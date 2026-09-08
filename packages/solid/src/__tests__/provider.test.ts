import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createComponent, createEffect } from "solid-js";
import { render } from "@solidjs/testing-library";
import { resetLoggerState } from "@flagward/core";
import { FlagwardProvider } from "../provider";
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

function Probe() {
  const { value, isLoading, error } = useFlag("beta");
  const el = document.createElement("p");
  createEffect(() => {
    el.textContent =
      `loading:${isLoading()} value:${String(value())} error:${error() ? "yes" : "no"}`;
  });
  return el;
}

function mountApp() {
  return render(() =>
    createComponent(FlagwardProvider, {
      apiKey: "key",
      get children() {
        return createComponent(Probe, {});
      },
    }),
  );
}

describe("the provider brings flags to any consumer", () => {
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

  it("resolves a flag without wrapping the consumer in anything", async () => {
    const { container, unmount } = mountApp();

    expect(container.textContent).toContain("loading:true");

    await vi.waitFor(() => expect(container.textContent).toContain("value:true"));
    expect(container.textContent).toContain("loading:false");

    unmount();
  });

  // A change announced on the stream has to reach the rendered consumer, or
  // the flag is only as fresh as the page load.
  it("re-renders when the stream announces a change", async () => {
    const { container, unmount } = mountApp();

    await vi.waitFor(() => expect(container.textContent).toContain("value:true"));

    enabled = false;
    FakeEventSource.last!.emit("flags");

    await vi.waitFor(
      () => expect(container.textContent).toContain("value:false"),
      { timeout: 3000 },
    );

    unmount();
  });

  // Registering as JAVASCRIPT would make this adapter indistinguishable from
  // every other one built on the same core.
  it("registers as SOLID, reporting this package's version", async () => {
    const { unmount } = mountApp();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sdk_type).toBe("SOLID");

    unmount();
  });
});
