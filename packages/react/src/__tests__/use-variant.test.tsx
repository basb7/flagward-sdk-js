import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { resetLoggerState } from "@flagward/core";
import { FlagwardProvider } from "../provider";
import { useVariant } from "../useVariant";

class FakeEventSource {
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

function flagPayload() {
  return {
    flags: [
      {
        key: "checkout-flow",
        name: "Checkout flow",
        is_enabled: true,
        flag_type: "MULTIVARIATE",
        variants: [
          { name: "control", percentage_allocation: 50, is_control: true },
          { name: "treatment", percentage_allocation: 50, is_control: false },
        ],
        rules: [],
        overridden: false,
      },
      { key: "beta", name: "Beta", is_enabled: true, flag_type: "BOOLEAN", rules: [] },
    ],
  };
}

function Reader({ flagKey, userId }: { flagKey: string; userId?: string }) {
  const { value } = useVariant(flagKey, userId ? { user_id: userId } : undefined);
  return <p>variant: {String(value)}</p>;
}

function renderReading(flagKey: string, userId?: string) {
  return render(
    <FlagwardProvider apiKey="key">
      <Reader flagKey={flagKey} userId={userId} />
    </FlagwardProvider>,
  );
}

describe("useVariant", () => {
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
          String(url).includes("/sdk/flags/") ? flagPayload() : { status: "registered" },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves the variant deterministically for a given user", async () => {
    renderReading("checkout-flow", "user-1");
    // hashBucket("user-1", "checkout-flow") = 9.36 -> control
    await waitFor(() => expect(screen.getByText("variant: control")).toBeDefined());
  });

  it("resolves undefined for a BOOLEAN flag", async () => {
    renderReading("beta");
    await waitFor(() => expect(screen.getByText("variant: undefined")).toBeDefined());
  });

  it("warns for a genuinely unknown key, once loaded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderReading("nope");

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"')),
    );
  });
});
