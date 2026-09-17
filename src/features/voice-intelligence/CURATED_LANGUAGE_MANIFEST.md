# Curated language source

`curatedLanguageSeeds.json` contains 2,500 static product-language cases. They
are editorial test inputs, not recordings, usage telemetry, transformed speech,
or claims about physical microphone accuracy.

Every row stores the utterance, intended production intent, route, semantic
family, and an editorial record with:

- `origin: product-editorial-review` — the row is present verbatim in the
  reviewed source; drafting assistance and admission policy are disclosed in
  `CURATED_EDITORIAL_REVIEW.md`;
- `languageFeature` — the grammatical or interaction feature being exercised;
- `reviewScope` — the route and intent reviewed together.

The source SHA-256 at this release boundary is
`341a5f8cd4bc720cedee6c24c10167512c39da596d8db413dc4babba61397295`.
Generated navigation/capture expansions, contextual dialogues, adversarial
grammar, and speech-normalization variants live in separate inventory
partitions and are never counted as curated rows.

The corpus lint rejects normalized duplicates, framing-only duplicates,
numbered padding, missing editorial records, route/intent mismatches, language
feature monocultures, repeated semantic cores/sentence shells, adjacent family
blocks, repeated eight-row family/route rotations, and low-diversity 40-row
windows. It also canonicalizes verbs, entities, people, clock/duration values,
and polite frames so vocabulary rotation cannot hide an underlying grammar
template. Eight whole-source grammar admissions reject quantity agreement,
determiner/object number mismatches, article/adjective sound errors, malformed
promise objects, incompatible adjective/object pairs, and broken
infinitive/`that` joins. Coverage additionally
requires at least 20 semantic families, 40 production intents, 50 language
features, eight product routes, and 250 Journal dictation rows.
