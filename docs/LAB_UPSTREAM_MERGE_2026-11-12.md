# Lab integration of upstream through 11 November 2026

Merged upstream `13eedf552417a6a791a7d13c6597e24300ee3a09` into the Lab integration
at `93c851a44caf022b82b6b165703cad155f383845`. The common base is
`4b9e05a2a806a3fe24f7b2560d98626c37dade35`: 2,123 upstream commits (1,778 excluding
merges) and six local commits. The upstream app reports 0.2.13 and engine 0.1.59.
This is a source integration and software-validation result, not a model qualification.

## Preserved behavior and conflict resolutions

- Preserve all six local commits, the managed attachment authentication, route
  allowlist, explicit runtime identity, fixed sampling, and inert-text restrictions.
- Combine managed pairing with upstream translation readiness and deferred UI imports.
- Keep the new chat handlers while retaining Lab-derived composer readiness.
- Reject managed loops, queued messages, goals and chat reattachment before dispatch.
  Standalone Strata retains those upstream features.
- Preserve profile projection into the existing per-layer cache shape and its native
  `PROFILE` protocol. Move its test target into upstream's new GPU CMake module.
- Preserve bounded native startup alongside upstream split serving. Lab mode rejects
  split/replica configurations, auxiliary models and alternate-engine fallback;
  its single native start disables transient, draft and VRAM retry paths. Standalone
  startup retains upstream retry behavior.

Conflicts were resolved in `CMakeLists.txt`, `apps/host/server/index.mjs`,
`apps/host/src/lib/store.ts`, `apps/host/src/main.tsx`,
`apps/host/src/screens/Chat.tsx`, and `serve/server.py`. A legacy non-UTF-8 ellipsis
in the managed startup banner was corrected within the resolved block.

## Validation actually executed

Windows; Python 3.10.11; Node 24.22.1 (explicit existing executable, SHA-256
`84563d843a822753470a7d9f71c23aaaf9fb5099bb363560f1b70a09e3b8745c`);
MSVC 14.44.35207; CUDA 13.0.88; Ninja; Release; CUDA architecture 86;
vendored ggml; two compilation jobs. No packages, models or toolchains were downloaded.

| Scope | Result |
|---|---|
| Nine server unittest modules below | 427 tests: 421 passed, 6 platform skips |
| Sixteen host test files below, Node 24.22.1 | 100 tests: 97 passed, 3 optional Harness skips |
| Four MicroExpert Lab integration files below | 100 passed, no skips |
| Final built-host authentication/isolation/cleanup replay | 1 passed; entirely overlaps the 100 Lab checks |
| TypeScript `tsc --noEmit` | Passed |
| Vite production build | Passed; large-chunk and mixed-import warnings retained |
| CUDA `strata` and `expert_profile_switch_test` targets | Compiled and linked successfully |
| CTest `^expert_profile_switch_test$` | 1 passed; CPU-only synthetic profile projection, no device touched |
| Integration whitespace/conflict check | Passed |

Server command (repository root):

```text
python -m unittest serve.test_lab_bounded serve.test_profile serve.test_drafting_retry serve.test_server serve.test_lifecycle serve.test_lifeline serve.test_winjob serve.test_winjob_early_child serve.test_split_fallback -v
```

Host command (`apps/host`, isolated temporary settings/components/user directories):

```text
node --test --test-concurrency=2 --test-timeout=120000 tests/lab-managed.test.mjs tests/lab-managed-send.test.mjs tests/chat-shortcuts.test.mjs tests/live-chat.test.mjs tests/no-model-chat.test.mjs tests/native-chat.test.mjs tests/parallel-chats.test.mjs tests/turn-reattach.test.mjs tests/session-persist.test.mjs tests/chat-store.test.mjs tests/chat-store-api.test.mjs tests/chat-save-notice.test.mjs tests/inference-line.test.mjs tests/agent-turn-guard.test.mjs tests/loop-stop.test.mjs tests/startup-listens-loopback.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

Lab command (existing Lab checkout, explicit Node and newly built host selected with
`MEL_TEST_STRATA_NODE` and `MEL_TEST_STRATA_HOST`; temporary base directory and JUnit output):

```text
python -m pytest tests/test_strata_host_integration.py tests/test_strata_runtime.py tests/test_strata_ui.py tests/test_browser_access.py -q
```

### Exact skips

Server: `StartCrashReported.test_a_silent_exit_is_retried_without_claiming_the_gpu_runtime`,
`test_sigill_is_reported_not_retried`, and `test_the_runtimes_own_failure_is_named`
require POSIX signals. `Lifeline.test_a_child_started_on_a_request_thread_outlives_that_thread_but_not_the_server`
requires Linux `PR_SET_PDEATHSIG`. `test_the_portable_watcher_ends_the_child_when_the_server_is_killed`
and `test_the_watcher_token_does_not_change_with_the_child_state` target the POSIX
watcher. Windows job-object and early-child tests ran instead; they are different coverage.

Host: three `agent-turn-guard` cases require a built Harness selected by
`STRATA_HARNESS_DIR`: a search-heavy plan with refused searches, an ordinary turn
whose searches fail, and a full-context turn without an answer. Harness was not
installed or enabled to remove those skips.

### Preserved failures and overlapping checks

- Before the managed-send correction, the seven new automation/queue checks failed
  while the existing 13 send checks passed. After correction, all 25 focused host
  checks passed; those 25 are included in the broader host scope above.
- The 19 focused server checks passed and are included in the 427-test server scope.
- The first Lab connection check rejected a redirected Node path before host launch:
  the shell shortcut pointed to Node 22.14.0. The other 99 checks passed. The corrected
  run uses the existing, non-redirected Node 24.22.1. No identity check was relaxed.
- Initial Node 22 host tests, type checking and build also passed, but do not qualify
  the supported runtime. They were repeated on Node 24.22.1 and are not additional
  independent tests. The final single-host replay ran after that build completed.
- Operator-local logs retain the initial results, failures, corrected results,
  compilation warnings and JUnit records. They are not uploaded with this report.

## Limits and next boundary

No model was run. CUDA compilation and CPU projection fixtures do not qualify GPU
profile transfer, numerical agreement, memory boundedness, cancellation or long use.
HIP, SYCL and Metal builds, the complete upstream test suites and browser interaction
were not run. No performance improvement is claimed.

The registered runtime checkout, active build registrations, model/profile artifacts,
prior qualification attempts and their evidence remain unchanged. The new engine
was built from the resolved merge worktree before its merge commit; its configure-time
git label consequently names the prior HEAD as dirty. A production candidate must be
rebuilt/fingerprinted against its frozen source identity and pass its own bounded
qualification under the existing limits before replacing that runtime.
