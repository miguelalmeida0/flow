# Current failure — evidence and diagnosis target

## Observed defects

1. Flow shows `Live listening`, but global commands are not routed globally.
2. “Open the calendar” and “Open the inbox” are saved as Inbox captures.
3. The fallback behavior appears to be: unknown speech → create capture. This is unsafe and wrong.
4. Navigation, capture, and domain-edit intents are not separated with strict precedence.
5. The active space does not provide reliable conversational context for follow-up commands.
6. The product still requires the user to think about where a command belongs rather than Flow understanding the command.
7. The home title/hero appears partially hidden under the fixed header in the supplied screenshot, indicating a layout ownership problem.
8. The UI does not clearly show the short lifecycle: heard → understood → changed.

## Why this is P0

Creating unintended data from misunderstood speech destroys trust. A navigation utterance must never become a note, task, plan, event, or promise.

## Required inspection

The implementation agent must trace:

- where SpeechRecognition is instantiated;
- who owns it across route changes;
- how final transcripts enter the application;
- the order in which navigation, system, domain, capture, and unknown intents are evaluated;
- why unknown input mutates Inbox;
- whether route components mount/unmount recognition listeners;
- whether duplicate `onresult`/`onend` handlers are possible;
- how `activeSpace`, `selectedEntity`, `lastChangedEntity`, and pending clarifications are stored;
- whether voice actions, typed actions, drag actions, and automatic Tide actions share one action pipeline.

The agent must document the verified root cause before modifying production code.
