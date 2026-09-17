# Acceptance and QA

## P0 manual physical-microphone journey

Start the app in Chrome on macOS. Grant microphone permission once. Start Live Session once.

Without touching the microphone again, speak this exact sequence naturally:

1. `Calendar`
2. `Move the two PM meeting to four`
3. `Make it red`
4. `Make it important`
5. `Give me twenty minutes before it`
6. `Home`
7. `Inbox`
8. `Remember to buy coffee tomorrow`
9. `Home`
10. `Plans`
11. `Turn the passport item into a plan`
12. `Home`
13. `People`
14. `I promised Maya the proposal by Friday`
15. `What fits right now?`
16. `Home`
17. `Undo`
18. `Redo`
19. `Pause listening`

Required:

- every navigation command opens the correct space;
- no navigation command creates a capture;
- follow-up `it` commands target the event just changed;
- exactly one coffee capture is created;
- the promise is linked correctly;
- one mic activation covers the entire journey;
- no command executes twice;
- no duplicate SpeechRecognition handlers;
- no state is lost when spaces change;
- undo/redo uses the same global history;
- unsupported speech never mutates state;
- no console errors or unhandled rejections.

## Automated tests

Add table-driven router tests covering at least:

- 25 navigation variants;
- 20 system-control variants;
- 20 explicit-capture variants;
- 20 phrases that must not capture;
- active-space follow-ups;
- stale context;
- pending clarification;
- semantic speech-candidate ranking;
- repeated recognizer `onend` recovery;
- route changes while listening;
- hidden-tab suspension;
- one action per final transcript.

## E2E

Use the real UI and fake recognition adapter to run a continuous session through multiple routes. Do not call feature parsers directly.

Assert:

- route/space changes;
- domain state changes;
- absence of accidental Inbox entries;
- global undo/redo;
- transcript visibility;
- no duplicate actions;
- desktop and mobile behavior;
- reduced motion;
- zero console/page/request failures.

## Release wording

Report separately:

- Synthetic continuous voice pipeline: PASS/FAIL
- Physical microphone continuous session: PASS/FAIL/NOT RUN

Do not call the release voice-ready until the physical journey passes.
