# Product behavior — the visual Alexa model

## Product promise

> Allow the microphone once. Speak naturally. Flow opens the right space and changes the right thing immediately.

The user should not need to select a container before speaking. Containers are visual projections, not command scopes that must be manually entered.

## Primary interaction

1. The user clicks `Start Live Session` once.
2. Flow remains available while the tab is visible and the session is active.
3. Saying a space name opens it immediately.
4. Follow-up speech operates in the active space and can refer to the last changed object.
5. Saying `Home`, `Back`, or another space name navigates without creating data.
6. Saying `Pause`, `Stop listening`, or pressing Escape ends/suspends the session.

## Example continuous session

```text
User: Calendar
Flow: opens Calendar

User: Move the two PM meeting to four
Flow: resolves the only event at 2 PM and moves it

User: Make it red and important
Flow: edits the same event through conversational context

User: Give me twenty minutes before it
Flow: creates a buffer before the same event

User: Home
Flow: returns Home

User: Inbox
Flow: opens Inbox

User: Remember to buy coffee tomorrow
Flow: creates one explicit capture

User: Plans
Flow: opens Plans

User: Turn the passport capture into a plan
Flow: transforms the intended capture into a plan
```

No microphone re-click. No accidental captures. No generic chatbot response.

## Intent precedence

Every final transcript must be processed in this order:

1. **System control** — pause, stop, undo, redo, cancel, help.
2. **Navigation** — home, calendar, inbox, plans, people, now, back.
3. **Pending clarification response** — resolve the current question.
4. **Active-space/domain command** — move, recolor, create, resize, link, complete, etc.
5. **Cross-space life command** — create a promise, turn capture into plan, schedule plan step.
6. **Explicit capture** — only when the user says `remember`, `capture`, `note`, `add to inbox`, or activates a dedicated capture mode.
7. **Unknown/unsupported** — never mutates state.

There is no `unknown → capture` fallback.

## Explicit capture rule

Flow may create an Inbox capture only when one of these is true:

- the utterance has an explicit capture verb;
- the user has deliberately opened a short Capture mode;
- the user confirms a clarification asking whether the phrase should be saved.

Examples that create captures:

- “Remember to buy coffee.”
- “Capture this: passport appointment requirements.”
- “Add a note to Inbox: ask Daniel about the contract.”

Examples that must never create captures:

- “Calendar.”
- “Open the plans container.”
- “Go home.”
- “Move the 2 PM meeting.”
- “What fits right now?”
- unsupported or poorly transcribed speech.

## Conversational context

Keep a small, explicit context object:

- `activeSpace`
- `previousSpace`
- `selectedEntityId`
- `lastReferencedEntityId`
- `lastChangedEntityId`
- `lastCreatedEntityId`
- `pendingClarification`
- `lastCommandAt`

Context expires conservatively. A follow-up such as “make it red” may target the last changed event, but never an unrelated object from several minutes ago without clarification.
