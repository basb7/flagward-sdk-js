import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createLogger, resetLoggerState } from "../logger";

describe("logger", () => {
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

  it("prefixes messages so they can be traced to this SDK", () => {
    createLogger().warn("missing-key", "no API key");

    expect(warn).toHaveBeenCalledWith("[Flagward] no API key");
  });

  it("reports the same problem once, however often it recurs", () => {
    const logger = createLogger();

    for (let i = 0; i < 50; i++) {
      logger.warn("flag-missing:beta", 'Flag "beta" not found');
    }

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("still reports a different problem", () => {
    const logger = createLogger();

    logger.warn("flag-missing:beta", 'Flag "beta" not found');
    logger.warn("flag-missing:gamma", 'Flag "gamma" not found');

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("uses console.error for problems that are certainly broken", () => {
    createLogger().error("bad-key", "invalid API key");

    expect(error).toHaveBeenCalledWith("[Flagward] invalid API key");
    expect(warn).not.toHaveBeenCalled();
  });

  it("says nothing at all when silenced", () => {
    const logger = createLogger("silent");

    logger.warn("a", "warning");
    logger.error("b", "error");

    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("keeps errors while dropping warnings at the error level", () => {
    const logger = createLogger("error");

    logger.warn("a", "warning");
    logger.error("b", "error");

    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("never throws, whatever the console does", () => {
    warn.mockImplementation(() => {
      throw new Error("console is unavailable");
    });

    expect(() => createLogger().warn("a", "warning")).not.toThrow();
  });
});
