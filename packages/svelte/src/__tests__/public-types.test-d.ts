/**
 * The public type surface, checked from a consumer's point of view.
 *
 * This file is only compiled, never run: it fails the build if a type a
 * consumer needs stops being importable, or changes shape. Every declaration
 * here exists because writing it required importing something from the
 * package root. It must never import a .svelte file: tsc cannot resolve
 * that extension on its own, and this file is the one place in the test
 * suite tsc actually type-checks.
 */
import { writable, type Readable } from "svelte/store";
import {
  createFlagward,
  evaluateFlag,
  flagStore,
  flagsStore,
  getFlagward,
  setFlagward,
  toFlagMap,
  useFlag,
  useFlags,
  type FlagData,
  type FlagDataMap,
  type FlagMap,
  type FlagsState,
  type FlagState,
  type FlagwardClientOptions,
  type FlagwardOptions,
  type FlagwardState,
  type LogLevel,
  type Logger,
  type MaybeStore,
  type UseFlagResult,
  type UseFlagsResult,
  type UserContext,
} from "../index";

// createFlagward and setFlagward share one options shape, so a wrapper can
// type its own pass-through props from it.
const options: FlagwardOptions = {
  apiKey: "key",
  host: "https://flags.example.com",
  context: { userId: "123", plan: "pro" },
  logLevel: "warn",
};
void options;

// The level is a closed set, so a typo is caught rather than ignored at runtime.
const level: LogLevel = "silent";
void level;

// A store-returning function's result can be held, passed on, and read
// through the plain store contract -- UseFlagResult and UseFlagsResult are
// not special types of their own, just Readable of a plain shape.
declare const flagResult: UseFlagResult;
declare const flagsResult: UseFlagsResult;
const asReadable: Readable<FlagState> = flagResult;
const asReadableAll: Readable<FlagsState> = flagsResult;
void asReadable;
void asReadableAll;

// A flag resolves to a boolean or nothing -- never a string today, so a
// consumer is not asked to handle a case that cannot happen.
declare const flagState: FlagState;
const value: boolean | undefined = flagState.value;
void value;

const flagsState: FlagsState = { flags: {}, isLoading: true, error: null };
const everyFlag: FlagMap = flagsState.flags;
void everyFlag;

// Context is accepted as a plain object or a store, everywhere it is taken.
void useFlag("beta", { plan: "pro" });
void useFlag("beta", writable({ plan: "pro" }));
void useFlags({ plan: "pro" });
void useFlags(writable({ plan: "pro" }));

// createFlagward returns the same state shape setFlagward puts on the
// context, so flagStore and flagsStore work against either -- the manual
// escape hatch needs no component at all.
declare const state: FlagwardState;
void createFlagward;
void setFlagward;
void getFlagward;
void flagStore(state, "beta");
void flagStore(state, "beta", { plan: "pro" });
void flagsStore(state);
void flagsStore(state, writable({ plan: "pro" }));

// A MaybeStore is exported so a wrapper can type its own pass-through prop.
declare const passthrough: MaybeStore<UserContext>;
void passthrough;

// Evaluation is usable outside Svelte, on data the caller already holds.
const data: FlagData = { key: "beta", is_enabled: true, rules: [] };
const everything: FlagDataMap = { beta: data };
const context: UserContext = { plan: "pro" };

const resolved: boolean | undefined = evaluateFlag(data, context);
const resolvedAll: FlagMap = toFlagMap(everything, context);
void resolved;
void resolvedAll;

// Client options are typable without reaching into the package's internals.
const clientOptions: FlagwardClientOptions = {
  apiKey: "key",
  host: "https://flags.example.com",
  timeout: 5000,
  logLevel: "error",
};
void clientOptions;

declare const logger: Logger;
void logger;
