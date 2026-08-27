import { useContext } from "react";
import { EasyFlagsContext } from "./context";
import type { FlagMap, UserContext } from "./types";

interface UseFlagsResult {
  flags: FlagMap;
  isLoading: boolean;
  error: Error | null;
  getFlag: (key: string, flagContext?: UserContext) => boolean | string | undefined;
}

export function useFlags(): UseFlagsResult {
  const context = useContext(EasyFlagsContext);

  const getFlag = (key: string, flagContext?: UserContext): boolean | string | undefined => {
    const mergedContext = { ...context.context, ...flagContext };
    try {
      return context.client?.evaluate(key, mergedContext);
    } catch {
      return undefined;
    }
  };

  return {
    flags: context.flags,
    isLoading: context.isLoading,
    error: context.error,
    getFlag,
  };
}
