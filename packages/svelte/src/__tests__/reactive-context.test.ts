import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { render } from "@testing-library/svelte";
import { resetLoggerState } from "@flagward/core";
import App from "./App.svelte";
import AppAll from "./AppAll.svelte";

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

describe("a context that changes while the consumer is mounted", () => {
  it("re-evaluates when a per-call context store changes", async () => {
    const plan = writable({ plan: "standard" });

    const { container, unmount } = render(App, {
      props: { apiKey: "key", flagKey: "beta", flagContext: plan },
    });

    await vi.waitFor(() => expect(container.textContent).toContain("value:false"));

    plan.set({ plan: "pro" });

    await vi.waitFor(() => expect(container.textContent).toContain("value:true"));

    unmount();
  });

  // The app-level context is the signed-in user. It changes on sign-in.
  it("re-evaluates when the root's own context store changes", async () => {
    const appContext = writable({ plan: "standard" });

    const { container, unmount } = render(App, {
      props: { apiKey: "key", flagKey: "beta", context: appContext },
    });

    await vi.waitFor(() => expect(container.textContent).toContain("value:false"));

    appContext.set({ plan: "pro" });

    await vi.waitFor(() => expect(container.textContent).toContain("value:true"));

    unmount();
  });

  // useFlag is covered above. The map useFlags returns has to follow the
  // same context, or two components reading the same flag through different
  // functions would disagree about it.
  it("re-evaluates the whole map when the root's context store changes", async () => {
    const appContext = writable({ plan: "standard" });

    const { container, unmount } = render(AppAll, {
      props: { apiKey: "key", context: appContext },
    });

    await vi.waitFor(() => expect(container.textContent).toContain('"beta":false'));

    appContext.set({ plan: "pro" });

    await vi.waitFor(() => expect(container.textContent).toContain('"beta":true'));

    unmount();
  });

  // A plain object still has to work: store support is an addition on top of
  // it, not a replacement for it.
  it("still accepts a plain object", async () => {
    const { container, unmount } = render(App, {
      props: { apiKey: "key", flagKey: "beta", flagContext: { plan: "pro" } },
    });

    await vi.waitFor(() => expect(container.textContent).toContain("value:true"));

    unmount();
  });
});
