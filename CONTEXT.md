# Project context for agents

Living notes for agents working on this repo. Read at the start of a session. Update when you learn or change a durable design decision, gotcha, or convention that a future agent would otherwise miss.

Keep entries short and actionable. Prefer linking to code over restating it.

---

## Search dock width

**Files:** `src/routes/+page.svelte` (`.dock`, `.dock-column`, `.chrome`), `src/lib/components/ImageRefStrip.svelte`

`.dock-column` is the centered, max-width (`--search-chrome-max-width`, 52rem) wrapper for search chrome + IMG reference strip. Chrome is full width of the column; the strip stays **fit-content** and **left-aligned** to the chrome’s left edge (`align-items: flex-start` on the column).

Overflow-thumb measurement reads the column’s `clientWidth`; measuring the fit-content strip itself causes a collapse feedback loop.

### Chrome dropdowns: no viewport-fixed panels

`.chrome` uses `backdrop-filter`, which makes `position: fixed` descendants position against the chrome box (not the viewport). Sorting/Collapse `Select` panels must stay `position: absolute` under their trigger (same pattern as `FilterMultiSelect`). Do not reintroduce viewport `left`/`bottom` math for fixed panels inside chrome.

### Dropdown outside clicks are swallowed

**File:** `src/lib/tools/dropdownOutsideClick.ts` (same idea as `src/actions/outclick.ts` for context menus)

When a dropdown is open, an outside `pointerdown` / `touchstart` / `click` must close it and be consumed (`preventDefault` + `stopPropagation`) so the gesture does not also select an image, press a button, etc. Do not revert to close-only listeners.

---

## Toasts stay above everything

**File:** `src/lib/components/Notifier.svelte`

Toasts portal to `document.body` and use `z-index: 10000` so they are never covered by modals (`Modal` is 210 and also body-portaled), pickers, or the operation banner. Do not lower toast stacking below other overlays.

---

## Modal form fields: match Input, don’t use vw min-width

**Files:** `src/lib/components/CustomFilterModal.svelte`, `src/lib/items/Input.svelte`

Modal textareas should match `Input` (inset fill, no border, `border-radius: 9px`). Prefer a form wrapper with `width: 500px; max-width: 100%` over `min-width: min(500px, 80vw)` — the vw min-width overflows the padded modal on mobile.

---

## Slideshow above nav arrows

**Files:** `src/routes/+page.svelte` (`.slideshow`), `src/lib/components/NavArrows.svelte`

Nav arrows are full-height hit targets (`z-index: 46`). The slideshow control must stay above them (`.slideshow` is `47`) or bottom-right clicks navigate instead of starting the slideshow.

---

## Settings header is sticky

**File:** `src/routes/settings/+page.svelte` (`.top`, `.settings::before`)

The Settings title + Back/Reset/Logout row stays sticky with a frosted, mask-faded bar (no hard border) so the page glow shows through. The accent radial lives on a **viewport-fixed** `::before`, not on the scrolling `.settings` background — do not put the gradient back on `.settings` or use an opaque sticky header that covers it.

---

## Search `[refs]` token

**File:** `src/lib/tools/searchReferences.ts`

`[refs]` (case-insensitive) expands to every current image-reference id, space-separated, in slot order — same client-side expansion path as `#n` / `[n]`. Empty refs → invalid (zero-result search), like a missing slot.

---

## Tag rename

**Files:** `src/lib/server/tags.ts` (`renameTagOnAllImages`), `PATCH /api/settings/tags`, Settings tag modal

Renaming a tag updates the MiscDB registry and rewrites `extradata.tags` on every image that had the old name (dedupe if both names were present). Color-only edits stay client/settings sync; name changes must go through the API.

---

## Search history must preserve SvelteKit history state

**Files:** `src/lib/tools/searchHistory.ts` (`writeSearchHistoryState`), `src/routes/+page.svelte`, `src/routes/settings/+page.svelte`

Gallery search/overlay history uses the History API. Always merge into the existing `history.state` so SvelteKit’s `sveltekit:index` is kept — bare `pushState`/`replaceState` that replace the whole state break browser back from `/settings` (URL changes, settings UI stays). Settings also re-`goto`s if popstate leaves `/settings` while the page is still mounted.

---

## Search input syntax highlighting

**File:** `src/lib/items/SearchInput.svelte`

The search bar uses a transparent `<input>` over a mirror `.highlight` overlay for colored syntax (keywords, unknown tags, abbreviated IDs).

### Do not bold overlay text

Highlight segments with **color only**. Never set `font-weight` (or other metrics-changing styles) on overlay spans such as `.keyword`.

Bold (or heavier weight) makes glyphs slightly wider than the transparent input text (weight 400). The caret is positioned from the input’s metrics, so it drifts relative to the visible overlay. This has been fixed more than once — do not reintroduce it.

```css
/* ✅ color only */
.keyword {
    color: var(--keyword);
}

/* ❌ causes caret drift */
.keyword {
    color: var(--keyword);
    font-weight: 600;
}
```

Overlay and input must share the same font family, size, line-height, padding, letter-spacing, and weight so glyph widths stay identical.

---

## Move/Copy folder context menus

**Files:** `src/lib/tools/folderMenu.ts`, `folderActionMenu()` in `src/routes/+page.svelte`

Move/Copy destinations are nested context submenus (one level per folder), not a flat breadcrumb list. Parent folders open a submenu; the first item is **Move here** / **Copy here** so the parent itself remains selectable. Leaf folders are direct actions.

When moving and every selected image shares one folder, that path is excluded as a destination but kept as a navigation-only submenu if it still has descendants.

---

## Bulk vectorize failure isolation

**File:** `src/lib/server/embeddings.ts` (`vectorizeImageBatch`)

One bad image must not fail the rest of an API batch.

- Encode images **one-by-one**; collect encode failures per id.
- Send only successfully encoded images in the batch API request.
- If the batch API still fails and the batch has more than one image, **retry each image individually** and record only the ones that fail.

Do not reintroduce a catch-all that marks every id in the chunk as failed on a single encode/API error — that interacts badly with bulk’s >50% abort threshold (`shouldAbortBulkRun` in `bulk.ts`).

---

## Video preview PNGs

**Files:** `src/lib/server/videoPreview.ts`, `src/lib/server/filemanager.ts`, `src/lib/server/imageUtils.ts`, `src/lib/server/responses.ts`

Videos (`.mp4`) use a same-basename companion PNG (`foo.mp4` + `foo.png`) for gallery thumbs (`preview=true`) and IMG embeddings.

- If the PNG is missing, `ensureVideoPreview` extracts the first frame via `@napi-rs/webcodecs` and writes it with sharp. Do not reintroduce bundled ffmpeg.
- Read rotation from the MP4 `tkhd` matrix via a **top-level atom walk** to load `moov` (end-of-file `moov` is common; naive end-chunk scans miss it). Matrix layout is `a b u / c d v / x y w` — `c` is at +12, not +8. Use ffmpeg’s `-atan2(c, a)`; when rotation is 90/270, swap stored tkhd size for display width/height.
- `VideoFrame.rotation` is often 0 for phone videos; do not rely on it alone.
- Index **preview generation before dimensions** for newly indexed videos: gallery `width`/`height` should come from the oriented PNG. Do not scan/repair all cached videos on every startup.
- `image.preview` must be set whenever the companion PNG exists — **including when EXIF is empty** (`readMetadataFromExif`). Linking must not depend on successful metadata parse.
- Watcher PNG attach (`updateImageMetadata`) must persist `preview` to MetaDB (and calc DB), not only memory.
- When serving `preview=true`, use an image `Content-Type`, not `video/mp4`.

Videos still without a preview after generation failure are skipped for vectorize (`canVectorizeImage`) — do not guess a missing `.png` path.

---

## Videos without preview are skipped for vectorize

**Files:** `src/lib/tools/misc.ts` (`canVectorizeImage`), `src/lib/server/bulk.ts`, `src/lib/server/embeddings.ts`

Videos embed from their preview PNG. If `preview` is empty, skip the video (do not count as a failure / do not guess a missing `.png` path and error). Still images are always eligible.

---

## Medium WebP encode and large wallpapers

**Files:** `src/lib/server/convert.ts`, `src/lib/tools/imageGeometry.ts`

`quality=medium` is WebP capped at **2MP** (`MEDIUM_MAX_TOTAL_PIXELS`), quality 90, effort 4. Low uses effort 4 as well; minimal stays at effort 6. Smart subsampling is always off (`smartSubsample: false`) — the Settings toggle and query/API knobs were removed. Stale `useSmartSubsampling` keys in localStorage / MiscDB are ignored.

libwebp with **effort 0** fails on large/high-entropy images (`webpsave: unable to encode` — PARTITION0_OVERFLOW). Do not set medium/low `effort` back to 0. The 2MP cap also keeps wallpaper encodes fast and within encoder limits.

Existing cache files are not auto-regenerated after tier setting changes — clear compressed images (or delete those `.webp` files) to rebuild.

---

## EXIF photo orientation

**Files:** `src/lib/server/convert.ts`, `src/lib/server/imageDimensions.ts`, `src/lib/tools/imageGeometry.ts` (`orientedDisplaySize`)

Camera JPEGs often store pixels in sensor orientation and put the real rotation in EXIF Orientation (1–8). Sharp does **not** apply that unless you call `.rotate()` with no angle.

- All sharp encode paths (WebP tiers, embedding, LLM) must `.rotate()` before resize/encode so pixels match display orientation and the Orientation tag is stripped from outputs.
- Indexed `width`/`height` must use `orientedDisplaySize` (swap sides for tags 5–8) so gallery aspect-ratio / masonry match what the browser shows for `quality=original`.
- Do not “fix” orientation only in CSS/`transform` — that breaks embeddings and cached WebP.

Already-generated WebP caches and already-stored dimensions are not rewritten automatically; clear compressed images (and re-index dimensions if tiles look stretched) after changing this behavior.

---

## Live view is image-only

**File:** `src/lib/items/ImageFull.svelte`

Live mode (`live` prop) shows the newest gallery image with **no metadata panel and no scrollable card chrome**. Parent leaves `data`/`info` undefined; ImageFull must also clear `stageInfo` while `live` so a previous fullscreen open of the same id cannot leak metadata into live.

---

## Fullscreen neighbor metadata preload

**Files:** `src/lib/requests/imageRequests.ts` (`getCachedImageInfo`, `preloadImageInfo`, `rememberImageInfo`), `src/routes/+page.svelte`, `src/lib/items/ImageFull.svelte`

Media neighbors preload in the stage; metadata must preload too. On arrow nav the media promote is often instant, so starting the info fetch only then leaves a frame with image and no panel (layout jump).

- Cache progressive info fetches; apply cache synchronously when selecting an image.
- Warm prev/next metadata while fullscreen is open.
- `stageInfo` updates when `data.id === stageId`; do **not** clear it on promote just because `data` has not caught up yet (live/closed still clear).
