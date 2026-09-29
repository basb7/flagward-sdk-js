# @flagward/openfeature-web

[OpenFeature](https://openfeature.dev) web provider for
[Flagward](https://github.com/basb7/flagward). Flags are downloaded once and
evaluated in the browser, so an evaluation costs nothing and never blocks on
the network — and changes still arrive in real time over SSE.

If your application already talks to OpenFeature, switching to Flagward is one
line. If it does not, you probably want the Flagward adapter for your framework
instead (`@flagward/react`, `@flagward/vue`, `@flagward/solid`,
`@flagward/svelte`).

> [!NOTE]
> This provider is for the browser (`@openfeature/web-sdk`). A server provider
> for `@openfeature/server-sdk` is not available yet.

## Installation

```bash
npm install @openfeature/web-sdk @flagward/openfeature-web
```

`@flagward/core` comes with the provider — you do not install it separately.

## Quick start

```ts
import { OpenFeature } from "@openfeature/web-sdk";
import { FlagwardWebProvider } from "@flagward/openfeature-web";

await OpenFeature.setContext({ targetingKey: user.id, country: user.country });
await OpenFeature.setProviderAndWait(
  new FlagwardWebProvider({
    apiKey: "your-environment-api-key",
    host: "https://flags.example.com",
  }),
);

const client = OpenFeature.getClient();

if (client.getBooleanValue("new-checkout", false)) {
  renderNewCheckout();
}
```

`host` is optional and defaults to the hosted service at
`https://app.flagward.com`. The options are the same as `FlagwardClient`'s:
`apiKey`, `host`, `timeout` and `logLevel`.

Coming from another provider, the change is the provider itself:

```diff
- OpenFeature.setProvider(new SomeOtherProvider(...));
+ OpenFeature.setProvider(new FlagwardWebProvider({ apiKey }));
```

## The evaluation context

Flagward rules read the same context OpenFeature holds:

- `targetingKey` becomes `user_id`, the identity percentage rollouts and
  variant splits bucket by. A `user_id` attribute is used only when there is no
  targeting key.
- Every other attribute is a trait, under its own name: `country` in the
  context is what a `country EQUALS US` rule reads.

Changing the context (`OpenFeature.setContext`) needs nothing from the server:
the next evaluation uses it.

## Flag types

| OpenFeature call | Flagward flag | Value |
| --- | --- | --- |
| `getBooleanValue` | BOOLEAN | the flag's result |
| `getBooleanValue` | MULTIVARIATE | whether the flag is enabled |
| `getStringValue` | MULTIVARIATE | the variant's name |
| `getStringValue` | BOOLEAN | your default, with `TYPE_MISMATCH` |
| `getNumberValue`, `getObjectValue` | any | your default, with `TYPE_MISMATCH` |

A key this environment does not have answers with your default and
`FLAG_NOT_FOUND`.

## Reasons

`getBooleanDetails` and `getStringDetails` say why a value was chosen:

| Reason | When |
| --- | --- |
| `TARGETING_MATCH` | a rule matched and decided the value |
| `SPLIT` | the user's hash bucket picked the variant |
| `DEFAULT` | nothing targeted the user: no rule matched, or there is no targeting key to split by (the control variant) |
| `STATIC` | the value does not depend on the user: an override, or an enabled flag with nothing to target |
| `DISABLED` | the flag is off |

```ts
client.getStringDetails("checkout-flow", "control");
// { value: "treatment", variant: "treatment", reason: "SPLIT", ... }
```

## Real-time updates

When a flag changes in the dashboard, the provider emits
`ConfigurationChanged`:

```ts
import { ProviderEvents } from "@openfeature/web-sdk";

client.addHandler(ProviderEvents.ConfigurationChanged, () => rerender());
```

If the flags cannot be loaded — a wrong API key, an unreachable host —
`setProviderAndWait` rejects, the provider is in the `ERROR` state, and every
evaluation answers with its default.

## Frameworks

OpenFeature's own SDKs build on this provider:

- React: `@openfeature/react-sdk`
- Angular: `@openfeature/angular-sdk`

Vue, Solid and Svelte have no OpenFeature SDK; there you use
`@openfeature/web-sdk` directly, or Flagward's adapter for the framework.

Pick one entry point per application. The provider and a Flagward adapter each
create their own client, so using both means two connections and two caches
that can briefly disagree.

## License

MIT
