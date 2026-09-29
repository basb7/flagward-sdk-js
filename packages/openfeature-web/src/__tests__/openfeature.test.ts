import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OpenFeature, ProviderEvents, ProviderStatus } from "@openfeature/web-sdk";
import { resetLoggerState } from "@flagward/core";
import { FlagwardWebProvider } from "../provider";

class FakeEventSource {
  readyState = 1;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

const usRule = {
  priority: 1,
  operator_logic: "AND",
  conditions: [{ attribute: "country", operator: "EQUALS", value: { type: "string", value: "US" } }],
};

let enabled: boolean;
let fetchMock: ReturnType<typeof vi.fn>;

function payload() {
  return {
    flags: [
      { key: "new-checkout", name: "New checkout", is_enabled: enabled, flag_type: "BOOLEAN", rules: [usRule] },
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
    ],
  };
}

beforeEach(() => {
  resetLoggerState();
  enabled = true;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("EventSource", FakeEventSource);
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes("/sdk/flags/") ? payload() : { status: "registered" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await OpenFeature.clearProviders();
  await OpenFeature.clearContext();
  OpenFeature.clearHandlers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("through the OpenFeature web SDK", () => {
  it("becomes READY and evaluates against the static context", async () => {
    await OpenFeature.setContext({ targetingKey: "u-1", country: "US" });
    await OpenFeature.setProviderAndWait(new FlagwardWebProvider({ apiKey: "key" }));
    const client = OpenFeature.getClient();

    expect(client.providerStatus).toBe(ProviderStatus.READY);
    expect(client.getBooleanDetails("new-checkout", false)).toMatchObject({
      flagKey: "new-checkout",
      value: true,
      reason: "TARGETING_MATCH",
    });
    expect(client.getStringDetails("checkout-flow", "control")).toMatchObject({
      value: "treatment",
      variant: "treatment",
      reason: "SPLIT",
    });
  });

  it("uses a new context on the next evaluation, with no extra request", async () => {
    await OpenFeature.setContext({ targetingKey: "u-1", country: "US" });
    await OpenFeature.setProviderAndWait(new FlagwardWebProvider({ apiKey: "key" }));
    const client = OpenFeature.getClient();
    const requests = fetchMock.mock.calls.length;

    await OpenFeature.setContext({ targetingKey: "user-1", country: "AR" });

    expect(client.getBooleanValue("new-checkout", true)).toBe(false);
    expect(client.getStringValue("checkout-flow", "x")).toBe("control");
    expect(fetchMock.mock.calls.length).toBe(requests);
  });

  it("reports ERROR and serves defaults when the flags cannot be loaded", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 401, statusText: "Unauthorized" }));
    const provider = new FlagwardWebProvider({ apiKey: "bad" });

    await expect(OpenFeature.setProviderAndWait(provider)).rejects.toThrow();
    const client = OpenFeature.getClient();

    expect(client.providerStatus).toBe(ProviderStatus.ERROR);
    expect(client.getBooleanValue("new-checkout", true)).toBe(true);
  });

  it("runs READY handlers exactly once", async () => {
    const ready = vi.fn();
    OpenFeature.addHandler(ProviderEvents.Ready, ready);
    OpenFeature.getClient().addHandler(ProviderEvents.Ready, ready);

    await OpenFeature.setProviderAndWait(new FlagwardWebProvider({ apiKey: "key" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A handler added while the no-op provider is READY runs at once, so only
    // this provider's events count: one from the API emitter, one from the
    // client's. A READY emitted by the provider itself would make it four.
    const fromFlagward = ready.mock.calls.filter(([details]) => details?.providerName === "flagward");
    expect(fromFlagward).toHaveLength(2);
  });

  it("runs ERROR handlers exactly once when the flags cannot be loaded", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 401, statusText: "Unauthorized" }));
    const failed = vi.fn();
    OpenFeature.getClient().addHandler(ProviderEvents.Error, failed);

    await expect(OpenFeature.setProviderAndWait(new FlagwardWebProvider({ apiKey: "bad" }))).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const fromFlagward = failed.mock.calls.filter(([details]) => details?.providerName === "flagward");
    expect(fromFlagward).toHaveLength(1);
  });

  it("tells handlers when a flag changes", async () => {
    const provider = new FlagwardWebProvider({ apiKey: "key" });
    await OpenFeature.setProviderAndWait(provider);
    const client = OpenFeature.getClient();
    const changed = vi.fn();
    client.addHandler(ProviderEvents.ConfigurationChanged, changed);

    enabled = false;
    await provider.client.fetchFlags();

    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(client.getBooleanDetails("new-checkout", true)).toMatchObject({ value: false, reason: "DISABLED" });
  });
});
