/**
 * Deterministic demo seed data — real objects the real capabilities operate
 * on, not a parallel "demo mode" branch. Triggered by an explicit real
 * command ("reset the demo" / "load demo data") and dispatched through the
 * same LifeAction/commit pipeline as everything else, so it is undoable and
 * indistinguishable from anything a user could create by hand.
 */
import type { LifeAction } from "../domain/life-actions";
import type { LifeDocument } from "../domain/life-model";

export const DEMO_RESET_PHRASE = /^(reset|load|set up) (the )?demo( data)?$/i;

export const DEMO_PERSON_SOFIA_ID = "demo-person-sofia";
export const DEMO_PERSON_DANIEL_ID = "demo-person-daniel";
export const DEMO_JOURNAL_LISBON_ID = "demo-journal-lisbon";
export const DEMO_COMMITMENT_SOFIA_ID = "demo-commitment-sofia";
export const DEMO_LISBON_AUDIO_ASSET_ID = "demo-asset-lisbon";

/**
 * Only emits actions for pieces that don't already exist, keyed by the
 * deterministic demo ids above — so saying "reset the demo" twice (or
 * running it against a document a user has already been talking to) never
 * duplicates Sofia, the commitment, or the journal entry.
 */
export function buildDemoSeedActions(now: string, document: LifeDocument): LifeAction[] {
  const actions: LifeAction[] = [];

  if (!document.people.some((person) => person.id === DEMO_PERSON_SOFIA_ID)) {
    actions.push({ type: "person.ensure", person: { id: DEMO_PERSON_SOFIA_ID, kind: "person", name: "Sofia", createdAt: now, updatedAt: now } });
  }
  if (!document.people.some((person) => person.id === DEMO_PERSON_DANIEL_ID)) {
    actions.push({ type: "person.ensure", person: { id: DEMO_PERSON_DANIEL_ID, kind: "person", name: "Daniel", createdAt: now, updatedAt: now } });
  }
  if (!document.studio.mediaAssets.some((asset) => asset.id === DEMO_LISBON_AUDIO_ASSET_ID)) {
    // No real recorded audio bytes exist for this asset (this is seed data,
    // not a captured voice memo) — registering it satisfies the same
    // journal-audio invariant a real recording would, so provenance
    // (timestamps, "play that part") is real and consistent, while playback
    // honestly reports it has no audio to actually play (see
    // productionBridge's recall.play handling).
    actions.push({ type: "media.register", asset: { id: DEMO_LISBON_AUDIO_ASSET_ID, kind: "journal-audio", name: "Trip planning recording", mimeType: "audio/webm", size: 0, createdAt: now } });
  }
  if (!document.commitments.some((commitment) => commitment.id === DEMO_COMMITMENT_SOFIA_ID)) {
    actions.push({
      type: "commitment.create",
      commitment: { id: DEMO_COMMITMENT_SOFIA_ID, kind: "commitment", personId: DEMO_PERSON_SOFIA_ID, title: "Book dinner for Sofia's birthday", direction: "i-owe", status: "open", createdAt: now, updatedAt: now },
    });
  }
  if (!document.studio.journalEntries.some((entry) => entry.id === DEMO_JOURNAL_LISBON_ID)) {
    actions.push({
      type: "journal.create",
      entry: {
        id: DEMO_JOURNAL_LISBON_ID,
        kind: "journal-entry",
        title: "Trip planning",
        text: "Thinking about visiting Lisbon next month. I already booked the hotel near the river for three nights.",
        status: "saved",
        recordingState: "idle",
        recordingDurationMs: 9800,
        audioAssetId: DEMO_LISBON_AUDIO_ASSET_ID,
        photoAssetIds: [],
        bookmarks: [],
        transcriptSegments: [
          { id: "demo-seg-lisbon-1", text: "Thinking about visiting Lisbon next month.", startMs: 0, endMs: 4200, source: "voice" },
          { id: "demo-seg-lisbon-2", text: "I already booked the hotel near the river for three nights.", startMs: 4200, endMs: 9800, source: "voice" },
        ],
        drawings: [],
        tags: ["travel"],
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  return actions;
}
