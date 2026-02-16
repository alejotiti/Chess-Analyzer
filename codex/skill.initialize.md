---
name: initialize
description: When the user types .initialize, detect the current stage from codex/CURRENT_STAGE.txt and codex/stages/*.done. Implement only what is required to complete that stage, run checks, mark the stage done, advance CURRENT_STAGE, commit and push to the GitHub repo.
---

# .initialize — Stage Integrator (Chess Analyzer)

## Repo
- Remote: https://github.com/alejotiti/Chess-Analyzer

## Scope
This skill is ONLY for progressing the Chess Analyzer project **one stage at a time**:
1) Detect current stage.
2) Implement missing work needed to finish that stage.
3) Run checks/tests for that stage.
4) Mark the stage as done and advance to the next stage.
5) Commit and push to `origin main`.

## Source of truth
- `codex/CURRENT_STAGE.txt` (e.g., "01")
- `codex/stages/XX/*.md`
- `codex/stages/XX.done` files (if present)

## Stage detection rules
- Read `codex/CURRENT_STAGE.txt` → STAGE
- If `codex/stages/{STAGE}.done` exists, increment STAGE until you find the first stage that is not done.
- If all stages are done, stop and report "All stages complete".

## Implementation rules
- Make minimal changes needed to satisfy the stage checklist.
- Do NOT start next stage in the same run.
- Prefer small, testable commits.

## Commands to run (Windows-friendly)
- Install deps if needed:
  - `npm install`
- Lint/typecheck (if configured):
  - `npm run typecheck` (if exists)
  - `npm run lint` (if exists)
- Build sanity:
  - `npm run build` (once Vite is set up)

## Marking stage complete
- Create: `codex/stages/{STAGE}.done` (empty file is fine)
- Update: `codex/CURRENT_STAGE.txt` to the next stage number (2 digits)

## Git commit & push
Assumptions:
- The repo is already cloned and the user has git credentials configured.
- `origin` points to the repo URL above.

Steps:
1) `git status`
2) `git add -A`
3) `git commit -m "Stage {STAGE}: <short summary>"`
4) `git push origin main`

If push fails due to auth, report the exact error and stop.
