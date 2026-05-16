# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — runs `tsx --env-file=.env.local server.ts`. The Express server in `server.ts` mounts the Vite dev server as middleware, so there is **one process on one port** (default 3000) serving both API and SPA. There is no separate `vite dev`.
- `npm run build` — `vite build` (frontend → `dist/`), then esbuild bundles `server.ts` → `dist/server.js`. Many backend deps are kept `--external` (express, libsql, multer, firebase-admin, etc.) and resolved from `node_modules` at runtime.
- `npm run start` — runs the production bundle (`node dist/server.js`). In production mode, the server skips Vite middleware and serves `dist/` statically with a `*` fallback to `index.html`.
- `npm run lint` — `tsc --noEmit`. There is no ESLint/Prettier; type-checking is the lint step.
- `npx cap sync` / `npx cap open android` — Capacitor wraps `dist/` into the Android app (`appId: com.cafe777.app`). `webDir` is `dist`, so a `vite build` must run first.
- **Tests**: no test framework is configured. Files named `test-*.js`, `test-*.cjs`, `test_*.ts` at the repo root are ad-hoc scripts (curl-style API probes, DB inspections). Run individually with `node`, `tsx`, or via `npm run test-routes` (which expects a `test_routes.cjs` that is currently absent — script is mostly aspirational).

## Architecture

### One-server topology
`server.ts` is a single ~8200-line Express app. It:
1. Initializes Firebase Admin (from `serviceAccountKey.json` on disk, or `FIREBASE_SERVICE_ACCOUNT_KEY` env, or ADC).
2. Opens a libsql connection — Turso embedded replica if `TURSO_DB_URL`+`TURSO_DB_AUTH_TOKEN` are set, otherwise a local-only SQLite file (`cafe777.db`, or `/tmp/cafe777.db` in prod). Replica syncs every 60s.
3. Creates all SQLite tables inline via `db.exec(...)` (schemas live in `server.ts`, not in migration files). One-off column adds use `try { ALTER TABLE ... ADD COLUMN ... } catch {}` as inline migrations.
4. Registers ~170 `/api/*` routes, then mounts Vite middleware (dev) or static `dist/` (prod) **after** the API, with a `/api/*` 404 handler in between.

### Dual data layer: SQLite + Firestore
Most write paths touch **both** libsql (SQLite) and Firestore. SQLite is the primary read path (faster, no permission setup needed in AI Studio); Firestore is the durable mirror. Patterns to know:
- `collections` (server.ts ~line 69) is the master list of Firestore collection handles.
- `ensureSqliteUserExists(userId)` (server.ts ~line 125) lazily backfills a SQLite row from Firestore when a foreign-key target is missing. This pattern recurs — when adding new endpoints that join on users, call this rather than assuming the row exists.
- `authenticateToken` middleware reads SQLite first, falls back to Firestore. JWTs are signed with `JWT_SECRET` (dev default if unset).
- **`PRAGMA foreign_keys = OFF` is intentional** (server.ts ~line 194). Turso enforces FKs by default but better-sqlite3 did not, and this codebase's INSERT/DELETE ordering was not written to satisfy them. Do not enable FKs.
- `db.transaction` is monkey-patched (~line 199) to work around a libsql 0.5.x bug where ROLLBACK failure swallows the original error. Use the patched version, not raw `BEGIN`/`COMMIT`.

### Client-side offline layer
`src/services/db.ts` defines a Dexie (IndexedDB) schema `Cafe777OfflineDB` with `users`, `sessions`, `profiles`, `sync_queue`. `src/services/syncEngine.ts` is a skeleton — `processItem` is mocked and does **not** actually POST to the backend yet. Treat the offline path as partially built.

### Frontend
- React 19 + React Router 7 SPA. Entry: `src/main.tsx` → `src/App.tsx`. All routes are declared in `App.tsx`; pages live in `src/pages/`.
- Four context providers wrap the app: `ThemeProvider`, `LanguageProvider`, `NotificationProvider`, `FeatureFlagProvider`. Language is EN/PT with translations inlined in `src/contexts/LanguageContext.tsx`. Feature flags persist to `localStorage` under `featureFlags`.
- Auth state lives in `localStorage` (`user`, `token`). `fetchWithAuth` (`src/utils/api.ts`) is the single client-side fetch wrapper — it attaches the JWT, redirects to `/login` (or `/admin/login`) on 401, and silently swallows expected network drops. Use it for all API calls.
- Tailwind v4 via `@tailwindcss/vite`. Path alias `@/*` → repo root (configured in both `vite.config.ts` and `tsconfig.json`).
- Maps: `@vis.gl/react-google-maps` (Google) and `react-leaflet` (Leaflet/OSM) coexist. Places data comes from both Google Places and OSM Overpass (`src/services/osmService.ts`) with server-side caching in the `places_cache` Firestore collection.

### Uploads
Multer (memory storage, 10MB limit, images only) → `uploadToFirebase()` writes to the Firebase Storage bucket and returns a `firebasestorage.googleapis.com/v0/b/.../o/...?alt=media` URL. Local fallback dir is `public/uploads` (dev) or `/tmp/uploads` (prod). The `/uploads` static mount still exists for legacy files.

### Environment detection
`isProd = NODE_ENV === 'production' || !!process.env.K_SERVICE`. `K_SERVICE` is Cloud Run / AI Studio's marker. In prod, writable paths shift to `/tmp/` because Cloud Run's root FS is read-only. CSP is configured to allow embedding in `https://ai.studio` and `*.run.app` frames (`frameguard: false`, X-Frame-Options removed in a follow-up middleware).

### Vite dev quirk
`vite.config.ts` honors `DISABLE_HMR=true` (set by AI Studio) to disable HMR and file-watching. Do not re-enable HMR unconditionally — it causes flicker during agent edits in AI Studio.

## Required environment variables

See `.env.example`. The non-obvious ones:
- `GEMINI_API_KEY` — injected by AI Studio at runtime; also exposed to the client via `vite.config.ts` `define`.
- `GOOGLE_MAPS_PLATFORM_KEY` — needs both **Maps JavaScript API** and **Places API** enabled in GCP.
- `TURSO_DB_URL` / `TURSO_DB_AUTH_TOKEN` — without these, data is local-only and lost on restart in prod.
- `FIREBASE_SERVICE_ACCOUNT_KEY` — single-line JSON, used when `serviceAccountKey.json` is absent (i.e., in deployed env).
- `K_SERVICE` — set automatically by Cloud Run / AI Studio; do not set manually.

## Gotchas

- `server.ts` is huge and not modularized. New endpoints go inline alongside existing ones; there is no router file split.
- Many root-level `replace_*.cjs` and `fix_*.ts` files are one-shot codemods that have already been applied. Treat them as history, not active tools.
- `cafe777.db`, `cafe777.db-shm`, `cafe777.db-wal`, `cafe777.db-info` are the local Turso replica artifacts — they appear modified in `git status` because `*.db` is gitignored but the `-shm`/`-wal`/`-info` siblings are not always covered. Don't commit them.
- Numeric user IDs come from SQLite `AUTOINCREMENT`; Firestore stores the same user under `users/<id-as-string>`. When crossing the two, always `.toString()` for Firestore and parse back to number for SQLite.
