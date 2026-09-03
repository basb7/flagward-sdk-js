import { useContext, useEffect, useMemo } from "react";
import { FlagwardContext } from "./context.js";
import { createLogger, evaluateFlag, toFlagMap } from "@flagward/core";
import type { FlagMap, UserContext } from "@flagward/core";

export interface UseFlagsResult {
  flags: FlagMap;
  isLoading: boolean;
  error: Error | null;
  getFlag: (key: string, flagContext?: UserContext) => boolean | undefined;
}

export function useFlags(): UseFlagsResult {
  const context = useContext(FlagwardContext);

  // Memoised so the effect below has a stable dependency. See useFlag.
  const logger = useMemo(
    () => context.client?.logger ?? createLogger(),
    [context.client],
  );

  // Reported after the render, not during it: rendering must be a pure
  // calculation, and React runs it as often as it likes.
  useEffect(() => {
    if (context.client) return;

    logger.error(
      "no-provider",
      "useFlags() was called outside FlagwardProvider, so it can only return " +
        "an empty set. Wrap the tree in <FlagwardProvider>.",
    );
  }, [context.client, logger]);

  /**
   * Resolves one flag, and reports a key this environment does not have.
   *
   * Reporting inline here, where the render moved it into an effect, is not an
   * inconsistency. This is a function the caller invokes: it runs when asked
   * to, exactly as often as it is asked, so a warning is a direct answer to a
   * direct question. A render runs on React's schedule instead, which is why
   * the reporting had to leave it.
   */
  const getFlag = (key: string, flagContext?: UserContext): boolean | undefined => {
    const mergedContext = { ...context.context, ...flagContext };
    const value = evaluateFlag(context.flagsData[key], mergedContext);

    if (value === undefined) {
      logger.warn(
        `unknown-flag:${key}`,
        `Flag "${key}" is not in this environment, so it reads as undefined. ` +
          "Check the key, and that the flag exists in the environment this " +
          "API key belongs to.",
      );
    }

    return value;
  };

  return {
    flags: toFlagMap(context.flagsData, context.context),
    isLoading: context.isLoading,
    error: context.error,
    getFlag,
  };
}
