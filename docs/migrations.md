# Migrations

App data version is stored in `MiscDB` under the key `version`. The current version is `APP_VERSION` in `src/lib/server/migration/index.ts`.

Migration steps live in `src/lib/server/migration/` — one file per version (`v1.ts`, `v2.ts`, …). Each step assumes the **previous** version's on-disk state and bumps the stored version when it completes.

The orchestrator runs steps in order by version number:

1. **Startup** (`handleMigrationStart`) — layout migrations before MetaDB opens
2. **Data load** (`runDataMigrations`) — schema/data migrations once the image cache is loaded
3. **End** (`handleMigrationEnd`) — sets version to `APP_VERSION` (covers fresh installs that skip data migrations)

Example: no stored version (treated as 0 internally) runs v1 if old files exist, bumps to `1`, then v2 during cache load, bumps to `2`.

## Pre-versioning → v1 — SQLite file split

**When:** No `version` key stored (pre-versioning installs).

**Assumes:** Pre-split layout (`data.sqlite3` + monolithic `metadata.sqlite3`). No-ops if those files are already gone.

**Code:** `src/lib/server/migration/v1.ts`

**What changed:** Single `data.sqlite3` and monolithic `metadata.sqlite3` were split into `appdata.sqlite3`, `metadata.sqlite3` (short rows), and `workflows.sqlite3` (prompt/workflow/extra).

**Verify:** Upgrade from oldest layout; metadata transfers and version becomes `1`.

**Removal:** Safe once all installs are on version ≥ 1.

## v1 → v2 — Remove isUnique, recalculate extradata

**When:** Stored version &lt; 2.

**Assumes:** v1 file layout (split sqlite files). Extradata may use an older schema.

**Recalc:** Drops the extradata table; `MetaCalcDB.setup()` recreates it from the current schema, then the existing "Calculating missing data" pass in `indexCachedFiles` rebuilds all rows via `getServerImage()`.

**Code:** `src/lib/server/migration/v2.ts`

**What changed:**

- Dropped the extradata table so startup recreates it with the current schema (no `isUnique` column) and recalculates all rows via `getServerImage()`.
- Exploration mode `'unique'` removed; saved client preference coerced to `'none'` via `coerceExplorationMode` in `src/lib/types/misc.ts`.

**Verify:** Upgrade from v1 library; extradata repopulates; exploration with old `'unique'` setting falls back to `'none'`.

**Removal:** Safe once all libraries report version ≥ 2.
