# @flagward/svelte

Svelte SDK for [Flagward](https://github.com/basb7/flagward). Flags are downloaded
once and evaluated in your process, so a flag check costs nothing and never
blocks on the network.

## Installation

```bash
npm install @flagward/svelte
```

Works with Svelte 4 or 5. `@flagward/core` comes with it — you do not install
it separately.

## Quick start

Call `setFlagward` once, in a root component's `<script>` — a SvelteKit
`+layout.svelte` is the usual place:

```svelte
<!-- +layout.svelte -->
<script lang="ts">
  import { setFlagward } from "@flagward/svelte";

  setFlagward({
    apiKey: "your-environment-api-key",
    host: "https://flags.example.com",
  });
</script>

<slot />
```

Then ask for a flag wherever the decision is actually made:

```svelte
<!-- Checkout.svelte -->
<script lang="ts">
  import { useFlag } from "@flagward/svelte";

  const flag = useFlag("new-checkout");
</script>

{#if $flag.isLoading}
  <LegacyCheckout />
{:else if $flag.value}
  <NewCheckout />
{:else}
  <LegacyCheckout />
{/if}
```

That `<slot />` is Svelte 4's spelling. On Svelte 5 it is
`{@render children()}` — see [SvelteKit](#sveltekit) below for a layout
written that way.

`host` is optional and defaults to the hosted service at
`https://app.flagward.com`. A self-hosted install passes its own — and that
is the case that has to be configured either way, since its operator already
knows they are running something.

Nothing has to be wrapped in a provider component. That is the point of
putting `setFlagward` on the context from a layout rather than requiring
every page to nest one: a flag is asked for where the decision is made, not
where somebody remembered to set it up.

## The result is one store of an object

`useFlag` and `useFlags` each return a single `Readable` whose value is a
plain object — the same shape `@tanstack/svelte-query` uses for `$query.data`
and `$query.isLoading`. Destructuring the store away would lose reactivity,
so read through the `$` prefix and pull fields off the object it gives you:

```ts
const flag = useFlag("new-checkout");
// $flag.value, $flag.isLoading, $flag.error
```

`value` is `undefined` while loading, and stays `undefined` for a key this
environment does not have — so decide what an unknown flag means rather than
letting `undefined` decide for you.

## How flags are evaluated

A flag with no rules is its own on/off switch. A flag with rules is evaluated
against a context you supply: rules are tried in priority order and the first
match wins.

Set the context once, for the whole application:

```ts
setFlagward({ apiKey, context: { plan: "pro", country: "AR" } });
```

Or add to it for one call:

```ts
const flag = useFlag("beta", { betaTester: true });
```

### The context can be a store

Everywhere a context is taken — `setFlagward`, `useFlag`, `useFlags` — it
accepts a store as readily as a plain object:

```ts
import { writable } from "svelte/store";

const user = writable({ plan: "standard" });
const flag = useFlag("beta", user);

user.set({ plan: "pro" }); // the flag re-evaluates, the DOM updates
```

This matters because what an application targets on is not fixed: somebody
signs in, changes plan, switches locale. A context read once at startup would
answer every later evaluation with what was true at startup.

Supported operators: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`,
`IN_LIST`, `CONTAINS`, combined with `AND` or `OR`.

## `useFlag` vs `useFlags`

Reach for `useFlag`. One flag, one decision, one store — it is what most
components need.

`useFlags` earns its place in two cases:

- **The keys are not known where you write the code** — a debug panel, an
  admin view, anything that iterates.
- **A component reads several flags** and one store reads better than five.

```ts
const all = useFlags();
// $all.flags        -- { "new-checkout": true, ... }
// $all.isLoading
// $all.error
```

A flag inside these is looked up by key: `$all.flags["beta"]`.

## `useVariant`

Resolves the variant of a MULTIVARIATE flag:

```ts
const variant = useVariant("checkout-flow");
// $variant.value      -- the variant's name, or undefined
// $variant.isLoading
// $variant.error
```

`$variant.value` is `undefined` while loading, for a key this environment
does not have, and for a flag that is not MULTIVARIATE, is disabled, or is
overridden (an override forces a boolean value server-side, so there is no
variant). `useFlag` and `useFlags` keep returning `true` once a MULTIVARIATE
flag is enabled — they answer "is it on", not "which variant". Reach for
`useVariant` when the answer needs to be the variant itself.

## Multivariate flags

### Put `user_id` in the context

Variant assignment is a deterministic bucket of `user_id` and the flag's
key — the same user always lands in the same variant. **Without a `user_id`,
every user resolves to the flag's control variant.** Set it alongside
whatever else your rules target:

```ts
setFlagward({ apiKey, context: { id: user.id, plan: user.plan } });
```

### A/B/n experiment

```svelte
<script lang="ts">
  import { useVariant } from "@flagward/svelte";

  const variant = useVariant("checkout-flow");
</script>

{#if $variant.isLoading}
  <LegacyCheckout />
{:else if $variant.value === "one-page"}
  <OnePageCheckout />
{:else if $variant.value === "express"}
  <ExpressCheckout />
{:else}
  <LegacyCheckout />   <!-- control, or undefined -->
{/if}
```

### Variant as remote configuration

A variant name is also a lookup key, not just a branch to render on:

```svelte
<script lang="ts">
  import { useVariant } from "@flagward/svelte";

  const COPY: Record<string, string> = {
    control: "Buy now",
    urgent: "Buy now — 3 left",
  };

  const variant = useVariant("cta-copy");
</script>

<button>{COPY[$variant.value ?? "control"]}</button>
```

### Segment targeting

The per-call context can be a store, same as `useFlag` — a rule can send part
of a segment to a specific variant and let the rest fall through to the
flag's overall split:

```ts
import { writable } from "svelte/store";
import { useVariant } from "@flagward/svelte";

const plan = writable({ plan: user.plan });
const variant = useVariant("pricing-page", plan);
// e.g. a rule sends 20% of plan === "enterprise" to "annual-discount";
// the other 80% falls through to the flag's own split.
```

### Loading

```ts
const variant = useVariant("checkout-flow");
// $variant.isLoading first, then $variant.value
```

## `createFlagward` and `flagStore` — the manual escape hatch

`setFlagward` needs a component's `<script>` block, because that is the only
place Svelte's own `setContext` and `onDestroy` know what to attach to. Where
there is no component — a plain module, a test, a SvelteKit `load` that runs
before any layout mounts — `createFlagward` builds the same state without
that requirement, and you own calling `destroy()` yourself:

```ts
import { createFlagward, flagStore, variantStore } from "@flagward/svelte";

const flagward = createFlagward({ apiKey: "your-environment-api-key" });
const flag = flagStore(flagward, "beta");
const variant = variantStore(flagward, "checkout-flow");

// later, once you are done with it
flagward.destroy();
```

`flagward.getFlag(key, context?)` reads one flag right away, outside any
store — useful from an event handler or anywhere else a subscription would be
overkill. `flagward.getVariant(key, context?)` is the same, for a MULTIVARIATE
flag's variant.

## Svelte 4 and 5

This package uses `svelte/store`, which ships in Svelte 5 unchanged and is
not deprecated there — `$flag` auto-subscription works exactly the same on
both. Nothing here uses runes, so nothing here requires them either.

If your own components have moved to runes, bridge a result with
[`fromStore`](https://svelte.dev/docs/svelte/svelte-store#fromStore):

```ts
import { fromStore } from "svelte/store";
import { useFlag } from "@flagward/svelte";

const flag = fromStore(useFlag("new-checkout"));
// flag.current.value
```

## SvelteKit

It works with nothing to configure. `setFlagward` in `+layout.svelte`,
`useFlag` wherever the decision is made — live updates, reactive context, all
of it:

```svelte
<!-- +layout.svelte -->
<script lang="ts">
  import { env } from "$env/dynamic/public";
  import { setFlagward } from "@flagward/svelte";

  let { children } = $props();

  setFlagward({
    // Typed `string | undefined` because nothing checked it at build time,
    // while apiKey is `string`. An empty string is the honest fallback: the
    // client reports a rejected key rather than the build claiming one it
    // never verified.
    apiKey: env.PUBLIC_FLAGWARD_API_KEY ?? "",
    host: env.PUBLIC_FLAGWARD_HOST,
  });
</script>

{@render children()}
```

```svelte
<!-- Checkout.svelte -->
<script lang="ts">
  import { useFlag } from "@flagward/svelte";

  const flag = useFlag("new-checkout");
</script>

{#if $flag.value}
  <NewCheckout />
{:else}
  <LegacyCheckout />
{/if}
```

What is worth knowing is *where* that runs, because Svelte has no
`"use client"`. A component is not a server one or a client one: it renders on
the server for the first request and again in the browser once it hydrates. So
`setFlagward` executes in both places, and `onDestroy` is the only lifecycle
hook Svelte still runs during SSR.

On the server that means the client is constructed, `init()` fires its
requests, and `onDestroy` tears it down — all inside one render, because
rendering a tree to a string never awaits what a `<script>` started. The HTML
therefore always ships the loading state, and the real value appears once the
browser builds its own client and that one gets to wait. In practice that is a
brief flash on the first paint of a session; every later navigation is
client-side and instant.

None of that is particular to Svelte. A React client component is
server-rendered too while its effect is not, so `@flagward/react` ships the
same placeholder from a Next.js server.

### Resolving on the server too

If that flash matters, read the flag on the server as well — with the core
rather than the adapter. `FlagwardClient` has no browser dependency, so it
resolves in a load function and lands in the HTML already decided:

```ts
// +page.server.ts
import { FlagwardClient } from "@flagward/svelte";
import { env } from "$env/dynamic/private";

export async function load() {
  const client = new FlagwardClient({
    apiKey: env.FLAGWARD_API_KEY,
    logLevel: "silent",
  });

  await client.init();
  return { newCheckout: client.getFlag("new-checkout") };
}
```

That key carries no `PUBLIC_` prefix, so it never reaches the browser. The
trade is that a server-resolved flag does not follow the stream — a change
lands on the next request rather than within the second — which is why the two
reads are worth having side by side rather than picking one.

Do not reach for `createFlagward` here. It starts `init()` itself without
handing back the promise, so awaiting the client's `init()` again duplicates
both requests and leaves `isLoading` true.

### Keeping it off the server

`export const ssr = false` stops SvelteKit rendering a route on the server, so
no client is built there and nothing is fetched and thrown away:

```ts
// +layout.ts — the whole app client-side
export const ssr = false;
```

That is a decision about the route rather than about flags: you give up
server-rendered HTML for everything on it, not only the flagged part. Behind a
login it costs nothing; on a public page it costs a great deal.

To keep SSR for the page and skip it for one component, guard the component
instead — the surrounding markup still renders on the server:

```svelte
<script lang="ts">
  import { browser } from "$app/environment";
</script>

{#if browser}
  <FlaggedThing />
{/if}
```

Two caveats. It only skips the server render: Svelte compiles every component
for the browser either way, so this saves no JavaScript. And if you also guard
`setFlagward` itself, any consumer you forget to guard finds no context, so it
reports the problem and reads `undefined` — which is worse than the loading
state it replaced.

### Passing a rune prop to `useFlag`

Calling it with a `$props()` value directly trips the compiler's
`state_referenced_locally` warning, because the call would read the prop once
and never again. Wrap it in `$derived`:

```svelte
<script lang="ts">
  import { useFlag } from "@flagward/svelte";

  let { flagKey }: { flagKey: string } = $props();

  const flag = $derived(useFlag(flagKey));
</script>

<p>{$flag.isLoading ? "…" : String($flag.value)}</p>
```

## Losing the network

Once a `setFlagward` or `createFlagward` client is connected, it opens a
server-sent events stream and keeps itself in step on its own:

- A flag changed on the server reaches every component within a second.
- Coming back online re-reads the flags, because a dropped connection means
  missed events — reconnecting alone would serve a stale value indefinitely.
- Returning to a backgrounded tab does the same. A machine waking from sleep
  drops the connection without the browser ever reporting the network as
  gone.
- Where there is no `EventSource` — server rendering, plain Node — live
  updates are reported as off and the flags already read keep working.

A failure never propagates into your application. Flags keep their last known
values and each caller's own fallback decides what the user sees.

## Error reporting

Everything the SDK recovers from is reported to the console once per page
load, prefixed with `[Flagward]`: a missing or rejected API key, an
unreachable host, a flag that is not in this environment, a dropped stream.
Narrow it with `logLevel`:

```ts
setFlagward({ apiKey, logLevel: "error" }); // "warn" | "error" | "silent"
```

## Outside Svelte

The client and the evaluator are re-exported here, so a plain module can use
them without a component:

```ts
import { FlagwardClient, evaluateFlag } from "@flagward/svelte";
```

## Options

| Option | Type | Default |
| --- | --- | --- |
| `apiKey` | `string` | — required |
| `host` | `string` | `https://app.flagward.com` |
| `context` | `UserContext \| Readable<UserContext>` | `{}` |
| `logLevel` | `"warn" \| "error" \| "silent"` | `"warn"` |

## Module format

ESM only, with type declarations. There is no CommonJS build.

## License

MIT
