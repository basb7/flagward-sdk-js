import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { get } from "svelte/store";
import { render } from "@testing-library/svelte";
import { resetLoggerState } from "@flagward/core";
import App from "./App.svelte";
import { useFlag } from "../useFlag.js";
import { useFlags } from "../useFlags.js";
import { SDK_VERSION } from "../version.js";

describe("the SDK reports problems without breaking the application", () => {
  beforeEach(() => {
    resetLoggerState();
    vi.stubGlobal("EventSource", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports a missing API key instead of failing to mount", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ flags: [] }) })),
    );

    const { unmount } = render(App, { props: { apiKey: "", flagKey: "beta" } });

    expect(error).toHaveBeenCalledWith(expect.stringContaining("No apiKey"));
    unmount();
  });

  it("still renders when the server cannot be reached, and records why", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const { container, unmount } = render(App, { props: { apiKey: "key", flagKey: "beta" } });

    await vi.waitFor(() => expect(container.textContent).toContain("error:yes"));
    expect(container.textContent).toContain("value:undefined");

    unmount();
  });

  // A store or a route guard can reach for useFlag/useFlags with no
  // component above it at all, not just no setFlagward. Neither should throw
  // out of the caller's own code.
  it("does not throw when useFlag is called with no Flagward state on the context", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const flag = useFlag("beta");

    expect(get(flag)).toEqual({ value: undefined, isLoading: false, error: null });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("setFlagward"));
  });

  it("does not throw when useFlags is called with no Flagward state on the context", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const all = useFlags();

    expect(get(all)).toEqual({ flags: {}, isLoading: false, error: null });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("setFlagward"));
  });
});

describe("the reported version", () => {
  it("is the version this package publishes", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(SDK_VERSION).toBe(pkg.version);
  });
});
