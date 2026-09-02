import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { resetLoggerState } from "@flagward/core";
import { flagward } from "../plugin";
import { useFlags } from "../useFlags";

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
      { key: "beta", name: "Beta", is_enabled: true, flag_type: "BOOLEAN", rules: [] },
      { key: "legacy", name: "Legacy", is_enabled: false, flag_type: "BOOLEAN", rules: [] },
      {
        key: "pro-only",
        name: "Pro",
        is_enabled: true,
        flag_type: "BOOLEAN",
        rules: [
          {
            priority: 1,
            operator_logic: "AND",
            conditions: [{ attribute: "plan", operator: "EQUALS", value: "pro" }],
          },
        ],
      },
    ],
  };
}

let captured: ReturnType<typeof useFlags>;

const Probe = defineComponent({
  setup() {
    captured = useFlags();
    return () => h("p", "probe");
  },
});

function mountWith(context?: Record<string, unknown>) {
  return mount(Probe, {
    global: { plugins: [flagward({ apiKey: "key", context })] },
  });
}

describe("reading every flag at once", () => {
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

  it("resolves the whole environment against the plugin's context", async () => {
    const wrapper = mountWith({ plan: "pro" });

    await vi.waitFor(() => expect(Object.keys(captured.flags.value)).toHaveLength(3));

    expect(captured.flags.value).toEqual({ beta: true, legacy: false, "pro-only": true });

    wrapper.unmount();
  });

  // The same environment answers differently for a different user. If the map
  // ignored context, a targeting rule would be decoration.
  it("answers a rule differently for a context that does not match", async () => {
    const wrapper = mountWith({ plan: "free" });

    await vi.waitFor(() => expect(Object.keys(captured.flags.value)).toHaveLength(3));

    expect(captured.flags.value["pro-only"]).toBe(false);

    wrapper.unmount();
  });

  it("lets one call override the context for one flag", async () => {
    const wrapper = mountWith({ plan: "free" });

    await vi.waitFor(() => expect(Object.keys(captured.flags.value)).toHaveLength(3));

    expect(captured.getFlag("pro-only")).toBe(false);
    expect(captured.getFlag("pro-only", { plan: "pro" })).toBe(true);

    wrapper.unmount();
  });

  it("reads an unknown flag as undefined rather than throwing", async () => {
    const wrapper = mountWith();

    await vi.waitFor(() => expect(Object.keys(captured.flags.value)).toHaveLength(3));

    expect(captured.getFlag("nope")).toBeUndefined();

    wrapper.unmount();
  });
});
