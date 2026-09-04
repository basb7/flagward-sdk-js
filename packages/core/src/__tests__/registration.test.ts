import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SDK_TYPE, FlagwardClient } from "../client";
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

  it("registers as JavaScript when nothing names a type", async () => {
    const fetchMock = captureRegistration();

    await new FlagwardClient({ apiKey: "key" }).register();

    expect(bodyOf(fetchMock).sdk_type).toBe(DEFAULT_SDK_TYPE);
  });

  // An adapter names itself so the dashboard can tell a React application from
  // a Vue one, rather than showing one indistinguishable JavaScript row.
  it("lets an adapter name its own type", async () => {
    const fetchMock = captureRegistration();

    await new FlagwardClient({ apiKey: "key", sdkType: "REACT" }).register();

    expect(bodyOf(fetchMock).sdk_type).toBe("REACT");
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

describe("where requests go", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * The hosted service, so an application that installs this and passes a key
   * works without a second setting. A self-hosted install passes its own host,
   * which is the case that has to be configured either way -- and the one whose
   * operator already knows they are running something.
   */
  it("goes to the hosted service when nothing says otherwise", async () => {
    const fetchMock = captureRegistration();

    await new FlagwardClient({ apiKey: "key" }).register();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://app.flagward.com/api/v1/sdk/register/");
  });

  it("goes where the caller says instead", async () => {
    const fetchMock = captureRegistration();

    await new FlagwardClient({ apiKey: "key", host: "https://flags.example.com" }).register();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://flags.example.com/api/v1/sdk/register/");
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
