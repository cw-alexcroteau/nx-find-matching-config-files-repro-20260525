# Nx `findMatchingConfigFiles` Reproduction

This is a standalone Nx workspace that reproduces the project-discovery overhead from compiling the same minimatch pattern repeatedly when scanning many project config files.

Validated on May 25, 2026 against `nx@22.7.3`.

## What this repo does

- Generates about 1,356 Nx projects with `project.json` files.
- Exposes Nx targets so the repro itself is Nx-driven.
- Exercises the real Nx discovery path via `nx show projects --json`.
- Captures Nx perf logs for `show projects` on both stock and patched Nx.
- Includes an isolated matcher benchmark that mirrors the problematic pattern-matching loop.

## Quick start

```bash
pnpm install
pnpm nx run repro:generate -- 1356
pnpm nx report
pnpm nx run repro:benchmark-show-projects
pnpm nx run repro:capture-show-projects-perf
pnpm nx run repro:compare-show-projects-perf
pnpm nx run repro:benchmark-matcher
```

## Expected outcome

On an unpatched Nx version, `repro:benchmark-show-projects` should show measurable overhead from project discovery on a workspace with 1,356 projects.

`repro:capture-show-projects-perf` records the Nx perf log output from `nx show projects --json`.

`repro:compare-show-projects-perf` runs `nx show projects --json` twice on the same workspace:

- once with the stock installed Nx package
- once after temporarily patching `findMatchingConfigFiles` in `node_modules`

It writes both perf logs to `artifacts/` and restores the original installed Nx file afterwards.

`repro:benchmark-matcher` isolates the specific matcher behavior by comparing:

- compiling the glob inside the loop
- compiling the glob once and reusing the matcher
- skipping the rematch entirely when the file list already came from `multiGlobWithWorkspaceContext` for that exact plugin glob

## Why both benchmarks exist

- `repro:benchmark-show-projects` is the end-to-end repro maintainers can run against a real Nx command.
- `repro:capture-show-projects-perf` and `repro:compare-show-projects-perf` provide Nx-native perf evidence for the issue and the proposed fix.
- `repro:benchmark-matcher` makes the hot path obvious even if machine noise makes the end-to-end difference smaller on a single run.

## Useful commands

```bash
pnpm nx run repro:clean
pnpm nx run repro:generate -- 2000
pnpm nx run repro:capture-show-projects-perf
pnpm nx run repro:compare-show-projects-perf
pnpm show:projects
```

## Verified reproduction steps

These are the exact steps used to validate the repro on the latest published Nx version:

```bash
cd /tmp/nx-find-matching-config-files-repro
pnpm install
pnpm nx run repro:generate -- 1356
pnpm nx report
pnpm nx run repro:benchmark-show-projects
pnpm nx run repro:capture-show-projects-perf
pnpm nx run repro:compare-show-projects-perf
pnpm nx run repro:benchmark-matcher
```

### Nx report

```text
Node           : 20.17.0
OS             : darwin-arm64
Native Target  : aarch64-macos
pnpm           : 11.2.2
daemon         : Available

nx  : 22.7.3
---------------------------------------
Cache Usage: 0.00 B / 46.04 GB
```

### Measured output

`pnpm nx run repro:benchmark-show-projects`

```text
run 01: 1008.3ms (1357 projects)
run 02: 987.7ms (1357 projects)
run 03: 1011.4ms (1357 projects)
run 04: 1091.3ms (1357 projects)
run 05: 1013.5ms (1357 projects)
run 06: 1007.4ms (1357 projects)
run 07: 977.1ms (1357 projects)

median: 1008.3ms
average: 1013.8ms
```

`pnpm nx run repro:benchmark-matcher`

```text
projects: 1356
iterations: 100
compile-inside-loop: 398.8ms
compile-once:        26.9ms
saved-vs-compile:    386.0ms
speedup-vs-compile:  15.02x
no-rematch:          2.4ms
saved-vs-no-rematch: 411.1ms
speedup-no-rematch:  170.93x
```

### Latest Nx perf-log signal

The most useful evidence on `nx@22.7.3` comes from the Nx perf logs rather than total wall time. On this machine, the temporary patch reduced the targeted slice even though plugin-worker startup still dominated the overall command:

```text
iterationsPerMode: 3
stockElapsedMedianMs: 1055.3
patchedElapsedMedianMs: 1027.2
elapsedMedianSavedMs: 28.1
elapsedMedianSpeedup: 1.03x
buildProjectConfigsStockMedianMs: 109.0
buildProjectConfigsPatchedMedianMs: 55.2
buildProjectConfigsMedianSavedMs: 53.9
retrieveProjectConfigurationsStockMedianMs: 604.3
retrieveProjectConfigurationsPatchedMedianMs: 575.0
retrieveProjectConfigurationsMedianSavedMs: 29.3
```

This is why the repro includes both Nx perf-log capture and the isolated matcher benchmark: the targeted graph-building slice improves clearly, while total command time on latest Nx is still dominated by other work such as plugin worker startup.

The stronger optimization modeled by the temporary patch is to skip `minimatch(file, pattern)` entirely inside `findMatchingConfigFiles` for the normal path where `projectFiles` already came from `multiGlobWithWorkspaceContext` for that same plugin glob.

## Issue template copy

### Steps to Reproduce

1. Clone this repo.
2. Run `pnpm install`.
3. Run `pnpm nx run repro:generate -- 1356` to create a workspace with 1,356 projects.
4. Run `pnpm nx run repro:capture-show-projects-perf` to capture Nx perf logs for `nx show projects --json`.
5. Run `pnpm nx run repro:compare-show-projects-perf` to compare stock vs patched Nx perf logs for the same command.
6. Run `pnpm nx run repro:benchmark-matcher` to isolate the `findMatchingConfigFiles` matcher hot path.

The end-to-end and perf-log commands run `nx show projects --json` with `NX_DAEMON=false`, `NX_CACHE_PROJECTS_CONFIG=false`, and `NX_PROJECT_GLOB_CACHE=false` so the project-discovery cost is paid on each run.

### Actual Behavior

On `nx@22.7.3`, project discovery remains expensive on a workspace with 1,356 generated projects. The Nx perf logs highlight the `build-project-configs` portion of `nx show projects --json`, and the patched comparison plus isolated matcher benchmark show that the redundant rematch materially inflates the hot-path cost.

### Expected Behavior

`findMatchingConfigFiles` should avoid rematching files against the plugin glob when those files were already selected by `multiGlobWithWorkspaceContext` for that same glob. At minimum it should not compile the same minimatch pattern inside the loop.

## Notes for upstream validation

If you want to compare a stock Nx build against a locally patched one, the repro includes a temporary patch step that edits the installed `nx` package, runs the command, records the perf logs, and restores the original file automatically:

```bash
pnpm nx run repro:capture-show-projects-perf
pnpm nx run repro:compare-show-projects-perf
pnpm nx run repro:benchmark-matcher
```

The generated perf logs are written under `artifacts/`.

## Nx targets

This workspace defines a single root project named `repro` with these targets:

- `repro:clean`
- `repro:generate`
- `repro:benchmark-show-projects`
- `repro:capture-show-projects-perf`
- `repro:compare-show-projects-perf`
- `repro:benchmark-matcher`

Use `pnpm nx show project repro --json` to inspect the target configuration.