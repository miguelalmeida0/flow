/**
 * The narrow compatibility adapter between legacy's own referent tracking
 * (LifeContext.selected/lastReferenced/lastChanged/lastCreated, each a
 * timestamped ConversationEntityReference — see conversationContext.ts) and
 * the kernel's authoritative referent model (ConversationSession.referents,
 * an EntityReference — see kernel/session.ts).
 *
 * There is exactly ONE referent contract (kernel/session.ts's
 * EntityReference); this file only translates between it and legacy's
 * pre-existing shape, using the timestamp both sides already carry
 * (`.at` / epoch ms) to decide whose referent is more recent. Neither side
 * is a second source of truth — legacy's fields stay legacy's own working
 * state (rewriting lifeCommandController.ts's resolution internals is out
 * of scope and unnecessary), but every referent either side establishes
 * becomes visible to the other through this single, generic translation
 * rather than a pile of "if this word then that field" special cases.
 */
import type { LifeContext } from "../domain/life-model";
import type { EntityReference } from "../kernel/session";

/**
 * Legacy's freshest referent (whichever of selected/lastReferenced/
 * lastChanged/lastCreated has the latest timestamp) translated into the
 * kernel's shape, so a kernel-recognized follow-up ("bookmark it" after
 * legacy opened a journal entry) can resolve it.
 */
export function referenceFromLegacyContext(context: LifeContext): EntityReference | undefined {
  const candidates = [context.selected, context.lastReferenced, context.lastChanged, context.lastCreated].filter(
    (candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate),
  );
  if (candidates.length === 0) return undefined;
  const freshest = candidates.reduce((latest, candidate) => (candidate.at > latest.at ? candidate : latest));
  return { id: freshest.id, kind: freshest.kind, at: freshest.at };
}

/**
 * The inverse: a kernel referent translated into the legacy context patch
 * that makes "it"/"that" resolvable by legacy's OWN resolution afterward
 * (e.g. after the kernel opens a recall result or moves a calendar event).
 * Referents with no real LifeEntityId (a desktop file, a raw search hit)
 * have no legacy slot and intentionally return undefined — legacy has no
 * concept of them, which is correct: the kernel is the only side that
 * understands a desktop path or an Earmark moment.
 */
export function legacyContextPatchFromReference(reference: EntityReference, atMs: number): Partial<LifeContext> | undefined {
  if (reference.kind === "desktop-file" || reference.kind === "search-hit") return undefined;
  const stamped = { id: reference.id, kind: reference.kind, at: atMs };
  return { focusedEntityId: reference.id, selected: stamped, lastReferenced: stamped };
}
