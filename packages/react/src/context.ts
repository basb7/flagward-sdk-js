"use client";

import { createContext } from "react";
import { FlagwardClient } from "@flagward/core";
import type { FlagDataMap, UserContext } from "@flagward/core";

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
