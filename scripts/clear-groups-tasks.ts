/**
 * Clear all groups and tasks from the database.
 * Idempotent: safe to re-run.
 *
 * Usage: bun run clear:groups-tasks
 */
import { getMongoClient } from "@/lib/mongodb";

const DB = "hcmut";

async function main() {
    const client = await getMongoClient();
    try {
        const db = client.db(DB);
        const groups = db.collection("groups");
        const tasks = db.collection("tasks");

        const beforeGroups = await groups.countDocuments();
        const beforeTasks = await tasks.countDocuments();
        console.log(`Before: groups=${beforeGroups}, tasks=${beforeTasks}`);

        const groupsResult = await groups.deleteMany({});
        const tasksResult = await tasks.deleteMany({});
        console.log(
            `Deleted groups=${groupsResult.deletedCount}, tasks=${tasksResult.deletedCount}`
        );

        const afterGroups = await groups.countDocuments();
        const afterTasks = await tasks.countDocuments();
        console.log(`After: groups=${afterGroups}, tasks=${afterTasks}`);
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error("Failed to clear groups/tasks:", error);
    process.exit(1);
});