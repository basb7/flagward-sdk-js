import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createComponent, createEffect, createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { resetLoggerState } from "@flagward/core";
import { FlagwardProvider } from "../provider";
import { useFlag } from "../useFlag";
import { useFlags } from "../useFlags";

class FakeEventSource {
  readyState = 1;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

/** One flag, on only for plan === "pro". */
function payload() {
  return {
    flags: [
      {
        key: "beta",
        name: "Beta",
        is_enabled: true,
        flag_type: "BOOLEAN",
        rules: [
          {
            priority: 1,
            operator_logic: "AND",
            conditions: [{ attribute: "plan", operator: "EQUALS", value: "pro" }],
          },
        ],
      },
    ],
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

function textProbe(read: () => unknown) {
  const el = document.createElement("p");
  createEffect(() => {
    el.textContent = String(read());
  });
  return el;
}

describe("a context that changes while the consumer is mounted", () => {
  it("re-evaluates when a per-call context accessor changes", async () => {
    const [plan, setPlan] = createSignal({ plan: "standard" });

    function Probe() {
      const { value } = useFlag("beta", plan);
      return textProbe(value);
    }

    const { container, unmount } = render(() =>
      createComponent(FlagwardProvider, {
        apiKey: "key",
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );

    await vi.waitFor(() => expect(container.textContent).toBe("false"));

    setPlan({ plan: "pro" });

    await vi.waitFor(() => expect(container.textContent).toBe("true"));

    unmount();
  });

  it("accepts a getter as well as a signal", async () => {
    const [plan, setPlan] = createSignal("standard");

    function Probe() {
      const { value } = useFlag("beta", () => ({ plan: plan() }));
      return textProbe(value);
    }

    const { container, unmount } = render(() =>
      createComponent(FlagwardProvider, {
        apiKey: "key",
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );

    await vi.waitFor(() => expect(container.textContent).toBe("false"));

    setPlan("pro");

    await vi.waitFor(() => expect(container.textContent).toBe("true"));

    unmount();
  });

  // The app-level context is the signed-in user. It changes on sign-in.
  it("re-evaluates when the provider's own context accessor changes", async () => {
    const [appContext, setAppContext] = createSignal({ plan: "standard" });

    function Probe() {
      const { value } = useFlag("beta");
      return textProbe(value);
    }

    const { container, unmount } = render(() =>
      createComponent(FlagwardProvider, {
        apiKey: "key",
        context: appContext,
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );

    await vi.waitFor(() => expect(container.textContent).toBe("false"));

    setAppContext({ plan: "pro" });

    await vi.waitFor(() => expect(container.textContent).toBe("true"));

    unmount();
  });

  // useFlag is covered above. The map useFlags returns has to follow the same
  // context, or two hooks in one consumer disagree about the same flag.
  it("re-evaluates the whole map when the provider's context accessor changes", async () => {
    const [appContext, setAppContext] = createSignal({ plan: "standard" });
    let captured: ReturnType<typeof useFlags>;

    function Probe() {
      captured = useFlags();
      return textProbe(() => captured.flags().beta);
    }

    const { container, unmount } = render(() =>
      createComponent(FlagwardProvider, {
        apiKey: "key",
        context: appContext,
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );

    await vi.waitFor(() => expect(container.textContent).toBe("false"));

    setAppContext({ plan: "pro" });

    await vi.waitFor(() => expect(container.textContent).toBe("true"));
    expect(captured!.flags().beta).toBe(true);

    unmount();
  });

  it("resolves a signal context through useFlags too", async () => {
    const [appContext] = createSignal({ plan: "pro" });
    let captured: ReturnType<typeof useFlags>;

    function Probe() {
      captured = useFlags();
      const el = document.createElement("p");
      el.textContent = "probe";
      return el;
    }

    const { unmount } = render(() =>
      createComponent(FlagwardProvider, {
        apiKey: "key",
        context: appContext,
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );

    await vi.waitFor(() => expect(Object.keys(captured!.flags())).toHaveLength(1));

    expect(captured!.flags().beta).toBe(true);
    expect(captured!.getFlag("beta", { plan: "standard" })).toBe(false);

    unmount();
  });

  // A plain object still has to work: accessor support is an addition.
  it("still accepts a plain object", async () => {
    function Probe() {
      const { value } = useFlag("beta", { plan: "pro" });
      return textProbe(value);
    }

    const { container, unmount } = render(() =>
      createComponent(FlagwardProvider, {
        apiKey: "key",
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );

    await vi.waitFor(() => expect(container.textContent).toBe("true"));

    unmount();
  });
});
