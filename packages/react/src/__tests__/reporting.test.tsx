import { StrictMode, useState } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { resetLoggerState } from "@flagward/core";
import { FlagwardProvider } from "../provider";
import { useFlag } from "../useFlag";

/** Minimal EventSource stand-in: jsdom has none. */
class FakeEventSource {
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

function flagPayload() {
  return {
    flags: [
      { key: "beta", name: "Beta", is_enabled: true, flag_type: "BOOLEAN", rules: [] },
    ],
  };
}

let warn: ReturnType<typeof vi.spyOn>;
let rerender: () => void;

function Reader({ flagKey }: { flagKey: string }) {
  const { value } = useFlag(flagKey);
  const [, setTick] = useState(0);
  rerender = () => setTick((n) => n + 1);
  return <p>flag: {String(value)}</p>;
}

function renderReading(flagKey: string) {
  return render(
    <FlagwardProvider apiKey="key">
      <Reader flagKey={flagKey} />
    </FlagwardProvider>,
  );
}

describe("reporting a key this environment does not have", () => {
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
          String(url).includes("/sdk/flags/") ? flagPayload() : { status: "registered" },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("says so once the flags are loaded and the key is not among them", async () => {
    renderReading("nope");

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"')),
    );
  });

  // The warning is about a key that is genuinely absent, not about the moment
  // before the first snapshot arrives. Reporting during loading would fire for
  // every flag on every page load.
  it("says nothing while the first snapshot is still on its way", () => {
    renderReading("nope");

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Flag "nope"'));
  });

  it("says nothing for a key that does exist", async () => {
    renderReading("beta");

    await waitFor(() => expect(screen.getByText("flag: true")).toBeDefined());

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Flag "beta"'));
  });

  // StrictMode exists to expose impure renders: it runs the render twice, and
  // the effects mount, unmount and mount again. The warning has to survive that
  // as one warning -- neither doubled, nor lost to the unmount in between.
  it("reports exactly once under StrictMode", async () => {
    render(
      <StrictMode>
        <FlagwardProvider apiKey="key">
          <Reader flagKey="nope" />
        </FlagwardProvider>
      </StrictMode>,
    );

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"')),
    );

    const forKey = warn.mock.calls.filter(([message]) =>
      String(message).includes('Flag "nope"'),
    );
    expect(forKey).toHaveLength(1);
  });

  // The reason to keep reporting out of the render. React re-renders on its own
  // schedule -- a parent updating, a state change elsewhere, StrictMode running
  // the render twice on purpose -- and if rendering wrote to the console, the
  // number of warnings would depend on how often React happened to re-render
  // rather than on anything that went wrong.
  it("writes nothing when the component merely re-renders", async () => {
    renderReading("nope");

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"')),
    );

    resetLoggerState();
    warn.mockClear();

    for (let i = 0; i < 5; i++) {
      act(() => rerender());
    }

    expect(warn).not.toHaveBeenCalled();
  });
});
