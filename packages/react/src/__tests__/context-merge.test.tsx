import { useState } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { resetLoggerState } from "@flagward/core";
import { FlagwardProvider } from "../provider";
import { useFlag } from "../useFlag";
import { useFlags } from "../useFlags";

class FakeEventSource {
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

/** One flag, on only for a plan the rule lists. */
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

describe("the provider's context and a call's context", () => {
  it("resolves against the provider when a call adds nothing", async () => {
    function Reader() {
      const { value } = useFlag("beta");
      return <p>beta: {String(value)}</p>;
    }

    render(
      <FlagwardProvider apiKey="key" context={{ plan: "pro" }}>
        <Reader />
      </FlagwardProvider>,
    );

    await waitFor(() => expect(screen.getByText("beta: true")).toBeDefined());
  });

  it("lets a call override the provider, key by key", async () => {
    function Reader() {
      const { value } = useFlag("beta", { plan: "pro" });
      return <p>beta: {String(value)}</p>;
    }

    render(
      <FlagwardProvider apiKey="key" context={{ plan: "free", country: "AR" }}>
        <Reader />
      </FlagwardProvider>,
    );

    await waitFor(() => expect(screen.getByText("beta: true")).toBeDefined());
  });

  /**
   * The asymmetry worth knowing before it surprises somebody.
   *
   * A context passed to useFlag belongs to that call. It is not published
   * anywhere: another component cannot see it, and useFlags() resolves its map
   * against the provider's context alone. Two hooks disagreeing here is not a
   * disagreement — they were asked different questions.
   */
  it("keeps a call's context to that call, out of the map useFlags returns", async () => {
    let mapValue: boolean | undefined;

    function Reader() {
      const { value } = useFlag("beta", { plan: "pro" });
      const { flags } = useFlags();
      mapValue = flags.beta;
      return <p>call: {String(value)}</p>;
    }

    render(
      <FlagwardProvider apiKey="key" context={{ plan: "free" }}>
        <Reader />
      </FlagwardProvider>,
    );

    await waitFor(() => expect(screen.getByText("call: true")).toBeDefined());

    // Same flag, same render, same environment. The call was told "pro"; the
    // map was not.
    expect(mapValue).toBe(false);
  });

  /**
   * And the way to make both follow: change the provider's context.
   *
   * State held inside a child cannot reach a sibling's hook — nothing carries
   * it. Lifting it to where the provider is rendered is what makes one answer
   * apply everywhere.
   */
  it("updates both when the provider's own context changes", async () => {
    let mapValue: boolean | undefined;
    let upgrade: () => void;

    function Reader() {
      const { value } = useFlag("beta");
      const { flags } = useFlags();
      mapValue = flags.beta;
      return <p>hook: {String(value)}</p>;
    }

    function App() {
      const [plan, setPlan] = useState("free");
      upgrade = () => setPlan("pro");

      return (
        <FlagwardProvider apiKey="key" context={{ plan }}>
          <Reader />
        </FlagwardProvider>
      );
    }

    render(<App />);

    await waitFor(() => expect(screen.getByText("hook: false")).toBeDefined());
    expect(mapValue).toBe(false);

    act(() => upgrade());

    expect(screen.getByText("hook: true")).toBeDefined();
    expect(mapValue).toBe(true);
  });
});
