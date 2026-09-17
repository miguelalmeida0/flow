# Visual reward system

Flow rewards real consequences, never activity for its own sake. The emotional sequence is intent → recognition → visible consequence → proportional payoff → stillness. There are no points, streaks, badges, confetti, fabricated achievements, or reward-driven state changes.

## Commit boundary

`FlowEnvironmentProvider.commit` remains the sole local user-history boundary. After the typed `LifeAction[]` has produced a valid draft and `saveLifeSnapshot` has accepted the expected revision, `deriveRewardFacts(before, after, actions)` compares stable identities and emits one frozen `transaction-committed` event. A compound command therefore produces one plan and at most one cue. The director cannot access a state setter, reducer, scheduler, or persistence API.

Navigation and temporal-scope acknowledgments are explicit non-history events emitted only after the destination/scope is accepted. Browser Back is neutral and silent. Hydration, migration, refresh, weather enrichment, instinct exposure, CAS failure, remote adoption, preview, clarification, confirmation-pending, cancellation, unsupported input, and no-op edits never produce a success reward.

## Levels

| Level | Use | Full duration |
| --- | --- | --- |
| 0 | no valid visible consequence | 0 ms |
| 1 | navigation, selection, style/remove acknowledgment, undo | 180 ms |
| 2 | create, move, resize, defer, protect/release, breathing room, focus start, capture routing, outcome progress, protected commitment, acted-on insight, redo | 560 ms |
| 3 | actual day recovery, meaningful elapsed focus completion, semantically complete outcome, kept commitment | 1120 ms |

Reduced motion uses 0/120/160/180 ms local opacity and state emphasis. Focus completion is Level 3 only when real elapsed time reaches `min(planned × 0.8, planned − 1 minute)`.

## Vocabulary

- **Tide:** travel, reallocation, movement, deferral, reclaimed time, shared scope.
- **Anchor:** protection, release, protected commitments, kept promises.
- **Bloom:** creation, resizing, styling, focus, progress, completion.
- **Neutral:** exact history restoration.

Recipes live in `src/core/rewards/reward-recipes.ts`; intensity lives in `reward-level.ts`. Presentation uses only existing Flow semantic colors.

## Fatigue and interruption

- Transaction IDs are retained in a bounded 256-entry runtime set.
- Identical Level 1 events coalesce for 750 ms; repeated style facts for 900 ms.
- Audio is limited to one cue per plan and at least 300 ms between cues.
- One Level 3 plan may be active; identical Level 3 fingerprints cool down for 10 seconds.
- Understood, small-win, and big-win mascot states have bounded 8/15/60 second static dwell; motion itself ends with the recipe.
- A new user action, undo/redo, Escape/cancel, visibility loss, remote adoption, or unmount cancels timers, nodes, targets, and mascot dwell. Nothing queues for replay.

## Adding a reward safely

1. Add a typed `RewardFact` only when a durable before/after consequence cannot be expressed by an existing fact.
2. Derive it from stable IDs and typed actions; never parse feedback copy.
3. Add an intensity mapping and reuse Tide, Anchor, or Bloom.
4. Prove no reward on failure/no-op/hydration and one reward for a compound transaction.
5. Add reduced-motion, hidden-tab, interruption, history, and settle assertions.

Forbidden: reward-owned business state, arbitrary component clip names, queued ceremonies, success on uncertainty, per-command confetti, a second action path, or animation required for correctness.
