import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FlagwardClient } from "../client";
import { SDK_VERSION } from "../version";

function captureRegistration() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: "registered" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

describe("registering with the server", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // The server stores sdk_type against a closed set of choices, but Django
  // does not validate choices on save, so an unknown value is accepted and
  // sits in the analytics as a type nothing else knows about.
  it("registers as a type the server actually knows", async () => {
    const fetchMock = captureRegistration();

    await new FlagwardClient({ apiKey: "key" }).register();

    expect(bodyOf(fetchMock).sdk_type).toBe("JAVASCRIPT");
  });

  it("reports this package's own version by default", async () => {
    const fetchMock = captureRegistration();

    await new FlagwardClient({ apiKey: "key" }).register();

    expect(bodyOf(fetchMock).version).toBe(SDK_VERSION);
  });

  // An adapter published on its own release cycle reports its own version,
  // otherwise every framework SDK claims to be the core.
  it("lets an adapter report its own version instead", async () => {
    const fetchMock = captureRegistration();

    await new FlagwardClient({ apiKey: "key", sdkVersion: "9.9.9" }).register();

    expect(bodyOf(fetchMock).version).toBe("9.9.9");
  });
});

describe("the reported version", () => {
  // Hardcoding the version next to the code that sends it is how it silently
  // drifts from what was actually published. This is the guard.
  it("is the version this package publishes", () => {
    // Resolved from the working directory rather than import.meta.url: these
    // tests run under jsdom, where module URLs are http, not file.
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    );
    expect(SDK_VERSION).toBe(pkg.version);
  });
});
