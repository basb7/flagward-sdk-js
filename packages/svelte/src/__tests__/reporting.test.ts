import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { render } from "@testing-library/svelte";
import { resetLoggerState } from "@flagward/core";
import App from "./App.svelte";
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
    flags: [{ key: "beta", name: "Beta", is_enabled: true, flag_type: "BOOLEAN", rules: [] }],
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

describe("reporting a key this environment does not have", () => {
  it("says so once the flags are loaded and the key is not among them", async () => {
    const { unmount } = render(App, { props: { apiKey: "key", flagKey: "nope" } });

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"')),
    );

    unmount();
  });

  // The warning is about a key that is genuinely absent, not about the
  // moment before the first snapshot arrives. Reporting during loading would
  // name every flag on every page load.
  it("says nothing while the first snapshot is still on its way", () => {
    const { unmount } = render(App, { props: { apiKey: "key", flagKey: "nope" } });

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Flag "nope"'));

    unmount();
  });

  it("says nothing for a key that does exist", async () => {
    const { container, unmount } = render(App, { props: { apiKey: "key", flagKey: "beta" } });

    await vi.waitFor(() => expect(container.textContent).toContain("value:true"));

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Flag "beta"'));

    unmount();
  });

  // getFlag is the imperative escape hatch on the state itself, used from a
  // handler rather than read from a store. It answers exactly the same way.
  it("warns and returns undefined when getFlag is asked for an unknown key", async () => {
    const state = createFlagward({ apiKey: "key" });

    await vi.waitFor(() => expect(get(state.isLoading)).toBe(false));

    expect(state.getFlag("nope")).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"'));

    state.destroy();
  });
});
