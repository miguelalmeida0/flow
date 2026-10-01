# Release security review

**BLOCKED.** Narrow boundary fixes have executable regression coverage. The installed STT dependency set has unresolved advisories; this is not a clean security sign-off.

## Boundary and fixes

Both companions still bind to `127.0.0.1`. Exact development Origin checks, constant-time bearer comparisons, capability/model allowlists, input bounds, private token files and directory constraints remain in place. No wildcard CORS, public listener, arbitrary shell facility, model URL, or filesystem root was added.

| Finding | Change | Evidence / limit |
| --- | --- | --- |
| Desktop startup disclosed its bearer token | Removed token from stdout; tests read an ephemeral private pairing file | Source review; exact live-token artifact scan |
| Audit truncation retained sensitive values | Audit records argument count; rejected identifiers/origins and exception text are redacted | Added server regression with secret-bearing arguments |
| macOS `open` could dispatch an executable file in an allowed directory | Restrict to supported non-executable document types | Server regression rejects executable/script inputs; no malicious script was executed |
| Recent-file listing followed child symlinks outside allowed roots | Validate each canonical child path | Server symlink regression |
| Voice token appeared in WebSocket URLs | Bounded, timed first-frame authentication before worker ownership | Client protocol tests and Python authentication tests; real voice pipeline exercised separately |
| Unbounded pipe writes and queued synthesis threads | Await pipe drain; one synthesis thread with a bounded latest-request slot | Source review and real pipeline run; no exhaustive denial-of-service stress claim |
| Stored endpoint overrides could send credentials outside loopback | Literal loopback-only HTTP/WS destinations; fetch redirects rejected | Client destination regression |
| Failed voice handshakes could reconnect indefinitely | Bounded retries; authentication rejection stops reconnect | Client retry regression |
| Worker exception/dependency messages could disclose user input or signed URLs | Generic worker error events; drain and redact dependency stderr | Source review; pipeline readiness and failures remain observable |

The public deployment is deliberately an unpaired demo. Public-origin local companion access and native browser recognition fallback are disabled. Local paired voice continues to use Kyutai, the existing coordinator/kernel, and Kokoro. No hosted model or speech service was introduced.

## Dependencies

- `npm audit --omit=dev` executed with **zero production advisories**. The complete npm dependency tree also contains development dependency advisories; they have not been blindly upgraded.
- `pip-audit` inspected the actual installed STT and TTS environments without modifying them. See `python-stt-audit-summary.json` and `python-tts-audit-summary.json`.
- STT `aiohttp 3.11.18` and `mlx 0.26.5` have reported advisories. MLX fixes require a version outside the installed `moshi_mlx` constraint (`mlx <0.27`). Upgrade compatibility and full real-audio regression evidence are unresolved. Do not patch a shared environment in place or declare an incompatible upgrade safe.
- The custom `rustymimi 0.4.1+flowreset2` decoder and `en-core-web-sm 3.8.0` were not auditable through PyPI. Their provenance is an additional open review item. TTS's auditable packages had no listed advisories; this is not a complete TTS dependency PASS.
- Python requirements are not a reproducible, fully hashed dependency lock. An isolated, compatible and audited release runtime remains necessary.

## Credentials, artifacts and rendering

Known private-key/GitHub-token/AWS-key patterns were checked in tracked files and reachable Git history. No matches were returned. No audio, model weights, private keys or audit logs were tracked by the inspected file inventory. Runtime caches, virtual environments and generated voice artifacts remain ignored.

The exact current companion credentials were compared against source, build and available diagnostic artifacts, including ZIP members, without printing credentials. No matches were found. This check cannot establish absence of historical credentials, secrets in spoken content, or visual text in screenshots. Generated audio is excluded from this byte-pattern check and is never uploaded by ordinary CI.

Source searches found no `dangerouslySetInnerHTML`, user-string `innerHTML`, dynamic `eval`/`Function`, or shell execution facility in the reviewed production source. User/model strings remain React text. Searches are supporting evidence, not a claim that every source file received a complete security audit.

## Remaining acceptance

Resolve the Python advisories and custom decoder provenance, validate the compatible isolated runtime, repeat all required real-model/audio checks, and complete the physical microphone checklist. Full-repository security coverage is partial. Security review must remain non-PASS until these issues have been resolved and evidence is bound to the exact candidate commit and artifact.
