import { RelationshipCommitments } from "./RelationshipCommitments";
import { SharedMemory } from "./SharedMemory";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { allCalendarEvents } from "../../domain/life-calendar-world";
import { WorldPageShell, warmButton, warmCard, warmField, warmQuietButton } from "../../shared/design-system/WorldPageShell";
import { PersonAvatar } from "./PersonAvatar";
import { personLabel } from "./people";
import { deliveryReceipts, subscribeDeliveries, deliveryDraftLabel } from "./messaging";
import { formatTime } from "../day-planner/time";
import { messagesForRecipient, peopleWithDeliveryHistory, groupsWithDeliveryHistory } from "./deliveryProjection";
import { VoiceNoteSpace } from "./VoiceNoteSpace";
import { SharedVoiceNote } from "./SharedVoiceNote";
import { GroupSpace } from "./GroupSpace";
import { FriendsOverview } from "./FriendsOverview";

export function FriendsSpace() {
  const environment = useFlowEnvironment();
  const { document, conversationContext, runCommand } = environment;
  const receipts = useSyncExternalStore(subscribeDeliveries, deliveryReceipts, deliveryReceipts);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [alias, setAlias] = useState("");
  const people = peopleWithDeliveryHistory(document, receipts);
  const person = people.find(({ id }) => id === conversationContext.focusedPersonId);
  const group = groupsWithDeliveryHistory(document, receipts).find(({ id }) => id === conversationContext.focusedGroupId);
  const voiceNote = document.friends?.voiceNotes.find(({ id }) => id === conversationContext.activeVoiceNoteId);
  function addPerson(event: FormEvent) { event.preventDefault(); if (!name.trim()) return; runCommand(`Add friend ${name.trim()}`, "type"); setName(""); }
  function draftMessage(event: FormEvent) { event.preventDefault(); if (!body.trim() || !person) return; environment.dispatchFriend({ type: "friend-message", resolvedPersonId: person.id, body }); setBody(""); }
  const messages = person ? messagesForRecipient(document, receipts, { kind: "person", id: person.id }) : [];
  const linkedEvents = person ? allCalendarEvents(document).filter((event) => event.participantIds?.includes(person.id)) : [];
  return <WorldPageShell destination="people" title={person ? personLabel(person) : group?.name ?? "Friends"} eyebrow="Private · Flow-local" description={person || group ? "Messages, shared plans, and the things you keep for each other." : "People you know. Nothing public, nothing invented."} testId="friends-space" action={<button data-action-id="people.view" className={warmQuietButton} onClick={() => environment.navigate("people", undefined, false, "commitments")} type="button">Commitments</button>}>
    {group ? <GroupSpace key={group.id} group={group} receipts={receipts} /> : person ? <>
      <button data-action-id="friends.overview" className={warmQuietButton} onClick={() => runCommand("Open Friends", "quick")} type="button">← All friends</button>
      {voiceNote && voiceNote.recipient.id === person.id && <VoiceNoteSpace note={voiceNote} />}
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className={`${warmCard} p-6`} aria-label="Messages" data-page-task="conversation" data-task-entity-id={person.id}><div className="flex items-center gap-3"><PersonAvatar person={person} /><div><h2 className="font-serif text-2xl">Conversation</h2><p className="mt-1 text-xs text-flow-secondary">Local to this browser · no external messaging provider</p></div></div>
          {!person.archived && <form onSubmit={draftMessage} className="space-y-3"><label className="block text-xs text-flow-secondary" htmlFor="friend-message">Message to {personLabel(person)}</label><textarea data-action-id="friends.message-compose" id="friend-message" className={`${warmField} min-h-28`} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message…" /><div className="flex flex-wrap gap-2"><button data-action-id="friends.message-compose" className={warmButton} type="submit">Review message</button><button data-action-id="friends.voice-create" className={warmQuietButton} onClick={() => environment.dispatchFriend({ type: "friend-voice", operation: "create", resolvedPersonId: person.id })} type="button">Voice note</button><button data-action-id="friends.plan-create" className={warmQuietButton} type="button" onClick={() => environment.dispatchFriend({ type: "friend-plan", resolvedPersonId: person.id })}>Make plan</button><button data-action-id="friends.availability-share" className={warmQuietButton} type="button" onClick={() => environment.dispatchFriend({ type: "friend-query", operation: "availability", resolvedPersonId: person.id })}>Share availability</button></div></form>}
          <div className="my-6 divide-y divide-[#E8E0D7]">{messages.map(({ message, receipt, restoredDraft, key }) => <article className="py-4" key={key} data-message-id={message.id}><p className="whitespace-pre-wrap text-sm leading-7">{message.body || (message.attachment ? "Voice note" : "Empty draft")}</p>{!restoredDraft && message.attachment?.kind === "voice" && <SharedVoiceNote message={message} />}{!restoredDraft && message.attachment?.kind === "memory" && <SharedMemory message={message} />}<p className="mt-2 text-xs text-flow-muted">{receipt ? receipt.label : restoredDraft ? "Restored draft · the delivered message above is unchanged" : deliveryDraftLabel(message)}</p></article>)}{!messages.length && <p className="py-8 text-sm text-flow-secondary">No messages yet. Start with your own words.</p>}</div>
        </section>
        <aside className="space-y-4"><section className={`${warmCard} p-5`}><h2 className="font-serif text-xl">Memories together</h2>{document.studio.memories.filter((memory) => memory.personIds?.includes(person.id)).map((memory) => <button data-action-id="memory.select" className="mt-3 block text-left text-sm" type="button" key={memory.id} onClick={() => { environment.navigate("memories"); environment.focusEntity(memory.id); }}>{memory.title}<span className="block text-xs text-flow-secondary">Private linked Memory</span></button>)}</section><section className={`${warmCard} p-5`}><h2 className="font-serif text-xl">Plans together</h2>{linkedEvents.map((event) => <button data-action-id="calendar.inspect" className="mt-3 block w-full text-left text-sm" key={event.id} onClick={() => { environment.navigate("today"); environment.setTemporalScope({ kind: "day", dateKey: event.dateKey }); environment.selectCalendarEvent(event.id); }} type="button">{event.title}<span className="block text-xs text-flow-secondary">{event.dateKey} · {formatTime(event.start)}</span></button>)}{!linkedEvents.length && <p className="mt-3 text-sm text-flow-secondary">No shared Calendar plans yet.</p>}</section><section className={`${warmCard} p-5`}><RelationshipCommitments personId={person.id} /></section><form className={`${warmCard} space-y-3 p-5`} onSubmit={(event) => { event.preventDefault(); if (alias.trim()) { environment.dispatchFriend({ type: "friend-person", operation: "alias", query: personLabel(person), resolvedPersonId: person.id, alias: alias.trim() }); setAlias(""); } }}><label className="block text-sm" htmlFor="friend-alias">Also known as</label><p className="text-xs text-flow-secondary">{person.aliases?.join(", ") || "No aliases yet"}</p><input data-action-id="friends.person-alias" id="friend-alias" className={warmField} value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="Mum, Johnny…" /><button data-action-id="friends.person-alias" className={warmQuietButton} type="submit">Add alias</button></form></aside>
      </div>
    </> : <>
      <form data-page-task="directory" className={`${warmCard} flex flex-wrap gap-3 p-4`} onSubmit={addPerson}><input data-action-id="friends.person-create" aria-label="Friend name" className={`${warmField} min-w-48 flex-1`} value={name} onChange={(event) => setName(event.target.value)} placeholder="Add someone you know" /><button data-action-id="friends.person-create" className={warmButton} type="submit">Add friend</button></form>
      <FriendsOverview receipts={receipts}>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{people.map((item) => <button data-action-id="friends.person-open" className={`${warmCard} flex gap-4 p-5 text-left`} data-life-entity-id={item.id} key={item.id} onClick={() => environment.dispatchFriend({ type: "friend-person", operation: "open", query: personLabel(item), resolvedPersonId: item.id })} type="button"><PersonAvatar person={item} /><span><span className="font-serif text-xl">{personLabel(item)}</span><span className="mt-2 block text-xs text-flow-secondary">{document.commitments.filter(({ personId, status }) => personId === item.id && status !== "completed").length} open commitments</span></span></button>)}</div>
      {!people.length && <div className="py-14 text-center"><p className="font-serif text-3xl">No friends yet.</p><p className="mt-3 text-sm text-flow-secondary">Add a friend to start a private local conversation.</p></div>}
      </FriendsOverview>
<div className={`${warmCard} mt-5 p-5`}><RelationshipCommitments /></div>
    </>}
  </WorldPageShell>;
}
