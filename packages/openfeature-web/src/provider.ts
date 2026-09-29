import {
  ClientProviderEvents,
  ErrorCode,
  OpenFeatureEventEmitter,
  StandardResolutionReasons,
  type EvaluationContext,
  type JsonValue,
  type Provider,
  type ResolutionDetails,
} from "@openfeature/web-sdk";
import {
  FlagwardClient,
  evaluateFlagDetail,
  evaluateVariantDetail,
  type FlagData,
  type FlagwardClientOptions,
  type UserContext,
} from "@flagward/core";
import { SDK_VERSION } from "./version.js";

/** The type this provider registers as, so the dashboard can tell it apart. */
export const SDK_TYPE = "OPENFEATURE_WEB";

export type FlagwardWebProviderOptions = Omit<FlagwardClientOptions, "sdkType" | "sdkVersion">;

/**
 * Map an OpenFeature evaluation context onto the user context Flagward's rules
 * read. `targetingKey` is the identity OpenFeature standardises on and becomes
 * `user_id`, the attribute the hash buckets by; an explicit `user_id` is kept
 * only when there is no targeting key. Every other attribute passes through as
 * a trait, under its own name.
 */
function toUserContext(context: EvaluationContext): UserContext {
  const { targetingKey, ...attributes } = context;
  if (targetingKey === undefined) {
    return attributes;
  }

  return { ...attributes, user_id: targetingKey };
}

function flagNotFound<T>(flagKey: string, defaultValue: T): ResolutionDetails<T> {
  return {
    value: defaultValue,
    reason: StandardResolutionReasons.ERROR,
    errorCode: ErrorCode.FLAG_NOT_FOUND,
    errorMessage: `Flag "${flagKey}" is not in this environment.`,
  };
}

function typeMismatch<T>(flagKey: string, defaultValue: T, expected: string): ResolutionDetails<T> {
  return {
    value: defaultValue,
    reason: StandardResolutionReasons.ERROR,
    errorCode: ErrorCode.TYPE_MISMATCH,
    errorMessage: `Flag "${flagKey}" cannot be read as ${expected}.`,
  };
}

/**
 * OpenFeature provider for the browser, backed by `@flagward/core`.
 *
 * Flags are downloaded once and evaluated locally, which is why the resolvers
 * can be synchronous as the web SDK requires. Changes arrive over SSE and are
 * announced as `ConfigurationChanged`.
 *
 * There is no `onContextChange`: evaluation reads the context on every call
 * and needs nothing from the server, so a new context takes effect on the next
 * evaluation without reconciling.
 */
export class FlagwardWebProvider implements Provider {
  readonly metadata = { name: "flagward" } as const;
  readonly runsOn = "client";
  readonly events = new OpenFeatureEventEmitter();

  /** The underlying Flagward client, for callers that need it directly. */
  readonly client: FlagwardClient;

  private unsubscribe: (() => void) | null = null;

  constructor(options: FlagwardWebProviderOptions) {
    this.client = new FlagwardClient({ ...options, sdkType: SDK_TYPE, sdkVersion: SDK_VERSION });
  }

  async initialize(): Promise<void> {
    // No PROVIDER_READY or PROVIDER_ERROR is emitted here, on purpose. The
    // spec's hardening draft (2.8.2, 2.8.3) makes the provider their sole
    // source, but @openfeature/web-sdk still derives both from how this
    // promise settles and emits them itself. Emitting them too would run every
    // handler twice. Revisit when the SDK adopts that part of the spec; a test
    // counts the handler calls.
    await this.client.init();

    this.unsubscribe = this.client.subscribe(() => {
      this.events.emit(ClientProviderEvents.ConfigurationChanged);
    });
    this.client.connect();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.client.destroy();
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): ResolutionDetails<boolean> {
    const detail = evaluateFlagDetail(this.flag(flagKey), toUserContext(context));
    if (!detail) {
      return flagNotFound(flagKey, defaultValue);
    }

    return { value: detail.value, reason: detail.reason };
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): ResolutionDetails<string> {
    const flag = this.flag(flagKey);
    if (!flag) {
      return flagNotFound(flagKey, defaultValue);
    }

    // Only a MULTIVARIATE flag has a string to give: its variant name.
    if (flag.flag_type !== "MULTIVARIATE") {
      return typeMismatch(flagKey, defaultValue, "a string: it is not MULTIVARIATE");
    }

    const detail = evaluateVariantDetail(flag, toUserContext(context))!;
    if (detail.value === undefined) {
      return { value: defaultValue, reason: detail.reason };
    }

    return { value: detail.value, variant: detail.value, reason: detail.reason };
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number): ResolutionDetails<number> {
    return this.unsupported(flagKey, defaultValue, "a number");
  }

  resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T): ResolutionDetails<T> {
    return this.unsupported(flagKey, defaultValue, "an object");
  }

  private flag(flagKey: string): FlagData | undefined {
    return this.client.snapshot[flagKey];
  }

  /** Flagward has no number or object flags; a known key is the wrong type. */
  private unsupported<T>(flagKey: string, defaultValue: T, expected: string): ResolutionDetails<T> {
    if (!this.flag(flagKey)) {
      return flagNotFound(flagKey, defaultValue);
    }

    return typeMismatch(flagKey, defaultValue, expected);
  }
}
