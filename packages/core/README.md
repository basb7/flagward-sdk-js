# @flagward/core

The framework-agnostic core of the [Flagward](https://github.com/basb7/flagward)
SDKs for JavaScript: the API client, the rule evaluator, and console reporting.

Use it directly in a plain script, on a server, or in any framework that has no
adapter yet. If you are writing React, install
[`flagward-sdk-react`](https://www.npmjs.com/package/flagward-sdk-react)
instead — it re-exports everything here, so you do not need both.

## Installation

```bash
npm install @flagward/core
```

## Quick start

```js
import { FlagwardClient } from "@flagward/core";

const client = new FlagwardClient({
  apiKey: "your-environment-api-key",
  host: "https://flags.example.com",
});

await client.init();

if (client.getFlag("new-checkout")) {
  // ...
}
```

`getFlag` never throws. A flag that is not in the environment reads as
`undefined`, so your own fallback decides what happens, and the reason is
reported to the console once.

## Evaluating with a user context

Rules are evaluated against attributes you pass in:

```js
client.evaluate("beta-features", { plan: "pro", country: "AR" });
```

A rule matches when its conditions do, under `AND` or `OR`. Rules are tried in
priority order and the first match wins. Supported operators: `EQUALS`,
`NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `IN_LIST`, `CONTAINS`.

Evaluation is also available as a pure function, for a caller that already
holds the data:

```js
import { evaluateFlag, toFlagMap } from "@flagward/core";
```

## Live updates

```js
client.connect();
client.subscribe((flagsData) => { /* ... */ });
```

`connect()` opens a server-sent events stream and watches for the network
returning and the tab becoming visible again, re-reading the flags on either.
A dropped connection means missed events, so coming back is a re-read, not
just a reconnect.

Where the environment has no `EventSource` — server rendering, React Native,
plain Node — live updates are reported as off and the client keeps serving the
flags it already read. It does not throw.

## Reporting

Every failure the SDK recovers from is reported once per page load, prefixed
with `[Flagward]`. Set `logLevel` to `"error"` or `"silent"` to narrow it:

```js
new FlagwardClient({ apiKey, logLevel: "error" });
```

## Registration

The client registers as `JAVASCRIPT`, reporting this package's version. A
framework adapter names itself and reports its own version instead, so the
dashboard shows what the application actually installed:

```js
new FlagwardClient({ apiKey, sdkType: "REACT", sdkVersion: "1.2.3" });
```

`src/version.ts` is generated from `package.json` at build time, so the version
that reaches the server is the one that was published.

## Module format

ESM only, with type declarations. There is no CommonJS build.

## License

MIT
