# YashYash Development Rules

## Project Goal

YashYash is a collaborative travel PWA improved incrementally. Preserve working behavior, improve stability, fix bugs with minimal changes, and keep changes easy to review and rollback.

## Scope Discipline

Only modify the scope explicitly requested by the active task. Do not proactively implement future phases. Record unrelated issues under Remaining Issues instead of fixing them, and avoid unrelated refactors.

## Repository Workflow

Base branch: `main`. Never develop directly on `main`; use a focused branch per task or phase. Do not merge into `main` unless explicitly requested. Keep commits focused and reversible.

## Existing Stack

- HTML, CSS, Vanilla JavaScript, PWA
- Node.js, Express, MongoDB
- GitHub Pages and Render

Do not replace this architecture, or migrate to React, Vue, TypeScript, another backend framework, or another database unless explicitly requested.

## Search Before Reading

Search for symbols, routes, strings, and filenames before reading files. Read only relevant sections, avoid whole-repository reads and repeated reads of unchanged files. Examples: search `API_URL`, `serviceWorker.register`, route names, or `setInterval` first.

## Token Efficiency

Use concise tools and reporting. Do not output full source files, large diffs, or full build logs unless requested. Run targeted validation first, then a basic smoke test; reuse gathered context.

## Minimal Change Rule

Prefer the smallest safe fix. Avoid large rewrites, unrelated renames/moves, whole-file formatting, and style-only refactors.

## Production Safety

The deployed frontend is `https://23566446.github.io/Yash-Yash/` and backend is `https://yash-yash.onrender.com`. Preserve API contracts, GitHub Pages deployment, Render deployment, PWA behavior, and MongoDB compatibility. GitHub Pages uses `/Yash-Yash/`; check service-worker, manifest, asset, script, CSS, and image paths accordingly.

## Backend and Secrets

Use shared frontend configuration for the API base URL when available. Do not expose or commit credentials, tokens, JWT/API secrets, or `MONGO_URI`. MongoDB must use `process.env.MONGO_URI`.

## Testing and Reporting

For each change: run targeted validation, address introduced regressions, run an affected-page smoke test, and report executed tests separately from manual checks. Do not claim unrun tests passed. When credentials or live data are needed, add a manual test step.

End each phase with: Summary, Files Changed, Tests Performed, Test Results, Manual Test Checklist, Remaining Issues, Commit, and Pull Request status. Keep it concise.

## Future Architecture

Authentication hardening, authorization, password hashing, TypeScript, React/Vite, real-time transport, offline architecture, cloud photo storage, multi-currency accounting, and AI features require an explicitly requested future phase.

## Automated Handoff

When a development phase or requested task is complete:

1. Commit all completed work.
2. Push the feature branch.
3. Create or update a Draft Pull Request targeting `main`.
4. Include a concise summary of:
   - implemented changes
   - actual tests performed
   - test results
   - manual verification still required
5. Do not merge into `main`.
6. Stop after the Pull Request is created or updated.
7. Wait for automated review.

When addressing automated review feedback:

- Fix only blocking issues explicitly identified by the review.
- Do not expand scope.
- Do not perform unrelated refactors.
- Run targeted validation for the affected code.
- Commit and push fixes to the same Pull Request branch.
- Do not create another branch unless explicitly requested.
- Do not merge into `main`.

## Automated Review Rules

When reviewing a Pull Request:

Prioritize:

- Functional correctness
- Regression risk
- Frontend/backend API contract mismatches
- Broken GitHub Pages `/Yash-Yash/` paths
- PWA / Service Worker regressions
- Render / MongoDB integration regressions
- Silent API failures
- Incorrect or misleading UI state
- Secrets or credentials accidentally committed
- Features that no longer work on completed/past trips
- UI/UX problems that prevent users from discovering or using existing functionality

Do not block a Pull Request only for:

- Formatting preferences
- Naming preferences
- Style-only refactors
- Optional architecture improvements
- Unrelated future-phase work

If a blocking issue is found:

- Give a concise explanation.
- Identify the affected file or behavior.
- Give clear acceptance criteria for the fix.
- Do not request unrelated changes.

## Automated Fix Loop

Automated review/fix iterations should be limited.

For the same Pull Request:

- Maximum automatic fix rounds: 2.
- Round 1 review should use:
  `[YashYash Auto Review Round 1]`
- Round 2 review should use:
  `[YashYash Auto Review Round 2]`

After two failed automatic fix rounds:

- Stop requesting additional automated fixes.
- Mark the Pull Request as requiring human review.
- Do not continue consuming tokens indefinitely.

When no blocking issues remain:

Use:

`[YashYash Auto Review PASS]`

Then stop modifying the Pull Request and wait for human smoke testing / merge approval.

## Token Efficiency for Automated Review

For Pull Request review:

1. Read `AGENTS.md`.
2. Read the Pull Request description and test results.
3. Inspect the PR diff first.
4. Read only files directly related to changed code.
5. Do not repeatedly inspect unchanged files.
6. Do not output full diffs or source files.
7. Do not trigger automated fixes for non-blocking style suggestions.
8. Prefer targeted tests over repeated full-repository analysis.

Functionality and correctness take priority over token savings, but avoid unnecessary context usage.

## Merge Safety

Never automatically merge into `main`.

The final flow must remain:

Development
→ Pull Request
→ Automated Review
→ Automated Fix if required
→ Review PASS
→ Human smoke test
→ Human merge approval
