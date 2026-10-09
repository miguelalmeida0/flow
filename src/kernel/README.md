# Historical command-kernel contracts

This alternate implementation is retained for its four contract-test suites. It is **not mounted by the app**. The production mutation coordinator lives in `src/app/FlowEnvironmentProvider.tsx` and `src/app/lifeCommandController.ts`.

Do not implement production features here or treat these passing tests as production-path coverage. Preserve unique behavioral cases until they have been ported to the active command path.
