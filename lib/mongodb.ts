import { MongoClient, MongoClientOptions } from "mongodb";
import { attachDatabasePool } from "@vercel/functions";

/**
 * Singleton Mongo client (promise cached on globalThis).
 *
 * Vercel Serverless Functions warm-and-cold repeatedly; caching the client
 * promise across invocations avoids reconnecting (and leaking) on every
 * request. This is the single source of truth for the App Router side;
 * `src/lib/mongodb.ts` re-exports it so the legacy Pages Router code keeps
 * working unchanged.
 */

const MONGODB_URI = process.env.MONGODB_URI;

const CLIENT_OPTIONS: MongoClientOptions = {
    appName: "bk-calendar",
    maxIdleTimeMS: 30000,
    connectTimeoutMS: 30000,
    serverSelectionTimeoutMS: 15000,
};

declare global {
    // eslint-disable-next-line no-var
    var __mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClient(): MongoClient {
    if (!MONGODB_URI) {
        throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
    }
    return new MongoClient(MONGODB_URI, CLIENT_OPTIONS);
}

/** Promise<MongoClient> shared across all modules in the process. */
export function getMongoClient(): Promise<MongoClient> {
    if (!globalThis.__mongoClientPromise) {
        const client = createClient();

        if (process.env.NODE_ENV === "production") {
            // Vercel-managed connection pooling (reuses existing sockets).
            attachDatabasePool(client);
        }

        globalThis.__mongoClientPromise = client.connect();
        // Fail fast on next request instead of resolving to a dead client.
        globalThis.__mongoClientPromise.catch(() => {
            globalThis.__mongoClientPromise = undefined;
        });
    }
    return globalThis.__mongoClientPromise;
}
