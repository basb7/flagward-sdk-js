import { readable } from "svelte/store";
import { createLogger, type UserContext } from "@flagward/core";
import { getFlagward } from "./context.js";
import type { MaybeStore } from "./store.js";
import { flagsStore, type UseFlagsResult } from "./flagsStore.js";

export function useFlags(flagContext?: MaybeStore<UserContext>): UseFlagsResult {
  const state = getFlagward();

  if (!state) {
    createLogger().error(
      "no-context",
      "useFlags() was called with no Flagward state on the context, so it can " +
        "only return an empty set. Call setFlagward({ apiKey }) in a root " +
        "component's <script>, for example a SvelteKit +layout.svelte.",
    );

    return readable({ flags: {}, isLoading: false, error: null });
  }

  return flagsStore(state, flagContext);
}
