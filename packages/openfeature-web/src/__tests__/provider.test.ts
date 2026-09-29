import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ClientProviderEvents, ErrorCode } from "@openfeature/web-sdk";
import { resetLoggerState } from "@flagward/core";
import { FlagwardWebProvider, SDK_TYPE } from "../provider";
import { SDK_VERSION } from "../version";

const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

class FakeEventSource {
  static last: FakeEventSource | null = null;
  readyState = 1;
  onerror: (() => void) | null = null;
  listeners: Record<string, (event: { data: string }) => void> = {};
  closed = false;
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: (event: { data: string }) => void) {
    this.listeners[type] = listener;
  }
  close() {
    this.closed = true;
  }
}

const usRule = {
  priority: 1,
  operator_logic: "AND",
  conditions: [{ attribute: "country", operator: "EQUALS", value: { type: "string", value: "US" } }],
};

// Hash vectors: u-1 buckets at 77.92 and user-1 at 9.36 for "checkout-flow".
function flags() {
  return [
    { key: "new-checkout", name: "New checkout", is_enabled: true, flag_type: "BOOLEAN", rules: [usRule] },
    { key: "off", name: "Off", is_enabled: false, flag_type: "BOOLEAN", rules: [] },
    {
      key: "checkout-flow",
      name: "Checkout flow",
      is_enabled: true,
      flag_type: "MULTIVARIATE",
      overridden: false,
      rules: [],
      variants: [
        { name: "control", percentage_allocation: 50, is_control: true },
        { name: "treatment", percentage_allocation: 50, is_control: false },
      ],
    },
  ];
}

let fetchMock: ReturnType<typeof vi.fn>;
let flagResponse: () => unknown;

beforeEach(() => {
  resetLoggerState();
  FakeEventSource.last = null;
  flagResponse = () => ({ flags: flags() });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("EventSource", FakeEventSource);
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes("/sdk/flags/") ? flagResponse() : { status: "registered" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function readyProvider() {
  const provider = new FlagwardWebProvider({ apiKey: "key", host: "https://flags.test" });
  await provider.initialize();
  return provider;
}

describe("metadata", () => {
  it("names itself and runs on the client", () => {
    const provider = new FlagwardWebProvider({ apiKey: "key" });
    expect(provider.metadata.name).toBe("flagward");
    expect(provider.runsOn).toBe("client");
  });

  it("reports the version in package.json", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(SDK_VERSION).toBe(pkg.version);
  });
});

describe("lifecycle", () => {
  it("registers as the OpenFeature web provider and loads the flags", async () => {
    await readyProvider();

    const register = fetchMock.mock.calls.find(([url]) => String(url).includes("/sdk/register/"));
    expect(JSON.parse(register![1].body)).toEqual({ sdk_type: SDK_TYPE, version: SDK_VERSION });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/sdk/flags/"))).toBe(true);
  });

  it("rejects initialize when the flags cannot be loaded", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 401, statusText: "Unauthorized" }));
    const provider = new FlagwardWebProvider({ apiKey: "bad" });

    await expect(provider.initialize()).rejects.toThrow();
  });

  it("opens the real-time stream once ready and closes it on close", async () => {
    const provider = await readyProvider();
    expect(FakeEventSource.last).not.toBeNull();

    await provider.onClose();
    expect(FakeEventSource.last!.closed).toBe(true);
  });

  it("emits ConfigurationChanged when the flags change", async () => {
    const provider = await readyProvider();
    const changed = vi.fn();
    provider.events.addHandler(ClientProviderEvents.ConfigurationChanged, changed);

    flagResponse = () => ({ flags: flags().filter((f) => f.key !== "off") });
    await provider.client.fetchFlags();

    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  });
});

describe("resolveBooleanEvaluation", () => {
  it("passes the targeting key and attributes to the rules", async () => {
    const provider = await readyProvider();

    expect(
      provider.resolveBooleanEvaluation("new-checkout", false, { targetingKey: "u-1", country: "US" }, logger),
    ).toEqual({ value: true, reason: "TARGETING_MATCH" });
    expect(
      provider.resolveBooleanEvaluation("new-checkout", true, { targetingKey: "u-1", country: "AR" }, logger),
    ).toEqual({ value: false, reason: "DEFAULT" });
  });

  it("reads a disabled flag as DISABLED", async () => {
    const provider = await readyProvider();
    expect(provider.resolveBooleanEvaluation("off", true, {}, logger)).toEqual({
      value: false,
      reason: "DISABLED",
    });
  });

  it("answers an unknown flag with the default and FLAG_NOT_FOUND", async () => {
    const provider = await readyProvider();
    expect(provider.resolveBooleanEvaluation("nope", true, {}, logger)).toEqual({
      value: true,
      reason: "ERROR",
      errorCode: ErrorCode.FLAG_NOT_FOUND,
      errorMessage: expect.stringContaining("nope"),
    });
  });
});

describe("resolveStringEvaluation", () => {
  it("buckets the targeting key into a variant", async () => {
    const provider = await readyProvider();

    expect(provider.resolveStringEvaluation("checkout-flow", "x", { targetingKey: "u-1" }, logger)).toEqual({
      value: "treatment",
      variant: "treatment",
      reason: "SPLIT",
    });
    expect(provider.resolveStringEvaluation("checkout-flow", "x", { targetingKey: "user-1" }, logger)).toEqual({
      value: "control",
      variant: "control",
      reason: "SPLIT",
    });
  });

  it("uses a user_id attribute when there is no targeting key", async () => {
    const provider = await readyProvider();
    expect(provider.resolveStringEvaluation("checkout-flow", "x", { user_id: "u-1" }, logger).value).toBe(
      "treatment",
    );
  });

  it("prefers the targeting key over a user_id attribute", async () => {
    const provider = await readyProvider();
    expect(
      provider.resolveStringEvaluation("checkout-flow", "x", { targetingKey: "user-1", user_id: "u-1" }, logger)
        .value,
    ).toBe("control");
  });

  it("answers a disabled flag with the default and its reason", async () => {
    flagResponse = () => ({
      flags: flags().map((f) => (f.key === "checkout-flow" ? { ...f, is_enabled: false } : f)),
    });
    const provider = await readyProvider();

    expect(provider.resolveStringEvaluation("checkout-flow", "fallback", {}, logger)).toEqual({
      value: "fallback",
      reason: "DISABLED",
    });
  });

  it("answers a BOOLEAN flag with the default and TYPE_MISMATCH", async () => {
    const provider = await readyProvider();
    expect(provider.resolveStringEvaluation("new-checkout", "fallback", {}, logger)).toMatchObject({
      value: "fallback",
      reason: "ERROR",
      errorCode: ErrorCode.TYPE_MISMATCH,
    });
  });

  it("answers an unknown flag with the default and FLAG_NOT_FOUND", async () => {
    const provider = await readyProvider();
    expect(provider.resolveStringEvaluation("nope", "fallback", {}, logger)).toMatchObject({
      value: "fallback",
      reason: "ERROR",
      errorCode: ErrorCode.FLAG_NOT_FOUND,
    });
  });
});

describe("number and object evaluation", () => {
  it("answers an existing flag with the default and TYPE_MISMATCH", async () => {
    const provider = await readyProvider();

    expect(provider.resolveNumberEvaluation("new-checkout", 7, {}, logger)).toMatchObject({
      value: 7,
      reason: "ERROR",
      errorCode: ErrorCode.TYPE_MISMATCH,
    });
    expect(provider.resolveObjectEvaluation("checkout-flow", { a: 1 }, {}, logger)).toMatchObject({
      value: { a: 1 },
      reason: "ERROR",
      errorCode: ErrorCode.TYPE_MISMATCH,
    });
  });

  it("answers an unknown flag with FLAG_NOT_FOUND", async () => {
    const provider = await readyProvider();
    expect(provider.resolveNumberEvaluation("nope", 7, {}, logger)).toMatchObject({
      value: 7,
      errorCode: ErrorCode.FLAG_NOT_FOUND,
    });
  });
});
