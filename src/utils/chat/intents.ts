/**
 * Legacy (Pages Router) chat helpers live under src/utils/chat.
 * Currently just re-exports the App Router intent classifier so both trees
 * share one implementation.
 */
export { classifyIntent, foldDiacritics } from "../../lib/intent-classifier";
export type { ChatIntent, IntentResult } from "../../lib/intent-classifier";
