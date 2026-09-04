# @flagward/vue

Vue SDK for [Flagward](https://github.com/basb7/flagward). Flags are downloaded
once and evaluated in your process, so a flag check costs nothing and never
blocks on the network.

## Installation

```bash
npm install @flagward/vue
```

Requires Vue 3.5 or newer. `@flagward/core` comes with it — you do not install
it separately.

## Quick start

Install the plugin once, on the app:

```ts
// main.ts
import { createApp } from "vue";
import { flagward } from "@flagward/vue";
import App from "./App.vue";

createApp(App)
  .use(flagward({
    apiKey: "your-environment-api-key",
    host: "https://flags.example.com",
  }))
  .mount("#app");
```

Then ask for a flag wherever the decision is actually made:

```vue
<script setup lang="ts">
import { useFlag } from "@flagward/vue";

const { value, isLoading } = useFlag("new-checkout");
</script>

<template>
  <LegacyCheckout v-if="isLoading" />
  <NewCheckout v-else-if="value" />
  <LegacyCheckout v-else />
</template>
```

`host` is optional and defaults to the hosted service at
`https://app.flagward.com`. A self-hosted install passes its own — and that
is the case that has to be configured either way, since its operator already
knows they are running something.

Nothing has to be wrapped. That is the point of installing on the app rather
than providing from a component: a flag is asked for where the decision is
made, not where somebody remembered to put a provider.

## The value is a ref

Composables return `ComputedRef`s, so destructuring keeps reactivity. Templates
unwrap them for you; in `<script>` you read `.value`:

```ts
const { value } = useFlag("new-checkout");

if (value.value) { /* ... */ }
```

`value` is `undefined` while loading, and stays `undefined` for a key this
environment does not have — so decide what an unknown flag means rather than
letting `undefined` decide for you.

## How flags are evaluated

A flag with no rules is its own on/off switch. A flag with rules is evaluated
against a context you supply: rules are tried in priority order and the first
match wins.

Set the context once, for the whole app:

```ts
app.use(flagward({ apiKey, context: { plan: "pro", country: "AR" } }));
```

Or add to it for one call:

```ts
const { value } = useFlag("beta", { betaTester: true });
```

### The context can be reactive

Everywhere a context is taken — the plugin, `useFlag`, `getFlag` — it accepts a
ref or a getter as readily as a plain object:

```ts
const user = ref({ plan: "standard" });

const { value } = useFlag("beta", user);

user.value = { plan: "pro" };   // the flag re-evaluates, the DOM updates
```

```ts
// Or as a getter, when the attributes come from several sources:
const { value } = useFlag("beta", () => ({ plan: plan.value, country: geo.country }));
```

This matters because what an application targets on is not fixed: somebody
signs in, changes plan, switches locale. A context read once at startup would
answer every later evaluation with what was true at startup.

Supported operators: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`,
`IN_LIST`, `CONTAINS`, combined with `AND` or `OR`.

## Composables

### Which one

Reach for `useFlag`. One flag, one decision, one composable — it is what most
components need.

`useFlags` earns its place in three cases:

- **The keys are not known where you write the code** — a debug panel, an admin
  view, anything that iterates.
- **You need a flag where a composable cannot go** — inside an event handler, a
  callback, a conditional branch. Composables run in `setup`; `getFlag` runs
  whenever you call it.
- **A component reads several flags** and one call reads better than five.

### `useFlag(key, context?)`

```ts
const { value, isLoading, error } = useFlag("new-checkout");
```

| | |
| --- | --- |
| `value` | `ComputedRef<boolean \| undefined>` |
| `isLoading` | `ComputedRef<boolean>` — true until the first snapshot arrives |
| `error` | `ComputedRef<Error \| null>` — the last startup failure, cleared when flags arrive |

### `useFlags()`

For a component that reads several flags, or iterates them:

```ts
const { flags, isLoading, error, getFlag } = useFlags();

flags.value;                          // { "new-checkout": true, ... }
getFlag("beta");                      // one flag, app context
getFlag("beta", { plan: "pro" });     // one flag, this context
```

### Where context comes from

Targeting rules are evaluated against a context, and there are two places it
can come from. They are not interchangeable:

```ts
app.use(flagward({ apiKey, context: user }));   // who the user is
useFlag("beta", { plan: "pro" });               // just this call
```

A context passed to `useFlag` belongs to **that call**. It is not published
anywhere: another component cannot see it, and the map `useFlags` returns
resolves against the plugin's context alone. So this is not a contradiction —

```ts
const { value } = useFlag("beta", { plan: "pro" });   // true
const { flags } = useFlags();                          // flags.value.beta === false
```

— it is two questions with two answers. The call was told `"pro"`; the map was
not. Deliberately: if a context passed in one component reached another
component's composable, you would have an invisible channel between parts of an
application that share nothing.

### Putting it together

The user lives in the plugin, once:

```ts
// main.ts
import { createApp, ref } from "vue";
import { flagward } from "@flagward/vue";

const user = ref({ plan: "free", country: "AR", id: null as string | null });

createApp(App)
  .use(flagward({
    apiKey: import.meta.env.VITE_FLAGWARD_API_KEY,
    host: "https://flags.example.com",
    context: user,
  }))
  .mount("#app");

// Signing in updates the ref, and every flag in the application follows.
export function signIn(account: Account) {
  user.value = { plan: account.plan, country: account.country, id: account.id };
}
```

One decision, one flag:

```vue
<!-- Checkout.vue -->
<script setup lang="ts">
import { useFlag } from "@flagward/vue";

const { value: newCheckout, isLoading } = useFlag("new-checkout");
</script>

<template>
  <LegacyCheckout v-if="isLoading" />
  <NewCheckout v-else-if="newCheckout" />
  <LegacyCheckout v-else />
</template>
```

A flag inside a handler, where a composable cannot go:

```vue
<!-- CheckoutForm.vue -->
<script setup lang="ts">
import { useFlags } from "@flagward/vue";

const { getFlag } = useFlags();

function onSubmit(data: FormData) {
  if (getFlag("strict-validation") && !isComplete(data)) {
    return setError("Every field is required.");
  }
  submit(data);
}
</script>
```

And the one case for a per-call context — the flag is about each row, not about
whoever is looking:

```vue
<!-- UserTable.vue -->
<script setup lang="ts">
import { useFlags } from "@flagward/vue";

defineProps<{ users: User[] }>();
const { getFlag } = useFlags();
</script>

<template>
  <tr v-for="u in users" :key="u.id">
    <td>{{ u.name }}</td>
    <td>{{ getFlag("premium-badge", { plan: u.plan }) ? "★" : "" }}</td>
  </tr>
</template>
```

## Losing the network

The plugin opens a server-sent events stream and keeps it in step on its own:

- A flag changed on the server reaches every component within a second.
- Coming back online re-reads the flags, because a dropped connection means
  missed events — reconnecting alone would serve a stale value indefinitely.
- Returning to a backgrounded tab does the same. A machine waking from sleep
  drops the connection without the browser ever reporting the network as gone.
- Where there is no `EventSource` — server rendering, plain Node — live updates
  are reported as off and the flags already read keep working.

A failure never propagates into your application. Flags keep their last known
values and each caller's own fallback decides what the user sees.

## Error reporting

Everything the SDK recovers from is reported to the console once per page load,
prefixed with `[Flagward]`: a missing or rejected API key, an unreachable host,
a flag that is not in this environment, a dropped stream. Narrow it with
`logLevel`:

```ts
app.use(flagward({ apiKey, logLevel: "error" }));   // "warn" | "error" | "silent"
```

## Outside Vue

The client and the evaluator are re-exported here, so a store, a router guard
or a plain module can use them without a component:

```ts
import { FlagwardClient, evaluateFlag } from "@flagward/vue";
```

## Module format

ESM only, with type declarations. There is no CommonJS build.

## License

MIT
