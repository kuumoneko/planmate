/**
 * Minimal Mongo-backed cache (collection `cache` in the `hcmut` db).
 *
 * Used by the dashboard route to serve cached dashboard payloads instead of
 * recomputing them on every request. Entries with an expiry are cleaned up
 * automatically by a Mongo TTL index (checked lazily by Mongo, ~60s
 * granularity) plus a read-time check.
 *
 * All functions degrade to no-ops / misses when Mongo is unreachable, so a
 * cache failure can never take down a route.
 */

import { getMongoClient } from "@/lib/mongodb";

export interface CacheDoc {
    key: string;
    value: unknown;
    updatedAt: Date;
    /** null = never expires. */
    expiresAt: Date | null;
}

const DB_NAME = "hcmut";
const COLLECTION_NAME = "cache";

let collectionPromise: Promise<import("mongodb").Collection<CacheDoc>> | null = null;

async function cacheCollection(): Promise<import("mongodb").Collection<CacheDoc>> {
    if (!collectionPromise) {
        collectionPromise = getMongoClient().then((client) => {
            const col = client.db(DB_NAME).collection<CacheDoc>(COLLECTION_NAME);
            // TTL index: Mongo deletes expired docs automatically.
            void col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
            // Unique key index: setCache upserts by key.
            void col.createIndex({ key: 1 }, { unique: true }).catch(() => {});
            return col;
        });
    }
    return collectionPromise;
}

export async function getCache<T>(key: string): Promise<T | null> {
    try {
        const col = await cacheCollection();
        const doc = await col.findOne({ key });
        if (!doc) return null;
        if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) {
            await col.deleteOne({ key }).catch(() => {});
            return null;
        }
        return doc.value as T;
    } catch {
        return null; // cache is best-effort
    }
}

export async function setCache<T>(
    key: string,
    value: T,
    options: { ttlMs?: number } = {}
): Promise<void> {
    try {
        const col = await cacheCollection();
        const expiresAt = options.ttlMs ? new Date(Date.now() + options.ttlMs) : null;
        await col.updateOne(
            { key },
            { $set: { key, value, updatedAt: new Date(), expiresAt } },
            { upsert: true }
        );
    } catch {
        // cache is best-effort
    }
}

export async function deleteCache(key: string): Promise<void> {
    try {
        const col = await cacheCollection();
        await col.deleteOne({ key });
    } catch {
        // cache is best-effort
    }
}