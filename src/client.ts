import type { Flag, FlagMap } from "./types";

export interface EasyFlagsClientOptions {
  apiKey: string;
  host?: string;
  environment?: string;
  timeout?: number;
}

interface EvaluationResult {
  key: string;
  value: boolean | string;
}

export class EasyFlagsClient {
  private apiKey: string;
  private host: string;
  private environment: string;
  private timeout: number;
  private flags: FlagMap = {};
  private registered = false;
  private eventSource: EventSource | null = null;
  private listeners: Set<(flags: FlagMap) => void> = new Set();

  constructor(options: EasyFlagsClientOptions) {
    this.apiKey = options.apiKey;
    this.host = options.host || "http://localhost:8000";
    this.environment = options.environment || "default";
    this.timeout = options.timeout || 10000;
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
          throw new Error("Invalid API key");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async init(): Promise<void> {
    await this.register();
    await this.getFlags();
  }

  async register(): Promise<void> {
    if (this.registered) return;

    await this.request("/sdk/register/", {
      method: "POST",
      body: JSON.stringify({ environment: this.environment }),
    });

    this.registered = true;
  }

  async getFlags(): Promise<FlagMap> {
    const response = await this.request<{ flags: Flag[] }>("/sdk/flags/");
    const newFlags: FlagMap = {};

    for (const flag of response.flags) {
      newFlags[flag.key] = flag.is_enabled;
    }

    this.flags = newFlags;
    this.notifyListeners();

    return newFlags;
  }

  async evaluate(key: string): Promise<boolean | string> {
    if (!(key in this.flags)) {
      await this.getFlags();
    }

    if (!(key in this.flags)) {
      throw new Error(`Flag "${key}" not found`);
    }

    const response = await this.request<EvaluationResult>("/sdk/evaluate/", {
      method: "POST",
      body: JSON.stringify({ key }),
    });

    return response.value;
  }

  getFlag(key: string): boolean | string | undefined {
    return this.flags[key];
  }

  isReady(): boolean {
    return this.registered && Object.keys(this.flags).length > 0;
  }

  subscribe(callback: (flags: FlagMap) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.flags);
    }
  }

  connect(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const url = `${this.host}/api/v1/sdk/stream/`;
    this.eventSource = new EventSource(`${url}?api_key=${this.apiKey}`);

    this.eventSource.onmessage = () => {
      this.getFlags();
    };

    this.eventSource.onerror = () => {
      // Will attempt to reconnect automatically
    };
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  destroy(): void {
    this.disconnect();
    this.listeners.clear();
  }
}
