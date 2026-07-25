# Diffender contributor guidance

## Product intent

Diffender reduces the human effort required to inspect AI-generated code.
The application is a read-only review surface first. Any future feature that
stages, reverts, commits, or otherwise mutates a registered repository must be
designed as a separate, explicitly confirmed capability.

## Architecture boundaries

- `src/main/**` owns filesystem access, Git, Codex CLI processes, persistence,
  repository validation, and Electron IPC handlers.
- `src/preload.ts` exposes a narrow, typed API through `contextBridge`.
- `src/renderer/**` is an unprivileged React application. It must never import
  Node.js or Electron main-process modules.
- `src/shared/contracts.ts` is the source of truth for IPC payloads.
- Renderer input is untrusted. Validate project IDs, paths, review IDs, and
  group IDs again in the main process.

## Security invariants

- Spawn executables with an argument array and `shell: false`.
- Run Codex reviews with `--sandbox read-only` and `--ephemeral`.
- Remove `CODEX_API_KEY` and `OPENAI_API_KEY` from the Codex child environment.
- Never read, copy, expose, or persist Codex authentication tokens.
- Keep `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`.
- Do not load remote renderer content.
- Registered repositories are read-only unless a future product requirement
  explicitly changes this invariant.

## Review and caching invariants

- Git content is the source of truth; AI summaries are advisory.
- Cache an AI review only against the exact deterministic diff hash.
- Tie approvals to a group fingerprint. A changed fingerprint invalidates the
  approval automatically.
- Do not silently omit untracked files. Report unsupported binary or oversized
  files clearly.

## Commands

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm start
pnpm package
pnpm make
```

## Verification expectations

Before handing off a change:

1. Run `pnpm typecheck`.
2. Run `pnpm test`.
3. Run `pnpm package` for changes to Electron, Forge, preload, or packaging.
4. Visually inspect the empty state, populated review, loading, error, stale,
   and approval states for renderer changes.
5. Re-check that no renderer code gained direct Node.js access.

## Code style

- Prefer small modules with explicit dependencies over global mutable state.
- Keep IPC handlers thin; delegate behavior to testable services.
- Use exhaustive unions and avoid `any`.
- Avoid barrel exports in performance-sensitive renderer code.
- Keep large diff rows isolated so unrelated UI state does not re-render them.
