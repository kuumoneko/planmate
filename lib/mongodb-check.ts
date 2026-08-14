import { Collection } from "mongodb";

/**
 * Ensure a pre-existing `data` doc exists for the given username, creating a
 * blank one on first sight (legacy mybk data convention).
 */
export default async function ensureUserDoc(collection: Collection, username: string) {
    const results = await collection.countDocuments({
        username: username,
    });

    if (results === 0) {
        await collection.insertOne({
            username: username,
            password: "",
            filter: null,
            schedule: null,
            exam: null,
            data: null,
        });
    }
}