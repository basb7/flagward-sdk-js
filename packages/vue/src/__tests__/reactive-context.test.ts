import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { resetLoggerState } from "@flagward/core";
import { flagward } from "../plugin";
import { useFlag } from "../useFlag";
import { useFlags } from "../useFlags";

class FakeEventSource {
  readyState = 1;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

/** One flag, on only for plan === "pro". */
function payload() {
  return {
    flags: [
      {
        key: "beta",
        name: "Beta",
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

describe("a context that changes while the component is mounted", () => {
  // Passing a ref is what a Vue developer writes without thinking about it.
  // Spreading one yields Vue's internals -- dep, __v_isRef, _value -- and not
  // the attributes, so the rule could never match and nothing said so.
  it("re-evaluates when a ref context changes", async () => {
    const plan = ref({ plan: "standard" });

    const Probe = defineComponent({
      setup() {
        const { value } = useFlag("beta", plan);
        return () => h("p", String(value.value));
      },
    });

    const wrapper = mount(Probe, {
      global: { plugins: [flagward({ apiKey: "key" })] },
    });

    await vi.waitFor(() => expect(wrapper.text()).toBe("false"));

    plan.value = { plan: "pro" };
    await nextTick();

    expect(wrapper.text()).toBe("true");

    wrapper.unmount();
  });

  // Mutating a property of the ref's object, rather than replacing the object.
  // A different reactivity path: ref() makes its object value reactive, so the
  // spread inside the computed has to track the property it read.
  it("re-evaluates when a property of the ref's object is mutated", async () => {
    const ctx = ref({ plan: "standard" });

    const Probe = defineComponent({
      setup() {
        const { value } = useFlag("beta", ctx);
        return () => h("p", String(value.value));
      },
    });

    const wrapper = mount(Probe, {
      global: { plugins: [flagward({ apiKey: "key" })] },
    });

    await vi.waitFor(() => expect(wrapper.text()).toBe("false"));

    ctx.value.plan = "pro";
    await nextTick();

    expect(wrapper.text()).toBe("true");

    wrapper.unmount();
  });

  it("accepts a getter as well as a ref", async () => {
    const plan = ref("standard");

    const Probe = defineComponent({
      setup() {
        const { value } = useFlag("beta", () => ({ plan: plan.value }));
        return () => h("p", String(value.value));
      },
    });

    const wrapper = mount(Probe, {
      global: { plugins: [flagward({ apiKey: "key" })] },
    });

    await vi.waitFor(() => expect(wrapper.text()).toBe("false"));

    plan.value = "pro";
    await nextTick();

    expect(wrapper.text()).toBe("true");

    wrapper.unmount();
  });

  // The app-level context is the logged-in user. It changes on sign-in.
  it("re-evaluates when the plugin's own context changes", async () => {
    const appContext = ref({ plan: "standard" });

    const Probe = defineComponent({
      setup() {
        const { value } = useFlag("beta");
        return () => h("p", String(value.value));
      },
    });

    const wrapper = mount(Probe, {
      global: { plugins: [flagward({ apiKey: "key", context: appContext })] },
    });

    await vi.waitFor(() => expect(wrapper.text()).toBe("false"));

    appContext.value = { plan: "pro" };
    await nextTick();

    expect(wrapper.text()).toBe("true");

    wrapper.unmount();
  });

  // useFlag is covered above. The map useFlags returns has to follow the same
  // context, or two hooks in one component disagree about the same flag.
  it("re-evaluates the whole map when the plugin's context changes", async () => {
    const appContext = ref({ plan: "standard" });
    let captured: ReturnType<typeof useFlags>;

    const Probe = defineComponent({
      setup() {
        captured = useFlags();
        return () => h("p", String(captured.flags.value.beta));
      },
    });

    const wrapper = mount(Probe, {
      global: { plugins: [flagward({ apiKey: "key", context: appContext })] },
    });

    await vi.waitFor(() => expect(wrapper.text()).toBe("false"));

    appContext.value.plan = "pro";
    await nextTick();

    expect(wrapper.text()).toBe("true");
    expect(captured!.flags.value.beta).toBe(true);

    wrapper.unmount();
  });

  it("resolves a ref context through useFlags too", async () => {
    const appContext = ref({ plan: "pro" });
    let captured: ReturnType<typeof useFlags>;

    const Probe = defineComponent({
      setup() {
        captured = useFlags();
        return () => h("p", "probe");
      },
    });

    const wrapper = mount(Probe, {
      global: { plugins: [flagward({ apiKey: "key", context: appContext })] },
    });

    await vi.waitFor(() => expect(Object.keys(captured!.flags.value)).toHaveLength(1));

    expect(captured!.flags.value.beta).toBe(true);
    expect(captured!.getFlag("beta", ref({ plan: "standard" }))).toBe(false);

    wrapper.unmount();
  });

  // A plain object still has to work: the ref support is an addition.
  it("still accepts a plain object", async () => {
    const Probe = defineComponent({
      setup() {
        const { value } = useFlag("beta", { plan: "pro" });
        return () => h("p", String(value.value));
      },
    });

    const wrapper = mount(Probe, {
      global: { plugins: [flagward({ apiKey: "key" })] },
    });

    await vi.waitFor(() => expect(wrapper.text()).toBe("true"));

    wrapper.unmount();
  });
});
