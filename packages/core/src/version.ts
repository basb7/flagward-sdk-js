/**
 * The version this package reports when it registers with the server.
 *
 * Kept in step with package.json by a test rather than by discipline: a
 * hardcoded version drifts from the published one the first time someone
 * bumps only one of the two.
 */
export const SDK_VERSION = "0.1.0";

/**
 * The type this SDK registers as.
 *
 * The server stores this against a closed set (PYTHON, JAVASCRIPT, GO), so
 * every SDK in this repository is JAVASCRIPT. Which framework adapter is
 * running is not something the server can record today: its registrations are
 * unique per environment and type, so React and Vue would share one row.
 */
export const SDK_TYPE = "JAVASCRIPT";
