import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, waitFor } from "@testing-library/react";
import { resetLoggerState } from "@flagward/core";
import { FlagwardProvider } from "../provider";
import { SDK_VERSION } from "../version";

describe("the version this adapter registers with", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // The core has its own release cycle. Without this, every React application
  // would report the core's version and the dashboard would never show which
  // version of this package is actually installed.
  it("is this package's version, not the core's", async () => {
    resetLoggerState();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("EventSource", undefined);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ flags: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<FlagwardProvider apiKey="key"><span /></FlagwardProvider>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).version).toBe(SDK_VERSION);

    view.unmount();
  });

  it("is the version this package publishes", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(SDK_VERSION).toBe(pkg.version);
  });
});
