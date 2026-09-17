# UX Behavior Specification

## Three-second comprehension target

Within three seconds of opening home, a first-time user should understand:

- this is **today**
- the current/available time window
- the next anchor
- the main weather/outfit recommendation
- whether a person/meeting needs attention
- the single highest-value Flow instinct
- that they can speak to Flow from the bottom command surface

## Stable spatial memory

Stable zones prevent cognitive churn:

- left = time/today
- left-center = current focus opportunity
- center = physical context / outfit
- right-center = people
- right = ambient intelligence
- bottom-center = voice
- bottom-right = time scope
- bottom-left = mascot/proactive cue

Content can adapt inside a zone. The entire layout should not randomly reshuffle every session.

## Today lens

The Today lens must be the easiest part of the design to read.

Required structure:

- real vertical time axis
- visible time labels
- event start/end times
- a visible current-time marker when relevant
- open time shown as space, not as a fake event
- the **next anchor** visually distinguishable
- past events muted
- future events readable but calmer than the next anchor
- event category accents are subtle and semantic

Recommended semantics:

- blue: focus / deep work
- orange: food / anchor / appointment
- violet: creative / review
- green/teal: people / social coordination
- neutral gray: open time / passive context

The timeline should never look like a stack of unrelated cards.

## Focus lens

Purpose: answer **“What can I use right now?”**

The ring is not decorative progress. It represents available usable time before the next anchor.

Primary text hierarchy:

- `28 min`
- `of deep work time`
- `before lunch`

The most useful contextual explanation may appear beneath the ring.

Voice examples:

- “Start focus.”
- “Give me 20 minutes.”
- “I need 40 minutes.”
- “Stop focus.”
- “Undo.”

If a requested duration exceeds available time, Flow proposes the available window.

## Weather & Outfit lens

Decision first, data second.

The lens must communicate:

1. recommendation: `Light layers should be enough.`
2. visual outfit suggestion
3. temperature / condition
4. only the weather details that materially change the recommendation

Do not dump telemetry.

Do not duplicate the same weather facts elsewhere on the screen.

## People lens

People earn space only when they are temporally relevant.

Useful triggers:

- meeting soon
- follow-up required
- shared plan today
- a voice note would be useful
- a commitment with that person is at risk

When no person is relevant, this zone may show a quiet empty state or another higher-value people context. Do not manufacture content just to fill the card.

## Good to know lens

This is the output of the Instinct Engine, not a generic insights feed.

Rules:

- one primary instinct at a time
- up to three quiet secondary signals
- sort by usefulness, urgency and confidence
- never repeat information already obvious elsewhere
- no push-notification tone
- no alarming language unless truly warranted

Examples:

- Great window for deep work
- UV is moderate
- Low chance of rain
- Sunset at 19:48

## Mascot

Mascot has one UX responsibility: embody the most useful intervention without becoming a talking head.

Use one short bubble maximum.

Good:

> “You’ve got a clear 28 minutes. Want to focus on your project?”

Bad:

> “Hello! I am Flow, your AI assistant. I noticed that according to your calendar…”

## Voice command surface

The bottom command bar is the primary control plane.

Resting state:

`Ask Flow or give a command…`

Listening state should change **inside this bar** only; do not add a second top listening chip.

States:

- idle
- listening
- parsing
- previewing a change
- committed
- recoverable error

Every committed change should support undo when technically possible.

## Time scope control

Keep:

- Today
- Tomorrow
- This Week

Voice equivalents:

- “Today.”
- “Tomorrow.”
- “This week.”
- “Friday.”
- “Next weekend.”
- “Go back.”

The visual control shows where the user is in time even if navigation happened by voice.
