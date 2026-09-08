import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { resetLoggerState } from "@flagward/core";
import { createFlagward } from "../createFlagward.js";
import { SDK_VERSION } from "../version.js";

/** Minimal EventSource stand-in: jsdom has none, and the test drives it. */
class FakeEventSource {
  readyState = 1;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

function flagPayload(isEnabled: boolean) {
  return {
    flags: [
      { key: "beta", name: "Beta", is_enabled: isEnabled, flag_type: "BOOLEAN", rules: [] },
    ],
  };
}

describe("createFlagward with no component at all", () => {
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

  it("loads flags and settles isLoading with nothing Svelte-specific involved", async () => {
    const state = createFlagward({ apiKey: "key" });

    expect(get(state.isLoading)).toBe(true);

    await vi.waitFor(() => expect(get(state.isLoading)).toBe(false));
    expect(get(state.flagsData).beta).toBeTruthy();

    state.destroy();
  });

  it("resolves a flag through getFlag once it has loaded", async () => {
    const state = createFlagward({ apiKey: "key" });

    await vi.waitFor(() => expect(get(state.isLoading)).toBe(false));
    expect(state.getFlag("beta")).toBe(true);

    state.destroy();
  });

  // A client left alive after the caller is done with it keeps its stream
  // open and keeps listening on the shared window, waking up long after
  // anybody cares.
  it("tears the client down when destroy is called", async () => {
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");

    const state = createFlagward({ apiKey: "key" });

    // connect() runs after init settles, so the listener does not exist yet
    // right away; waiting for it is what makes the assertion below mean
    // something instead of passing on a client that never added one.
    await vi.waitFor(() =>
      expect(addListener).toHaveBeenCalledWith("online", expect.any(Function)),
    );

    state.destroy();

    expect(removeListener).toHaveBeenCalledWith("online", expect.any(Function));
  });

  // Registering as JAVASCRIPT would make this adapter indistinguishable from
  // every other one built on the same core.
  it("registers as SVELTE, reporting this package's version", async () => {
    const state = createFlagward({ apiKey: "key" });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sdk_type).toBe("SVELTE");
    expect(body.version).toBe(SDK_VERSION);

    state.destroy();
  });
});
