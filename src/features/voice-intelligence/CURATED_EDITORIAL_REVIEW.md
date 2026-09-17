# Curated language editorial review

## What this source is

`curatedLanguageSeeds.json` is a static, reviewable product acceptance source.
It contains 2,500 distinct English utterances with an expected route, intent,
language family, and production review scope. It is not telemetry, a recording
set, a claim about accents, or physical-microphone evidence.

The September 6 rescue substantially rewrote more than 2,086 rows at the
utterance level. The final whole-source grammar pass then corrected 26 admitted
rows spanning bounded Studio, temporal, Capture, and Commitment language. A
local Ollama model helped draft alternate wording for
the large language families. The admitted text was then corrected against the
product vocabulary, reviewed as static source, and exercised through the real
registry, controller, entity planner, transaction engine, invariants, and
history. The model is not a runtime dependency and its drafts are not counted
as observed user speech. `product-editorial-review` is deliberately used as the
origin label instead of claiming that every word was manually composed.

## Admission policy

A row is admitted only when all of these checks pass:

- its normalized utterance and filler-stripped fingerprint are unique;
- it is not numbered, counter-padded, or a disguised example/frame label;
- its route and expected intent match its `reviewScope`;
- its normalized semantic core occurs at most 10 times;
- its sentence-edge skeleton occurs at most 10 times;
- its canonical grammar skeleton—after abstracting verbs, entities, times,
  durations, names, and polite framing—occurs at most 20 times;
- every rolling 40-row window covers at least nine families, five intents, and
  four routes, with no repeated eight-row family/route rotation;
- eight grammar-quality admissions reject singular/plural disagreement,
  determiner/plural-object conflicts, `a`/`an` sound disagreement, and malformed
  infinitive/`that` clause joins. Commitment-specific checks also reject
  malformed promise-object determiners and adjective/object combinations that
  are syntactically shaped but semantically impossible;
- it resolves through the production candidate registry; and
- an expected execution completes through production planning and the atomic
  transaction/history boundary (or reaches the required confirmation state).

The measured values are persisted in
`artifacts/voice-intelligence/coverage-report.json` under
`curatedEditorialAudit`. The corpus SHA-256 in `CURATED_LANGUAGE_MANIFEST.md`
freezes the exact reviewed source.

## Grammar-quality review

All 2,500 checked-in utterances are scanned, rather than accepting a spot-check
sample. The admission test reports the row id, text, and failed rule. This pass
corrected every detected quantity, article/object, promise-object, and
infinitive/clause disagreement. Representative source corrections include:

| Before | Admitted wording | Rule exercised |
| --- | --- | --- |
| `Move the voice start 1 seconds later` | `Move the voice start one second later` | one takes a singular unit |
| `Show me 1 days from today` | `Show me one day from today` | one takes a singular unit |
| `I owe Omar a finished design notes by Friday` | `I owe Omar finished design notes by Friday` | an indefinite article cannot determine a plural object |
| `I promised Jonas a reviewed apartment keys before Friday morning` | `I promised Jonas I would return the apartment keys before Friday morning` | promise objects retain grammatical number |
| `Remember to that address saved somewhere` | `Remember that address for later` | an infinitive cannot directly own a `that` clause |
| `I owe Amir the completed apartment keys for review by Friday` | `I owe Amir the apartment keys back by Friday` | completion adjectives cannot describe a physical key set |

The same corrected rows must still resolve through the production registry and
complete through planning, invariant validation, atomic persistence, and exact
history. A grammar correction that changes the expected product behavior is
therefore rejected rather than waived.

## Family-by-family review

| Family | Rows | Representative checked-in language | Editorial purpose |
| --- | ---: | --- | --- |
| `atmosphere-adjust` | 40 | “restore the rain”; “make everything quieter” | Separates layer restoration, layer volume, and master-volume requests from Calendar movement language. |
| `atmosphere-play` | 60 | “Play Long-form focus atmosphere”; “Put on Tea and thunder” | Covers named preset lookup with play/start/put-on/use forms. |
| `atmosphere-playback` | 10 | “mute the atmosphere”; “pause the atmosphere”; “resume the atmosphere” | Keeps media playback controls distinct from the global Live Session. |
| `atmosphere-save` | 40 | “Save this as Muted garden”; “Rename this to Sunday evening” | Exercises named-preset creation and rename continuations. |
| `attention-query` | 40 | “what is the weather”; “when does the sun set”; “start that” | Covers deterministic recommendations and context-resolved follow-up action. |
| `calendar-create` | 200 | “Add 20 minutes customer research at 9:00 AM”; “Could you add a 30-minute mobility workout to my schedule at 11:00 AM today” | Mixes exact starts, ranges, word/clock durations, dates, filler, and title shapes. |
| `calendar-defer` | 50 | “Defer career planning until tomorrow”; “Reschedule security review for Wednesday” | Distinguishes moving work to another day from same-day movement and deletion. |
| `calendar-fit` | 100 | “Fit 30 minutes language practice between nine am and eleven am”; “Fit one hour client debrief in the next free slot” | Tests bounded windows, deadlines, and automatic free-slot placement. |
| `calendar-move` | 200 | “Shift strategy review over to 4 pm”; “Move the data cleanup block after lunch” | Covers move/shift/push/reschedule/put, exact time, and relative anchors without seed IDs. |
| `calendar-protect` | 50 | “Protect architecture review”; “Do not move the budget planning” | Confirms explicit anchoring language and avoids destructive or generic-removal leakage. |
| `calendar-resize` | 100 | “Take 15 minutes off email review”; “Give passport paperwork another 15 minutes” | Covers set, extend, and shorten forms, including duration-first speech. |
| `commitment-statement` | 400 | “I promised Daniel I'd send the workshop agenda by Friday”; “I owe Daniel a clear answer about the budget draft no later than Thursday” | Varies promise/owe/told syntax, person placement, deliverables, and deadline forms. |
| `editorial-capture-backfill` | 136 | “Write down where to buy blister patches”; “Capture confirm that picnic time with Amir before Saturday” | Preserves short, irregular capture shapes that intentionally do not become Outcomes or Calendar actions. |
| `explicit-capture` | 300 | “Remember to clean the coffee grinder during my next break”; “Save for later return that borrowed camera before Friday” | Proves explicit capture precedence across routes without an unknown-to-capture fallback. |
| `goal-phrasing` | 300 | “I need to study Portuguese grammar before I travel to Senegal next month”; “My goal is to design the garden beds before our backyard renovation starts next week” | Covers outcome statements, motivations, milestones, and natural deadline language. |
| `journal-create` | 20 | “let me get something down”; “start a new entry” | Exercises visible entry-creation language without Calendar’s `start` verb stealing it. |
| `journal-dictation` | 250 | “Daniel's inquiry forced me to pause and identify what truly mattered”; “The riverbank reminded me that growth doesn't always have to be loud and obvious” | Content-first long-form speech includes command-like words that must remain raw journal text. |
| `journal-editing` | 10 | “Rename this entry to The difficult choice”; “Rename this entry to Rain in the courtyard” | Covers current-entry references and user-supplied titles. |
| `journal-interruption` | 20 | “I'm done”; “keep that bit”; “end recording” | Defines the exact whole-utterance controls allowed to escape Journal dictation. |
| `memory-audio-trim` | 80 | “Move the voice start 5 seconds earlier”; “Move the voice start 5 seconds later” | Tests direction, boundary selection, and scalar adjustment of saved audio. |
| `memory-editing` | 20 | “Save memory”; “Bigger”; “Bring the voice back” | Covers current-memory state, visual scale, and audio inclusion. |
| `navigation-motion` | 12 | “Bring up good to know”; “Open commitments”; “Go to people” | Verifies global navigation wins without creating data on any current route. |
| `people-query` | 20 | “show Miguel”; “what does Maya owe me”; “prepare me for Luis Friday” | Covers person lookup, commitment direction, and next-conversation preparation. |
| `system-control` | 20 | “show commands”; “what changed”; “pause listening” | Keeps application controls above domain interpretation and outside history. |
| `temporal-fragment` | 15 | “Sunday”; “tomorrow”; “last week” | Exercises route-neutral date/range fragments and conversational navigation. |
| `temporal-relative` | 7 | “Show me one day from today”; “Show me 4 days from today” | Covers deterministic relative-date computation separately from Calendar mutation. |

## Release interpretation

Passing this source demonstrates deterministic English transcript handling for
the covered product contract. It does not demonstrate acoustic recognition,
accent coverage, noisy-room performance, or physical microphone permission.
Those remain separate browser/device acceptance evidence.
