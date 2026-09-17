# Install the Flow Codex agent kit

From Terminal:

```bash
cd ~/Downloads/flow-voice-calendar
mv agents.md docs/internal/agents/agents.legacy.md 2>/dev/null || true
unzip -o ~/Downloads/flow-codex-principal-agent-kit.zip -d .
```

The rename matters on default macOS case-insensitive filesystems because Codex's project instruction filename is `AGENTS.md`.

Then open a fresh Codex chat for this repository and paste:

```text
Execute docs/internal/engineering/FLOW_REPAIR_MISSION.md completely. Spawn flow_mapper and flow_language_auditor in parallel and wait for both. Then have flow_principal implement the repair. After implementation, have flow_qa independently validate it. Route every QA failure back to flow_principal and repeat until PASS. Do not stop at a plan, diagnosis, or partial regex patch. Do not ask me for implementation choices that can be resolved from the repository and mission.
```
