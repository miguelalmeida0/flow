import type { ControllerOptions } from "../../app/lifeCommandController";
import type { TransactionSource } from "../day-planner/model";
import { messageEnvelope } from "../friends/deliveryProjection";
import { deliveryReceipts } from "../friends/messaging";
import { recordingDocument } from "../studio/recordingTarget";
import { allCalendarEvents } from "../../domain/life-calendar-world";

/** Read only actual selected content. A contact or empty page is not content. */
export function contextualCaptureContent(options: ControllerOptions, answer: string | undefined, transcript: string, source: TransactionSource): string | undefined {
  const snapshot = options.getSnapshot(), context = options.getContext();
  if (answer !== undefined) {
    const pending = options.getPending();
    if (!pending?.capture || pending.capture.expiresAt < options.now().getTime() || pending.baseRevision !== snapshot.revision) {
      options.setPending(undefined); options.setFeedback({ phase: "clarification", title: "That capture question expired", detail: "Say Capture followed by the words to save. Nothing was captured.", transcript }); return;
    }
    return answer;
  }
  let content: string | undefined;
  if (context.route === "people") {
    const target = context.activeMessageId ? { kind: "shared-message" as const, id: context.activeMessageId } : context.activeVoiceNoteId ? { kind: "voice-note" as const, id: context.activeVoiceNoteId } : undefined;
    if (target && context.selectedVoiceMarkerId) content = recordingDocument(snapshot.document, target)?.markers.find(({ id }) => id === context.selectedVoiceMarkerId)?.excerpt;
    if (!content && context.activeMessageId) {
      const message = messageEnvelope(snapshot.document, deliveryReceipts(), context.activeMessageId);
      content = message?.body || message?.attachment?.text;
    }
  } else if (context.route === "journal" && context.selectedJournalPassage) {
    const entry = snapshot.document.studio.journalEntries.find(({ id }) => id === context.activeJournalEntryId);
    if (entry?.text.includes(context.selectedJournalPassage)) content = context.selectedJournalPassage;
  } else if (["today", "calendar"].includes(context.route) && options.selectedCalendarEventId) content = allCalendarEvents(snapshot.document).find(({ id }) => id === options.selectedCalendarEventId)?.title;
  if (content?.trim()) return content.trim();
  options.setPending({ actions: [], baseRevision: snapshot.revision, transcript, source, summary: "Waiting for capture content", capture: { expiresAt: options.now().getTime() + 120_000 } });
  options.updateContext({ capturePrompt: true, pending: "clarification" });
  options.setFeedback({ phase: "clarification", title: "What should I capture?", detail: "Say the words or select a message. Nothing has been captured.", transcript });
}
