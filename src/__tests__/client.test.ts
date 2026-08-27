import { describe, it, expect } from "vitest";
import { EasyFlagsClient } from "../client";

describe("EasyFlagsClient", () => {
  it("should create client with options", () => {
    const client = new EasyFlagsClient({
      apiKey: "test-key",
      host: "http://localhost:8000",
    });

    expect(client).toBeDefined();
  });

  it("should not be ready before init", () => {
    const client = new EasyFlagsClient({ apiKey: "test-key" });
    expect(client.isReady()).toBe(false);
  });
});
