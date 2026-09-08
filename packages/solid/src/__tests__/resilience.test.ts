import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createComponent, createEffect } from "solid-js";
import { render } from "@solidjs/testing-library";
import { resetLoggerState } from "@flagward/core";
import { FlagwardProvider } from "../provider";
import { useFlag } from "../useFlag";
import { useFlags } from "../useFlags";
import { SDK_VERSION } from "../version";

function Probe() {
  const { value, error } = useFlag("beta");
  const el = document.createElement("p");
  createEffect(() => {
    el.textContent = `value:${String(value())} error:${error() ? "yes" : "no"}`;
  });
  return el;
}

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

    const { unmount } = render(() =>
      createComponent(FlagwardProvider, {
        apiKey: "",
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );

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

    const { container, unmount } = render(() =>
      createComponent(FlagwardProvider, {
        apiKey: "key",
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );

    await vi.waitFor(() => expect(container.textContent).toContain("error:yes"));
    expect(container.textContent).toContain("value:undefined");

    unmount();
  });

  it("does not throw out of a hook used without the provider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    function Orphan() {
      const flag = useFlag("beta");
      const all = useFlags();
      const el = document.createElement("p");
      el.textContent = `${String(flag.value())}|${Object.keys(all.flags()).length}`;
      return el;
    }

    const { container, unmount } = render(() => createComponent(Orphan, {}));

    expect(container.textContent).toBe("undefined|0");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("FlagwardProvider"));

    unmount();
  });

  // A client left alive after the app is gone keeps its stream open and keeps
  // listening on the shared document, waking up long after anybody cares.
  it("tears the client down when the application unmounts", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ flags: [] }) })),
    );

    const { unmount } = render(() =>
      createComponent(FlagwardProvider, {
        apiKey: "key",
        get children() {
          return createComponent(Probe, {});
        },
      }),
    );

    // connect() runs after init settles, so the listener does not exist yet on
    // the first render. Waiting for the text would unmount before it is added
    // and prove nothing.
    await vi.waitFor(() =>
      expect(addListener).toHaveBeenCalledWith("online", expect.any(Function)),
    );

    unmount();

    expect(removeListener).toHaveBeenCalledWith("online", expect.any(Function));
  });
});

describe("the reported version", () => {
  it("is the version this package publishes", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(SDK_VERSION).toBe(pkg.version);
  });
});
