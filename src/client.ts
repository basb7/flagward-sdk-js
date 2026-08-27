import type { Condition, Flag, FlagDataMap, FlagMap, Rule, UserContext } from "./types";

export interface EasyFlagsClientOptions {
  apiKey: string;
  host?: string;
  timeout?: number;
}

export class EasyFlagsClient {
  private apiKey: string;
  private host: string;
  private timeout: number;
  private flagsData: FlagDataMap = {};
  private registered = false;
  private initialized = false;
  private eventSource: EventSource | null = null;
  private listeners: Set<(flags: FlagMap) => void> = new Set();

  constructor(options: EasyFlagsClientOptions) {
    this.apiKey = options.apiKey;
    this.host = options.host || "http://localhost:8000";
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
    if (this.initialized) return;
    this.initialized = true;
    await this.register();
    await this.fetchFlags();
  }

  async register(): Promise<void> {
    if (this.registered) return;

    await this.request("/sdk/register/", {
      method: "POST",
      body: JSON.stringify({
        sdk_type: "REACT",
        version: "0.1.0",
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

  evaluate(key: string, context?: UserContext): boolean | string {
    const flagData = this.flagsData[key];

    if (!flagData) {
      throw new Error(`Flag "${key}" not found`);
    }

    if (!flagData.is_enabled) {
      return false;
    }

    if (!flagData.rules || flagData.rules.length === 0) {
      return true;
    }

    // Evaluate rules by priority
    const sortedRules = [...flagData.rules].sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      const result = this.evaluateRule(rule, context || {});
      if (result) {
        return true;
      }
    }

    return false;
  }

  private evaluateRule(rule: Rule, context: UserContext): boolean {
    if (rule.conditions.length === 0) {
      return true;
    }

    if (rule.operator_logic === "AND") {
      return rule.conditions.every((c) => this.evaluateCondition(c, context));
    } else {
      return rule.conditions.some((c) => this.evaluateCondition(c, context));
    }
  }

  private evaluateCondition(condition: Condition, context: UserContext): boolean {
    const attributeValue = context[condition.attribute];

    if (attributeValue === undefined) {
      return false;
    }

    switch (condition.operator) {
      case "EQUALS":
        return attributeValue === condition.value;
      case "NOT_EQUALS":
        return attributeValue !== condition.value;
      case "GREATER_THAN":
        return Number(attributeValue) > Number(condition.value);
      case "LESS_THAN":
        return Number(attributeValue) < Number(condition.value);
      case "IN_LIST":
        return Array.isArray(condition.value) && condition.value.includes(attributeValue);
      case "CONTAINS":
        return String(attributeValue).includes(String(condition.value));
      default:
        return false;
    }
  }

  getFlag(key: string): boolean | string | undefined {
    try {
      return this.evaluate(key);
    } catch {
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

  subscribe(callback: (flags: FlagMap) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.cachedFlags);
    }
  }

  private getFlagsTimeout: ReturnType<typeof setTimeout> | null = null;

  connect(): void {
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
        this.fetchFlags();
      }, 500);
    });

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
    if (this.getFlagsTimeout) {
      clearTimeout(this.getFlagsTimeout);
    }
    this.initialized = false;
    this.registered = false;
    this.listeners.clear();
  }
}
