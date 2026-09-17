# Flow product-rescue audit

Date: 2026-09-04

## Release scope

This audit compares the mounted production application with the ordered `FLOW_ELITE_HANDOFF_FINAL_2026-09-04` source of truth and its locked reference. It covers the application reachable from `src/main.tsx`; tests and historical, unmounted planner screens are classified separately.

## Root-cause inventory

The failed release had two structural causes:

1. Navigation was seven route-local regular expressions over legacy names. Generic surface nouns such as “area” were not compositional, Focus/Weather/Good-to-know were not destinations, URL identity was inverted, and a miss fell through to the Calendar interpreter. That is why “open the focus area” surfaced a calendar-action error.
2. Home was a new warm projection mounted beside a legacy dark tab application. The other worlds were not merely under-styled; Focus, Weather & Outfit, and Good to know did not exist as detailed production surfaces.

The repair preserves the proven Calendar parser, Tide execution, invariant validator, atomic Life transaction boundary, CAS persistence, and one application-shell recognition owner. It replaces the brittle navigation/route layer and migrates the mounted visual world.

## Production route inventory

| URL | World | Classification | Result |
| --- | --- | --- | --- |
| `/` | Home | correctly migrated | Five orientation lenses, global time scope, one command dock, restrained mascot cue |
| `/today` | Today | migrated from legacy dark | Warm time rail, real geometry, Now context, selection/edit controls, Tide feedback |
| `/focus` | Focus | newly implemented | Available/active states, real free-window calculation, start/complete transaction |
| `/weather-outfit` | Weather & Outfit | newly implemented | Decision-first outfit guidance, observed data provenance, honest unavailable state |
| `/people` | People | migrated and consolidated | Relevant people with linked commitments and Calendar reservations |
| `/people?view=commitments` | People / commitments | migrated and consolidated | Filters, search, add, complete, defer, destructive-confirmed delete |
| `/good-to-know` | Good to know | newly implemented | Ranked deterministic conclusions with provenance and sparse empty state |
| `/capture` | Capture | migrated from legacy dark | Explicit intake, unresolved/resolved state, outcome/event actions, confirmed delete |
| `/outcomes` | Outcomes | migrated from legacy dark | Empty state, outcomes, progress, next step, add/schedule utilities |
| `/outcomes/:id` | Outcome detail | migrated from legacy dark | Desired result, condition, steps, progress, Calendar relationship |
| `/calendar` | alias | obsolete canonical identity | history-preserving replacement to `/today` |
| `/inbox` | alias | obsolete canonical identity | history-preserving replacement to `/capture` |
| `/plans` | alias | obsolete canonical identity | history-preserving replacement to `/outcomes` |
| `/commitments` | alias | no duplicate application | replacement to `/people?view=commitments` |
| `/now` | alias | obsolete standalone world | replacement to `/today`; Now remains embedded in Home/Today |

## Historical and intentionally unmounted code

- `src/features/day-planner/FlowPlannerScreen.tsx` is the pre-LifeState standalone planner. It remains only to preserve its 54-unit-test safety net and is not reachable from `src/main.tsx`.
- `src/features/now/NowSpace.tsx` is the former standalone Now screen. It is not reachable; the production Now projection is `NowInset` inside Today/Home.
- Their child `PlannerHeader` / route-local `VoiceCommandBar` code is likewise historical test coverage, not production UI.

The design migration command builds an import graph from `src/main.tsx`, so an old token in unreachable historical test material is classified instead of hidden, while every mounted module is release-blocking.

## Final routing architecture

Recognition alternatives and typed input enter the same command runner. The final precedence is:

1. system controls
2. temporal navigation
3. world navigation
4. pending clarification
5. contextual follow-up
6. explicit domain action
7. query
8. explicit capture
9. unsupported with no mutation

`features/voice-navigation` owns normalization, structured lexicon data, frame parsing, candidate scoring, destination resolution, context, and deterministic corpus generation. Generic nouns are stripped only inside a confirmed navigation frame. Exact unique aliases work bare; fuzzy recovery is limited to a unique, explicitly framed navigation destination with a safety margin. Destructive and event references are never fuzzy-matched.

## State and context

One versioned `LifeDocument` holds Calendar projections, Focus, weather, people, commitments, captures, outcomes, steps, links, instincts, and preferences. One `LifeContext` holds current/previous world, global time scope, current topic, recent typed entity references, focused person/outcome, pending interaction, turn, and last committed transaction. Browser history restores canonical world identity; transactions and context are independent of route visibility.

Navigation, time travel, queries, and proposals are history-free. Each durable logical request commits one transaction. Calendar invariant validation remains the release boundary. Undo/redo restores complete documents, including cross-world links, Focus state, protection, deferred items, and Calendar geometry.

## Design migration

The mounted application uses the locked warm foundation throughout: `#F9F5F1` page, near-white surfaces, graphite copy, restrained semantic blue/orange/violet/green, editorial serif headings, UI sans fallbacks, consistent focus rings, and the specified Flow easing. The values are registered as Tailwind theme tokens in `src/tailwind.css`; feature-owned class contracts live in the shared design-system modules.

Removed from mounted production:

- dark canvas and dark route shells
- neon teal-on-black accents
- permanent top tabs and mobile tab bar
- route-local command/status treatments
- duplicate Commitments page/store
- generic dark empty canvases
- Calendar-specific copy for navigation failures

The automated import-graph audit fails on any reachable legacy dark token or deprecated permanent-navigation symbol.

## Motion and accessibility

Shared world materialization uses one mounted command/session surface and Motion layout continuity. Cross-space data operations use the measured six-beat Tide/Bloom flight layer. The visual clone is `aria-hidden`, bounded inside the viewport, interruptible, and removed after settlement. Reduced motion uses the short crossfade path without frame sampling.

All detailed worlds have a logical heading, keyboard-operable controls, visible focus treatment, non-voice operation, labelled inputs, restrained live feedback, and non-color status copy. The hidden Home shortcuts remain keyboard discoverable without creating permanent visual navigation.

## Performance findings

- Recognition and ownership listeners are created at the shell, not per route.
- Interim recognition updates only the command/session projection; route state is untouched.
- Weather is normalized once into local document observations and has a truthful no-data path.
- Motion diagnostics reject duplicate clones, hidden-tab frame loops, residue, route flashes, and long-frame regressions.
- Deterministic derived view models avoid network or model work during navigation.

## Honest visual exception

The supplied locked reference is a composite screenshot, not a separately licensed/exported mascot asset. Production retains the previously accepted DOM/SVG cream mascot under the handoff’s behavioral constraints; it is not claimed to be a pixel-identical extraction of the raster character in the source image. No placeholder bitmap, generated image, or unlawfully extracted crop was introduced. The mascot is confined to Home and never substitutes for product feedback.

## Release evidence

The final evidence set is produced by the authoritative release runner plus:

- `artifacts/elite-product-rescue/single-session-evidence.json`
- `artifacts/elite-product-rescue/visual-matrix/matrix.json`
- 95 viewport/state screenshots in the visual matrix
- prior Tide/Anchor/Bloom motion frame matrices retained by the release harness

Synthetic recognition and the physical acoustic microphone are reported separately. A synthetic pass cannot be used to claim a physical microphone pass.
