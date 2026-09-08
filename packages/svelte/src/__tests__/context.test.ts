import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/svelte";
import { resetLoggerState } from "@flagward/core";
import App from "./App.svelte";

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

describe("a root that provides state to a child through the context", () => {
  it("resolves a flag in a child that never called setFlagward itself", async () => {
    const { container, unmount } = render(App, {
      props: { apiKey: "key", flagKey: "beta" },
    });

    expect(container.textContent).toContain("loading:true");

    await vi.waitFor(() => expect(container.textContent).toContain("value:true"));
    expect(container.textContent).toContain("loading:false");

    unmount();
  });

  // A client left alive after the tree is gone keeps its stream open and
  // keeps listening on the shared window, waking up long after anybody
  // cares.
  it("tears the client down when the root unmounts", async () => {
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(App, { props: { apiKey: "key", flagKey: "beta" } });

    // connect() runs after init settles, so the listener does not exist yet
    // on the first render. Waiting for it is what makes unmounting right
    // after mean something, instead of proving a client that never added a
    // listener also never removes one.
    await vi.waitFor(() =>
      expect(addListener).toHaveBeenCalledWith("online", expect.any(Function)),
    );

    unmount();

    expect(removeListener).toHaveBeenCalledWith("online", expect.any(Function));
  });
});
