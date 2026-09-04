import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

/**
 * React APIs that only exist on the client. A module reaching for any of them
 * cannot run in a React Server Component, and in Next.js's App Router that is
 * not a warning -- the build fails, with an error naming the hook.
 */
const CLIENT_ONLY = /\b(useState|useEffect|useContext|useMemo|createContext)\b/;

function modules(): string[] {
  return readdirSync(SRC).filter((name) => /\.tsx?$/.test(name));
}

describe("the client boundary", () => {
  /**
   * Without the directive, importing FlagwardProvider from a layout.tsx fails
   * the build: "You're importing a component that needs useState. It only
   * works in a Client Component." The consumer's fix is to re-export it from a
   * file of their own carrying the directive -- work this package should do
   * once instead of asking every application to do it again.
   *
   * Asserted on the source rather than the build because a module added later
   * would otherwise ship without it and nobody would notice until somebody
   * tried it in Next.
   */
  it("declares itself on every module that uses a client-only React API", () => {
    const missing = modules().filter((name) => {
      const source = readFileSync(join(SRC, name), "utf8");
      return CLIENT_ONLY.test(source) && !source.startsWith('"use client"');
    });

    expect(missing).toEqual([]);
  });

  /**
   * index.ts re-exports the core -- FlagwardClient, evaluateFlag, the types --
   * which runs anywhere. Marking the entry point as client-only would put a
   * server component that only wants the evaluator on the wrong side of the
   * boundary. The directive belongs on the modules that need it.
   */
  it("leaves the entry point free of it", () => {
    const index = readFileSync(join(SRC, "index.ts"), "utf8");

    expect(index.startsWith('"use client"')).toBe(false);
  });
});
