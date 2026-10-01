# Flow deployment readiness

Verdict: **BLOCKED** — verification in progress. No deployment or promotion authorized until every applicable gate passes.

## Starting state (2026-10-01)

- Repository: miguelalmeida0/flow
- Initial isolated checkout: /tmp/flow-safe-production; initial status clean. Continued work in the writable, isolated checkout at `/Users/malmeida/Documents/ChatGPT/flow-portfolio-integration/portfolio/artifacts/flow-safe-production` to avoid repeated filesystem approval prompts. The unrelated portfolio product files remain untouched by this task.
- Branch: release/safe-production, created from origin/test.
- HEAD/test: aa63e018da0e3aa8dca3445923538881487dab38
- main: 87d95fd35535073010ab49a08094cdad616f0492
- gh-pages: e47028bab78231714df2853bfae935959b75bcc3
- Initial shell: Node v26.0.0, npm 11.12.1. Release checks use installed Node v22.23.2; npm version recorded with results.
- package-lock SHA256: 31046f8b5617551514253572660aa352e955666cb77efd1c34cfa5e17aa34c4b
- GitHub Pages: legacy branch source gh-pages:/, https://miguelalmeida0.github.io/flow/
- Remote checks: none returned for test.
- Unrelated dirty portfolio and sibling Flow film checkouts preserved.

## Preserved production / rollback

- Exact previous publication archived from origin/gh-pages into /tmp/flow-gh-pages-e47028b.tar.
- Archive SHA256: d72cb05fc1726796355afa40f7515ce75e93b039a85a45bebcc83ebcd83392a9.
- Previous main and gh-pages SHAs above must remain reachable. Do not overwrite gh-pages.
- Before a future Pages Actions cutover, retain this archive durably as a private release-machine artifact and record its hash. Current branch source can be restored to gh-pages:/ to republish the preserved commit; verify live assets afterward.

## Evidence policy

PASS requires actual execution on the identified revision/artifact. Missing runtime/model/hardware is BLOCKED or NOT PERFORMED. Digital microphone audio never counts as physical microphone acceptance. Public deployment remains NO-GO until physical microphone acceptance is PASS and tied to the immutable candidate.

## Baseline

Clean installs and independent lint/unit/server/build/design checks completed on both exact SHAs. Logs and machine-readable test results are retained under artifacts/baseline. Failure identity comparison was performed, not inferred from equal failure totals.

## Pending gates

Deterministic suites; qa:release; local real model; voice autopilot; physical Mac microphone; security review; production origin/browser loopback; production artifact smoke; CI; immutable deployment provenance.

## Executed baseline comparison

{
  "main": {
    "numTotalTestSuites": 235,
    "numPassedTestSuites": 195,
    "numFailedTestSuites": 40,
    "numPendingTestSuites": 0,
    "numTotalTests": 4988,
    "numPassedTests": 4525,
    "numFailedTests": 463,
    "numPendingTests": 0,
    "numTodoTests": 0
  },
  "test": {
    "numTotalTestSuites": 300,
    "numPassedTestSuites": 260,
    "numFailedTestSuites": 40,
    "numPendingTestSuites": 0,
    "numTotalTests": 5254,
    "numPassedTests": 4791,
    "numFailedTests": 463,
    "numPendingTests": 0,
    "numTodoTests": 0
  },
  "shared": 462,
  "introduced": [],
  "resolved": []
}

Full failing file/test identities and exact error messages are in baseline-main-failures.json and baseline-test-failures.json. There are 463 failed executions but 462 unique file/name identities because one name occurs twice. Main has no test:server script: attempted invocation failed with Missing script. Candidate server suite passed 35/35. Both lint/build/design checks passed. No baseline tests were skipped. The test baseline also emitted one unhandled teardown rejection (`localStorage is not defined`); a destroyed-coordinator guard addresses it.

## Hardening verification checkpoint

The first complete hardening unit run passed 4,794/5,257 tests, failed 463, and skipped zero. Identity comparison found no introduced or resolved baseline failures. No unhandled rejection was reported. Desktop tests passed 38/38, Python tests 8/8, release policy tests 4/4, lint/build/design and npm production audit passed. Subsequent source changes require the final verification recorded below.

The real configured Ollama model `qwen3-vl:2b-instruct-q4_K_M` was available and exercised through a real desktop companion process and production coordinator/kernel. Vitest: 7 pass, 6 fail, zero skipped. Acceptance: 106/127 single-turn/safety cases passed, 21 failed; 16 multi-turn conversations (44 utterances) completed without a crash. That multi-turn assertion does not establish semantic success. Details and failed utterances: `real-model-summary.json`.

Initial digital-audio autopilot: 31/33 scenarios passed, two failed (`add-anita`, `two-tab-ownership`). It used the development frontend and is not acceptance of the production artifact. The initial production run was interrupted after discovering that development-only diagnostics prevented the harness from observing real executed turns. Local production diagnostics now require explicit opt-in; public-origin diagnostics remain disabled. A full production rerun is required. Physical microphone: **NOT PERFORMED**.

The `/flow/` artifact smoke completed navigation, mutation, undo/redo, persistence, reload, query strings, keyboard focus and responsive checks at six origin/viewport combinations. The first run recorded two HTTP 503 console errors. A diagnostic rerun on the same artifact passed with zero unexpected console/page/request errors and no companion requests; it did not reproduce the 503s. Preserve that instability in the release review. Expected GitHub Pages deep-document HTTP 404 responses are recorded separately. Public-origin candidate responses were fulfilled from the local artifact, not deployed.

Actual current Chrome also visited the existing public deployment. Default-denied HTTP and WebSocket loopback probes were blocked by Local Network Access checks. No granted production pairing is claimed; the candidate deliberately operates as an unpaired public demo.

`main` and `test` now require **Deterministic gates**, including administrators, with strict checks and force-push/deletion disabled. Pages source remains `gh-pages:/`. CI and guarded deployment workflows are staged on the temporary branch; no deployment workflow was dispatched.

Security remains blocked by installed Python advisories and incomplete custom-decoder provenance. See `SECURITY_REVIEW.md`. The previous Pages artifact is also retained at `artifacts/rollback/gh-pages-e47028b.tar` with the hash above.
