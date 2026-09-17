/** Canonical verb and noun vocabulary for Journal CRUD voice commands. A
 * single synonym set here keeps every Journal entry point (creation,
 * deletion, rename, open) speaking the same paraphrase grammar instead of
 * letting each file drift its own ad hoc word list.
 *
 * "note" is ambiguous in Flow: bare ("a note") it means the Journal, but
 * "note <content>" is the existing Inbox capture verb (see capturePayload.ts
 * and captureFeatureProposals). Every helper below only treats "note" as a
 * Journal noun for a *bare* object phrase — never when followed by content —
 * so this module cannot regress the established capture grammar. */

export const JOURNAL_CREATE_VERB = "(?:start|begin|make|create|write)";
export const JOURNAL_CREATE_VERB_REQUIRES_NEW = "(?:open)";
export const JOURNAL_DELETE_VERB = "(?:delete|remove|discard|erase)";
export const JOURNAL_DELETE_AWAY_VERB = "(?:throw|toss)";
export const JOURNAL_RENAME_VERB = "(?:rename|call|name|retitle)";
export const JOURNAL_OBJECT_NOUN = "(?:journal(?:\\s+entry)?|entry|note)";
/** Excludes "note", which is Inbox capture vocabulary outside an active
 * Journal surface (see capturePayload.ts). Use this noun set for any matcher
 * that is not already gated to a Journal context. */
export const JOURNAL_OBJECT_NOUN_NO_NOTE = "(?:journal(?:\\s+entry)?|entry)";

const bareCreateNoNew = new RegExp(`^${JOURNAL_CREATE_VERB}(?:\\s+writing)?\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?${JOURNAL_OBJECT_NOUN}$`);
const bareCreateNewRequired = new RegExp(`^${JOURNAL_CREATE_VERB_REQUIRES_NEW}\\s+(?:a\\s+|an\\s+)?new\\s+${JOURNAL_OBJECT_NOUN}$`);

/** Matches a whole-utterance "start/create/make/write a (new) note|entry|journal"
 * shape, with or without an explicit "new". Never matches when the object noun
 * is followed by further content, so it cannot swallow an Inbox capture. */
export function isJournalCreateCommand(normalizedText: string): boolean {
  return bareCreateNoNew.test(normalizedText) || bareCreateNewRequired.test(normalizedText);
}

function deletePatterns(noun: string) {
  return [
    new RegExp(`^${JOURNAL_DELETE_VERB}\\s+(?:the\\s+|my\\s+)?(?:this\\s+|current\\s+|active\\s+)?${noun}$`),
    new RegExp(`^${JOURNAL_DELETE_AWAY_VERB}\\s+(?:this|the|my)\\s+${noun}\\s+away$`),
    new RegExp(`^get rid of\\s+(?:this\\s+|the\\s+|my\\s+)?${noun}$`),
  ];
}
const gatedDeletePatterns = deletePatterns(JOURNAL_OBJECT_NOUN);
const ungatedDeletePatterns = deletePatterns(JOURNAL_OBJECT_NOUN_NO_NOTE);

/** Matches a whole-utterance Journal deletion command. Pass `journalSurfaceActive:
 * true` only when the caller already knows the user is on a Journal surface
 * (route/topic/active entry) — only then is the ambiguous "note" object noun
 * accepted, so a stray Inbox item titled with "note" is never mistaken for a
 * Journal delete outside that context. */
export function isJournalDeleteCommand(normalizedText: string, journalSurfaceActive: boolean): boolean {
  const patterns = journalSurfaceActive ? gatedDeletePatterns : ungatedDeletePatterns;
  return patterns.some((pattern) => pattern.test(normalizedText));
}

const bareRenameNoTitle = new RegExp(`^${JOURNAL_RENAME_VERB}\\s+(?:this\\s+|my\\s+|the\\s+|current\\s+)?${JOURNAL_OBJECT_NOUN}$`);

/** A rename command with no new title attached. This is not a failure — it is
 * an incomplete but recognizable request that deserves a spoken follow-up
 * question instead of a generic "nothing changed" response. */
export function isJournalRenameMissingTitle(normalizedText: string): boolean {
  return bareRenameNoTitle.test(normalizedText);
}

const bareObject = new RegExp(`^(?:a\\s+|an\\s+|the\\s+|this\\s+|my\\s+|current\\s+)*(?:new\\s+)?${JOURNAL_OBJECT_NOUN}$`);

/** True for a bare journal object phrase with no further content, e.g. "a
 * note", "the entry", "my journal entry" — never "note buy milk", which is
 * Inbox capture content, not a Journal command. Used to keep a contentless
 * "note" object from being mistaken for real capture text (see
 * capturePayload.ts). */
export function isBareJournalObject(value: string): boolean {
  return bareObject.test(value.trim());
}

const latestWords = /^(?:latest|last|newest|most recent)$/;

/** Maps spoken "latest"/"last"/"most recent" to ordinal 1, matching the
 * newest-first sort every Journal collection uses (see studioSelectionPlan.ts). */
export function latestOrdinal(word: string): number | undefined {
  return latestWords.test(word.trim().toLowerCase()) ? 1 : undefined;
}
