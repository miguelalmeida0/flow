# Voice architecture

## Ownership

The live voice session must be owned by the application shell, above all spaces/routes.

```text
AppShell
└── VoiceSessionProvider
    ├── Home projection
    ├── Calendar projection
    ├── Inbox projection
    ├── Plans projection
    ├── People projection
    └── Now projection
```

Opening Calendar must not destroy and recreate the recognizer. Route changes are projections inside one continuous environment.

## Shared pipeline

```text
Microphone final transcript
Typed command
Keyboard command
        ↓
normalize transcript
        ↓
select best speech candidate
        ↓
GlobalIntentRouter
        ↓
resolve references with ConversationContext
        ↓
LifeAction[] or NavigationAction
        ↓
validate / preview
        ↓
atomic commit
        ↓
persistence + exact undo/redo
        ↓
route transition + domain motion
```

Voice does not get a private mutation path.

## Recognition state machine

States:

- `off`
- `requesting-permission`
- `starting`
- `listening`
- `processing`
- `recovering`
- `paused`
- `permission-denied`
- `unavailable`

Requirements:

- explicit `en-US` or selected supported English locale before every start;
- `continuous = true` where supported;
- `interimResults = true`;
- multiple alternatives and semantic candidate ranking;
- exactly one recognizer instance per live session;
- no duplicate listeners;
- guarded auto-restart after unexpected `onend`;
- no auto-restart after user pause, permission denial, or hidden tab;
- suspend/stop when the document becomes hidden;
- resume only with the user’s active Live Session consent;
- Escape pauses immediately;
- no audio storage.

## Router contracts

Use discriminated unions, not stringly-typed side effects.

```ts
type SpaceId = "home" | "calendar" | "inbox" | "plans" | "people" | "now";

type RoutedIntent =
  | { kind: "system"; action: "pause" | "resume" | "undo" | "redo" | "cancel" }
  | { kind: "navigate"; target: SpaceId }
  | { kind: "life-action"; actions: LifeAction[] }
  | { kind: "clarification"; prompt: string; options: ClarificationOption[] }
  | { kind: "unsupported"; transcript: string; reason: UnsupportedReason };
```

Navigation returns a navigation intent, never a Capture action.

## Context-aware follow-ups

Examples:

```text
Calendar → Move the 2 PM meeting to 4 → Make it red → Protect it
```

`Make it red` and `Protect it` resolve through `lastChangedEntityId`.

```text
Inbox → select/capture passport item → Turn that into a plan
```

`that` resolves through selected or last referenced capture.

If context is missing or stale, ask one concise question rather than guessing.

## Safety

Safe/reversible edits may apply immediately with undo.

Deletion, moving protected/shared commitments, or external side effects require preview/confirmation.

Unknown speech never mutates domain state.
