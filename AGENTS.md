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
