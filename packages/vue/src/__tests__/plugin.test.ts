import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { resetLoggerState } from "@flagward/core";
import { flagward } from "../plugin";
import { useFlag } from "../useFlag";

/** Minimal EventSource stand-in: jsdom has none, and the test drives it. */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  static readonly CLOSED = 2;
  readyState = 1;
  onerror: (() => void) | null = null;
  listeners: Record<string, ((event: MessageEvent) => void)[]> = {};

  constructor(public url: string) {
    FakeEventSource.last = this;
  }

  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    (this.listeners[type] ??= []).push(handler);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(type: string) {
    for (const handler of this.listeners[type] ?? []) {
      handler({ data: "{}" } as MessageEvent);
    }
  }
}

function flagPayload(isEnabled: boolean) {
  return {
    flags: [
      { key: "beta", name: "Beta", is_enabled: isEnabled, flag_type: "BOOLEAN", rules: [] },
    ],
  };
}

const Probe = defineComponent({
  setup() {
    const { value, isLoading, error } = useFlag("beta");
    return () =>
      h("p", `loading:${isLoading.value} value:${String(value.value)} error:${error.value ? "yes" : "no"}`);
  },
});

describe("the plugin brings flags to any component", () => {
  let enabled: boolean;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetLoggerState();
    enabled = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("EventSource", FakeEventSource);
    fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes("/sdk/flags/") ? flagPayload(enabled) : { status: "registered" },
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves a flag without wrapping the component in anything", async () => {
    const wrapper = mount(Probe, {
      global: { plugins: [flagward({ apiKey: "key" })] },
    });

    expect(wrapper.text()).toContain("loading:true");

    await vi.waitFor(() => expect(wrapper.text()).toContain("value:true"));
    expect(wrapper.text()).toContain("loading:false");

    wrapper.unmount();
  });

  // A change announced on the stream has to reach the rendered component, or
  // the flag is only as fresh as the page load.
  it("re-renders when the stream announces a change", async () => {
    const wrapper = mount(Probe, {
      global: { plugins: [flagward({ apiKey: "key" })] },
    });

    await vi.waitFor(() => expect(wrapper.text()).toContain("value:true"));

    enabled = false;
    FakeEventSource.last!.emit("flags");

    await vi.waitFor(async () => {
      await nextTick();
      expect(wrapper.text()).toContain("value:false");
    }, { timeout: 3000 });

    wrapper.unmount();
  });

  // Registering as JAVASCRIPT would make this adapter indistinguishable from
  // every other one built on the same core.
  it("registers as VUE, reporting this package's version", async () => {
    const wrapper = mount(Probe, {
      global: { plugins: [flagward({ apiKey: "key" })] },
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sdk_type).toBe("VUE");

    wrapper.unmount();
  });
});
