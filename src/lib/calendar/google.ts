import Mongo_client_Component from "@/lib/mongodb";
import { CalendarEventDraft, GoogleCredential, SyncResult } from "@/types";
import { GOOGLE_CALENDAR_ENABLED } from "./config";
import { TZID } from "@/utils/calendar/parser";

/**
 * Server-side Google Calendar integration (googleapis).
 *
 * Gated by GOOGLE_CALENDAR_ENABLED + GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 * (see README). googleapis is imported dynamically so the client bundle
 * never pays for it and the module is inert without credentials.
 */

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_ORIGIN = "https://www.googleapis.com";

/** Non-null only when the OAuth flow is fully configured. */
export function googleConfig() {
    if (!GOOGLE_CALENDAR_ENABLED) return null;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
        process.env.GOOGLE_REDIRECT_URI ??
        `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3005"}/api/google/callback`;
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret, redirectUri };
}

async function getOAuthClient() {
    const config = googleConfig();
    if (!config) throw new Error("GOOGLE_CALENDAR not configured");
    const { google } = await import("googleapis");
    return new google.auth.OAuth2(
        config.clientId,
        config.clientSecret,
        config.redirectUri
    );
}

/** Build the consent-screen URL (offline + consent -> guaranteed refresh token). */
export async function authUrl(username: string): Promise<string> {
    const client = await getOAuthClient();
    return client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [GOOGLE_SCOPE],
        state: username,
    });
}

/** Exchange the authorization code and persist the refresh token in Mongo. */
export async function handleCallback(code: string, username: string): Promise<void> {
    const client = await getOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
        throw new Error("No refresh_token returned; revoke access and retry");
    }

    const credential: GoogleCredential = {
        username,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? undefined,
        accessExpiry: tokens.expiry_date ?? undefined,
    };

    const mongo = await Mongo_client_Component();
    await mongo.connect();
    await mongo
        .db("hcmut")
        .collection<GoogleCredential>("google_credentials")
        .updateOne({ username }, { $set: credential }, { upsert: true });
}

export async function loadCredential(username: string): Promise<GoogleCredential | null> {
    const mongo = await Mongo_client_Component();
    await mongo.connect();
    return mongo
        .db("hcmut")
        .collection<GoogleCredential>("google_credentials")
        .findOne({ username });
}

/** Fresh calendar_v3 client for the user's stored refresh token. */
async function getCalendarClient(username: string) {
    const credential = await loadCredential(username);
    if (!credential) throw new Error("Not connected to Google Calendar");

    const client = await getOAuthClient();
    client.setCredentials({
        refresh_token: credential.refreshToken,
        access_token: credential.accessToken,
        expiry_date: credential.accessExpiry,
    });

    const { google } = await import("googleapis");
    return {
        calendar: google.calendar({ version: "v3", auth: client }),
        credential,
    };
}

/** Draft -> calendar_v3 event resource (recurrence, reminders, attendees). */
export function toGoogleEvent(event: CalendarEventDraft) {
    const recurrence: string[] = [];
    if (event.rrule) recurrence.push(`RRULE:${event.rrule}`);
    if (event.exdates.length > 0) {
        recurrence.push(
            `EXDATE;VALUE=DATE:${event.exdates.map((d) => d.replace(/-/g, "")).join(",")}`
        );
    }

    return {
        summary: event.title,
        description: event.description,
        location: event.location,
        start: event.allDay
            ? { date: event.startLocal.slice(0, 10) }
            : { dateTime: `${event.startLocal}:00`, timeZone: TZID },
        end: event.allDay
            ? {
                  date: new Date(
                      new Date(`${event.startLocal.slice(0, 10)}T00:00:00`).getTime() +
                          24 * 3600 * 1000
                  )
                      .toISOString()
                      .slice(0, 10),
              }
            : { dateTime: `${event.endLocal}:00`, timeZone: TZID },
        ...(recurrence.length > 0 ? { recurrence } : {}),
        reminders: {
            useDefault: false,
            overrides: event.reminders.map((r) => ({
                method: r.method,
                minutes: r.minutesBefore,
            })),
        },
        attendees: event.attendees?.map((a) => ({ email: a.email })),
        extendedProperties: {
            private: { sourceUid: event.uid, app: "bk-calendar" },
        },
    };
}

/**
 * Push a single event (deadline, meeting) to the user's Google Calendar.
 * Best-effort — returns false when the user is not connected or it fails.
 */
export async function pushEventToGoogle(
    username: string,
    event: CalendarEventDraft
): Promise<boolean> {
    try {
        const { calendar } = await getCalendarClient(username);
        await calendar.events.insert({
            calendarId: "primary",
            requestBody: toGoogleEvent(event),
        });
        return true;
    } catch (e) {
        console.error("pushEventToGoogle failed", e);
        return false;
    }
}

/**
 * Push the user's schedule to their default Google Calendar.
 * Idempotent: previously pushed events are updated in place via
 * the uid -> Google eventId mapping stored in `google_events`.
 */
export async function syncScheduleToGoogle(
    username: string,
    events: CalendarEventDraft[]
): Promise<SyncResult> {
    const { calendar } = await getCalendarClient(username);
    const mongo = await Mongo_client_Component();
    await mongo.connect();
    const mappings = mongo.db("hcmut").collection("google_events");

    const result: SyncResult = { created: 0, updated: 0, skipped: 0 };

    for (const event of events) {
        const existing = await mappings.findOne({ username, uid: event.uid });

        if (existing) {
            await calendar.events.update({
                calendarId: "primary",
                eventId: existing.googleEventId,
                requestBody: toGoogleEvent(event),
            });
            result.updated++;
            continue;
        }

        const inserted = await calendar.events.insert({
            calendarId: "primary",
            requestBody: toGoogleEvent(event),
        });
        if (inserted.data.id) {
            await mappings.insertOne({
                username,
                uid: event.uid,
                googleEventId: inserted.data.id,
            });
            result.created++;
        } else {
            result.skipped++;
        }
    }

    return result;
}
