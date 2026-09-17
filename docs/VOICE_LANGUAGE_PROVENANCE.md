# Voice language evidence provenance

This evidence separates editorial language, deterministic generation, contextual conversations, and physical microphone acceptance. Counts from one category are never relabeled as another.

## Curated product language

- Source: `src/features/voice-intelligence/curatedLanguageSeeds.json`
- Count: 2,500 static rows
- Provenance label: `editorial_product`
- Each row is directly reviewable and carries an explicit route, family, expected production intent, `product-editorial-review` origin, language feature, and route/intent review scope.
- Rows are statically interleaved across product families rather than stored as Cartesian action/object/route blocks. The corpus lint rejects duplicate normalized utterances, counter/placeholder padding, framing-only duplicates, repeated semantic cores and sentence shells, adjacent family blocks, repeated eight-row family/route rotations, low-diversity 40-row windows, missing editorial records, and feature monocultures.
- A local Ollama model assisted the large-family wording rewrite; more than 2,086 texts were substantially rewritten, followed by a whole-source grammar review that corrected 26 admitted rows. Eight grammar admissions now reject quantity, determiner/object, article/adjective, promise-object, incompatible adjective/object, and infinitive/`that` failures. The admitted rows were product-reviewed as static source and production-tested. See `src/features/voice-intelligence/CURATED_EDITORIAL_REVIEW.md` for all 26 families, samples, review rationale, and admission policy.
- No runtime expansion, generated navigation/capture variant, or dialogue turn contributes to this count.

## Deterministically generated language

- Count: 25,000 rows
- Provenance label: `grammar_generated`
- Construction: bounded navigation grammar plus explicit-capture task/context combinations.
- These rows test breadth and collision resistance. They are not described as authored or as observed user speech.

## Negative and confusion language

- Count: 2,000 rows
- Provenance: 10 directly reviewed cross-domain collisions plus 1,990 distinct grammar-generated unsupported utterances.
- The independent destructive-safety probe runs 50 additional destructive-looking sentences on Home, Calendar, Journal, People, and Plans (250 production-plan probes) regardless of corpus expectation and rejects any executable destructive action.

## Contextual conversations

- Count: 1,000 distinct dialogues and 4,000 turns
- Provenance label: `contextual_dialogue`
- The five journey families cover Journal, Calendar, Commitments, Atmosphere, and Outcomes.
- Each turn is interpreted against context advanced from the preceding production result. Per-turn context is not injected to make the expected result pass.
- These conversations are generated evaluation material, not real-user dialogue evidence.

## What the evaluator proves

The semantic evaluator calls the production scored registry and records intent, resolution, domain, route, confidence, score, confusion, and provenance. The production-pipeline evaluator additionally runs all 29,500 direct cases and all 4,000 contextual turns through `createLifeCommandRunner`, domain planning/entity resolution, `applyLifeTransaction`, invariant validation, and history. Its 33,500 per-case JSONL records contain route, transcript, normalized text, candidates/scores/evidence, context, selected intent, planned action types, history delta, state mutation, feedback, and latency.

## What this evidence does not prove

The database does not represent acoustic conditions, browser recognition quality, accents, device permissions, or a physical microphone session. Physical-microphone acceptance is reported separately and remains `NOT_PERFORMED` until a person completes the prescribed journey on a real device.
