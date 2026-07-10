# Migrations

## Embedding query optimization setting (2026-07)

### What changed

`embeddingSettings` now includes `useOptimizedEmbeddingQuery`. It chooses the sqlite-vec KNN path for `IMG` queries without an explicit `k`; disabling it uses JavaScript cosine-similarity scoring for those queries instead. An explicit `k` of 4096 or less always uses sqlite-vec KNN. An explicit `k` greater than 4096 always uses JavaScript scoring.

### Affected data

Existing localStorage and global `embeddingSettings` values lack this field. They retain the previous behavior by defaulting to `true` when loaded; no persisted data is rewritten solely for this change.

### Migration code

- [`src/lib/types/embeddings.ts`](../src/lib/types/embeddings.ts) — `normalizeEmbeddingSettings()` adds the default at the settings boundary.

### How to verify

1. Load a profile with existing embedding settings that lack `useOptimizedEmbeddingQuery`; Settings → Embedding settings shows the toggle enabled.
2. Disable the toggle and run `IMG <query>`; JavaScript similarity returns every threshold match.
3. With the toggle disabled, run `IMG <query> 100`; sqlite-vec KNN is used and returns up to 100 results.
4. Enable the toggle and run `IMG <query>`; sqlite-vec KNN is used and returns at most 4096 results.
5. Run `IMG <query> 5000`; JavaScript similarity is used and returns up to 5000 results regardless of the toggle.

### Removal

Keep the defaulting behavior while stored settings from before this field existed may be loaded.

## Folder filter → custom filters (2026-06)

### What changed

The standalone folder filter (`folderFilter` / `folderMode`) was replaced by the custom filters system. Users can define any number of named filter expressions and toggle them from the image page multi-select.

NSFW filtering is unchanged in the UI (checkbox + editable filter string on settings). Only request packaging was harmonized: all filtering goes through `filters[]`; the redundant `nsfw: boolean` API field was removed.

### Affected data

| Legacy key | Replacement |
|------------|-------------|
| `folderFilter` (localStorage + global settings) | `customFilters.filters[]` — built-in **Folders** entry (`id: builtin-folders`) |
| `folderMode` (localStorage) | `activeCustomFilterIds` — includes `builtin-folders` when folder filter was enabled |

Fresh local profiles with neither legacy key do not create the built-in **Folders** entry; custom filters default to empty.

### Migration code

- Local: [`src/lib/migrations/folderFilterMigration.ts`](../src/lib/migrations/folderFilterMigration.ts) — `migrateFolderFilterToCustomFilters()`, guarded by `folderFilterMigrated` in localStorage
- Global settings pull: `migratePulledGlobalSettings()` in the same file, called from `updateGlobalSettings()`

### How to verify

1. With legacy `folderFilter` / `folderMode` in localStorage, reload the app once — custom filters should contain a **Folders** entry with the same expression; active state should match prior `folderMode`.
2. With cleared site data and no legacy folder-filter keys, reload the app once — custom filters should remain empty.
3. Image page multi-select shows **Folders** when migrated; toggling it changes results as before.
4. NSFW checkbox still works independently; network requests send NSFW expression inside `filters[]` only (no `nsfw` field).
5. Settings → Custom Filters: add, edit, delete entries; changes persist and sync globally.

### Removal

After all clients have migrated, legacy `folderFilter` keys can be ignored. The migration flag `folderFilterMigrated` prevents re-running local migration.

## Image tags (v4, 2026-07)

### What changed

First-class image tags were added: a global tag registry (name + color), per-image tag assignments stored in `extradata.tags`, `TAG` search, settings management, full-image editing, and bulk tag operations.

### Affected data

| Location | Change |
|----------|--------|
| `MiscDB` global settings key `tags` | Tag registry: `{ tags: [{ name, color }] }` — seeded with `favourite` (#e6b422) and `nsfw` (#e0528f) on startup when missing (`ensureDefaultTagsRegistry()` in `filemanager.ts`); client store starts empty until settings load |
| `extradata.tags` | Comma-separated list of tag name strings per image |
| App version | Bumped from `3` to `4` |

Missing, null, or invalid `extradata.tags` values are treated as `[]`.

### Migration code

- Version bump and column add: [`src/lib/server/migration/v4.ts`](../src/lib/server/migration/v4.ts), wired from [`src/lib/server/migration/index.ts`](../src/lib/server/migration/index.ts)
- Default tag registry seed: [`src/lib/server/tags.ts`](../src/lib/server/tags.ts) `ensureDefaultTagsRegistry()`, called from [`src/lib/server/filemanager.ts`](../src/lib/server/filemanager.ts) after migrations start
- DB read/write and preservation: [`src/lib/server/db.ts`](../src/lib/server/db.ts) `MetaCalcDB`
- Tag helpers: [`src/lib/server/tags.ts`](../src/lib/server/tags.ts)

During manual extradata recalculation, `tags` are preserved the same way as annotations (`set`, `setAll`, `setAllStaging`, `swapStagingToLive`).

Deleting a tag in Settings removes it from the registry and strips it from all images via `POST /api/settings/tags`.

### How to verify

1. Upgrade from v3 — `extradata` gains a `tags` column; existing rows behave as untagged.
2. Settings — add, edit color, delete tags inline between Search keywords and Custom Filters; registry syncs globally. Fresh installs get default tags `favourite` and `nsfw` on first server startup when the registry is missing (not from client defaults).
3. Full image view — add/remove tags from registry; changes persist after reload.
4. Search — `TAG name`, `NOT TAG name`, and regex `TAG pattern` match assigned tags; unknown exact tag names highlight red in the search box.
5. Bulk → Tag — add/remove/replace on matching images; gallery refreshes after completion.
6. Manual extradata recalc — tag assignments unchanged after swap.

### Removal

After all clients are on v4+, no further migration steps are required for tags.

## Image quality cache folders (v5, 2026-07)

### What changed

Generated WebP cache folders were renamed to match quality tier names. A new `minimal` quality tier was added (230px width, quality 70, effort 6). Smart subsampling is now configurable when generating cached WebP files.

### Affected data

| Legacy folder | New folder | Quality tier |
|---------------|------------|--------------|
| `{LOCAL_DATA}/compressed/` | `{LOCAL_DATA}/medium/` | `medium` (full-size WebP, quality 90) |
| `{LOCAL_DATA}/thumbnails/` | `{LOCAL_DATA}/low/` | `low` (460px, quality 80) |
| *(none)* | `{LOCAL_DATA}/minimal/` | `minimal` (230px, quality 70, effort 6) |

App version bumped from `4` to `5`.

### Migration code

- Filesystem migration: [`src/lib/server/migration/v5.ts`](../src/lib/server/migration/v5.ts), wired from [`src/lib/server/migration/index.ts`](../src/lib/server/migration/index.ts)
- Cache paths: [`src/lib/server/paths.ts`](../src/lib/server/paths.ts)
- Generation and serving: [`src/lib/server/convert.ts`](../src/lib/server/convert.ts), [`src/lib/server/responses.ts`](../src/lib/server/responses.ts)
- Clear cache action: [`src/lib/server/imageCache.ts`](../src/lib/server/imageCache.ts), `POST /api/settings/clear-compressed`

### How to verify

1. Upgrade from v4 with populated `compressed/` and `thumbnails/` folders — files appear under `medium/` and `low/` after startup; empty legacy folders are removed.
2. Gallery thumbnails (`quality=low`) and full view (`quality=medium` or `quality=minimal`) load without errors.
3. Settings — `minimal` appears in quality dropdowns; smart subsampling toggle persists; clear compressed images deletes only generated WebP cache files.
4. Delete or move an image — cache files are removed from the new tier folders.
5. Fresh install — empty `medium/`, `low/`, and `minimal/` folders are created; lazy generation still works.
6. Re-run startup — migration is a no-op (idempotent).

### Removal

After all clients are on v5+, legacy `compressed/` and `thumbnails/` directories are removed automatically when migration completes without failures. Folders with unmigrated files (e.g. failed moves or non-WebP leftovers) are left in place.

## Manual extradata recalculation

This is not a version migration. It is a user-triggered rebuild of derived fields stored in `MetaCalcDB` (`extradata` table).

### What it does

Rebuilds `positive`, `negative`, `params`, `models`, and `hash` from raw metadata via `getServerImage()`. LLM/user **annotations and tags are preserved**.

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
3. After completion — search/similarity reflect new hashes; annotations and tags unchanged.
4. `npm run build:worker` produces `build/workers/extradataCompute.js` for production worker threads.
