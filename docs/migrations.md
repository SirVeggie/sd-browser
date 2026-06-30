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
