# @flagward/solid

Solid SDK for [Flagward](https://github.com/basb7/flagward). Flags are downloaded
once and evaluated in your process, so a flag check costs nothing and never
blocks on the network.

## Installation

```bash
npm install @flagward/solid
```

Requires Solid 1.8 or newer. `@flagward/core` comes with it — you do not
install it separately.

## Quick start

Wrap the app in the provider once:

```tsx
// index.tsx
import { render } from "solid-js/web";
import { FlagwardProvider } from "@flagward/solid";
import App from "./App";

render(
  () => (
    <FlagwardProvider
      apiKey="your-environment-api-key"
      host="https://flags.example.com"
    >
      <App />
    </FlagwardProvider>
  ),
  document.getElementById("root")!,
);
```

Then ask for a flag wherever the decision is actually made:

```tsx
import { useFlag } from "@flagward/solid";

function Checkout() {
  const { value, isLoading } = useFlag("new-checkout");

  return (
    <Switch>
      <Match when={isLoading()}><LegacyCheckout /></Match>
      <Match when={value()}><NewCheckout /></Match>
      <Match when={!value()}><LegacyCheckout /></Match>
    </Switch>
  );
}
```

`host` is optional and defaults to the hosted service at
`https://app.flagward.com`. A self-hosted install passes its own — and that
is the case that has to be configured either way, since its operator already
knows they are running something.

## The value is an accessor

Hooks return `Accessor`s, so calling them inside JSX keeps the fine-grained
tracking Solid is built around:

```tsx
const { value } = useFlag("new-checkout");

if (value()) { /* ... */ }
```

`value()` is `undefined` while loading, and stays `undefined` for a key this
environment does not have — so decide what an unknown flag means rather than
letting `undefined` decide for you.

## How flags are evaluated

A flag with no rules is its own on/off switch. A flag with rules is evaluated
against a context you supply: rules are tried in priority order and the first
match wins.

Set the context once, for the whole app:

```tsx
<FlagwardProvider apiKey={apiKey} context={{ plan: "pro", country: "AR" }}>
```

Or add to it for one call:

```tsx
const { value } = useFlag("beta", { betaTester: true });
```

### The context can be reactive

Everywhere a context is taken — the provider, `useFlag`, `getFlag` — it accepts
a signal or a plain getter as readily as a plain object:

```tsx
const [user, setUser] = createSignal({ plan: "standard" });

const { value } = useFlag("beta", user);

setUser({ plan: "pro" });   // the flag re-evaluates, the DOM updates
```

```tsx
// Or as a getter, when the attributes come from several sources:
const { value } = useFlag("beta", () => ({ plan: plan(), country: geo().country }));
```

This matters because what an application targets on is not fixed: somebody
signs in, changes plan, switches locale. A context read once at startup would
answer every later evaluation with what was true at startup.

Supported operators: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`,
`IN_LIST`, `CONTAINS`, combined with `AND` or `OR`.

## Hooks

### Which one

Reach for `useFlag`. One flag, one decision, one hook — it is what most
components need.

`useFlags` earns its place in three cases:

- **The keys are not known where you write the code** — a debug panel, an admin
  view, anything that iterates.
- **You need a flag where a hook cannot go** — inside an event handler, a
  callback, a conditional branch. Hooks run in a component's setup; `getFlag`
  runs whenever you call it.
- **A component reads several flags** and one call reads better than five.

### `useFlag(key, context?)`

```tsx
const { value, isLoading, error } = useFlag("new-checkout");
```

| | |
| --- | --- |
| `value` | `Accessor<boolean \| undefined>` |
| `isLoading` | `Accessor<boolean>` — true until the first snapshot arrives |
| `error` | `Accessor<Error \| null>` — the last startup failure, cleared when flags arrive |

### `useFlags()`

For a component that reads several flags, or iterates them:

```tsx
const { flags, isLoading, error, getFlag } = useFlags();

flags();                              // { "new-checkout": true, ... }
getFlag("beta");                      // one flag, app context
getFlag("beta", { plan: "pro" });     // one flag, this context
```

### `useVariant(key, context?)`

Resolves the variant of a MULTIVARIATE flag.

```tsx
const { value, isLoading, error } = useVariant("checkout-flow");
```

| | |
| --- | --- |
| `value` | `Accessor<string \| undefined>` — the variant's name, `undefined` while loading, for a key this environment does not have, and for a flag that is not MULTIVARIATE, is disabled, or is overridden (an override forces a boolean value server-side, so there is no variant) |
| `isLoading` | `Accessor<boolean>` — true until the first snapshot arrives |
| `error` | `Accessor<Error \| null>` — the last startup failure, cleared when flags arrive |

`useFlag` and `useFlags` keep returning `true` once a MULTIVARIATE flag is
enabled — they answer "is it on", not "which variant". Reach for `useVariant`
when the answer needs to be the variant itself.

### Where context comes from

Targeting rules are evaluated against a context, and there are two places it
can come from. They are not interchangeable:

```tsx
<FlagwardProvider apiKey={apiKey} context={user}>   // who the user is
useFlag("beta", { plan: "pro" });                   // just this call
```

A context passed to `useFlag` belongs to **that call**. It is not published
anywhere: another component cannot see it, and the map `useFlags` returns
resolves against the provider's context alone. So this is not a contradiction —

```tsx
const { value } = useFlag("beta", { plan: "pro" });   // true
const { flags } = useFlags();                          // flags().beta === false
```

— it is two questions with two answers. The call was told `"pro"`; the map was
not. Deliberately: if a context passed in one component reached another
component's hook, you would have an invisible channel between parts of an
application that share nothing.

### Putting it together

The user lives in the provider, once:

```tsx
// index.tsx
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { FlagwardProvider } from "@flagward/solid";
import App from "./App";

const [user, setUser] = createSignal({ plan: "free", country: "AR", id: null as string | null });

// Signing in updates the signal, and every flag in the application follows.
export function signIn(account: Account) {
  setUser({ plan: account.plan, country: account.country, id: account.id });
}

render(
  () => (
    <FlagwardProvider
      apiKey={import.meta.env.VITE_FLAGWARD_API_KEY}
      host="https://flags.example.com"
      context={user}
    >
      <App />
    </FlagwardProvider>
  ),
  document.getElementById("root")!,
);
```

One decision, one flag:

```tsx
// Checkout.tsx
import { useFlag } from "@flagward/solid";

function Checkout() {
  const { value: newCheckout, isLoading } = useFlag("new-checkout");

  return (
    <Switch>
      <Match when={isLoading()}><LegacyCheckout /></Match>
      <Match when={newCheckout()}><NewCheckout /></Match>
      <Match when={!newCheckout()}><LegacyCheckout /></Match>
    </Switch>
  );
}
```

A flag inside a handler, where a hook cannot go:

```tsx
// CheckoutForm.tsx
import { useFlags } from "@flagward/solid";

function CheckoutForm() {
  const { getFlag } = useFlags();

  function onSubmit(data: FormData) {
    if (getFlag("strict-validation") && !isComplete(data)) {
      return setError("Every field is required.");
    }
    submit(data);
  }

  return <form onSubmit={onSubmit}>{/* ... */}</form>;
}
```

And the one case for a per-call context — the flag is about each row, not about
whoever is looking:

```tsx
// UserTable.tsx
import { useFlags } from "@flagward/solid";

function UserTable(props: { users: User[] }) {
  const { getFlag } = useFlags();

  return (
    <For each={props.users}>
      {(u) => (
        <tr>
          <td>{u.name}</td>
          <td>{getFlag("premium-badge", { plan: u.plan }) ? "★" : ""}</td>
        </tr>
      )}
    </For>
  );
}
```

## Multivariate flags

A MULTIVARIATE flag does not just turn a feature on — it hands back which
variant a user is in. `useFlag` and `useFlags` keep answering "is it on"
(`true` once the flag is enabled, even for a MULTIVARIATE flag); reach for
[`useVariant`](#uservariantkey-context) above when the answer needs to be the
variant name.

### Put `user_id` in the provider

Variant assignment is a deterministic bucket of `user_id` and the flag's
key — the same user always lands in the same variant. **Without a `user_id`,
every user resolves to the flag's control variant.** Set it alongside
whatever else your rules target:

```tsx
<FlagwardProvider apiKey={apiKey} context={{ user_id: user.id, plan: user.plan }}>
```

### A/B/n experiment

```tsx
function Checkout() {
  const { value: variant, isLoading } = useVariant("checkout-flow");

  return (
    <Switch fallback={<LegacyCheckout />}>
      <Match when={isLoading()}><LegacyCheckout /></Match>
      <Match when={variant() === "one-page"}><OnePageCheckout /></Match>
      <Match when={variant() === "express"}><ExpressCheckout /></Match>
    </Switch>
  );
}
```

### Variant as remote configuration

A variant name is also a lookup key, not just a branch to render on. Call the
accessor inside JSX to keep the fine-grained tracking:

```tsx
const COPY: Record<string, string> = {
  control: "Buy now",
  urgent: "Buy now — 3 left",
};

function BuyButton() {
  const { value: variant } = useVariant("cta-copy");
  return <button>{COPY[variant() ?? ""] ?? "Buy now"}</button>;
}
```

### Segment targeting

A rule can send part of a segment to a specific variant and let the rest fall
through to the flag's overall split — only the first matching rule counts:

```tsx
const [plan, setPlan] = createSignal(user.plan);
const { value: variant } = useVariant("pricing-page", () => ({ plan: plan() }));
// e.g. a rule sends 20% of plan() === "enterprise" to "annual-discount";
// the other 80% falls through to the flag's own split.
```

### Loading

```tsx
const { value, isLoading } = useVariant("checkout-flow");

<Show when={!isLoading()} fallback={<Spinner />}>
  {value() === "express" ? <ExpressCheckout /> : <LegacyCheckout />}
</Show>
```

## Losing the network

The provider opens a server-sent events stream and keeps it in step on its own:

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

```tsx
<FlagwardProvider apiKey={apiKey} logLevel="error">   {/* "warn" | "error" | "silent" */}
```

## Outside Solid

The client and the evaluator are re-exported here, so a store, a route guard
or a plain module can use them without a component:

```ts
import { FlagwardClient, evaluateFlag } from "@flagward/solid";
```

## Module format

ESM only, with type declarations. There is no CommonJS build.

## License

MIT
