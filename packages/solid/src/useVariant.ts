import {
  createEffect,
  createMemo,
  getOwner,
  useContext,
  type Accessor,
} from "solid-js";
import { createLogger, evaluateVariant, type UserContext } from "@flagward/core";
import { access, FlagwardContext, type FlagwardState, type MaybeAccessor } from "./context.js";

export interface UseVariantResult {
  /** The variant's name, or undefined while loading, if the flag does not
   * exist, is not MULTIVARIATE, or is disabled/overridden. */
  value: Accessor<string | undefined>;
  isLoading: Accessor<boolean>;
  error: Accessor<Error | null>;
}

/**
 * Resolves a MULTIVARIATE flag's variant. Same shape and reactivity as
 * `useFlag`, just returning a variant name instead of a boolean.
 */
export function useVariant(
  key: string,
  flagContext?: MaybeAccessor<UserContext>,
): UseVariantResult {
  const state = useContext(FlagwardContext);

  if (!state) {
    createLogger().error(
      "no-provider",
      `useVariant("${key}") was called outside a <FlagwardProvider>, so it ` +
        "can only return undefined. Wrap the app in <FlagwardProvider apiKey={...}>.",
    );

    return {
      value: () => undefined,
      isLoading: () => false,
      error: () => null,
    };
  }

  const value = createMemo(() => {
    if (state.isLoading()) return undefined;

    return evaluateVariant(state.flagsData()[key], {
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
 * not -- and not a known flag that simply is not MULTIVARIATE, disabled or
 * overridden, which resolves to undefined for a documented reason rather
 * than an unknown one. See `useFlag`'s equivalent for why this lives in an
 * effect.
 */
function reportIfUnknown(
  key: string,
  value: Accessor<string | undefined>,
  state: FlagwardState,
): void {
  if (!getOwner()) return;

  createEffect(() => {
    const loading = state.isLoading();
    const resolved = value();
    const known = state.flagsData()[key] !== undefined;

    if (loading || resolved !== undefined || known) return;

    state.client.logger.warn(
      `unknown-flag:${key}`,
      `Flag "${key}" is not in this environment, so it reads as undefined. ` +
        "Check the key, and that the flag exists in the environment this " +
        "API key belongs to.",
    );
  });
}
