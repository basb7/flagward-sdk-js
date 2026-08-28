/**
 * The public type surface, checked from a consumer's point of view.
 *
 * This file is only compiled, never run: it fails the build if a type a
 * consumer needs stops being importable, or changes shape. Every declaration
 * here exists because writing it required importing something from the
 * package root.
 */
import {
  evaluateFlag,
  toFlagMap,
  type FlagData,
  type FlagDataMap,
  type FlagMap,
  type FlagwardClientOptions,
  type FlagwardProviderProps,
  type LogLevel,
  type Logger,
  type UserContext,
  type UseFlagResult,
  type UseFlagsResult,
} from "../index";

// A wrapper component can type its own props from the provider's.
type WrapperProps = Pick<FlagwardProviderProps, "apiKey" | "host" | "context" | "logLevel">;
const wrapperProps: WrapperProps = {
  apiKey: "key",
  host: "https://flags.example.com",
  context: { userId: "123", plan: "pro" },
  logLevel: "warn",
};
void wrapperProps;

// The level is a closed set, so a typo is caught rather than ignored at runtime.
const level: LogLevel = "silent";
void level;

// A hook result can be held, passed on, and destructured with types.
declare const flagResult: UseFlagResult;
declare const flagsResult: UseFlagsResult;

// A flag resolves to a boolean or nothing. It is never a string today, so a
// consumer is not asked to handle a case that cannot happen.
const value: boolean | undefined = flagResult.value;
const loading: boolean = flagResult.isLoading;
const failure: Error | null = flagResult.error;
void value;
void loading;
void failure;

const everyFlag: FlagMap = flagsResult.flags;
const oneFlag: boolean | undefined = flagsResult.getFlag("beta", { plan: "pro" });
void everyFlag;
void oneFlag;

// Evaluation is usable outside React, on data the caller already holds.
const data: FlagData = { key: "beta", is_enabled: true, rules: [] };
const everything: FlagDataMap = { beta: data };
const context: UserContext = { plan: "pro" };

const resolved: boolean | undefined = evaluateFlag(data, context);
const resolvedAll: FlagMap = toFlagMap(everything, context);
void resolved;
void resolvedAll;

// Client options are typable without reaching into the package's internals.
const options: FlagwardClientOptions = {
  apiKey: "key",
  host: "https://flags.example.com",
  timeout: 5000,
  logLevel: "error",
};
void options;

declare const logger: Logger;
void logger;
