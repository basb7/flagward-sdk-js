import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { resetLoggerState } from "@flagward/core";
import { createFlagward } from "../createFlagward.js";

class FakeEventSource {
  readyState = 1;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

function payload() {
  return {
    flags: [
      {
        key: "checkout-flow",
        name: "Checkout flow",
        is_enabled: true,
        flag_type: "MULTIVARIATE",
        variants: [
          { name: "control", percentage_allocation: 50, is_control: true },
          { name: "treatment", percentage_allocation: 50, is_control: false },
        ],
        rules: [],
        overridden: false,
      },
      { key: "beta", name: "Beta", is_enabled: true, flag_type: "BOOLEAN", rules: [] },
    ],
  };
}

describe("createFlagward.getVariant with no component at all", () => {
  beforeEach(() => {
    resetLoggerState();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          String(url).includes("/sdk/flags/") ? payload() : { status: "registered" },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves a variant deterministically once loaded", async () => {
    const state = createFlagward({ apiKey: "key" });

    await vi.waitFor(() => expect(get(state.isLoading)).toBe(false));
    // hashBucket("user-1", "checkout-flow") = 9.36 -> control
    expect(state.getVariant("checkout-flow", { user_id: "user-1" })).toBe("control");

    state.destroy();
  });

  it("resolves undefined, not a warning, for a BOOLEAN flag", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = createFlagward({ apiKey: "key" });

    await vi.waitFor(() => expect(get(state.isLoading)).toBe(false));
    expect(state.getVariant("beta")).toBeUndefined();
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Flag "beta"'));

    state.destroy();
  });

  it("warns for a genuinely unknown key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = createFlagward({ apiKey: "key" });

    await vi.waitFor(() => expect(get(state.isLoading)).toBe(false));
    expect(state.getVariant("nope")).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"'));

    state.destroy();
  });
});
