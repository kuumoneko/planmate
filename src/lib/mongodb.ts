/**
 * Legacy Pages Router entry point — re-exports the App Router singleton so
 * every existing import (`@/lib/mongodb`) keeps working without changes.
 */
export { getMongoClient, getMongoClient as default } from "../../lib/mongodb";