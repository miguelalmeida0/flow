# Local Runbook

The handoff does not assume a repo path that has not been verified. Use this exact discovery sequence first.

## Locate Flow

```bash
cd "$HOME/Documents/Development"
find . -maxdepth 3 -name package.json -print | grep -i flow
```

Then enter the correct repo and record state:

```bash
cd <FLOW_REPO>
git status --short --branch
git log -8 --oneline --decorate
node -v
cat package.json | sed -n '1,220p'
```

## Package manager

Use the lockfile already committed to the repo.

```bash
ls -1 | grep -E '^(package-lock.json|pnpm-lock.yaml|yarn.lock|bun.lockb?)$'
```

### npm project

```bash
npm ci
npm run dev
```

### pnpm project

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

### yarn project

```bash
corepack enable
yarn install --immutable
yarn dev
```

## Before editing

```bash
git status --short --branch
npm run lint --if-present
npm run typecheck --if-present
npm test --if-present
npm run build --if-present
```

If npm is not the repository package manager, use the equivalent command from that manager.

## After editing

Run the repository’s actual scripts from `package.json`. At minimum verify equivalents of:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Do not create a new branch/commit strategy without being asked. Preserve the user's preference for one clean commit at the end of a branch when that is the active workflow.
