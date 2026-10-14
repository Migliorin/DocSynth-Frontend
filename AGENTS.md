# Repository Guidelines

## Project Structure & Module Organization

This repository is the DocSynth React, TypeScript, and Vite frontend. Keep application configuration, pages, and route selection in `src/app/`. Put feature components, API types, and styles in `src/features/auth/` or `src/features/documents/`; put code with no feature dependency in `src/shared/`. The Vite entry point is `index.html` at the project root. Static assets belong in `public/`; imported assets belong in `src/shared/assets/`. Place tests in `tests/` and architecture notes in `docs/` when needed.

## Build, Test, and Development Commands

Run commands from this directory:

- `pnpm install` installs dependencies from `pnpm-lock.yaml`.
- `pnpm dev` starts the local Vite server.
- `pnpm test` type-checks and runs the TypeScript tests with Node's test runner.
- `pnpm lint` runs ESLint, including TypeScript and React Hooks rules.
- `pnpm build` runs strict TypeScript checks and creates `dist/`.
- `pnpm preview` serves the production build locally.

Run `pnpm test`, `pnpm lint`, and `pnpm build` after changing application code or entry points.

## Coding Style & Naming Conventions

Use TypeScript (`.ts` and `.tsx`) with two-space indentation and follow the surrounding file's formatting. Keep strict type checking enabled. Name React components in PascalCase, functions and variables in camelCase, and test files `*.test.ts`. Reuse feature types for API payloads and responses; keep `src/shared/` independent of features and routes. Do not add folders or dependencies for speculative use.

## Testing Guidelines

Add focused tests in `tests/` for behavior that can regress, especially session renewal and API pagination. When an endpoint returns `limit`, `cursor`, and `nextCursor`, make each UI page request one backend page; check that next and previous controls use the correct cursors and that displayed totals come from the API. For UI changes, also verify the relevant flow in a browser when the backend is available.

## Commit & Pull Request Guidelines

Recent commits use short subjects such as `feat: Add login and registration interface`, `chore: Add frontend behavior tests`, and `docs: Document frontend setup`. Use a lowercase type prefix and an imperative English description. In pull requests, explain the behavior changed, list checks run, link the related issue when one exists, and include screenshots for visible UI changes.

## Security & Configuration

Copy `.env.example` to `.env` for local setup. `VITE_API_URL` is public build-time configuration; never place secrets in `VITE_` variables or commit `.env`, tokens, uploaded PDFs, or generated `dist/` files.
