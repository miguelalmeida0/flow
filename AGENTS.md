# Repository instructions

<!-- BEGIN: owner-branch-policy -->
## Mandatory repository branch and attribution policy

These instructions apply to coding agents, local automation, and repository maintenance.

- Only `main` and `test` are permitted development branches.
- `test` is the working/integration branch; `main` is for reviewed, verified production changes.
- Do not create or push other branches (including feature, fix, release, PR, bot or deployment branches). Work using the permitted refs. If branch protection makes this impossible, stop and request a compliant plan rather than inventing another branch.
- Do not promote unrelated, unverified work from `test` into `main`. Verify and ship a focused change only.
- Never rewrite shared history, reset, force-push, or delete a ref without explicit owner approval and verified preservation of unique work.
- For locally authored changes, set both Git author and committer to `Miguel Almeida <94702822+miguelalmeida0@users.noreply.github.com>`. Do not add automated-agent co-author trailers.
- Preserve real contributor provenance when it differs from this single-owner assumption; stop for review rather than silently misattributing another human's work.
- Publish GitHub Pages only with the artifact-based GitHub Actions workflow. Do not recreate `gh-pages`.
<!-- END: owner-branch-policy -->
