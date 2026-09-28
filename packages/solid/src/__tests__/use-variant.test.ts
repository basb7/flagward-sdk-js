import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createComponent } from "solid-js";
import { render } from "@solidjs/testing-library";
import { resetLoggerState } from "@flagward/core";
import { FlagwardProvider } from "../provider";
import { useVariant } from "../useVariant";

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

let captured: ReturnType<typeof useVariant>;

function Probe(props: { flagKey: string }) {
  captured = useVariant(props.flagKey);
  const el = document.createElement("p");
  el.textContent = "probe";
  return el;
}

function mountWith(flagKey: string) {
  return render(() =>
    createComponent(FlagwardProvider, {
      apiKey: "key",
      get children() {
        return createComponent(Probe, { flagKey });
      },
    }),
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
          String(url).includes("/sdk/flags/") ? payload() : { status: "registered" },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves undefined for a BOOLEAN flag without warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { unmount } = mountWith("beta");

    await vi.waitFor(() => expect(captured.isLoading()).toBe(false));

    expect(captured.value()).toBeUndefined();
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Flag "beta"'));

    unmount();
  });

  it("resolves the control variant when there is no user id", async () => {
    const { unmount } = mountWith("checkout-flow");

    await vi.waitFor(() => expect(captured.isLoading()).toBe(false));

    expect(captured.value()).toBe("control");

    unmount();
  });

  it("warns for a genuinely unknown key, once loaded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { unmount } = mountWith("nope");

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Flag "nope"')),
    );

    unmount();
  });
});
