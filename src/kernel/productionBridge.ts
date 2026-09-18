/**
 * The single authoritative conversational execution path connecting the
 * kernel to real production state.
 *
 * Flow's existing production voice/text path (lifeCommandController.ts +
 * globalInterpreter.ts) is a large, mature, separately-tested system that
 * already gives calendar/journal/plans/friends commands real conflict
 * detection, undo and storage persistence. Rewriting it wholesale to run
 * through the kernel is out of scope for one sprint and would be reckless
 * against its existing test coverage. Instead, this bridge makes the kernel
 * the real, live-data-backed decision-maker for:
 *   - domains the legacy system has no equivalent for at all: personal
 *     memory (remember/forget), universal recall with provenance, Earmark,
 *     and the desktop companion;
 *   - "yes/no/undo/that one" follow-up replies, using the kernel's existing
 *     proposal/staleness machinery (proposals.ts, kernel.reply);
 *   - calendar moves: the kernel decides *whether* and *what* to propose
 *     (via calendar.move's real preflight/conflict logic against the real
 *     LifeDocument), and the actual mutation is persisted by translating the
 *     kernel's computed result into the app's own `LifeAction`s and running
 *     it through the SAME `dispatchLife`/`commit` transaction pipeline every
 *     other calendar edit uses — so revision tracking, storage persistence
 *     and `env.undo()` all keep working unmodified.
 *
 * Nothing here fabricates a result: recognizeIntent returns null for
 * anything it doesn't confidently understand, and the caller is expected to
 * fall back to the legacy path (or say "I didn't understand that") rather
 * than guess.
 */
import type { LifeAction } from "../domain/life-actions";
import type { LifeDocument, LifeEntityId } from "../domain/life-model";
import { createDefaultRegistry } from "./capabilities";
import type { CalendarMoveArgs } from "./capabilities/calendar";
import { createEnvironment, submit, reply, cancel, phaseFor, type KernelEnvironment, type KernelOutcome, type KernelPhase } from "./kernel";
import type { CapabilityRegistry } from "./registry";
import { createSession, type ConversationSession, type EntityReference } from "./session";
import { resolveReferentWord, resolveOrdinal, rememberSearchResults, searchHitToReference } from "./referents";
import type { PlanStepInput } from "./planner";
import { searchEverything, type SearchHit } from "./search";
import { classifyReply, matchProposalAlternative } from "./proposals";
import { DEMO_RESET_PHRASE, buildDemoSeedActions } from "./demoSeed";
import type { PersonalMemoryFact } from "./types";

let registrySingleton: CapabilityRegistry | undefined;
/** One registry for the process lifetime — CapabilityRegistry#register
 * throws on a duplicate id, so this must not be rebuilt per render/turn. */
export function getBridgeRegistry(): CapabilityRegistry {
  registrySingleton ??= createDefaultRegistry();
  return registrySingleton;
}

export function createBridgeSession(id?: string): ConversationSession {
  return createSession(id);
}

function findPersonId(document: LifeDocument, nameFragment: string): LifeEntityId | undefined {
  const needle = nameFragment.trim().toLowerCase();
  if (!needle) return undefined;
  return document.people.find(
    (person) => person.name.toLowerCase().includes(needle) || person.aliases?.some((alias) => alias.toLowerCase().includes(needle)),
  )?.id;
}

/** "her"/"him"/"them" resolve through the ONE referent model (whichever
 * person was last established, by either legacy or the kernel — see
 * kernelReferentBridge.ts); a real name falls back to a document lookup.
 * This is the single place pronoun-vs-name decides which path to take, so
 * no capability pattern below needs its own "if the word is her" special
 * case. */
function resolvePersonId(session: ConversationSession, document: LifeDocument, fragment: string): LifeEntityId | undefined {
  const pronoun = resolveReferentWord(session, fragment);
  if (pronoun?.kind === "person") return pronoun.id;
  return findPersonId(document, fragment);
}

const KNOWN_APPS: Record<string, string> = {
  "vs code": "Visual Studio Code",
  vscode: "Visual Studio Code",
  "visual studio code": "Visual Studio Code",
  finder: "Finder",
  preview: "Preview",
  safari: "Safari",
  notes: "Notes",
  terminal: "Terminal",
};

const DEFAULT_BUFFER_MINUTES = 45;

function formatSeekTime(atMs: number): string {
  const totalSeconds = Math.round(atMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function findEventTitleMatch(document: LifeDocument, fragment: string): { eventId: string; title: string; start: number; duration: number } | undefined {
  const needle = fragment.trim().toLowerCase();
  for (const plan of Object.values(document.calendars)) {
    const match = plan.events.find((event) => event.title.toLowerCase().includes(needle));
    if (match) return { eventId: match.id, title: match.title, start: match.start, duration: match.end - match.start };
  }
  return undefined;
}

export interface RecentFileMeta {
  path: string;
  name: string;
  extension: string;
  modifiedAt: string;
  size: number;
}

export function fileReference(path: string, label: string): EntityReference {
  return { id: path, kind: "desktop-file", label, desktopPath: path };
}

export function recentFileToReference(file: RecentFileMeta): EntityReference {
  return fileReference(file.path, file.name);
}

export type RecognizedIntent =
  | { kind: "capability"; steps: PlanStepInput[]; label: string }
  /** Navigating to a recall result is a UI action (env.navigate/focusEntity),
   * not a capability — the kernel has no browser-navigation capability, so
   * this bubbles up to the caller (see KernelTurnResult.openReferent) instead
   * of being executed here. */
  | { kind: "open-referent"; ref: EntityReference }
  | { kind: "play-referent"; ref: EntityReference | undefined; query: string }
  | { kind: "demo-reset" };

/**
 * Deterministic recognizer for the kernel-native slice of the conversation:
 * memory, universal recall, commitments, a narrow calendar-move grammar, and
 * desktop actions. Returns null when nothing matches so the caller can fall
 * back to the legacy interpreter rather than a wrong guess.
 */
export function recognizeIntent(utterance: string, document: LifeDocument, session: ConversationSession): RecognizedIntent | null {
  const text = utterance.trim();
  const lower = text.toLowerCase();

  if (DEMO_RESET_PHRASE.test(text)) return { kind: "demo-reset" };

  const remember = text.match(/^remember(?: that)?\s+(.+)$/i);
  if (remember) {
    const rest = remember[1]!;
    const subjectMatch = rest.match(/^([A-Za-z]+)\s+(.+)$/);
    const capitalizedSubject = subjectMatch && /^[A-Z][a-z]+$/.test(subjectMatch[1]!) && subjectMatch[1] !== "I";
    if (subjectMatch && (findPersonId(document, subjectMatch[1]!) || capitalizedSubject)) {
      return { kind: "capability", steps: [{ capabilityId: "friends.remember", args: { name: subjectMatch[1], fact: subjectMatch[2] }, utterance: text }], label: `Remember ${subjectMatch[1]}: ${subjectMatch[2]}` };
    }
    return { kind: "capability", steps: [{ capabilityId: "memory.store", args: { text: rest }, utterance: text }], label: `Remember: ${rest}` };
  }

  const forget = text.match(/^forget(?: that)?\s+(.+)$/i);
  if (forget) return { kind: "capability", steps: [{ capabilityId: "memory.forget", args: { query: forget[1] }, utterance: text }], label: `Forget: ${forget[1]}` };

  const rememberAbout = text.match(/^what do you remember about\s+(.+?)\??$/i);
  if (rememberAbout) {
    const personId = resolvePersonId(session, document, rememberAbout[1]!);
    return personId
      ? { kind: "capability", steps: [{ capabilityId: "memory.recall", args: { subjectPersonId: personId }, utterance: text }], label: `Recall memory about ${rememberAbout[1]}` }
      : { kind: "capability", steps: [{ capabilityId: "memory.search", args: { query: rememberAbout[1] }, utterance: text }], label: `Search memory: ${rememberAbout[1]}` };
  }
  if (/^what do you remember\??$/i.test(lower)) return { kind: "capability", steps: [{ capabilityId: "memory.recall", args: {}, utterance: text }], label: "Recall all memory" };

  const promised = text.match(/^what (?:did|have) i promis(?:e|ed) (.+?)\??$/i);
  if (promised) {
    const personId = resolvePersonId(session, document, promised[1]!);
    return personId
      ? { kind: "capability", steps: [{ capabilityId: "recall.commitments", args: { personId }, utterance: text }], label: `What was promised to ${promised[1]}` }
      : { kind: "capability", steps: [{ capabilityId: "recall.search", args: { query: promised[1] }, utterance: text }], label: `Search: promised ${promised[1]}` };
  }

  const doingWith = text.match(/^what am i doing with\s+(.+?) this week\??$/i);
  if (doingWith) return { kind: "capability", steps: [{ capabilityId: "recall.search", args: { query: doingWith[1] }, utterance: text }], label: `Doing with ${doingWith[1]} this week` };

  const lastMentionedMatch = text.match(/^when did i last mention (her|him|them|.+?)\??$/i);
  if (lastMentionedMatch) {
    const word = lastMentionedMatch[1]!;
    const pronounRef = /^(?:her|him|them)$/i.test(word) ? resolveReferentWord(session, word) : undefined;
    const query = pronounRef ? (pronounRef.label ?? pronounRef.personIds?.[0] ?? "") : word;
    if (query) return { kind: "capability", steps: [{ capabilityId: "recall.search", args: { query }, utterance: text }], label: `Last mention of ${query}` };
  }

  const recallPatterns = [
    /^where did i (?:mention|talk about)\s+(.+?)\??$/i,
    /^what did i say about\s+(.+?)\??$/i,
    /^find where i talked about\s+(.+?)\??$/i,
    /^show me everything (?:connected to|about)\s+(.+?)\??$/i,
  ];
  for (const pattern of recallPatterns) {
    const match = text.match(pattern);
    if (match) return { kind: "capability", steps: [{ capabilityId: "recall.search", args: { query: match[1] }, utterance: text }], label: `Recall: ${match[1]}` };
  }

  const playPart = lower.match(/^play (?:the part|that part)(?: where i mentioned (.+?))?\??$/i);
  if (playPart) {
    const query = playPart[1] ?? "";
    let ref = query ? session.referents.lastSearchResults?.find((candidate) => candidate.label?.toLowerCase().includes(query)) : resolveReferentWord(session, "that");
    // The cached referent is one-per-entry (its best-matching segment for
    // the ORIGINAL query), which may not be the segment this specific
    // mention lives in — re-search fresh for that exact phrase so "play the
    // part where I mentioned the hotel" finds the hotel segment even if the
    // last recall was for a different word in the same entry.
    if (!ref && query) ref = searchEverything(document, [], query).filter((hit) => hit.audioTimestampStart != null).map(searchHitToReference)[0];
    return { kind: "play-referent", ref, query };
  }

  const moveWithBuffer = lower.match(/^move (?:the |my )?(.+?) so (?:i have|there'?s?|there is) enough time before (?:the |my )?(.+?)$/i);
  if (moveWithBuffer) {
    const anchor = findEventTitleMatch(document, moveWithBuffer[2]!);
    const target = findEventTitleMatch(document, moveWithBuffer[1]!);
    if (anchor && target) {
      // "enough time before X" means finish DEFAULT_BUFFER_MINUTES before X
      // starts, so the new start has to account for the event's own duration.
      const startMinutes = Math.max(0, anchor.start - DEFAULT_BUFFER_MINUTES - target.duration);
      const args: CalendarMoveArgs = { eventId: target.eventId, startMinutes };
      return { kind: "capability", steps: [{ capabilityId: "calendar.move", args: args as unknown as Record<string, unknown>, utterance: text }], label: `Move ${target.title} before ${anchor.title}` };
    }
  }

  if (/^(?:what app am i using|what app is this|what'?s the frontmost app|which app is open)\??$/i.test(lower)) {
    return { kind: "capability", steps: [{ capabilityId: "desktop.getFrontmostApp", args: {}, utterance: text }], label: "Frontmost app" };
  }

  const openApp = lower.match(/^open\s+(.+?)$/i);
  if (openApp && KNOWN_APPS[openApp[1]!.trim()]) {
    return { kind: "capability", steps: [{ capabilityId: "desktop.openApp", args: { app: KNOWN_APPS[openApp[1]!.trim()] }, utterance: text }], label: `Open ${KNOWN_APPS[openApp[1]!.trim()]}` };
  }

  const findInFinder = /^(?:show|reveal) (it|that|the file) in finder\??$/i.exec(lower);
  if (findInFinder) {
    const ref = resolveReferentWord(session, findInFinder[1]!);
    if (ref?.kind === "desktop-file" && ref.desktopPath) {
      return { kind: "capability", steps: [{ capabilityId: "desktop.revealInFinder", args: { path: ref.desktopPath }, utterance: text }], label: "Reveal in Finder" };
    }
  }

  // "open it in Preview" — V1's desktop bridge only supports opening with
  // the OS default handler (Rule #4 caps the allowlist at six capabilities;
  // "open with a specific app" isn't one of them), so this intentionally
  // reduces to a plain openFile rather than pretending to force an app.
  if (/^open it in (?:preview|the default app)\??$/i.test(lower)) {
    const ref = resolveReferentWord(session, "it");
    if (ref?.kind === "desktop-file" && ref.desktopPath) {
      return { kind: "capability", steps: [{ capabilityId: "desktop.openFile", args: { path: ref.desktopPath }, utterance: text }], label: "Open in Preview" };
    }
  }

  // "open" is optional for the list-position/content phrases — "the
  // previous one" or "the one with Sofia" said on their own are natural
  // ellipsis for "open the previous one" in a conversation that was just
  // looking at a list of results. It stays required for bare "it"/"that"
  // (saying just "that" alone isn't a command).
  // "Bookmark it" after LEGACY opened a journal entry (e.g. "open my latest
  // entry") is the cross-boundary case this bridge exists for: the referent
  // came from legacy's own navigation, translated into the kernel's shape
  // by kernelReferentBridge.ts before recognizeIntent ever runs (see
  // tryKernelBridge) — there's no special-case "if legacy just opened a
  // journal entry" here, just the one resolver.
  const bookmarkMatch = /^bookmark (it|that|this)\??$/i.exec(lower);
  if (bookmarkMatch) {
    const ref = resolveReferentWord(session, bookmarkMatch[1]!);
    if (ref?.kind === "journal-entry") {
      return { kind: "capability", steps: [{ capabilityId: "journal.bookmark", args: { entryId: ref.id }, utterance: text }], label: `Bookmark ${ref.label ?? "entry"}` };
    }
  }

  const openReferentPattern = /^open (that|it)\??$|^(?:open )?(the (?:one before that|previous one)|the (?:first|second|third|fourth|fifth) one|the one (?:with|about|from) .+?)\??$/i;
  const openReferentMatch = lower.match(openReferentPattern);
  if (openReferentMatch) {
    const pronoun = openReferentMatch[1];
    const ordinalOrContent = openReferentMatch[2];
    // One resolver for every phrasing — pronoun ("it"/"that") through
    // resolveReferentWord, list-position/content phrases through
    // resolveOrdinal. Whichever referent comes back is generic: branching on
    // its `kind` (rather than on which phrase matched) decides whether this
    // is a real desktop action or a UI navigation, so there is exactly one
    // place that resolves "open X" instead of a desktop-shaped special case
    // layered on top of a recall-shaped one.
    const ref = pronoun ? resolveReferentWord(session, pronoun) : resolveOrdinal(session, ordinalOrContent!);
    if (ref?.kind === "desktop-file" && ref.desktopPath) {
      return { kind: "capability", steps: [{ capabilityId: "desktop.openFile", args: { path: ref.desktopPath }, utterance: text }], label: "Open that" };
    }
    if (ref) return { kind: "open-referent", ref };
  }

  // "What was I working on" is unambiguously about the desktop (legacy has
  // no equivalent), so it needs no file-type keyword. But "open/show me my
  // latest X" MUST require an explicit desktop-flavored noun (file/pdf/
  // download/document) — "open my latest entry" (a journal entry) or "my
  // latest note" has to fall through to legacy's own navigation instead of
  // being swallowed just because it shares "open my latest X" phrasing.
  const workingOn = /^what was i working on\b/i.test(lower);
  const listRecent = lower.match(/^(?:show me|open) (?:my )?(?:the )?(?:latest|most recent|last) (pdf|file|download|document)s?\b.*$/i);
  if (workingOn || listRecent) return { kind: "capability", steps: [{ capabilityId: "desktop.listRecentFiles", args: { limit: 5 }, utterance: text }], label: "List recent files" };

  return null;
}

export interface KernelTurnResult {
  env: KernelEnvironment;
  session: ConversationSession;
  outcome: KernelOutcome;
  phase: KernelPhase;
  message: string;
  /** A referent the caller should navigate to and visually surface
   * (env.navigate + focusEntity/selectCalendarEvent, or the desktop
   * capability's own action) — browser navigation isn't a kernel capability,
   * so this bubbles up rather than being executed here. Every other
   * cross-turn referent need (recall results, "the second one", "show it in
   * Finder") is already carried by `session.referents` — there is no second,
   * bridge-local tracking structure. */
  openReferent?: EntityReference;
  recognized: boolean;
  /** Undo/redo/"what changed" for a bridge-routed mutation live in the real
   * app's own transaction history (see persistKernelMutation), not the
   * kernel's own per-turn history — the kernel environment is rebuilt fresh
   * every turn from live document state, so its internal history is never
   * authoritative across turns. The caller should invoke the real
   * `env.undo()`/`env.redo()` when this is set. */
  delegateToApp?: "undo" | "redo" | "whatChanged";
}

function messageFor(outcome: KernelOutcome): string {
  switch (outcome.status) {
    case "executed":
      return outcome.descriptions.join(" ");
    case "proposed": {
      const { alternatives, conflicts } = outcome.proposal.consequences;
      return alternatives[0]?.description ?? conflicts[0]?.message ?? "There's a conflict — how should I handle it?";
    }
    case "clarify":
      return outcome.clarification.question;
    case "cancelled":
      return outcome.reason;
    case "error":
      return outcome.message;
  }
}

function buildContext(document: LifeDocument, memory: PersonalMemoryFact[], now: () => Date) {
  return { document, navigation: { route: "home" as const }, memory, history: [], historyPointer: -1, clock: { now } };
}

/** One conversational turn: undo/redo/"what changed" always delegate to the
 * real app (see KernelTurnResult.delegateToApp); a reply to an active
 * proposal/clarification goes through kernel.reply; a non-mutating
 * recognized capability (recall/memory queries, desktop reads) executes
 * directly so its structured `data` survives for the UI, since the kernel's
 * plan/history machinery only preserves human-readable descriptions, not
 * raw data; everything else goes through kernel.submit for real
 * preflight/proposal handling. */
export interface KernelBridgeDeps {
  /** Persist a bridge-decided mutation through the app's real transaction
   * pipeline (see persistKernelMutation's doc comment). Omit in tests that
   * only care about the kernel's own decision, not real-app persistence. */
  dispatchLife?: (actions: LifeAction[], summary: string, transcript?: string) => void;
}

export function runKernelTurn(
  utterance: string,
  document: LifeDocument,
  memoryFacts: PersonalMemoryFact[],
  session: ConversationSession,
  now: () => Date = () => new Date(),
  deps: KernelBridgeDeps = {},
): KernelTurnResult {
  const registry = getBridgeRegistry();
  const env: KernelEnvironment = { ...createEnvironment(registry, document, { route: "home" }, { now }), memory: memoryFacts };
  const hasPendingContext = Boolean(session.activeProposal || session.pendingClarification);
  const replyIntent = classifyReply(utterance);

  const persist = (capabilityId: string | undefined, afterEnv: KernelEnvironment, summary: string) => {
    if (!capabilityId || !deps.dispatchLife) return;
    const actions = persistKernelMutation(capabilityId, document, memoryFacts, afterEnv.document, afterEnv.memory, undefined);
    if (actions.length > 0) deps.dispatchLife(actions, summary, utterance);
  };

  if (!hasPendingContext && (replyIntent === "undo" || replyIntent === "redo" || replyIntent === "whatChanged")) {
    return { env, session, outcome: { status: "cancelled", reason: "" }, phase: "done", message: "", recognized: true, delegateToApp: replyIntent };
  }

  // A fully recognized fresh command always wins over ambiguous short
  // replies, even with a proposal pending — "actually, move it to 5pm"
  // must supersede rather than be swallowed as an unmatched proposal reply.
  // Bare replies ("yes", "8:30", "the second one") never match this
  // recognizer, so they correctly fall through to kernel.reply() below.
  const recognized = recognizeIntent(utterance, document, session);

  // This is the merge point with the real, separate legacy interpreter
  // (see the module doc): the bridge must claim ONLY what it will actually
  // handle, or an unrelated utterance ("open my calendar") while a kernel
  // proposal happens to be pending would get swallowed as a generic "I
  // didn't understand" instead of correctly falling through to legacy.
  // kernel.reply()'s own fallback for that case is exactly this same
  // generic error, so it's replicated here as a pre-check rather than
  // guessed at after the fact.
  const matchesAlternative = Boolean(session.activeProposal && session.activeProposal.status === "pending" && matchProposalAlternative(session.activeProposal, utterance));
  // "yes"/"no"/"cancel" are ambiguous words that could equally belong to a
  // pending LEGACY confirmation (e.g. "send this message to John? yes") —
  // they only belong to the kernel when the kernel actually has something
  // pending to answer. Bare "undo"/"redo"/"whatChanged" are handled above
  // unconditionally instead, since real undo/redo is shared, unambiguous
  // state regardless of which system made the last change.
  const kernelOwnsReply = Boolean(session.pendingClarification) || matchesAlternative || (hasPendingContext && replyIntent !== "unknown");

  // A capability is a contract to return CapabilityFailure rather than
  // throw, but the kernel's existing calendar.move has at least one known
  // live-data edge case (see productionBridge's module doc / the sprint
  // report's P0 list) that throws instead. Never let that crash a turn —
  // fail the turn visibly (Part 15: never silently fail) instead of losing
  // the user's input with no feedback.
  try {
    if (!recognized && kernelOwnsReply) {
      const pendingCapabilityId = session.activeProposal?.step.capabilityId;
      const step = reply(env, session, utterance);
      if (step.outcome.status === "executed") persist(pendingCapabilityId, step.env, messageFor(step.outcome));
      return { env: step.env, session: step.session, outcome: step.outcome, phase: phaseFor(step.outcome), message: messageFor(step.outcome), recognized: true };
    }

    if (!recognized) {
      // Nothing here claims this utterance. If a kernel proposal was left
      // dangling, it's now genuinely stale (the user moved on to something
      // legacy will handle) — cancel it so a later "yes" can't resurrect it.
      const clearedSession = hasPendingContext ? cancel(env, session).session : session;
      return { env, session: clearedSession, outcome: { status: "error", message: `I didn't understand "${utterance}".` }, phase: "listening", message: `I didn't understand "${utterance}".`, recognized: false };
    }

    if (recognized.kind === "demo-reset") {
      const actions = buildDemoSeedActions(now().toISOString(), document);
      if (actions.length > 0) deps.dispatchLife?.(actions, "Loaded demo data.", utterance);
      const message = actions.length > 0 ? "Loaded the demo data — Sofia, Daniel, the Lisbon trip, and a commitment." : "Demo data is already loaded.";
      const outcome: KernelOutcome = { status: "executed", descriptions: [message] };
      return { env, session, outcome, phase: "done", message, recognized: true };
    }

    if (recognized.kind === "play-referent") {
      if (!recognized.ref) {
        const message = recognized.query ? `Nothing found mentioning "${recognized.query}" to play.` : "There's nothing recent to play — search for something first.";
        const outcome: KernelOutcome = { status: "error", message };
        return { env, session, outcome, phase: "listening", message, recognized: true };
      }
      const ref = recognized.ref;
      const message = ref.audioTimestamp
        ? `That's ${formatSeekTime(ref.audioTimestamp.atMs)} into "${ref.label}"${ref.audioTimestamp.confidence === "estimated" ? " (estimated)" : ""}. Flow doesn't have an audio player wired up to actually play it in this build.`
        : `"${ref.label}" doesn't have a recording to play from.`;
      const outcome: KernelOutcome = ref.audioTimestamp ? { status: "executed", descriptions: [message] } : { status: "error", message };
      const nextSession = rememberSearchResults(session, [ref], now().getTime());
      return { env, session: nextSession, outcome, phase: "done", message, recognized: true, openReferent: ref };
    }

    if (recognized.kind === "open-referent") {
      const message = `Opening ${recognized.ref.label}.`;
      const outcome: KernelOutcome = { status: "executed", descriptions: [message] };
      // Refresh this specific referent to the front (not just leave it at
      // whatever index it was in the old result list) so an immediate
      // follow-up ("show it in Finder") points at exactly what was opened.
      const nextSession = rememberSearchResults(session, [recognized.ref], now().getTime());
      return { env, session: nextSession, outcome, phase: "done", message, recognized: true, openReferent: recognized.ref };
    }

    if (recognized.steps.length === 1) {
      const capability = registry.get(recognized.steps[0]!.capabilityId);
      if (capability && !capability.mutates) {
        const ctx = buildContext(document, memoryFacts, now);
        const invalid = capability.validate(recognized.steps[0]!.args, ctx);
        const result = invalid ? { status: "error" as const, code: "invalid", message: invalid } : capability.execute(recognized.steps[0]!.args, ctx);
        const outcome: KernelOutcome = result.status === "ok" ? { status: "executed", descriptions: [result.description] } : { status: "error", message: result.message };
        const capabilityId = recognized.steps[0]!.capabilityId;
        const isRecall = capabilityId === "recall.search" || capabilityId === "recall.commitments";
        const isRecentFiles = capabilityId === "desktop.listRecentFiles";
        const isFileReferent = capabilityId === "desktop.openFile" || capabilityId === "desktop.revealInFinder";
        let nextSession = session;
        let openReferent: EntityReference | undefined;
        if (result.status === "ok" && isRecall && Array.isArray(result.data)) {
          nextSession = rememberSearchResults(session, (result.data as SearchHit[]).map(searchHitToReference), now().getTime());
        } else if (result.status === "ok" && isRecentFiles && Array.isArray(result.data)) {
          nextSession = rememberSearchResults(session, (result.data as RecentFileMeta[]).map(recentFileToReference), now().getTime());
        } else if (result.status === "ok" && isFileReferent) {
          const path = (recognized.steps[0]!.args as { path?: string }).path;
          if (path) {
            openReferent = fileReference(path, path.split("/").pop() ?? path);
            nextSession = rememberSearchResults(session, [openReferent], now().getTime());
          }
        }
        return { env, session: nextSession, outcome, phase: phaseFor(outcome), message: messageFor(outcome), openReferent, recognized: true };
      }
    }

    const step = submit(env, session, utterance, recognized.steps);
    if (step.outcome.status === "executed") persist(recognized.steps[0]?.capabilityId, step.env, messageFor(step.outcome));
    return { env: step.env, session: step.session, outcome: step.outcome, phase: phaseFor(step.outcome), message: messageFor(step.outcome), recognized: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong handling that.";
    return { env, session, outcome: { status: "error", message }, phase: "listening", message: `Flow couldn't complete that: ${message}`, recognized: true };
  }
}

/**
 * After a successful kernel step, translate the specific capabilities this
 * bridge wires into real, persisted `LifeAction`s and run them through the
 * app's existing `dispatchLife` (same `commit` pipeline as every legacy
 * mutation — revision, undo and storage all keep working unmodified).
 * Capabilities not listed here are kernel-internal only (recall/search are
 * read-only; unrecognized ids are left alone rather than guessed at).
 */
export function persistKernelMutation(
  capabilityId: string,
  before: LifeDocument,
  beforeMemory: PersonalMemoryFact[],
  after: LifeDocument,
  afterMemory: PersonalMemoryFact[],
  entityId: string | undefined,
): LifeAction[] {
  const actions: LifeAction[] = [];

  if (capabilityId === "memory.store") {
    const added = afterMemory.find((fact) => !beforeMemory.some((existing) => existing.id === fact.id));
    if (added) actions.push({ type: "memory.fact.create", fact: added });
  }

  if (capabilityId === "memory.forget" && entityId) {
    actions.push({ type: "memory.fact.delete", factId: entityId });
  }

  if (capabilityId === "friends.remember") {
    const addedPerson = after.people.find((person) => !before.people.some((existing) => existing.id === person.id));
    if (addedPerson) actions.push({ type: "person.ensure", person: addedPerson });
    const addedFact = afterMemory.find((fact) => !beforeMemory.some((existing) => existing.id === fact.id));
    if (addedFact) actions.push({ type: "memory.fact.create", fact: addedFact });
  }

  if (capabilityId === "journal.bookmark") {
    for (const afterEntry of after.studio.journalEntries) {
      const beforeEntry = before.studio.journalEntries.find((entry) => entry.id === afterEntry.id);
      const addedBookmark = afterEntry.bookmarks.find((bookmark) => !beforeEntry?.bookmarks.some((existing) => existing.id === bookmark.id));
      if (addedBookmark) { actions.push({ type: "journal.bookmark.add", entryId: afterEntry.id, bookmark: addedBookmark }); break; }
    }
  }

  if (capabilityId === "calendar.move") {
    for (const [dateKey, plan] of Object.entries(after.calendars)) {
      if (before.calendars[dateKey] !== plan) actions.push({ type: "calendar.replace", plan });
    }
  }

  return actions;
}
