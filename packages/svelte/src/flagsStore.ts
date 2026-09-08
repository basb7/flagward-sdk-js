import { derived, type Readable } from "svelte/store";
import { toFlagMap, type FlagMap, type UserContext } from "@flagward/core";
import { toReadable, type MaybeStore } from "./store.js";
import type { FlagwardState } from "./createFlagward.js";

export interface FlagsState {
  flags: FlagMap;
  isLoading: boolean;
  error: Error | null;
}

export type UseFlagsResult = Readable<FlagsState>;

/**
 * Resolves every flag in the environment against a state built by
 * createFlagward or setFlagward.
 *
 * No unknown-flag reporting here, unlike flagStore. `toFlagMap` only returns
 * keys that actually exist in the environment, so there is never a missing
 * key for this function to report on -- `getFlag` on the state is where a
 * named key that might not exist gets an answer, and a warning to go with
 * it.
 */
export function flagsStore(
  state: FlagwardState,
  flagContext?: MaybeStore<UserContext>,
): UseFlagsResult {
  return derived(
    [
      state.flagsData,
      state.isLoading,
      state.error,
      toReadable(state.context),
      toReadable(flagContext ?? {}),
    ],
    ([flagsData, isLoading, error, appContext, callContext]) => ({
      flags: toFlagMap(flagsData, { ...appContext, ...callContext }),
      isLoading,
      error,
    }),
  );
}
