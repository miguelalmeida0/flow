# Physical microphone release acceptance

Status: **NOT PERFORMED — production NO-GO**

An actual human must execute this checklist on a Mac's physical microphone in current Chrome against the immutable production build at `/flow/`. Digital/generated audio, fake devices, injected transcripts and CI cannot satisfy this gate.

Record tester, UTC time, Mac/microphone, macOS, Chrome version, release SHA, dependency lock hash, artifact SHA256, origin, local model identity/digest, companion versions and each observed outcome. Record no tokens or private conversation content. Any failed or missing item means NO-GO.

| ID | Action | Required observation | Result |
|---|---|---|---|
| wake | Say Flow at ordinary volume | Local wake recognized once | NOT PERFORMED |
| calendar | Give an ordinary natural-language Calendar command | Correct target/date, exactly one mutation or bounded proposal | NOT PERFORMED |
| short | Say yes, undo or confirm in its appropriate context | Short utterance captured completely, correct authority | NOT PERFORMED |
| ambiguity | Ask to edit one of two similarly named events; clarify | No mutation before clarification; correct selected event | NOT PERFORMED |
| destructive | Request deletion, then confirm | Exact pending proposal only, protected events respected | NOT PERFORMED |
| interruption | Speak while Flow is speaking | Playback stops, new utterance accepted without self-echo | NOT PERFORMED |
| cancel | Cancel pending operation | No late mutation or delayed confirmation | NOT PERFORMED |
| two-tabs | Open two tabs, transfer/close owner | One microphone owner; no duplicate action; stale tab reclaims safely | NOT PERFORMED |
| deny | Deny browser microphone permission | Clear unavailable state; core navigation works; no retry storm | NOT PERFORMED |
| recover | Grant permission and explicitly retry | Capture resumes once, no duplicate recognizers | NOT PERFORMED |
| persistence | Voice mutation then reload | Exact document/history retained | NOT PERFORMED |
| undo-redo | Undo and redo that voice mutation | Exact original and changed state, once each | NOT PERFORMED |

Also record consecutive turns, decoder reset/no previous utterance leakage and reconnect. Attach redacted evidence and sign the result. The production public origin remains demo-only until an explicit paired-origin deployment has separately passed browser security validation; do not add wildcard origins or disable browser protections.

Machine-readable human evidence must use `docs/release/physical-microphone.template.json`, copied outside tracked source, with every result PASS, the exact release SHA/artifact hash, tester and time. `qa:production` validates it; this document alone cannot authorize deployment.
