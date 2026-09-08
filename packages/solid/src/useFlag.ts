import {
  createEffect,
  createMemo,
  getOwner,
  useContext,
  type Accessor,
} from "solid-js";
import { createLogger, evaluateFlag, type UserContext } from "@flagward/core";
import { access, FlagwardContext, type FlagwardState, type MaybeAccessor } from "./context.js";

export interface UseFlagResult {
  /** The flag's value, or undefined while loading or if it does not exist. */
  value: Accessor<boolean | undefined>;
  isLoading: Accessor<boolean>;
  error: Accessor<Error | null>;
}

export function useFlag(
  key: string,
  flagContext?: MaybeAccessor<UserContext>,
): UseFlagResult {
  const state = useContext(FlagwardContext);

  if (!state) {
    createLogger().error(
      "no-provider",
      `useFlag("${key}") was called outside a <FlagwardProvider>, so it can ` +
        "only return undefined. Wrap the app in <FlagwardProvider apiKey={...}>.",
    );

    return {
      value: () => undefined,
      isLoading: () => false,
      error: () => null,
    };
  }

  /**
   * Resolves the flag, and does nothing else.
   *
   * Reading the context through `access` here, rather than capturing it
   * once outside, is what registers the dependency: a context that changes
   * re-evaluates the flag. Spreading a signal instead of calling it would
   * copy nothing -- a signal is a function, and a function has no
   * enumerable properties -- so every attribute would be silently dropped
   * and the rule would simply never match.
   */
  const value = createMemo(() => {
    if (state.isLoading()) return undefined;

    return evaluateFlag(state.flagsData()[key], {
      ...access(state.context),
      ...access(flagContext),
    });
  });

  reportIfUnknown(key, value, state);

  return {
    value,
    isLoading: () => state.isLoading(),
    error: () => state.error(),
  };
}

/**
 * Reports a key this environment does not have, once it is certain it does
 * not.
 *
 * Deliberately not inside the memo above. A memo that writes to the console
 * is not a memo: it runs on Solid's schedule rather than the caller's, it
 * fires or does not depending on whether anybody read the value, and nothing
 * in `const { value } = useFlag(key)` suggests that reading has consequences.
 * Keeping the effect in an effect is what lets the value be read anywhere,
 * any number of times, with nothing happening.
 *
 * Waits for loading to finish. Reporting earlier would name every flag on
 * every page load, when the only thing wrong is that the answer has not
 * arrived yet.
 *
 * Only registered when there is an owner to dispose it. Called from a route
 * guard or a plain module with no owner, an effect would never be torn down,
 * and a leaked effect is a worse trade than a missing console warning.
 */
function reportIfUnknown(
  key: string,
  value: Accessor<boolean | undefined>,
  state: FlagwardState,
): void {
  if (!getOwner()) return;

  createEffect(() => {
    const loading = state.isLoading();
    const resolved = value();

    if (loading || resolved !== undefined) return;

    state.client.logger.warn(
      `unknown-flag:${key}`,
      `Flag "${key}" is not in this environment, so it reads as undefined. ` +
        "Check the key, and that the flag exists in the environment this " +
        "API key belongs to.",
    );
  });
}
