# Component Contracts

These are behavior boundaries, not mandatory filenames.

## `FlowHomeScene`

Owns layout/orchestration only. Must not contain weather rules, calendar arithmetic or voice parsing.

Consumes view models for:

- header
- today lens
- focus lens
- weather/outfit lens
- people lens
- instincts lens
- mascot cue
- time scope
- voice state

## `TodayLens`

Inputs:

- local date
- current time
- events
- free windows
- next anchor id

Outputs only interaction intents, e.g. `inspect_event`, `show_full_day`.

No mutation logic inside the component.

## `FocusLens`

Inputs:

- availableMinutes
- nextAnchorLabel
- activeFocusSession
- contextualHint

## `WeatherOutfitLens`

Inputs:

- weatherSnapshot
- outfitRecommendation
- optional relevant warning

The component never derives clothing recommendations itself.

## `PeopleLens`

Inputs:

- ranked relevant people
- associated upcoming commitment
- optional suggested action

## `InstinctsLens`

Inputs:

- ranked instincts

Max visible: 4; primary item receives highest emphasis.

## `FlowMascot`

Input is a finite mascot state + optional single utterance.

No freeform chatbot text generated inside the component.

## `VoiceCommandBar`

Inputs:

- idle/listening/parsing/preview/committed/error state
- transcript preview
- optional action preview

All voice actions feed the same command bus as any pointer/touch fallback controls.
