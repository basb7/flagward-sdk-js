import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { FlagwardClient } from "../client";

function flagsResponse() {
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
    ],
  };
}

describe("FlagwardClient.getVariant", () => {
  let client: FlagwardClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => flagsResponse(),
    });
    vi.stubGlobal("fetch", fetchMock);

    client = new FlagwardClient({ apiKey: "test-key", host: "http://localhost:8000" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carries flag_type, variants and overridden through fetchFlags", async () => {
    await client.fetchFlags();

    // hashBucket("user-1", "checkout-flow") = 9.36 -> control
    expect(client.getVariant("checkout-flow", { user_id: "user-1" })).toBe("control");
    // hashBucket("user-0", "checkout-flow") = 77.41 -> treatment
    expect(client.getVariant("checkout-flow", { user_id: "user-0" })).toBe("treatment");
  });

  it("returns undefined, not a throw, for an unknown flag", async () => {
    await client.fetchFlags();

    expect(client.getVariant("nonexistent")).toBeUndefined();
  });

  it("still reads the boolean API as true for a MULTIVARIATE flag", async () => {
    await client.fetchFlags();

    expect(client.getFlag("checkout-flow")).toBe(true);
  });
});
