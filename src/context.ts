import { createContext } from "react";
import { EasyFlagsClient } from "./client";
import type { FlagMap, UserContext } from "./types";

export interface EasyFlagsContextValue {
  client: EasyFlagsClient | null;
  flags: FlagMap;
  isLoading: boolean;
  error: Error | null;
  context: UserContext;
}

export const EasyFlagsContext = createContext<EasyFlagsContextValue>({
  client: null,
  flags: {},
  isLoading: false,
  error: null,
  context: {},
});
