# Flagward SDKs for JavaScript

Feature flags for JavaScript applications, as one shared core and one thin
adapter per framework.

## Packages

| Package | npm | What it is |
| --- | --- | --- |
| [`packages/core`](packages/core) | `@flagward/core` | The client, the rule evaluator, and console reporting. No framework, no DOM framework assumptions beyond the browser APIs it guards. |
| [`packages/react`](packages/react) | `flagward-sdk-react` | The React adapter: a provider, `useFlag` and `useFlags`. |

## Why a core

A feature flag SDK is mostly not framework code. Of this repository's source,
the client, the evaluator, the logger and the types have no framework imports
at all; a framework adapter is a provider and two or three bindings on top.

Copying that core once per framework would mean maintaining several copies of
the same rule evaluator. They do not stay identical. The failure that follows
is the worst kind this product can have: the same user, the same flag and the
same server, answered one way by the React application and another way by the
Vue one, with nothing reporting the disagreement.

So the evaluator exists once, and every adapter depends on it.

## Working on it

This is an npm workspace. From the repository root:

```bash
npm install     # links packages/react against packages/core locally
npm run build   # builds every package
npm run lint    # type-checks every package
npm test        # runs every package's suite
```

A single package:

```bash
npm run build -w @flagward/core
npm run test:run -w flagward-sdk-react
```

An adapter resolves `@flagward/core` from its built `dist/`, not from source,
so linting or testing against a stale one checks code nobody is running and
against a missing one fails outright. `lint` and `test` build the core first
rather than leaving that to whoever remembers.

## Publishing

The core publishes first: an adapter cannot resolve a dependency that is not on
the registry yet.

```bash
npm publish -w @flagward/core
npm publish -w flagward-sdk-react
```

Each package lints, tests and builds itself through `prepublishOnly` before npm
packs anything, so neither a failing suite nor a stale `dist` can reach the
registry. `npm publish` does not build on its own, and `files` ships whatever
`dist` happens to hold — which is how old code goes out under a new version
number without anything failing.

A published version is permanent. `npm unpublish` works for 72 hours and burns
the number either way, so a mistake ships as a patch release, never as a fix to
the version that carried it.

Each package reports its own version at registration, and `src/version.ts` is
generated from `package.json` before every build, so bumping the manifest is
the whole change. A test in each package compares the two, so a file edited by
hand fails the suite rather than shipping a version nobody published.

Each adapter also names itself: the core registers as `JAVASCRIPT`, the React
adapter as `REACT`. The server does not record adapter types yet, so those
arrive ahead of the schema on purpose — when it does, the applications already
in the field are distinguishable without anybody reinstalling anything.

## License

MIT
