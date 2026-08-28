import { useContext } from "react";
import { FlagwardContext } from "./context";
import { evaluateFlag, toFlagMap } from "./evaluation";
import { createLogger } from "./logger";
import type { FlagMap, UserContext } from "./types";

export interface UseFlagsResult {
  flags: FlagMap;
  isLoading: boolean;
  error: Error | null;
  getFlag: (key: string, flagContext?: UserContext) => boolean | undefined;
}

export function useFlags(): UseFlagsResult {
  const context = useContext(FlagwardContext);
  const logger = context.client?.logger ?? createLogger();

  if (!context.client) {
    logger.error(
      "no-provider",
      "useFlags() was called outside FlagwardProvider, so it can only return " +
        "an empty set. Wrap the tree in <FlagwardProvider>.",
    );
  }

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
