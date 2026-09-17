import type { FriendsAction } from "./friends-actions";
import type { LifeDocument } from "./life-model";
import { emptyFriendsState } from "./friends-model";
import { canonicalPerson } from "../features/friends/people";
import { appendJournalProse } from "./journalProse";

/** Pure operations called only by the Life transaction draft boundary. */
export function applyFriendsAction(draft: LifeDocument, action: FriendsAction, now: string): string | null {
  const friends = draft.friends ??= emptyFriendsState();
  if (action.type === "person.create") draft.people.push(canonicalPerson(action.person));
  if (action.type === "person.update") {
    if (!draft.people.some(({ id }) => id === action.personId)) return "That person no longer exists.";
    draft.people = draft.people.map((person) => person.id === action.personId ? canonicalPerson({ ...person, ...action.patch, updatedAt: now }) : person);
  }
  if (action.type === "friend.message.create") friends.messages.push(action.message);
  if (action.type === "friend.message.update") {
    const message = friends.messages.find(({ id }) => id === action.messageId);
    if (!message || message.revision !== action.expectedRevision) return "That message changed. Review its current draft before continuing.";
    Object.assign(message, action.patch, { revision: message.revision + 1, updatedAt: now });
  }
  if (action.type === "friend.message.delete") friends.messages = friends.messages.filter(({ id }) => id !== action.messageId);
  if (action.type === "voice-note.create") friends.voiceNotes.push(action.note);
  if (action.type === "voice-note.update") {
    const note = friends.voiceNotes.find(({ id }) => id === action.noteId);
    if (!note) return "That voice note no longer exists.";
    Object.assign(note, action.patch, { updatedAt: now });
  }
  if (action.type === "voice-note.delete") friends.voiceNotes = friends.voiceNotes.filter(({ id }) => id !== action.noteId);
  if (action.type === "recording.segment.add" || action.type === "recording.markers.replace") {
    if (action.target.kind === "shared-message") return "Delivered audio and its markers are immutable. Reply or save a separate copy.";
    const target = action.target.kind === "journal" ? draft.studio.journalEntries.find(({ id }) => id === action.target.id) : friends.voiceNotes.find(({ id }) => id === action.target.id);
    if (!target) return "That recording no longer exists.";
    if (action.type === "recording.markers.replace") target.markers = action.markers;
    else if (!target.transcriptSegments.some(({ id }) => id === action.segment.id)) {
      target.transcriptSegments.push(action.segment);
      target.text = appendJournalProse(target.text, action.segment.text);
      target.recordingDurationMs = Math.max(target.recordingDurationMs, action.segment.endMs);
    }
    target.updatedAt = now;
  }
  if (action.type === "friend.group.create") friends.groups.push(action.group);
  if (action.type === "friend.group.update") friends.groups = friends.groups.map((group) => group.id === action.groupId ? { ...group, ...action.patch, updatedAt: now } : group);
  if (action.type === "friend.group-plan.create") friends.groupPlans.push(action.plan);
  if (action.type === "friend.group-plan.update") friends.groupPlans = friends.groupPlans.map((plan) => plan.id === action.planId ? { ...plan, ...action.patch } : plan);
  if (action.type === "friend.link.create") friends.links.push(action.link);
  if (action.type === "friend.reaction.add") friends.reactions.push(action.reaction);
  return null;
}
