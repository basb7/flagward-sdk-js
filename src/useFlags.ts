import { useContext } from "react";
import { EasyFlagsContext } from "./context";
import type { FlagMap } from "./types";

interface UseFlagsResult {
  flags: FlagMap;
  isLoading: boolean;
  error: Error | null;
  getFlag: (key: string) => boolean | string | undefined;
}

export function useFlags(): UseFlagsResult {
  const context = useContext(EasyFlagsContext);

  const getFlag = (key: string): boolean | string | undefined => {
    return context.flags[key];
  };

  return {
    flags: context.flags,
    isLoading: context.isLoading,
    error: context.error,
    getFlag,
  };
}
