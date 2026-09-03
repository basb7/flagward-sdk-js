import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defineComponent, effectScope, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { resetLoggerState } from "@flagward/core";
import { flagward } from "../plugin";
import { useFlag } from "../useFlag";

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
    ],
  };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetLoggerState();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
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

function mountReading(key: string) {
  const Probe = defineComponent({
    setup() {
      const { value } = useFlag(key);
      return () => h("p", String(value.value));
    },
  });

  return mount(Probe, { global: { plugins: [flagward({ apiKey: "key" })] } });
}

describe("reporting a key this environment does not have", () => {
  it("says so once the flags are loaded and the key is not among them", async () => {
    const wrapper = mountReading("nope");

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"')),
    );

    wrapper.unmount();
  });

  // The warning is about a key that is genuinely absent, not about the moment
  // before the first snapshot arrives. Reporting during loading would fire for
  // every flag on every page load.
  it("says nothing while the first snapshot is still on its way", () => {
    const wrapper = mountReading("nope");

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Flag "nope"'));

    wrapper.unmount();
  });

  it("says nothing for a key that does exist", async () => {
    const wrapper = mountReading("beta");

    await vi.waitFor(() => expect(wrapper.text()).toBe("true"));
    await nextTick();

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Flag "beta"'));

    wrapper.unmount();
  });

  // The point of moving the reporting out of the computed. Re-evaluating a
  // flag is something Vue does on its own schedule, as often as it likes; if
  // that wrote to the console, the number of warnings would depend on how
  // often Vue happened to recompute rather than on anything that went wrong.
  it("writes nothing when the value is merely re-evaluated", async () => {
    const ctx = ref({ plan: "free" });

    const Probe = defineComponent({
      setup() {
        const { value } = useFlag("nope", ctx);
        return () => h("p", String(value.value));
      },
    });

    const wrapper = mount(Probe, {
      global: { plugins: [flagward({ apiKey: "key" })] },
    });

    // Let the watcher report the missing key once, as it should.
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"')),
    );

    // From a clean slate, force the computed to run again several times. The
    // watcher will not fire: neither the resolved value nor the loading flag
    // changes. Anything written now came from the computed itself.
    resetLoggerState();
    warn.mockClear();

    for (const plan of ["pro", "premium", "enterprise"]) {
      ctx.value.plan = plan;
      await nextTick();
    }

    expect(warn).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  // A store or a router guard reaches for a flag outside any component. The
  // value still has to resolve there; only the reporting depends on a scope.
  it("still resolves the flag when called outside a component", async () => {
    const app = mount(defineComponent({ setup: () => () => h("p") }), {
      global: { plugins: [flagward({ apiKey: "key" })] },
    });

    const scope = effectScope();
    let resolved: boolean | undefined = undefined;
    scope.run(() => {
      const { value } = useFlag("beta");
      resolved = value.value;
    });

    expect(resolved).toBeUndefined(); // no plugin reachable outside the app tree
    scope.stop();
    app.unmount();
  });
});
