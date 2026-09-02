# flagward-sdk-react

React SDK for Flagward - Feature Flags as a Service

## Installation

```bash
npm install flagward-sdk-react
```

## Quick Start

```tsx
import { FlagwardProvider, useFlag } from "flagward-sdk-react";

function App() {
  return (
    <FlagwardProvider apiKey="your-api-key">
      <Dashboard />
    </FlagwardProvider>
  );
}

function Dashboard() {
  const { value: showNewUI } = useFlag("show-new-ui");

  return showNewUI ? <NewDashboard /> : <OldDashboard />;
}
```

## Module format

This package ships as **ESM only** (`"type": "module"`, with an `exports` map
pointing at `dist/index.js`). It has no CommonJS build: `require("flagward-sdk-react")`
fails with a clear `ERR_PACKAGE_PATH_NOT_EXPORTED`/`ERR_REQUIRE_ESM` error
rather than silently loading broken code. Next.js, Vite, and any other
bundler-based toolchain resolve ESM packages natively, which covers the
realistic ways a React SDK gets consumed. If you have a pure CommonJS
build pipeline with no ESM support, `import()` the package dynamically or
open an issue.

## How flags are evaluated

This SDK evaluates **locally, in the browser**. On startup it downloads the
full set of flags and their targeting rules for the environment your API key
belongs to, then evaluates each flag against the rules on the client. A
Server-Sent Events (SSE) stream keeps that local copy fresh as flags change on
the server, without a page reload (see "Losing the network" below for what
happens when that stream drops).

This has a direct consequence you must know before writing a targeting rule:
**the rules are visible in the browser.** Anything you put in a rule
(condition values, user attribute names, percentages, etc.) is downloaded as
plain JSON to every client and can be read by opening devtools. Do not encode
secrets, internal identifiers you don't want exposed, or anything
security-sensitive in a flag's targeting rules — treat them the same way you'd
treat any other client-side configuration.

## Hooks

### `useFlag(key)`

Evaluates a single flag by key.

```tsx
const { value, isLoading, error } = useFlag("new-dashboard");
```

Returns:
- `value`: `boolean | string | undefined`
- `isLoading`: `boolean`
- `error`: `Error | null`

### `useFlags()`

Returns all flags and helper functions.

```tsx
const { flags, getFlag, isLoading } = useFlags();

const showBanner = getFlag("show-banner");
```

## Provider

Wrap your app with `FlagwardProvider`:

```tsx
<FlagwardProvider
  apiKey="your-api-key"
  host="http://localhost:8000"  // optional, defaults to localhost:8000
  context={{ userId: "123" }}   // optional, used to evaluate targeting rules
  logLevel="warn"               // optional, see Error reporting below
>
  {children}
</FlagwardProvider>
```

## Losing the network

Flags are read once and evaluated locally, so a client that loses its
connection keeps working: every flag answers from its last known value.

What it cannot do while disconnected is notice a change. When the browser
reports the network is back, the SDK re-reads the flags and reopens the update
stream if the browser had given up on it, so a change made during the outage is
picked up rather than waiting for the next reload.

A stream that is still open is left alone: replacing a working connection would
drop events for no reason.

Returning to a backgrounded tab does the same. A machine waking from sleep
drops its connection without the browser ever reporting the network as gone, so
`online` never fires and the tab comes back holding whatever it knew before it
slept. Both signals share one in-flight refresh, so arriving together does not
produce two.

## Error reporting

The SDK never throws into your application. A rejected API key, an unreachable
server or an unknown flag all resolve to `undefined`, so your own fallback
decides what the user sees and the page keeps rendering.

Because none of that surfaces on its own, the SDK reports it to the console
instead:

```
[Flagward] The API key was rejected. Check that it matches an environment in
your Flagward dashboard.
```

Each distinct problem is reported once per page load, so a component that
re-renders a hundred times does not produce a hundred lines.

`logLevel` controls how much is reported:

| Value | Reports |
|-------|---------|
| `"warn"` (default) | everything: unknown flags, dropped streams, network failures |
| `"error"` | only what cannot work at all: a missing or rejected API key, a missing provider |
| `"silent"` | nothing |

## The core

Everything that is not React lives in
[`@flagward/core`](https://www.npmjs.com/package/@flagward/core) — the client,
the rule evaluator and the reporting — and is re-exported from this package, so
installing this one is enough. Reach for the core directly only outside React.

## Standalone Client

Use the client directly without React:

```ts
import { FlagwardClient } from "flagward-sdk-react";

const client = new FlagwardClient({
  apiKey: "your-api-key",
  host: "http://localhost:8000",
});

await client.init();

// Every flag's configured on/off state, from the local snapshot.
// Targeting rules are NOT applied here -- there is no user context to
// apply them against.
const flags = client.cachedFlags;

// One flag with targeting rules applied against the context you pass.
// Throws if the key does not exist in this environment.
const showBanner = client.evaluate("show-banner", { plan: "premium" });

// The same, without context and without throwing: an unknown key reads
// as undefined and your own fallback decides what happens.
const maintenance = client.getFlag("maintenance-mode");

// Optional: keep the snapshot fresh via the SSE stream.
client.connect();

// Close it when you are done -- an open stream holds a connection.
client.disconnect();
```

`cachedFlags` and `evaluate` answer different questions. The first says how a
flag is configured; the second says what it resolves to for a particular user.
Reaching for `cachedFlags` when you meant `evaluate` silently ignores every
targeting rule on the flag.

## License

MIT
