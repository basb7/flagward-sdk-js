import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { resetLoggerState } from "@flagward/core";
import { flagward } from "../plugin";
import { useFlag } from "../useFlag";
import { useFlags } from "../useFlags";
import { SDK_VERSION } from "../version";

const Probe = defineComponent({
  setup() {
    const { value, error } = useFlag("beta");
    return () => h("p", `value:${String(value.value)} error:${error.value ? "yes" : "no"}`);
  },
});

describe("the SDK reports problems without breaking the application", () => {
  beforeEach(() => {
    resetLoggerState();
    vi.stubGlobal("EventSource", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports a missing API key instead of failing to install", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ flags: [] }) })));

    const wrapper = mount(Probe, { global: { plugins: [flagward({ apiKey: "" })] } });

    expect(error).toHaveBeenCalledWith(expect.stringContaining("No apiKey"));
    wrapper.unmount();
  });

  it("still renders when the server cannot be reached, and records why", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    const wrapper = mount(Probe, { global: { plugins: [flagward({ apiKey: "key" })] } });

    await vi.waitFor(() => expect(wrapper.text()).toContain("error:yes"));
    expect(wrapper.text()).toContain("value:undefined");

    wrapper.unmount();
  });

  it("does not throw out of a composable used without the plugin", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const Orphan = defineComponent({
      setup() {
        const flag = useFlag("beta");
        const all = useFlags();
        return () => h("p", `${String(flag.value.value)}|${Object.keys(all.flags.value).length}`);
      },
    });

    const wrapper = mount(Orphan);

    expect(wrapper.text()).toBe("undefined|0");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("never installed the plugin"));

    wrapper.unmount();
  });

  // A client left alive after the app is gone keeps its stream open and keeps
  // listening on the shared document, waking up long after anybody cares.
  it("tears the client down when the application unmounts", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ flags: [] }) })));

    const wrapper = mount(Probe, { global: { plugins: [flagward({ apiKey: "key" })] } });

    // connect() runs after init settles, so the listener does not exist yet on
    // the first render. Waiting for the text would unmount before it is added
    // and prove nothing.
    await vi.waitFor(() =>
      expect(addListener).toHaveBeenCalledWith("online", expect.any(Function)),
    );

    wrapper.unmount();

    expect(removeListener).toHaveBeenCalledWith("online", expect.any(Function));
  });
});

describe("the reported version", () => {
  it("is the version this package publishes", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(SDK_VERSION).toBe(pkg.version);
  });
});
