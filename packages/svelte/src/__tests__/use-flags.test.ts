import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import { render } from "@testing-library/svelte";
import { resetLoggerState, type UserContext } from "@flagward/core";
import AppAll from "./AppAll.svelte";

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
      { key: "legacy", name: "Legacy", is_enabled: false, flag_type: "BOOLEAN", rules: [] },
      {
        key: "pro-only",
        name: "Pro",
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

function mountWith(context?: UserContext) {
  return render(AppAll, { props: { apiKey: "key", context } });
}

describe("reading every flag at once", () => {
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

  it("resolves the whole environment against the root's context", async () => {
    const { container, unmount } = mountWith({ plan: "pro" });

    await vi.waitFor(() => expect(container.textContent).toContain('"legacy":false'));
    expect(container.textContent).toContain('"beta":true');
    expect(container.textContent).toContain('"pro-only":true');

    unmount();
  });

  // The same environment answers differently for a different user. If the
  // map ignored context, a targeting rule would be decoration.
  it("answers a rule differently for a context that does not match", async () => {
    const { container, unmount } = mountWith({ plan: "free" });

    await vi.waitFor(() => expect(container.textContent).toContain('"pro-only":false'));

    unmount();
  });

  it("lets a per-call context store change the resolved map", async () => {
    const perCall = writable<UserContext>({ plan: "free" });

    const { container, unmount } = render(AppAll, {
      props: { apiKey: "key", context: { plan: "free" }, flagContext: perCall },
    });

    await vi.waitFor(() => expect(container.textContent).toContain('"pro-only":false'));

    perCall.set({ plan: "pro" });

    await vi.waitFor(() => expect(container.textContent).toContain('"pro-only":true'));

    unmount();
  });

  it("reads an unknown flag as absent from the map rather than throwing", async () => {
    const { container, unmount } = mountWith();

    await vi.waitFor(() => expect(container.textContent).toContain('"legacy":false'));
    expect(container.textContent).not.toContain("nope");

    unmount();
  });
});
