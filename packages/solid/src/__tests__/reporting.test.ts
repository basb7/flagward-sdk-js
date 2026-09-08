import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createComponent, createEffect, createRoot, createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { resetLoggerState } from "@flagward/core";
import { FlagwardProvider } from "../provider";
import { useFlag } from "../useFlag";

class FakeEventSource {
  readyState = 1;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

function payload() {
  return {
    flags: [
      { key: "beta", name: "Beta", is_enabled: true, flag_type: "BOOLEAN", rules: [] },
    ],
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

function mountReading(key: string) {
  function Probe() {
    const { value } = useFlag(key);
    const el = document.createElement("p");
    createEffect(() => {
      el.textContent = String(value());
    });
    return el;
  }

  return render(() =>
    createComponent(FlagwardProvider, {
      apiKey: "key",
      get children() {
        return createComponent(Probe, {});
      },
    }),
  );
}

describe("reporting a key this environment does not have", () => {
  it("says so once the flags are loaded and the key is not among them", async () => {
    const { unmount } = mountReading("nope");

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"')),
    );

    unmount();
  });

  // The warning is about a key that is genuinely absent, not about the moment
  // before the first snapshot arrives. Reporting during loading would name
  // every flag on every page load.
  it("says nothing while the first snapshot is still on its way", () => {
    const { unmount } = mountReading("nope");

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Flag "nope"'));

    unmount();
  });

  it("says nothing for a key that does exist", async () => {
    const { container, unmount } = mountReading("beta");

    await vi.waitFor(() => expect(container.textContent).toBe("true"));

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Flag "beta"'));

    unmount();
  });

  // The point of moving the reporting out of the memo. Re-evaluating a flag is
  // something Solid does on its own schedule, as often as it likes; if that
  // wrote to the console, the number of warnings would depend on how often
  // Solid happened to recompute rather than on anything that went wrong.
  it("writes nothing when the value is merely re-evaluated", async () => {
    const [plan, setPlan] = createSignal("free");

    function Probe() {
      const { value } = useFlag("nope", () => ({ plan: plan() }));
      const el = document.createElement("p");
      createEffect(() => {
        el.textContent = String(value());
      });
      return el;
    }

    const { unmount } = render(() =>
      createComponent(FlagwardProvider, {
        apiKey: "key",
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );

    // Let the effect report the missing key once, as it should.
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"')),
    );

    // From a clean slate, force the memo to run again several times. The
    // reporting effect will not fire: neither the resolved value nor the
    // loading flag changes. Anything written now came from the memo itself.
    resetLoggerState();
    warn.mockClear();

    for (const value of ["pro", "premium", "enterprise"]) {
      setPlan(value);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warn).not.toHaveBeenCalled();

    unmount();
  });

  // A store or a route guard reaches for a flag outside any consumer. The
  // value still has to resolve there; only the reporting depends on an owner.
  it("still resolves the flag when called outside a consumer", () => {
    const { unmount } = render(() =>
      createComponent(FlagwardProvider, {
        apiKey: "key",
        get children() {
          return document.createElement("p");
        },
      }),
    );

    let resolved: boolean | undefined = undefined;
    const dispose = createRoot((d) => {
      const { value } = useFlag("beta");
      resolved = value();
      return d;
    });

    expect(resolved).toBeUndefined(); // no provider reachable outside the app tree
    dispose();
    unmount();
  });
});
