import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FlagwardClient } from "../client";
import { resetLoggerState } from "../logger";

/** Minimal EventSource stand-in that reports its own state, as the real one does. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readyState = FakeEventSource.OPEN;
  onerror: (() => void) | null = null;
  listeners: Record<string, ((event: MessageEvent) => void)[]> = {};

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    (this.listeners[type] ??= []).push(handler);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  /** The browser gave up retrying: the connection is closed for good. */
  failPermanently() {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.();
  }
}

function flagResponse(isEnabled: boolean) {
  return {
    flags: [
      { key: "beta", name: "Beta", is_enabled: isEnabled, flag_type: "BOOLEAN", rules: [] },
    ],
  };
}

describe("recovering from a network interruption", () => {
  let online: boolean;
  let enabled: boolean;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetLoggerState();
    FakeEventSource.instances = [];
    online = true;
    enabled = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("EventSource", FakeEventSource);

    fetchMock = vi.fn(async (url: string) => {
      if (!online) throw new TypeError("Failed to fetch");
      return {
        ok: true,
        status: 200,
        json: async () =>
          String(url).includes("/sdk/flags/") ? flagResponse(enabled) : { status: "ok" },
      };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function goOnline() {
    online = true;
    window.dispatchEvent(new Event("online"));
  }

  it("re-reads the flags when the network comes back", async () => {
    const client = new FlagwardClient({ apiKey: "key" });
    await client.init();
    client.connect();

    // The browser goes offline and a flag is changed elsewhere meanwhile.
    online = false;
    enabled = false;
    expect(client.getFlag("beta")).toBe(true);

    goOnline();

    await vi.waitFor(() => {
      expect(client.getFlag("beta")).toBe(false);
    });

    client.destroy();
  });

  it("opens a new stream when the browser gave up on the old one", async () => {
    const client = new FlagwardClient({ apiKey: "key" });
    await client.init();
    client.connect();

    expect(FakeEventSource.instances).toHaveLength(1);

    // Offline long enough that EventSource stops retrying by itself.
    online = false;
    FakeEventSource.instances[0].failPermanently();

    goOnline();

    await vi.waitFor(() => {
      expect(FakeEventSource.instances.length).toBeGreaterThan(1);
      expect(FakeEventSource.instances[FakeEventSource.instances.length - 1].readyState).not.toBe(FakeEventSource.CLOSED);
    });

    client.destroy();
  });

  it("leaves a still-open stream alone", async () => {
    const client = new FlagwardClient({ apiKey: "key" });
    await client.init();
    client.connect();

    goOnline();

    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
    });
    // The stream never closed, so replacing it would drop a working connection.
    expect(FakeEventSource.instances).toHaveLength(1);

    client.destroy();
  });

  it("recovers a startup that failed while offline", async () => {
    online = false;
    const client = new FlagwardClient({ apiKey: "key" });

    await expect(client.init()).rejects.toThrow();
    client.connect();

    expect(client.getFlag("beta")).toBeUndefined();

    goOnline();

    await vi.waitFor(() => {
      expect(client.getFlag("beta")).toBe(true);
    });

    client.destroy();
  });

  it("stops listening once destroyed", async () => {
    const client = new FlagwardClient({ apiKey: "key" });
    await client.init();
    client.connect();
    client.destroy();

    const callsBefore = fetchMock.mock.calls.length;
    goOnline();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // A destroyed client must not keep waking up on network events.
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });
});

describe("the reported error clears on recovery", () => {
  it("does not leave a past failure in place once flags arrive", async () => {
    resetLoggerState();
    FakeEventSource.instances = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("EventSource", FakeEventSource);

    let online = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (!online) throw new TypeError("Failed to fetch");
        return {
          ok: true,
          status: 200,
          json: async () =>
            String(url).includes("/sdk/flags/") ? flagResponse(true) : { status: "ok" },
        };
      }),
    );

    const { render, screen } = await import("@testing-library/react");
    const { FlagwardProvider } = await import("../provider");
    const { useFlag } = await import("../useFlag");

    function Probe() {
      const { error } = useFlag("beta");
      return <p>error: {error ? "yes" : "no"}</p>;
    }

    const view = render(
      <FlagwardProvider apiKey="key">
        <Probe />
      </FlagwardProvider>,
    );

    await vi.waitFor(() => expect(screen.getByText("error: yes")).toBeDefined());

    online = true;
    window.dispatchEvent(new Event("online"));

    await vi.waitFor(() => expect(screen.getByText("error: no")).toBeDefined());

    // Unmounted explicitly: the provider destroys its client on the way out,
    // and a client left alive keeps listening on the shared document, waking
    // up during later tests.
    view.unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe("returning to a tab that was in the background", () => {
  let visible: boolean;
  let enabled: boolean;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetLoggerState();
    FakeEventSource.instances = [];
    visible = true;
    enabled = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("EventSource", FakeEventSource);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (visible ? "visible" : "hidden"),
    });

    fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes("/sdk/flags/") ? flagResponse(enabled) : { status: "ok" },
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function show() {
    visible = true;
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("re-reads the flags on the way back", async () => {
    /**
     * A sleeping machine drops the connection without the browser ever
     * reporting the network as gone, so `online` never fires and the tab wakes
     * up holding whatever it knew before.
     */
    const client = new FlagwardClient({ apiKey: "key" });
    await client.init();
    client.connect();

    visible = false;
    enabled = false;
    expect(client.getFlag("beta")).toBe(true);

    show();

    await vi.waitFor(() => {
      expect(client.getFlag("beta")).toBe(false);
    });

    client.destroy();
  });

  it("does nothing on the way out", async () => {
    const client = new FlagwardClient({ apiKey: "key" });
    await client.init();
    client.connect();

    const before = fetchMock.mock.calls.length;
    visible = false;
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Leaving a tab is not a reason to talk to the server.
    expect(fetchMock.mock.calls.length).toBe(before);

    client.destroy();
  });

  it("stops listening once destroyed", async () => {
    const client = new FlagwardClient({ apiKey: "key" });
    await client.init();
    client.connect();
    client.destroy();

    const before = fetchMock.mock.calls.length;
    show();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchMock.mock.calls.length).toBe(before);
  });
});
