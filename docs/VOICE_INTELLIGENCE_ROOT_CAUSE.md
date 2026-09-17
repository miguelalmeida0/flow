# Voice intelligence root cause

The acceptance failures are a routing architecture defect, not missing phrase trivia.

1. `interpretGlobalCommand` is a first-match waterfall. `rankGlobalTranscript` scores only the result the waterfall already selected, so it cannot compare Journal, navigation, Commitments, and Calendar candidates. Calendar is parsed early and later treated as the broad mutation fallback. Permissive Calendar verbs such as `start` and `put` therefore steal language that has stronger evidence in the active surface.
2. Context exists as many optional `LifeContext` fields, but consumers use different subsets and freshness rules. It has no single bounded active-mode/selected-object/recent-intent contract. Clarifications preserve display copy and choices, but not a typed partial intent such as “commitment person = Miguel” or the selected Good-to-know insight.
3. Journal does not model command, dictation, and command interruption as explicit interpretation states. Its UI also dispatches hidden substitute phrases (`Start with my voice` runs `Let me talk for a while`), which lets mouse tests pass while the visible phrase fails when spoken.
4. Navigation and temporal interpretation return mutually exclusive intent shapes. A request containing both a destination and range, such as “open my calendar for the whole week,” cannot preserve both slots.
5. Good-to-know click/voice actions address “the first” recomputed insight instead of a persisted selection, so a clarification or data change can silently change the target.
6. The development trace records only the final selected result. Existing corpora count generated navigation permutations as coverage but do not expose candidates, negative evidence, source provenance, confusion pairs, or contextual dialogue accuracy.

The repair introduces one central candidate registry around bounded feature interpreters. Every candidate carries positive and negative evidence, surface affinity, validation status, and a score; the router applies explicit thresholds and a domain-neutral fallback. The 120 candidate-producing definitions expose every supported intent and all 27 concrete Calendar operations instead of hiding the production grammar behind one umbrella candidate. Each definition invokes its bounded adapter lazily during central candidate collection; there is no production-wide preselected result. All execution continues through the canonical `LifeAction` transaction boundary.

Pending continuations are now typed, one-shot, explicitly replaceable, cleared by navigation, and limited to two minutes. Journal long-form mode treats speech as raw content by default; only exact whole-utterance recording controls can interrupt dictation. Destination and temporal range compose into a single global intent. Selected insights are retained by stable identity. Development traces and generated evidence expose every candidate, score, evidence vector, entity extraction, context transition, and planned action.

The language evidence uses a static 2,500-row `editorial_product` source with
explicit `product-editorial-review` provenance and keeps generated grammar,
contextual dialogues, adversarial cases, and physical microphone acceptance in
separate categories. Local drafting assistance and the 2,086-row substantive
rewrite are disclosed rather than mislabeled as observed or exclusively manual
language. The production evaluator runs all 33,500 rows/turns through the real
controller, domain planning/entity resolution, invariant-protected transaction
boundary, and history, then persists auditable per-case evidence. See
`docs/VOICE_LANGUAGE_PROVENANCE.md` and
`src/features/voice-intelligence/CURATED_EDITORIAL_REVIEW.md`.
