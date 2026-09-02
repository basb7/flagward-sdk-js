/**
 * The public type surface, checked from a consumer's point of view.
 *
 * This file is only compiled, never run: it fails the build if a type a
 * consumer needs stops being importable, or changes shape. Every declaration
 * here exists because writing it required importing something from the
 * package root.
 */
import { ref } from "vue";
import {
  evaluateFlag,
  flagward,
  useFlag,
  toFlagMap,
  type FlagData,
  type FlagDataMap,
  type FlagMap,
  type FlagwardClientOptions,
  type FlagwardPluginOptions,
  type LogLevel,
  type Logger,
  type UserContext,
  type UseFlagResult,
  type UseFlagsResult,
} from "../index";

// A wrapper around the plugin can type its own options from the plugin's.
type AppFlags = Pick<FlagwardPluginOptions, "apiKey" | "host" | "context" | "logLevel">;
const appFlags: AppFlags = {
  apiKey: "key",
  host: "https://flags.example.com",
  context: { userId: "123", plan: "pro" },
  logLevel: "warn",
};
void appFlags;

// The plugin is installable: app.use() takes what this returns.
const plugin = flagward({ apiKey: "key" });
void plugin;

// The level is a closed set, so a typo is caught rather than ignored at runtime.
const level: LogLevel = "silent";
void level;

// A composable result can be held, passed on, and destructured with types.
declare const flagResult: UseFlagResult;
declare const flagsResult: UseFlagsResult;

// A flag resolves to a boolean or nothing, behind a ref. It is never a string
// today, so a consumer is not asked to handle a case that cannot happen.
const value: boolean | undefined = flagResult.value.value;
const loading: boolean = flagResult.isLoading.value;
const failure: Error | null = flagResult.error.value;
void value;
void loading;
void failure;

const everyFlag: FlagMap = flagsResult.flags.value;
void everyFlag;

// Context is accepted as a plain object, a ref, or a getter, everywhere it is
// taken -- a Vue application holds the attributes it targets on reactively.
const plainContext: boolean | undefined = flagsResult.getFlag("beta", { plan: "pro" });
const refContext: boolean | undefined = flagsResult.getFlag("beta", ref({ plan: "pro" }));
const getterContext: boolean | undefined = flagsResult.getFlag("beta", () => ({ plan: "pro" }));
void plainContext;
void refContext;
void getterContext;

declare const fromRef: UseFlagResult;
void useFlag("beta", ref({ plan: "pro" }));
void useFlag("beta", () => ({ plan: "pro" }));
void useFlag("beta", { plan: "pro" });
void fromRef;

// The plugin takes the same three shapes for the application-wide context.
void flagward({ apiKey: "key", context: { plan: "pro" } });
void flagward({ apiKey: "key", context: ref({ plan: "pro" }) });
void flagward({ apiKey: "key", context: () => ({ plan: "pro" }) });

// Evaluation is usable outside Vue, on data the caller already holds.
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
