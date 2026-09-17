# 03 — Global Voice Runtime

## Core rule

The user starts Live Session once. The recognizer belongs to the application shell and survives route changes.

## Voice state machine

```text
idle
→ requesting-permission
→ listening
→ processing-final-transcript
→ executing
→ listening

error states:
permission-denied
microphone-unavailable
no-speech
network-unavailable
language-unavailable
paused
```

There must never be two active recognizers or duplicate event listeners.

## Foreground continuous behavior

While Live Session is enabled and the tab is active:

- final transcripts execute automatically;
- Chrome recognition restarts after a normal `end` event;
- restart is debounced and blocked while processing;
- navigation does not tear down the session;
- hiding the tab pauses capture;
- returning to the visible tab resumes only if the user left Live Session enabled;
- Escape pauses listening immediately;
- “pause listening,” “stop listening,” and “Flow sleep” pause it;
- “resume listening” works from the typed command path if the browser allows it.

## Explicit language

The deterministic command language is English. Set the recognizer explicitly to `en-US` before every start. Do not infer from operating-system or browser locale.

## Candidate selection

Collect multiple speech alternatives where available. Rank candidates by domain validity before browser confidence.

A candidate that produces a complete valid command beats a higher-confidence candidate that produces nonsense.

## Global intent priority

Every final transcript follows exactly this priority:

1. system control;
2. navigation;
3. pending confirmation/clarification;
4. contextual follow-up on the last referenced entity;
5. explicit domain command;
6. cross-domain life statement;
7. explicit capture;
8. unsupported.

Unknown speech must never become a Capture automatically.

## Navigation vocabulary

Support direct nouns and natural variants:

- Home / go home / main screen
- Today / calendar / open my day
- Capture / inbox / notes / open my captures
- Outcomes / plans / goals / open my plans
- Commitments / people / promises / who am I waiting on

Route changes should begin as soon as interim intent becomes unambiguous, but state mutation waits for the final transcript.

## Context memory

Maintain a small explicit context stack:

```ts
type InteractionContext = {
  currentSpace: SpaceId;
  lastReferencedEntityId?: string;
  lastCreatedEntityId?: string;
  lastChangedEntityId?: string;
  pendingClarification?: Clarification;
  pendingConfirmation?: Confirmation;
  lastTranscript?: string;
  updatedAt: number;
};
```

Context enables:

- “Move the 2 PM meeting to 4.”
- “Make it red.”
- “Make it important.”
- “Give me 20 minutes before it.”
- “Actually undo that.”

## Voice feedback

The command surface is compact and temporary.

While listening:

- show interim text;
- show the detected action preview when confidence is high;
- do not mutate until final.

On success:

- animate the changed object;
- keep the final transcript briefly;
- no success toast is needed.

On failure:

- show what was heard;
- distinguish recognition failure from unsupported capability;
- ask at most one clarification;
- never use a large persistent red panel.
