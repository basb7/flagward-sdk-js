import { createContext } from "react";
import { FlagwardClient } from "./client";
import type { FlagDataMap, UserContext } from "./types";

export interface FlagwardContextValue {
  client: FlagwardClient | null;
  /** The flag data this render was produced from. */
  flagsData: FlagDataMap;
  isLoading: boolean;
  error: Error | null;
  context: UserContext;
}

export const FlagwardContext = createContext<FlagwardContextValue>({
  client: null,
  flagsData: {},
  isLoading: false,
  error: null,
  context: {},
});
