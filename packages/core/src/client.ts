import { evaluateFlag } from "./evaluation.js";
import { createLogger, type LogLevel, type Logger } from "./logger.js";
import type { Flag, FlagDataMap, FlagMap, UserContext } from "./types.js";
import { SDK_TYPE, SDK_VERSION } from "./version.js";

export interface FlagwardClientOptions {
  apiKey: string;
  host?: string;
  timeout?: number;
  /** How much the SDK reports to the console. Defaults to "warn". */
  logLevel?: LogLevel;
  /**
   * The version reported at registration. A framework adapter passes its own,
   * so the dashboard shows the version the application actually installed
   * rather than the core's.
   */
  sdkVersion?: string;
}

export class FlagwardClient {
  private apiKey: string;
  private host: string;
  private timeout: number;
  private sdkVersion: string;
  private flagsData: FlagDataMap = {};
  private registered = false;
  private initialized = false;
  private eventSource: EventSource | null = null;
  private listeners: Set<(flagsData: FlagDataMap) => void> = new Set();

  /** Internal: used by the hooks to report without throwing. */
  readonly logger: Logger;

  constructor(options: FlagwardClientOptions) {
    this.apiKey = options.apiKey;
    this.host = options.host || "http://localhost:8000";
    this.timeout = options.timeout || 10000;
    this.sdkVersion = options.sdkVersion || SDK_VERSION;
    this.logger = createLogger(options.logLevel);

    if (!this.apiKey) {
      this.logger.error(
        "missing-api-key",
        "No apiKey was provided. Every request will be rejected and all flags " +
          "will fall back to undefined. Pass the environment's API key to " +
          "FlagwardProvider.",
      );
    }
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.host}/api/v1${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.logger.error(
            "invalid-api-key",
            "The API key was rejected. Check that it matches an environment in " +
              "your Flagward dashboard.",
          );
          throw new Error("Invalid API key");
        }
        this.logger.warn(
          `http-${response.status}`,
          `${path} failed with HTTP ${response.status} ${response.statusText}.`,
        );
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        this.logger.warn(
          "timeout",
          `${path} timed out after ${this.timeout}ms. Check the host option: ` +
            `currently "${this.host}".`,
        );
      } else if (err instanceof TypeError) {
        // fetch rejects with TypeError when it never reached the server.
        this.logger.warn(
          "unreachable",
          `Could not reach ${this.host}. Check the host option, and that the ` +
            "server allows this origin.",
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    await this.register();
    await this.fetchFlags();

    // Marked only once it actually succeeded. Setting it up front left a
    // client that failed to start permanently convinced it had started, so
    // no later attempt could get past the guard.
    this.initialized = true;
  }

  async register(): Promise<void> {
    if (this.registered) return;

    await this.request("/sdk/register/", {
      method: "POST",
      body: JSON.stringify({
        sdk_type: SDK_TYPE,
        version: this.sdkVersion,
      }),
    });

    this.registered = true;
  }

  async fetchFlags(): Promise<FlagMap> {
    const response = await this.request<{ flags: Flag[] }>("/sdk/flags/");

    const newFlagsData: FlagDataMap = {};
    const newFlags: FlagMap = {};

    for (const flag of response.flags) {
      newFlagsData[flag.key] = {
        key: flag.key,
        is_enabled: flag.is_enabled,
        rules: flag.rules || [],
      };
      newFlags[flag.key] = flag.is_enabled;
    }

    this.flagsData = newFlagsData;
    this.notifyListeners();

    return newFlags;
  }

  evaluate(key: string, context?: UserContext): boolean {
    const flagData = this.flagsData[key];

    if (!flagData) {
      throw new Error(`Flag "${key}" not found`);
    }

    return evaluateFlag(flagData, context || {}) as boolean;
  }

  /**
   * An immutable view of the flag data, for a caller that needs to hold it.
   *
   * The provider keeps this in React state so a hook renders from the same
   * value that triggered the render, rather than reaching back into data this
   * client mutates underneath it.
   */
  get snapshot(): FlagDataMap {
    return { ...this.flagsData };
  }

  getFlag(key: string): boolean | undefined {
    try {
      return this.evaluate(key);
    } catch {
      // Reading a flag never throws: an unknown flag reads as undefined so the
      // caller's own fallback decides what happens.
      this.logger.warn(
        `unknown-flag:${key}`,
        `Flag "${key}" is not in this environment, so it reads as undefined. ` +
          "Check the key, and that the flag exists in the environment this " +
          "API key belongs to.",
      );
      return undefined;
    }
  }

  get cachedFlags(): FlagMap {
    const flags: FlagMap = {};
    for (const [key, data] of Object.entries(this.flagsData)) {
      flags[key] = data.is_enabled;
    }
    return flags;
  }

  isReady(): boolean {
    return this.initialized && Object.keys(this.flagsData).length > 0;
  }

  subscribe(callback: (flagsData: FlagDataMap) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private getFlagsTimeout: ReturnType<typeof setTimeout> | null = null;
  private onlineHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private revalidating: Promise<void> | null = null;

  connect(): void {
    this.watchConnectivity();
    this.openStream();
  }

  /**
   * Bring the client back in step with the server.
   *
   * A dropped connection means missed events, so coming back online is not
   * just about reopening the stream: whatever changed while the client was
   * away has to be read, or it serves a stale value indefinitely.
   */
  async revalidate(): Promise<void> {
    // Coming back online and returning to the tab often happen together, and
    // a user flipping between tabs can fire this repeatedly. One in-flight
    // pass is shared rather than queueing a request per event.
    if (this.revalidating) return this.revalidating;

    this.revalidating = this.runRevalidation().finally(() => {
      this.revalidating = null;
    });

    return this.revalidating;
  }

  private async runRevalidation(): Promise<void> {
    if (!this.initialized) {
      try {
        await this.init();
      } catch {
        this.logger.warn(
          "revalidate-failed",
          "Could not reach the server after the network returned. Flags stay " +
            "at their last known values.",
        );
        return;
      }
    } else {
      try {
        await this.fetchFlags();
      } catch {
        this.logger.warn(
          "revalidate-failed",
          "Could not re-read the flags after the network returned. They stay " +
            "at their last known values.",
        );
        return;
      }
    }

    // Only replace a stream the browser has given up on: a live one is
    // already delivering, and closing it would lose events for no reason.
    if (!this.eventSource || this.eventSource.readyState === 2) {
      this.openStream();
    }
  }

  private watchConnectivity(): void {
    if (this.onlineHandler || typeof window === "undefined") return;

    this.onlineHandler = () => {
      void this.revalidate();
    };
    window.addEventListener("online", this.onlineHandler);

    if (typeof document === "undefined") return;

    // A machine waking from sleep drops the connection without the browser
    // ever reporting the network as gone, so `online` never fires and the tab
    // comes back holding whatever it knew before it slept.
    this.visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void this.revalidate();
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  private openStream(): void {
    // Server rendering, React Native and plain Node have no EventSource. The
    // rest of the SDK works there — flags are read once over fetch — so this
    // is a missing capability to report, not a reason to throw.
    if (typeof EventSource === "undefined") {
      this.logger.warn(
        "no-eventsource",
        "This environment has no EventSource, so live updates are off. Flags " +
          "keep the values they were last read with.",
      );
      return;
    }

    if (this.eventSource) {
      this.eventSource.close();
    }

    const url = `${this.host}/api/v1/sdk/stream/`;
    this.eventSource = new EventSource(`${url}?api_key=${this.apiKey}`);

    this.eventSource.addEventListener("flags", () => {
      if (this.getFlagsTimeout) {
        clearTimeout(this.getFlagsTimeout);
      }
      this.getFlagsTimeout = setTimeout(() => {
        // Reported rather than left as an unhandled rejection: a refetch that
        // fails silently leaves the UI on a value the server no longer holds.
        this.fetchFlags().catch(() => {
          this.logger.warn(
            "refresh-failed",
            "A flag change was announced but could not be read. Flags stay at " +
              "their last known values.",
          );
        });
      }, 500);
    });

    this.eventSource.onerror = () => {
      // EventSource reconnects on its own, so this is reported once and left
      // alone rather than treated as a failure.
      this.logger.warn(
        "stream-error",
        "The live update stream dropped. Flags stay at their last known " +
          "values and the connection will be retried automatically.",
      );
    };
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  destroy(): void {
    if (this.onlineHandler && typeof window !== "undefined") {
      window.removeEventListener("online", this.onlineHandler);
    }
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    this.onlineHandler = null;
    this.visibilityHandler = null;
    this.disconnect();
    if (this.getFlagsTimeout) {
      clearTimeout(this.getFlagsTimeout);
    }
    this.initialized = false;
    this.registered = false;
    this.listeners.clear();
  }
}
