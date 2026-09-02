import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { resetLoggerState } from "@flagward/core";
import { FlagwardProvider } from "../provider";
import { useFlag } from "../useFlag";

/** Minimal EventSource stand-in: jsdom has none, and the test drives it. */
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
}

function flagResponse(isEnabled: boolean) {
  return {
    flags: [
      { key: "beta", name: "Beta", is_enabled: isEnabled, flag_type: "BOOLEAN", rules: [] },
    ],
  };
}

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

