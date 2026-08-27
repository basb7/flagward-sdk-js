# easy-flags-sdk-react

React SDK for Easy Flags - Feature Flags as a Service

## Installation

```bash
npm install easy-flags-sdk-react
```

## Quick Start

```tsx
import { EasyFlagsProvider, useFlag } from "easy-flags-sdk-react";

function App() {
  return (
    <EasyFlagsProvider apiKey="your-api-key">
      <Dashboard />
    </EasyFlagsProvider>
  );
}

function Dashboard() {
  const { value: showNewUI } = useFlag("show-new-ui");

  return showNewUI ? <NewDashboard /> : <OldDashboard />;
}
```

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

Wrap your app with `EasyFlagsProvider`:

```tsx
<EasyFlagsProvider
  apiKey="your-api-key"
  host="http://localhost:8000"  // optional
  environment="production"     // optional
>
  {children}
</EasyFlagsProvider>
```

## Standalone Client

Use the client directly without React:

```tsx
import { EasyFlagsClient } from "easy-flags-sdk-react";

const client = new EasyFlagsClient({
  apiKey: "your-api-key",
  host: "http://localhost:8000",
});

await client.init();
const flags = await client.getFlags();
```

## License

MIT
