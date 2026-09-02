import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FlagwardClient, resetLoggerState } from "@flagward/core";
import { FlagwardProvider } from "../provider";
import { useFlag } from "../useFlag";
import { useFlags } from "../useFlags";

function FlagReader({ flagKey = "beta" }: { flagKey?: string }) {
  const { value } = useFlag(flagKey);
  return <p>flag: {String(value)}</p>;
}

describe("the SDK reports problems without breaking the host application", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetLoggerState();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("no API key", () => {
    it("reports it instead of failing to construct", () => {
      expect(() => new FlagwardClient({ apiKey: "" })).not.toThrow();
      expect(error).toHaveBeenCalledWith(expect.stringContaining("No apiKey"));
    });
  });

  describe("used outside the provider", () => {
    it("renders, returns undefined, and says why", () => {
      render(<FlagReader />);

      expect(screen.getByText("flag: undefined")).toBeDefined();
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("outside FlagwardProvider"),
      );
    });

    it("does not throw out of useFlags either", () => {
      function FlagsReader() {
        const { getFlag } = useFlags();
        return <p>flag: {String(getFlag("beta"))}</p>;
      }

      expect(() => render(<FlagsReader />)).not.toThrow();
      expect(screen.getByText("flag: undefined")).toBeDefined();
    });
  });

  describe("the backend is unreachable", () => {
    it("still renders the tree and falls back to undefined", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
      );

      render(
        <FlagwardProvider apiKey="key" host="http://localhost:9999">
          <FlagReader />
        </FlagwardProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("flag: undefined")).toBeDefined();
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Could not reach"),
      );

      vi.unstubAllGlobals();
    });
  });

  describe("an unknown flag", () => {
    it("is reported once however many times it is read", () => {
      const client = new FlagwardClient({ apiKey: "key" });

      for (let i = 0; i < 20; i++) {
        expect(client.getFlag("never-defined")).toBeUndefined();
      }

      const unknownFlagWarnings = warn.mock.calls.filter(([message]) =>
        String(message).includes("never-defined"),
      );
      expect(unknownFlagWarnings).toHaveLength(1);
    });
  });

  describe("silenced", () => {
    it("writes nothing to the console", () => {
      const client = new FlagwardClient({ apiKey: "", logLevel: "silent" });

      client.getFlag("never-defined");

      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });
  });
});
