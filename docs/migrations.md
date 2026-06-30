# Migrations

## Folder filter → custom filters (2026-06)

### What changed

The standalone folder filter (`folderFilter` / `folderMode`) was replaced by the custom filters system. Users can define any number of named filter expressions and toggle them from the image page multi-select.

NSFW filtering is unchanged in the UI (checkbox + editable filter string on settings). Only request packaging was harmonized: all filtering goes through `filters[]`; the redundant `nsfw: boolean` API field was removed.

### Affected data

| Legacy key | Replacement |
|------------|-------------|
| `folderFilter` (localStorage + global settings) | `customFilters.filters[]` — built-in **Folders** entry (`id: builtin-folders`) |
| `folderMode` (localStorage) | `activeCustomFilterIds` — includes `builtin-folders` when folder filter was enabled |

### Migration code

- Local: [`src/lib/migrations/folderFilterMigration.ts`](../src/lib/migrations/folderFilterMigration.ts) — `migrateFolderFilterToCustomFilters()`, guarded by `folderFilterMigrated` in localStorage
- Global settings pull: `migratePulledGlobalSettings()` in the same file, called from `updateGlobalSettings()`

### How to verify

1. With legacy `folderFilter` / `folderMode` in localStorage, reload the app once — custom filters should contain a **Folders** entry with the same expression; active state should match prior `folderMode`.
2. Image page multi-select shows **Folders** when migrated; toggling it changes results as before.
3. NSFW checkbox still works independently; network requests send NSFW expression inside `filters[]` only (no `nsfw` field).
4. Settings → Custom Filters: add, edit, delete entries; changes persist and sync globally.

### Removal

After all clients have migrated, legacy `folderFilter` keys can be ignored. The migration flag `folderFilterMigrated` prevents re-running local migration.

## Manual extradata recalculation

This is not a version migration. It is a user-triggered rebuild of derived fields stored in `MetaCalcDB` (`extradata` table).

### What it does

Rebuilds `positive`, `negative`, `params`, `models`, and `hash` from raw metadata via `getServerImage()`. LLM/user **annotations are preserved**.

Use when parser logic changed without a schema version bump, or to repair inconsistent derived data.

### Code

| Module | Role |
|--------|------|
| [`src/lib/server/extradataComputeCore.ts`](../src/lib/server/extradataComputeCore.ts) | Pure CPU derivation (worker-safe, no `$env`/DB) |
| [`src/lib/server/extradataRecalc.ts`](../src/lib/server/extradataRecalc.ts) | Orchestrates recalc job |
| [`src/lib/server/extradataBatch.ts`](../src/lib/server/extradataBatch.ts) | Shared batch compute (startup + manual) |
| [`src/lib/server/workers/`](../src/lib/server/workers/) | Worker-thread pool for CPU-bound parsing |
| [`src/lib/server/db.ts`](../src/lib/server/db.ts) | Staging table + atomic swap |
| Settings → **Data management** | UI trigger |

### How it works

1. Recalculated rows are written to `extradata_staging` while live `extradata` continues serving reads/writes.
2. On completion, staging is swapped into place in one SQLite transaction; rows for images added during recalc are merged from the old table.
3. In-memory `imageList` is refreshed; exploration caches (sparse, similar, unique) are invalidated.

### Recovery after crash

- **Mid-batch:** live `extradata` is untouched; orphan `extradata_staging` is dropped on next startup (`MetaCalcDB.cleanupOrphanExtradataTables()`).
- **Mid-swap:** SQLite transaction is atomic; leftover `extradata_old` / `extradata_staging` tables are cleaned on startup.

### How to verify

1. Settings → Data management → **Recalculate extra data** — global progress banner shows `done / total`.
2. Browse/search during recalc — gallery remains usable; old derived data until swap completes.
3. After completion — search/similarity reflect new hashes; annotations unchanged.
4. `npm run build:worker` produces `build/workers/extradataCompute.js` for production worker threads.
