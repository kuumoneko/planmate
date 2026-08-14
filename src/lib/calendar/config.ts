/**
 * Feature flags for the calendar integrations.
 * NEXT_PUBLIC_* values are inlined into the client bundle.
 */

/** Master switch for the Google Calendar OAuth flow + auto-push. */
export const GOOGLE_CALENDAR_ENABLED =
    process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_ENABLED === "true";
