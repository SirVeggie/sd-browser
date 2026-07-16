# Migrations

## Smart subsampling global setting (2026-07)

### What changed

`useSmartSubsampling` now syncs through global settings (MiscDB `settings` key), matching other shared image preferences such as `nsfwFilter` and quality modes.

### Affected data

| Location | Change |
|----------|--------|
| localStorage `useSmartSubsampling` | Unchanged; still read on startup before global pull |
| Global settings `useSmartSubsampling` | New key; absent until a client changes the toggle or loads with an existing local value and syncs |

Existing per-client localStorage values continue to work. The server default when the key is missing remains `true` (store default and image API fallback).

### Migration code

- [`src/lib/stores/searchStore.ts`](../src/lib/stores/searchStore.ts) — `syncMemory('useSmartSubsampling', …, true)` registers the store for global pull/push

### How to verify

1. Client A — disable **Use smart subsampling** in Settings; confirm `useSmartSubsampling` appears in global settings (MiscDB or `/api/settings`).
2. Client B — reload or open Settings; the toggle matches client A.
3. Fresh client with no localStorage — receives the synced value from global settings on load.

### Removal

No dedicated migration helper is required; the setting is a boolean with a stable default.

## SIMILAR img removed (2026-07)

### What changed

Image-to-image embedding similarity no longer uses `SIMILAR img <id>`. Use `IMG <id>` instead (64-character hex image id). `SIMILAR` / `SM` is prompt-only similarity. There is no runtime fallback for the old syntax.

### Affected data

| Location | Change |
|----------|--------|
| Search syntax | `SIMILAR img …` is not parsed as image embedding similarity |
| Context menu **Similar images** | Sets `IMG <id> <threshold>` (single) or `IMG avg <ids…> <threshold>` (multi-select) |
| Search display abbreviation | Applies to `IMG` clause hex ids as well as `SIMILAR` ids |

### Migration code

None. Users must update saved searches and habits manually.

### How to verify

1. Right-click an image with embeddings configured — **Similar images** runs `IMG <id> 0.8` (or the configured threshold).
2. With multiple images selected — **Similar images** runs `IMG avg <id1> <id2> … <threshold>`.
3. `IMG <64-char-id>` returns image-to-image matches; `SIMILAR <id>` compares prompt text only.
4. Weighted `IMG <id> + turtle - beach` abbreviates hex ids in the search box display.
5. Mode queries work: `IMG all <id1> <id2>`, `IMG any …`, `IMG more <A> <B>`, `IMG fringe …`.

### Removal

No migration helper; the old `SIMILAR img` form is unsupported.

## IMG multi-image modes (2026-07)

### What changed

`IMG` accepts named multi-image modes with space-separated hex ids (no `+` required):

- `avg` — centroid / average embedding (fast KNN)
- `all` — soft intersection (geometric mean of similarities)
- `any` — soft union (max similarity)
- `more <A> <B>` — extrapolate past A away from B
- `fringe` — related but atypical vs the selection centroid

Weighted `+/-` image+text queries are unchanged. Mode names are recognized only when followed by hex ids, so `IMG fringe of trees` remains a text query.

Tokenizer note: inside an `IMG` clause, the `ALL` keyword does not start a new clause (so `IMG all <id>…` parses as one clause). Explicit `AND` still splits.

### Affected data

| Location | Change |
|----------|--------|
| Search syntax | Additive mode forms |
| Multi-select **Similar images** | Emits `IMG avg …` |
| Keyword help | Documents modes |

### Migration code

None (additive).

### How to verify

1. `IMG avg <id1> <id2> 0.8` returns blended neighbors.
2. `IMG all <id1> <id2>` stays one search clause (not split by `ALL`).
3. `IMG more <idA> <idB>` requires exactly two ids.
4. Multi-select → Similar images emits `IMG avg` with all selected ids.

### Removal

Modes can be removed later by dropping the mode parse branch; no data migration.

## Image similarity threshold setting (2026-07)

### What changed

`embeddingSettings` now includes `imageSimilarityThreshold` (default `0.8`). It sets the default similarity cutoff for `IMG` searches with a 64-character image id (image-to-image embedding similarity). Per-query overrides remain supported via a trailing number on the search command.

### Affected data

Existing localStorage and global `embeddingSettings` values lack this field. They receive the default `0.8` when loaded via `normalizeEmbeddingSettings()`; the next settings sync persists the normalized value.

### Migration code

- [`src/lib/types/embeddings.ts`](../src/lib/types/embeddings.ts) — `normalizeEmbeddingSettings()` adds the default at the settings boundary.

### How to verify

1. Load a profile with existing embedding settings that lack `imageSimilarityThreshold`; Settings → Embedding settings shows **Image similarity threshold** at `0.8`.
2. Right-click an image with a configured embedding API; **Similar images** appears and runs `IMG <id> 0.8` (or the configured threshold).
3. Change the threshold in settings; the context-menu command and default search behavior use the new value on the next sync.

### Removal

Keep the defaulting behavior while stored settings from before this field existed may be loaded.

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

## MMR search and uniqueness index (2026-07)

### What changed

- Search syntax now supports `MMR <resultCount> [candidateCount]` as a position-independent result-shaping directive. Omitted `candidateCount` defaults to `resultCount * 10`.
- MMR returns a fixed diverse image sequence from saved embeddings inside the current filtered match set.
- A temporary `uniqueness` sort becomes available while an MMR clause is active.
- Global `mmrSettings` were added for candidate-pool strategy (`n-select`, `index`, `pre-rank`) and MMR diversity weight.
- `embeddings.sqlite3` now has an optional `uniqueness_scores` table for the manual full-library uniqueness index used by the `index` candidate strategy.

### Affected data

| Location | Change |
|----------|--------|
| Global settings `mmrSettings` | New persisted settings with defaults from `normalizeMmrSettings()` |
| `embeddings.sqlite3` table `uniqueness_scores` | Optional manually built scores keyed by image id |
| Search sessions | May store `mmrSearchContext` with fixed MMR order and intrinsic uniqueness scores |

No automatic uniqueness-index build runs on startup or migration. Users rebuild manually from Settings → Embedding settings → **Build uniqueness index**. Clearing or replacing the embedding database remains the required action after changing embedding models.

### Migration code

- [`src/lib/types/mmr.ts`](../src/lib/types/mmr.ts) — defaults and normalization for `mmrSettings`
- [`src/lib/server/embeddingDb.ts`](../src/lib/server/embeddingDb.ts) — creates `uniqueness_scores` table only; does not populate it
- [`src/lib/stores/mmrStore.ts`](../src/lib/stores/mmrStore.ts) — client sync and global settings push

### How to verify

1. Vectorize some images, then run `MMR 20` — the gallery returns at most 20 embedded matches in a stable diverse order.
2. Run `MMR 20 50` — candidate selection is capped at 50 instead of the default 200.
3. Combine `IMG misty forest AND MMR 10` — similarity and uniqueness temporary sorts are both available; changing sort reorders within the same MMR result set.
4. Settings → Embedding settings — change candidate strategy and diversity weight; subsequent MMR searches use the new values.
5. Build the uniqueness index manually, switch candidate strategy to `index`, and run MMR — candidates prefer indexed scores; images without scores fall behind scored images.
6. Delete embeddings or images — corresponding `uniqueness_scores` rows are removed with the embedding row.

### Removal

Keep the `uniqueness_scores` table and `mmrSettings` defaulting while older clients or stored settings may still omit them.

## IMGSIM time-neighbor pruning (2026-07)

### What changed

- Search syntax now supports `IMGSIM <count>` as a position-independent result-shaping keyword.
- After ordinary filters and `IMG` clauses resolve, IMGSIM keeps only embedded matches, orders them by date (image id tie-break), and repeatedly removes the image whose minimum cosine distance to either direct time neighbor is smallest until `<count>` images remain.
- Search sessions may store `imgsimSearchContext` with the fixed pruned order so live updates revalidate membership without repopulating or reordering the set.
- The former MMR candidate strategy `time-neighbors` was removed. Use `IMGSIM` instead.

### Affected data

| Location | Change |
|----------|--------|
| Search sessions | May store `imgsimSearchContext` with fixed IMGSIM order |
| Global settings `mmrSettings.candidatePoolStrategy` | Stored `time-neighbors` values normalize back to `n-select` via `normalizeMmrSettings()` |

### Migration code

- [`src/lib/tools/searchParsing.ts`](../src/lib/tools/searchParsing.ts) — `IMGSIM` parsing, validation, and stripping via `stripResultShapingParts()`
- [`src/lib/server/imgSimRanking.ts`](../src/lib/server/imgSimRanking.ts) — time-neighbor pruning over embedded matches
- [`src/lib/tools/mmrMath.ts`](../src/lib/tools/mmrMath.ts) — shared `selectByTimeNeighbors()` heap primitive
- [`src/lib/server/searching.ts`](../src/lib/server/searching.ts) — applies IMGSIM after matching, before optional MMR
- [`src/lib/server/imageUpdates.ts`](../src/lib/server/imageUpdates.ts) — strips IMGSIM from live-update matcher checks; fixed IMGSIM membership
- [`src/lib/types/mmr.ts`](../src/lib/types/mmr.ts) — removed `time-neighbors` from MMR candidate strategies

### How to verify

1. Vectorize some images, then run `IMGSIM 1000` — the gallery returns at most 1,000 embedded matches in stable date order after time-neighbor pruning.
2. Run `IMG misty forest AND IMGSIM 1000` and `IMGSIM 1000 AND IMG misty forest` — both return the same membership.
3. Confirm results remain visible past the 10-second live-update check.
4. Run `IMGSIM 1000 AND MMR 50` — IMGSIM prunes first, then MMR diversifies within the pruned set.
5. Settings → Embedding settings — the MMR candidate strategy list no longer includes `time-neighbors`.

### Removal

Keep `normalizeMmrSettings()` fallback for stored `time-neighbors` values until all clients and saved settings have moved on.

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
3. Settings — `minimal` appears in quality dropdowns; smart subsampling toggle persists locally and syncs globally; clear compressed images deletes only generated WebP cache files.
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
