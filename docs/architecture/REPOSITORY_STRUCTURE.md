# Repository structure

**Repository role:** React/Vite voice-first product

The public root is product-first: runtime code, framework configuration,
tests, project docs and legal metadata stay visible. Agent runtime material,
historical planning and generated QA output live in explicit internal
namespaces.

## Rules

1. Product/runtime architecture owns the root.
2. Claude/Codex/agent material lives under `docs/internal/automation/` or `tooling/`.
3. Local agent conventions are recreated with `scripts/dev/bootstrap-local-tooling.sh`.
4. Generated output is not a root architectural concept.
5. Historical material lives under `docs/archive/`.
6. Framework-required configuration stays at root.

## Moved

- `.codex` -> `docs/internal/automation/codex`
- `AGENTS.md` -> `docs/internal/automation/AGENTS.md`

## Notes

- None.

## Root before

```text
.codex/
.gitignore
AGENTS.md
README.md
docs/
e2e/
eslint.config.js
index.html
package-lock.json
package.json
playwright.config.ts
playwright.dev.config.ts
playwright.motion.config.ts
public/
scripts/
src/
tsconfig.app.json
tsconfig.json
tsconfig.node.json
vite.config.ts
```

## Root after

```text
.gitignore
README.md
docs/
e2e/
eslint.config.js
index.html
package-lock.json
package.json
playwright.config.ts
playwright.dev.config.ts
playwright.motion.config.ts
public/
scripts/
src/
tsconfig.app.json
tsconfig.json
tsconfig.node.json
vite.config.ts
```
