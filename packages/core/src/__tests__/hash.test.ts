import { describe, it, expect } from "vitest";
import { md5Hex, hashBucket } from "../hash";

describe("md5Hex", () => {
  // RFC 1321 test vectors, section A.5.
  it.each([
    ["", "d41d8cd98f00b204e9800998ecf8427e"],
    ["a", "0cc175b9c0f1b6a831c399e269772661"],
    ["abc", "900150983cd24fb0d6963f7d28e17f72"],
    ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
    [
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
      "d174ab98d277d9f5a5611c2c9f419d9f",
    ],
  ])("hashes %j to %s", (input, expected) => {
    expect(md5Hex(input)).toBe(expected);
  });
});

describe("hashBucket", () => {
  // Shared vectors, pinned identically in the backend
  // (`.venv/bin/python -m pytest`), computed from
  // int(md5(f"{user_id}:{flag_key}").hexdigest()[:8], 16) % 10000 / 100.
  it.each([
    ["u-1", "checkout-flow", 77.92],
    ["user-0", "checkout-flow", 77.41],
    ["user-1", "checkout-flow", 9.36],
    ["pro-user-0", "new-pricing", 55.17],
    ["ñandú-42", "new-pricing", 70.25],
    ["", "checkout-flow", 78.23],
    ["12345", "dark-mode", 35.83],
  ])("buckets %j + %j at %s", (userId, flagKey, expected) => {
    expect(hashBucket(userId, flagKey)).toBeCloseTo(expected, 2);
  });

  it("stringifies a non-string userId, like the server's String(user_id)", () => {
    expect(hashBucket(12345, "dark-mode")).toBeCloseTo(35.83, 2);
  });

  it("is deterministic for the same inputs", () => {
    expect(hashBucket("user-1", "checkout-flow")).toBe(hashBucket("user-1", "checkout-flow"));
  });

  it("returns a value in [0, 100)", () => {
    const bucket = hashBucket("some-user", "some-flag");
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(100);
  });
});
