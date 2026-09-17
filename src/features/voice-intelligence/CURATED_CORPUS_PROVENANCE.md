# Curated language corpus provenance

`curatedLanguageSeeds.json` is Flow's static editorial acceptance set. Its 2,500
rows are repository-owned product language, not telemetry, generated speech
alternatives, UI-label framing, or physical-microphone evidence. Those other
sources are stored and counted separately by `languageDatabase.ts`.

Each row is a directly inspectable utterance with its intended route, semantic
intent, language family, and review scope. During the September 6 rescue, more
than 2,086 utterance texts were substantially rewritten; the final whole-source
grammar review then corrected 26 admitted rows, including bounded Studio,
temporal, Capture, and Commitment language. A local Ollama model assisted
with language drafting; the static rows were then product-reviewed, corrected,
admitted by lint, and run through the production transaction path. This is why
the origin is `product-editorial-review`, not a claim of exclusively manual
composition. The complete method and representative samples for all 26
families are in `CURATED_EDITORIAL_REVIEW.md`.

The checked-in acceptance lint rejects:

- duplicate normalized utterances and duplicate editorial fingerprints;
- numbered/example/frame padding;
- repeated eight-row family/route rotations;
- adjacent rows from the same editorial family;
- low-diversity 40-row windows;
- repeated normalized sentence shells above the allowed editorial ceiling;
- repeated canonical grammar shapes after verbs, entities, names, times,
  durations, and polite frames are abstracted;
- singular/plural, determiner/object, article/adjective, promise-object,
  adjective/object semantic, and infinitive/`that` grammar violations;
- over-concentrated language features or semantic cores;
- a curated row that does not resolve through the production registry; and
- any curated `execute` row that does not also complete through the production
  controller, entity planner, transaction engine, invariants, and history.

The set is synthetic product acceptance language. Local drafting assistance is
not a runtime dependency and is not relabeled as observed user speech.
Synthetic final-transcript tests and the physical microphone acceptance result
are reported independently.
