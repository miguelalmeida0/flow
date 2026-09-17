# Sonic identity

Flow uses one lazy `RewardSoundDirector` and the native Web Audio API. Eight tiny synthesized cues are available: listening, understood, placed, protected, resolved, completed, undo, and uncertain. They use low-gain sine oscillators with short attack/release envelopes; no audio files, library, network, or paid service is required.

Sound defaults **Off**. An `AudioContext` is created/resumed only from the explicit Sound On button gesture. The persisted preference is separate from `LifeDocument` and user history. Turning sound off cancels active oscillator nodes immediately.

The RewardDirector chooses at most one cue for a compound transaction, enforces 300 ms spacing, and never plays for hydration, refresh, remote sync, navigation, uncertainty, background automation, hidden tabs, reduced sensory motion, or suppressed/cooling rewards. A new command, undo, visibility loss, settings change, or unmount stops active nodes. Audio supplements visible state and concise text; it is never the only confirmation.

Development diagnostics are exposed as `window.__FLOW_SOUND__` with context, play, active-node, and last-cue counts. The stress gate requires zero contexts while sound remains off and zero active nodes after settle.
