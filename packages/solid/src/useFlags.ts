import { createMemo, useContext, type Accessor } from "solid-js";
import {
  createLogger,
  evaluateFlag,
  toFlagMap,
  type FlagMap,
  type UserContext,
} from "@flagward/core";
import { access, FlagwardContext, type MaybeAccessor } from "./context.js";

export interface UseFlagsResult {
  flags: Accessor<FlagMap>;
  isLoading: Accessor<boolean>;
  error: Accessor<Error | null>;
  /** Resolve one flag, optionally against attributes this call adds. */
  getFlag: (key: string, flagContext?: MaybeAccessor<UserContext>) => boolean | undefined;
}

export function useFlags(): UseFlagsResult {
  const state = useContext(FlagwardContext);

  if (!state) {
    createLogger().error(
      "no-provider",
      "useFlags() was called outside a <FlagwardProvider>, so it can only " +
        "return an empty set. Wrap the app in <FlagwardProvider apiKey={...}>.",
    );

    return {
      flags: () => ({}),
      isLoading: () => false,
      error: () => null,
      getFlag: () => undefined,
    };
  }

  const logger = state.client.logger;

  /**
   * Resolves one flag, and reports a key this environment does not have.
   *
   * Reporting inline here, where `useFlag` moved it into an effect, is not
   * an inconsistency. This is a function the caller invokes: it runs when
   * asked to, exactly as often as it is asked, so a warning is a direct
   * answer to a direct question. A memo runs on Solid's schedule instead,
   * which is why the effect had to leave it.
   */
  const getFlag = (
    key: string,
    flagContext?: MaybeAccessor<UserContext>,
  ): boolean | undefined => {
    const resolved = evaluateFlag(state.flagsData()[key], {
      ...access(state.context),
      ...access(flagContext),
    });

    if (resolved === undefined) {
      logger.warn(
        `unknown-flag:${key}`,
        `Flag "${key}" is not in this environment, so it reads as undefined. ` +
          "Check the key, and that the flag exists in the environment this " +
          "API key belongs to.",
      );
    }

    return resolved;
  };

  return {
    flags: createMemo(() => toFlagMap(state.flagsData(), access(state.context))),
    isLoading: () => state.isLoading(),
    error: () => state.error(),
    getFlag,
  };
}
