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
- **libsql runs in REMOTE mode, not embedded-replica.** When `TURSO_DB_URL` is set, `new Database(tursoUrl, { authToken })` opens a direct connection — there is no local `cafe777.db` replica. Embedded replicas were tried and abandoned because writes diverged from Turso under FK pressure: the local replica would apply two writes, Turso would reject the second (FK or constraint), and a subsequent sync would revert both locally, leaving orphan rows from earlier failed attempts. Remote mode trades ~50ms per query for correctness. Local-only mode (no `TURSO_DB_URL`) still uses a `cafe777.db` file for dev without Turso.

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

## Conventions

### Design tokens (Tailwind v4 + CSS variables)
The theme is defined in `src/index.css` via `@theme` and CSS variables, with `.dark` on `<html>` toggling dark mode (managed by `ThemeContext`, persisted to `localStorage.theme`). The motorcycle-themed color tokens are: `primary`, `accent`, `chrome`, `steel`, `asphalt`, `carbon`, `engine`, `oil`, `inverse`, plus standard `error`/`success`/`info`/`warning`. Light mode is a beige/red palette; dark mode is the original orange/black. **Always use these tokens, not raw hex values or default Tailwind colors** — the `replace_*.cjs` codemods in the repo exist precisely because raw colors were swept out.

Reusable component classes in the `@layer components` block: `glass-card`, `btn-primary`, `btn-secondary`, `input-field`, `badge-primary`, `badge-chrome`, `no-scrollbar`, plus utilities `grid-pattern` and `mask-linear-fade`. Fonts: `font-sans` (Inter), `font-display` (Space Grotesk, used for headings), `font-mono` (JetBrains Mono).

### i18n
Default language is **`pt`** (Portuguese), not English. `useLanguage()` exposes `t(key, params?)` where params interpolate as `{name}`. All ~700 translation keys live inline in `src/contexts/LanguageContext.tsx` — add new ones there (both `en` and `pt`). Missing keys log a warning and fall through to the key name.

### User feedback
For toasts/snackbars, use `useNotification().showNotification(type, message)` with type `'success' | 'error' | 'info' | 'warning'`. They auto-dismiss after 5s and stack in the bottom-right. **Don't use `alert()`, `confirm()`, or ad-hoc toast components.**

### Roles and permissions
DB roles: `user` / `admin` / `moderator`. Plans: `freemium` / `premium`.
- `authenticateToken` → attaches `req.user`.
- `checkAdmin` → admin **or** moderator (used after `authenticateToken`).
- `checkAmbassador` → must have active `ambassadors` row (SQLite or Firestore), admins/moderators also pass.
- Every admin write must call `logAdminAction(req.user.id, 'ACTION_NAME', targetType, targetId, details?)` — writes to the `admin_logs` SQLite table.

### Feature gating
The `settings` table holds rows with keys like `feature_create_event` and value `freemium` or `premium`. Client reads them from `GET /api/f-access` via `useFeatureAccess()`. Use `canAccess(feature, userPlan, userRole, userType?)` — admins always pass. Special case hardcoded: `create_event` for `ecosystem` users always requires `premium`.

### Schema migrations
There are **48 inline `CREATE TABLE IF NOT EXISTS`** and **53 inline `try { ALTER TABLE ... ADD COLUMN ... } catch {}`** blocks in `server.ts` startup. Follow this pattern — do not introduce a migration framework. New columns are added by appending another `try/catch` block.

### Background jobs
`setInterval(checkContests, 60000)` runs at module load (~line 1449), picks contest winners whose `end_date` has passed, and awards prizes. It runs in **every** server instance — keep this in mind if scaling horizontally (you'd get duplicate winner picks).

### Realtime is polling, not subscriptions
Chat messages use `setInterval(fetchMessages, 3000)` in `subscribeToMessages` (`src/services/messagingService.ts`) — a 3-second REST poll. Despite Firestore being available client-side via `src/services/firebase.ts`, no `onSnapshot` listeners are wired up. New realtime features should follow the polling pattern unless explicitly migrating to Firestore listeners.

### Rate limits and body size
- `/api/*` global: 1000 req / 15 min per IP.
- `/api/login`, `/api/register`, `/api/forgot-password`, `/api/reset-password`: 10 req / hour per IP.
- `express.json` and `express.urlencoded` are capped at **10MB**.
- Image uploads: 10MB, allowlist `jpe?g|png|gif|webp|avif|heic|heif|jfif` on **both** extension and MIME.

### Capacitor / mobile
Only `@capacitor/network` is actually consumed (`src/hooks/useNetwork.ts`), which triggers `SyncEngine.sync()` when connectivity returns. The sync engine itself is a stub (see Architecture). `@capacitor/splash-screen` and `@capacitor/android` are wired but unused in TS code.

### Gemini AI
`@google/genai` is in `package.json` and `GEMINI_API_KEY` is exposed via Vite `define`, but **no source file imports or uses it yet**. Don't assume AI features exist — they're scaffolding.

### OSM Overpass quirks
`fetchOSMPlaces` (`src/services/osmService.ts`) caps radius at **5km** regardless of input — larger queries time out on public Overpass instances. Results are cached in-memory for 15 minutes, keyed by `lat.toFixed(3),lng.toFixed(3),radius`. The `mapCategory()` function is the canonical mapping from OSM tags to app categories (`parts_store`, `repair`, `biker_cafe`, `biker_bar`, `ride_stop`, `meeting_spot`, `motoclub`, `gear_shop`).

### Profile redirect pattern
`/profile` (no username) reads `localStorage.user` and redirects to `/profile/:username` or `/login`. See `ProfileRedirect` in `App.tsx`. Use the same pattern for any new "current user" landing route.
