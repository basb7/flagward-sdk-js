/**
 * Console reporting for problems the SDK recovers from on its own.
 *
 * Every failure here is already handled: a flag falls back to `undefined`, a
 * failed fetch leaves the previous flags in place. None of that reaches the
 * host application, which is what makes these problems invisible and hard to
 * diagnose. The logger exists to make them audible without making them fatal.
 */

export type LogLevel = "silent" | "error" | "warn";

const PREFIX = "[Flagward]";

/**
 * Problems repeat: a component that renders a hundred times asks for the same
 * missing flag a hundred times. Reporting each one buries the console, so a
 * given problem is reported once per page load.
 */
const reported = new Set<string>();

/** Clears the reported set. Intended for tests. */
export function resetLoggerState(): void {
  reported.clear();
}

export interface Logger {
  /** A degraded but plausible situation: a missing flag, a dropped stream. */
  warn(key: string, message: string): void;
  /** A situation that cannot work at all: no API key, a rejected one. */
  error(key: string, message: string): void;
}

export function createLogger(level: LogLevel = "warn"): Logger {
  const report = (
    write: (message: string) => void,
    key: string,
    message: string,
  ) => {
    if (reported.has(key)) return;
    reported.add(key);

    // A logger that throws would defeat its own purpose: this runs inside the
    // catch blocks that keep the host application alive.
    try {
      write(`${PREFIX} ${message}`);
    } catch {
      // Nothing left to report it with.
    }
  };

  return {
    warn(key, message) {
      if (level !== "warn") return;
      report((text) => console.warn(text), key, message);
    },
    error(key, message) {
      if (level === "silent") return;
      report((text) => console.error(text), key, message);
    },
  };
}
