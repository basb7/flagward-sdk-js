import { StrictMode, useContext, useState } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { FlagwardContext } from "../context";
import { FlagwardProvider } from "../provider";
import { resetLoggerState } from "@flagward/core";
import { useFlag } from "../useFlag";

/** Minimal EventSource stand-in: jsdom has none, and the test drives it. */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.last = this;
  }

  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    (this.listeners[type] ??= []).push(handler);
  }

  close() {
    this.closed = true;
  }

  /** Deliver a server event to whoever subscribed. */
  emit(type: string, data: unknown) {
    for (const handler of this.listeners[type] ?? []) {
      handler({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

function Banner() {
  const { value, isLoading } = useFlag("show-banner");
  if (isLoading) return <p>loading</p>;
  return <p>banner: {String(value)}</p>;
}

function flagPayload(isEnabled: boolean) {
  return {
    flags: [
      {
        key: "show-banner",
        name: "Banner",
        is_enabled: isEnabled,
        flag_type: "BOOLEAN",
        rules: [],
        overridden: false,
      },
    ],
  };
}

describe("a flag flipped on the server reaches the rendered component", () => {
  let enabled: boolean;

  beforeEach(() => {
    resetLoggerState();
    enabled = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          String(url).includes("/sdk/flags/")
            ? flagPayload(enabled)
            : { status: "registered" },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the flag's initial value", async () => {
    render(
      <FlagwardProvider apiKey="key">
        <Banner />
      </FlagwardProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("banner: true")).toBeDefined();
    });
  });

  it("re-renders when the stream announces a change", async () => {
    render(
      <FlagwardProvider apiKey="key">
        <Banner />
      </FlagwardProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("banner: true")).toBeDefined();
    });

    // The server disables it and announces the change over the stream.
    enabled = false;
    FakeEventSource.last?.emit("flags", flagPayload(false));

    await waitFor(
      () => {
        expect(screen.getByText("banner: false")).toBeDefined();
      },
      { timeout: 3000 },
    );
  });
});


describe("the same flow under StrictMode", () => {
  let enabled: boolean;

  beforeEach(() => {
    resetLoggerState();
    enabled = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          String(url).includes("/sdk/flags/")
            ? flagPayload(enabled)
            : { status: "registered" },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("still re-renders when the stream announces a change", async () => {
    render(
      <StrictMode>
        <FlagwardProvider apiKey="key">
          <Banner />
        </FlagwardProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText("banner: true")).toBeDefined();
    });

    enabled = false;
    FakeEventSource.last?.emit("flags", flagPayload(false));

    await waitFor(
      () => {
        expect(screen.getByText("banner: false")).toBeDefined();
      },
      { timeout: 3000 },
    );
  });
});


describe("consecutive changes", () => {
  let enabled: boolean;

  beforeEach(() => {
    resetLoggerState();
    enabled = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          String(url).includes("/sdk/flags/")
            ? flagPayload(enabled)
            : { status: "registered" },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("follows a flag turned off and then back on", async () => {
    render(
      <StrictMode>
        <FlagwardProvider apiKey="key">
          <Banner />
        </FlagwardProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByText("banner: true")).toBeDefined());

    enabled = false;
    FakeEventSource.last?.emit("flags", flagPayload(false));
    await waitFor(() => expect(screen.getByText("banner: false")).toBeDefined(), {
      timeout: 3000,
    });

    // Turned back on. The value must follow, not lag one change behind.
    enabled = true;
    FakeEventSource.last?.emit("flags", flagPayload(true));
    await waitFor(() => expect(screen.getByText("banner: true")).toBeDefined(), {
      timeout: 3000,
    });
  });
});


describe("the rendered value comes from React state", () => {
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
          String(url).includes("/sdk/flags/")
            ? flagPayload(true)
            : { status: "registered" },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("ignores flag data mutated behind React's back", async () => {
    /**
     * A hook reading the client's mutable field would pick this up on the next
     * render for any reason at all, showing a value no state update ever
     * published. That is a stale render: what is shown and what caused the
     * render disagree, and nothing reports it.
     */
    let captured: { flagsData: Record<string, unknown> } | null = null;

    function Probe() {
      const context = useContext(FlagwardContext);
      const { value } = useFlag("show-banner");
      const [, force] = useState(0);

      captured = context.client as unknown as { flagsData: Record<string, unknown> };

      return (
        <>
          <p>banner: {String(value)}</p>
          <button type="button" onClick={() => force((n) => n + 1)}>
            render
          </button>
        </>
      );
    }

    render(
      <FlagwardProvider apiKey="key">
        <Probe />
      </FlagwardProvider>,
    );

    await waitFor(() => expect(screen.getByText("banner: true")).toBeDefined());

    // Reach past the published state and change the client's data directly.
    captured!.flagsData = {
      "show-banner": { key: "show-banner", is_enabled: false, rules: [] },
    };

    // Re-render for an entirely unrelated reason.
    act(() => {
      screen.getByRole("button").click();
    });

    // The published state still says true, so that is what must be rendered.
    expect(screen.getByText("banner: true")).toBeDefined();
  });
});
