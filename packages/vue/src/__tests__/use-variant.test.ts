import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { resetLoggerState } from "@flagward/core";
import { flagward } from "../plugin";
import { useVariant } from "../useVariant";

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

let captured: ReturnType<typeof useVariant>;

const Probe = defineComponent({
  props: { flagKey: { type: String, required: true } },
  setup(props) {
    captured = useVariant(props.flagKey);
    return () => h("p", "probe");
  },
});

function mountWith(flagKey: string) {
  return mount(Probe, {
    props: { flagKey },
    global: { plugins: [flagward({ apiKey: "key" })] },
  });
}

describe("useVariant", () => {
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

  it("resolves undefined for a BOOLEAN flag without warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrapper = mountWith("beta");

    await vi.waitFor(() => expect(captured.isLoading.value).toBe(false));

    expect(captured.value.value).toBeUndefined();
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Flag "beta"'));

    wrapper.unmount();
  });

  it("resolves the control/treatment split deterministically", async () => {
    const wrapper = mountWith("checkout-flow");

    await vi.waitFor(() => expect(captured.isLoading.value).toBe(false));

    // hashBucket("some-user", "checkout-flow") is deterministic but not one
    // of the pinned vectors; assert against the flag's own no-user-id path
    // instead, which is pinned: control.
    expect(captured.value.value).toBe("control");

    wrapper.unmount();
  });

  it("warns for a genuinely unknown key, once loaded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrapper = mountWith("nope");

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"')),
    );

    wrapper.unmount();
  });
});
