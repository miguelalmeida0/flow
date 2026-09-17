# Flow Product Rescue — Principal Staff Engineer Mission

You are the principal staff engineer and product-minded frontend lead responsible for turning the current Flow repository into a coherent, Apple-grade portfolio product.

This is a stop-ship rescue mission. Do not stop after planning, auditing, or scaffolding.

## Read first

1. Repository `docs/internal/automation/AGENTS.md`
2. Repository `docs/quality/VERIFICATION.md`
3. Every file in `FLOW_APPLE_GRADE_PRODUCT_RESCUE_HANDOFF` in README order
4. Every failure screenshot in `assets/current-state`
5. Every target reference in `assets/target`

## Current truth

The current app is not one world. It is several routes sharing a dark theme and a microphone. Voice commands are often interpreted by the wrong local parser. Navigation phrases fail or become data. Valid event creation fails outside Calendar. Plans, People, and Now do not provide complete utility loops. Motion contains broken telemetry-like paths.

Do not call the current state acceptable.

## Mission outcome

Implement P0 and P1 from `07_IMPLEMENTATION_BACKLOG.md`. Complete the P2 motion rescue before declaring the experience portfolio-ready. Do not implement P3.

Canonical product structure:

- Home
- Today
- Capture
- Outcomes
- Commitments

Now is embedded in Home and Today, not a top-level route.

Legacy routes and voice aliases must redirect safely.

## Hard architectural requirements

- React + strict TypeScript
- Tailwind and centralized design tokens
- feature/domain organization
- small, readable modules
- one application-shell voice owner
- one global intent router
- one unified `LifeState`
- one typed `LifeAction` engine
- one atomic transaction path
- one global undo/redo history
- no prop-drilling maze
- context only where it genuinely reduces complexity
- no route-local business logic forks
- no paid/runtime LLM
- no backend
- no mascot yet

## Work sequence

### Step 1 — Establish baseline

Inspect actual code paths and run existing lint/tests/build. Document failures honestly. Do not trust old verification claims when the physical product contradicts them.

### Step 2 — Repair global voice first

Move recognition ownership to the app shell. Implement the state machine, explicit English locale, candidate ranking, continuous foreground restart, deduplication, global intent priority, route navigation, contextual references, and unsupported-with-zero-mutation behavior.

After this step, the following must work from any route:

- “Home.”
- “Calendar.”
- “Open the inbox area.”
- “Open my plans.”
- “Book dinner at Pizzeria Roma tomorrow at eight.”
- “Make it red and important.”
- “Undo.”
- “Redo.”

### Step 3 — Consolidate routes and state

Implement canonical routes and safe redirects. Replace route-owned copies with unified state and projection selectors. Add migrations for existing local data. Preserve working calendar behavior and IDs.

### Step 4 — Finish complete utility loops

Implement Home, Today, Capture, Outcomes, and Commitments according to `05_PAGE_UTILITY_SPECS.md`.

Do not ship blank pages with instructional copy. Every empty state must allow the user to begin the page's core job immediately.

### Step 5 — Connect cross-space actions

The following journey must update one underlying world:

1. Create dinner event.
2. Modify it with a pronoun follow-up.
3. Create passport outcome.
4. Add first step.
5. Schedule first step.
6. Create Maya commitment.
7. Ask what needs attention now.
8. Undo/redo globally.

No duplicates. No manual copying between routes.

### Step 6 — Rescue motion

Delete the current broken reclaimed-time polylines. Implement only Tide, Anchor, and Bloom using DOM + SVG + Motion. Use one organic path, clear causality, no persistent decoration, no Three.js/WebGL/shaders.

### Step 7 — Test like a skeptical release engineer

Expand tests to meet `08_RELEASE_GATES.md`. The semantic corpus must contain at least 250 meaningful utterances. E2E tests must use the actual UI and one persistent fake voice session across route changes.

Run the full release harness locally. Save screenshots, traces, console evidence, and results.

### Step 8 — Physical microphone acceptance

Do not claim voice-ready from injected transcripts. Complete and document the physical microphone journey in `08_RELEASE_GATES.md`, or report it as NOT RUN and provide the exact next command and spoken test.

## Product behavior requirements

- The current route may never block a valid global command.
- Unknown speech may never create data.
- Navigation may never create data.
- Event references by unique time must work without selection.
- Pronoun follow-ups must use recent context safely.
- Cross-domain statements must create the right entity type.
- Every committed change is atomic and undoable.
- Every page has a critical reason to exist.
- Now is contextual, not a dead-end page.
- Outcomes always drive toward a next step with reserved time.
- Commitments stay narrow and useful, not CRM-like.
- The interface confirms actions through changed objects, not verbose cards.
- The listening indicator is always truthful.

## Completion standard

Do not report completion unless:

- P0 and P1 backlog items are implemented;
- P2 motion rescue is complete;
- lint passes;
- all unit/integration tests pass;
- at least 250 semantic utterances pass;
- production build passes;
- browser E2E passes;
- no unexpected console/page/request errors exist;
- required screenshots and motion frames exist;
- data migration is verified;
- global undo/redo is verified;
- physical microphone result is reported honestly.

## Final report

Provide:

1. brutal root-cause summary;
2. architecture before/after;
3. canonical routes and redirects;
4. supported global voice commands;
5. page-by-page utility delivered;
6. unified state/action model;
7. migration behavior;
8. tests and exact counts;
9. browser/console results;
10. physical microphone result;
11. motion evidence;
12. remaining genuine limitations;
13. exact changed-file list.

Do not manufacture blockers. Do not manufacture evidence. Do not ask the user to choose implementation details that can be resolved from the repository and this handoff.

Execute now.
