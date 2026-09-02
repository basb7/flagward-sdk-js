import type { InjectionKey, MaybeRefOrGetter, Ref, ShallowRef } from "vue";
import type { FlagDataMap, FlagwardClient, UserContext } from "@flagward/core";

export interface FlagwardState {
  client: FlagwardClient;
  /**
   * The flag data every composable reads from.
   *
   * Shallow on purpose: the client hands over a whole new snapshot rather than
   * mutating the old one, so deep reactivity would walk every flag and every
   * rule on each update to observe a change that always happens at the root.
   */
  flagsData: ShallowRef<FlagDataMap>;
  isLoading: Ref<boolean>;
  error: Ref<Error | null>;
  /**
   * Held unresolved. The attributes an application targets on -- the plan, the
   * country, whether anybody is signed in -- change while it runs, so reading
   * this once at install would answer every later evaluation with what was
   * true at startup.
   */
  context: MaybeRefOrGetter<UserContext>;
}

/**
 * Symbol rather than a string: an injection key that cannot collide with
 * another library's, whatever it decides to call itself.
 */
export const FLAGWARD: InjectionKey<FlagwardState> = Symbol("flagward");
