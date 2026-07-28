# Project context for agents

Living notes for agents working on this repo. Read at the start of a session. Update when you learn or change a durable design decision, gotcha, or convention that a future agent would otherwise miss.

Keep entries short and actionable. Prefer linking to code over restating it.

---

## Regex search uses RE2 (ReDoS)

**Files:** `src/lib/server/searchRegex.ts`, `src/lib/server/searching.ts`

Gallery regex matching compiles via **RE2 only** (linear-time). JS `RegExp` can catastrophically backtrack on patterns like `conditioning(.*\n)*enable: true` or empty `[^]` as in `([^]*\n)*` against params with many newlines — one `test()` blocks the Node event loop so SSE/abort cannot run.

Patterns RE2 rejects (lookaheads, backreferences, empty `[^]`, unterminated classes, …) fail at compile with `UnsupportedSearchRegexError` — **do not fall back to JS `RegExp`**. A true per-match timeout without another thread/process is not possible: once `test()` runs on the main thread, nothing else (including abort) runs until it returns.

Abort checks in `searchImagesStreaming` run **every image** (and still yield every `yieldEvery`); that only helps when matching itself cannot block the loop.

Invalid/unsupported regex failures are sent on the image stream as `{ type: 'error', message }` (`stream/+server.ts`). The gallery debounces that toast (`REGEX_ERROR_TOAST_DEBOUNCE_MS` in `+page.svelte`) so typing through incomplete patterns does not spam notifications.

---

## Search dock width

**Files:** `src/routes/+page.svelte` (`.dock`, `.dock-column`, `.chrome`), `src/lib/components/ImageRefStrip.svelte`

`.dock-column` is the centered, max-width (`--search-chrome-max-width`, 52rem) wrapper for search chrome + IMG reference strip. Chrome is full width of the column; the strip stays **fit-content** and **left-aligned** to the chrome’s left edge (`align-items: flex-start` on the column).

Overflow-thumb measurement reads the column’s `clientWidth`; measuring the fit-content strip itself causes a collapse feedback loop.

### Chrome dropdowns: no viewport-fixed panels

`.chrome` uses `backdrop-filter`, which makes `position: fixed` descendants position against the chrome box (not the viewport). Sorting/Collapse `Select` panels must stay `position: absolute` under their trigger (same pattern as `FilterMultiSelect`). Do not reintroduce viewport `left`/`bottom` math for fixed panels inside chrome.

Non-chrome `Select` panels use `position: fixed` + `getBoundingClientRect` so overflow/clipping ancestors (settings CSS columns, collapse wrappers) cannot truncate the menu.

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

**File:** `src/routes/settings/+page.svelte` (`.top`, `.top-inner`, `.settings::before`)

The frosted sticky bar is **full viewport width** so it doesn’t cut a hard edge against the page glow. Title/actions sit in `.top-inner` (`max-width: 56rem`, centered). The accent radial lives on a **viewport-fixed** `::before`, not on the scrolling `.settings` background — do not put the gradient back on `.settings` or use an opaque sticky header that covers it.

## Settings cards layout

**File:** `src/routes/settings/+page.svelte` (`.settings-main`, `.cards`, `.wrapper`)

- Body content (help + cards) is capped in `.settings-main` (`max-width: 56rem`, centered).
- `.cards` uses CSS multi-column masonry (`column-count: 2`, `break-inside: avoid` on cards). Keep modals **outside** `.cards` so they aren’t column items.
- Cards are `display: flex` with `overflow: hidden` (not `inline-flex` / `overflow: visible`) so expanded collapsibles cannot paint into the neighboring column.
- Non-chrome `Select` panels are viewport-fixed (see Select note above) so card/column overflow cannot clip them.
- Collapsible `.wrapper .inner` stays `overflow: hidden` (open and closed). Do not flip to `visible` after open — that reintroduces cross-column overlap (Custom Filters over PWA). Open state also sets `min-height: min-content` on `.inner` so the card claims height in the column layout. Flyout extras use `.join-prev` so the lead rule isn’t doubled on top of the toggle row’s border.

---

## Search `[refs]` token

**File:** `src/lib/tools/searchReferences.ts`

`[refs]` (case-insensitive) expands to every current image-reference id, space-separated, in slot order — same client-side expansion path as `#n` / `[n]`. Empty refs → invalid (zero-result search), like a missing slot.

### Custom (`temp:…`) references

**Files:** `src/lib/stores/imageRefStore.ts`, `src/routes/api/images/temp-embed/+server.ts`, `src/lib/server/searching.ts`

Clipboard paste / OS file drop creates custom refs: client downscales to embedding size before `POST /api/images/temp-embed` (avoids adapter-node 512KB / 413), which encodes+embeds once and returns `{ id: "temp:<uuid>", embedding }`. Server keeps nothing. Client stores the vector **and a compact JPEG data-URL `preview`** on the ref in localStorage (same lifetime as gallery refs). Search only attaches `tempEmbeddings` (base64 Float32) when the expanded query contains `temp:` ids — never on ordinary gallery loads. Do not write temp vectors into EmbeddingDB. If localStorage quota is exceeded, previews are dropped first so embeddings still persist. `BODY_SIZE_LIMIT` for adapter-node must be a plain integer (bytes); suffixes like `10M` become `10` via `parseInt` and break every POST with 413.

---

## IMG shared negatives

**Files:** `src/lib/tools/searchParsing.ts` (`parseSharedImgModeTokens`), `src/lib/tools/vectorMath.ts` (`scoreImgSharedMode`), `src/lib/server/searching.ts`

`IMG shared <pos…> - <neg…> [threshold|k]` — one spaced `-`, then space-separated negative hex ids (threshold/k stripped first). Shared query is still inverse-variance over positives only; score is `(sim(shared,x) − max sim(neg,x) + 1) / 2` (same remap as weighted IMG +/-). Do not fold negatives into the variance pool. Multiple `-` tokens are not mode syntax.

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

## Image source roots and indexing

**Files:** `src/lib/server/paths.ts`, `src/lib/server/filetools.ts`, `src/lib/server/filemanager.ts`, `src/lib/server/workers/indexingWorkerPool.ts`

- Configure one folder with `IMG_FOLDER`, or several with `IMG_FOLDERS` (semicolon-separated absolute paths). Nested roots are ignored.
- **Single root:** `hashPath` / `folder` stay relative-only (existing DB ids and WebP caches remain valid).
- **Multi root:** `hashPath` includes `rootKey\0relative`; `folder` is `rootKey/...`. Move/copy cannot cross roots.
- Bulk indexing runs metadata+dimensions on a worker-thread pool; SQLite writes stay on the main thread via coalesced flushes (`MetaCalcDB.setAllNew` for new rows). Each flush calls `notifyMetadataChange` so the gallery SSE updates during first-run index.
- Do not `mkdir` missing source roots (external SD output dirs). Do not open `better-sqlite3` from worker threads.

---

## Generation duration in basic metadata

**Files:** `src/lib/tools/metadataInterpreter.ts` (`getDuration`), `src/lib/items/ImageFull.svelte` (`extractBasic`)

When `extra` JSON includes a finite numeric `duration` (seconds), the fullscreen basic metadata line appends it after the date, rounded to one decimal (`… · 15.4s`). Omitted when missing or not a finite number. Requires blobs loaded (`extra` present).

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

---

## SV Generate panel (svgen)

**Files:** `src/lib/svgen/**`, `src/lib/server/svgen/**`, `src/routes/api/svgen/**`, `src/lib/components/Webui.svelte`, comfyui-sv-nodes `workflow_convert.py`

Isolated Generate feature inside the side flyout (tabbed with WebUI iframe). Keep gen logic in `svgen/` — thin hooks only in layout/settings/ImageFull.

- **Convert on Comfy** via `/sv_sd_browser/convert` (proxied); do not reimplement UI→API conversion in TypeScript. Converter (`workflow_converter.py`) must **length-match** when zipping `widgets_values` → names (same idea as panel `alignSlotNames`): use unwired names when counts match (Danbooru omits wired `seed`); use full mapping when counts match that (linked seed still present as a stale value — skip assigning the linked name, do not drop the slot). Always preferring unwired shifts seeds onto combos (`scale_mode`, `sampler_name`, …).
- **Comfy ↔ panel bridge:** sd-browser → Comfy graph is `POST /sv_sd_browser/open_workflow` (Comfy polls `pending_workflow`) via `/api/comfy/open-workflow` (image id **or** raw workflow JSON — Generate panel burger **Open in Comfy**). Reverse: Comfy SV Gen panel **sd-browser** button → `POST /sv_sd_browser/open_in_panel`; sd-browser polls `/api/svgen/pending-panel-workflow` → `pending_panel_workflow` (TTL ~60s, one-shot consume) and loads into the Generate panel (opens flyout + Generate tab).
- **Progress:** sd-browser proxies Comfy WS server-side and streams events to the panel via `/api/svgen/events` (SSE). Do **not** open a browser WebSocket to Comfy — Comfy’s host/origin check returns 403 when the UI origin differs (e.g. `localhost:8000` vs `127.0.0.1:8188`). HTTP mutate paths stay proxied too.
- **Flyout tabs:** show WebUI | Generate only when both are available; hide tabs if only one mode is on. Active tab is localStorage (`flyoutTab`). Gen panel can be disabled in Settings (`svgenUi.enabled`). Gallery image context menu shows **Open in panel** only when svgen is enabled **and** the flyout is open (`flyoutState`); ImageFull metadata menu shows it whenever svgen is enabled (and opens the flyout). **Use params** (below Open in panel) appears when the flyout is open **and** an active Generate session exists — it copies exposed UI values from the image’s workflow onto the current session (same card identity matching as layout inherit; best match wins; does not open a new session or touch graph internals). See `paramsInherit.ts`.
- **Layouts:** no masonry — each column is its own scroll container. Card placement is stored **per column count** (auto 1 & 2; 3-col layout only after user drops a card into col 3; remove 3-col layout when col 3 is empty). Collapse / field order / hidden fields are shared across column counts. **Initial auto order** (`cardOrder.ts`): seeds → models → prompts → negative prompts → sampler → resolution → lora → images → others (alphabetical title tie-break). **Unsaved opens** (image / Comfy) and **Use params** (`paramsInherit.ts`): identity-match cards via `layoutInherit.matchCardsByIdentity` — strictest pass first, then looser passes over remaining unmatched only (exact type+title → type+loose title → unique type → unique title). Remap layout / field prefs by those pairs; Use params copies exposed widget values the same way. Field order / hidden / int-control keys remap by widget-name fallbacks so adding widgets in Comfy does not break node matching.
- **Field discovery** (`src/lib/svgen/fields.ts`): expand subgraph `proxyWidgets` (values from outer or inner `widgets_values`); map slots via `object_info` like SethRobinson converter; strip control companions (`fixed`/`randomize`/…) before zip; **align names to value count** — when a force_input (e.g. Danbooru `seed`) is wired it is omitted from `widgets_values`, so zip against unwired names (not full object_info) or boolean `image` lands on STRING `rating` and renders as text `"false"`; **never reuse a widget name across slots** (pad from node inputs instead — avoids duplicate labels like a second `random`); hide `_` name/label, wired inputs, `$$canvas*` (check outer name **and** inner/`schemaWidgetName` / label — remapped promoted canvas must not become a string field), control_after_generate, SD Browser `search`. Runtime `boolean` values win over a mismatched STRING schema. Image-display nodes (`SV-Danbooru*`, PreviewImage, …) always show the output preview slot and never use the single-field inline title row. Subgraph shells that promote `$$canvas-image-preview` also get `imageDisplay` unless they already have an image/SD Browser picker field. Title = custom title → subgraph name → `display_name` → type. Proxy field labels: outer/inner input rename → widget name only — **never** the inner node title (LORA `PrimitiveBoolean` titled "Enable LORA" must stay `enabled` / `value`, not the title). When several proxies share an inner name (`value`), Comfy promotes them as `value` / `value_1` / `value_2` on the outer node **in outer input socket order**, which can differ from `proxyWidgets` order (Sampler lists Steps before Seed, but Seed owns wired `value` and Steps is `value_1`). Resolve outer names via label/title→outer-socket match (`resolveOuterProxyWidgetNames`), not list occurrence — occurrence hid Steps and shifted Start/Switch onto the wrong labels; also do not let an unlabeled proxy steal a differently-labeled leftover socket (Hires `enable` vs wired `seed`). Schema lookup still uses the inner widget name. Combo options: legacy `[[…], opts]` **and** modern `["COMBO", { options: […] }]` (V3) — without the latter, scale_mode/distribution look like plain text. **CustomCombo** declares `choice` as COMBO with empty options in object_info; the frontend fills values from sibling `option*` string widgets. Saved layout is `[choice, index, option1, …, ""]` (`customComboChoiceOptions` in `fields.ts`) — without reading those, Instruction Select / other CustomCombo proxies render as plain text. Number `step`: prefer `step2`, else use object_info `step` as-is — do **not** `/10` (that scale is only for live Comfy canvas `widget.options.step`). Horizontal scrub: `src/actions/numberDrag.ts` (same threshold/axis-lock/step alignment as original `attachNumberDrag`).
- **Widget value pairing is positional** (`values[i]` ↔ widget names[i]). Do **not** skip/reorder by type or min/max — that shifted LLMArgs `max_tokens` 1000 onto `presence_penalty` (see test metadata: UI `widgets_values` `[…, false, 0, 1000, 0.8, false]` vs API `presence_penalty: 0, max_tokens: 1000`). Pick the name list by **length match**: full list; else unwired; else full minus linked `forceInput` (Danbooru omits force_input `seed`; Resolution keeps stale linked `base`=768 but omits force_input `seed`). Linked names **consume** a value and don’t assign. Control companions (`fixed`/`randomize`/…) are stripped only because they aren’t API inputs — UI show/hide of freeze controls is separate. **Do not** treat inner links to subgraph inputNode (`-10`) as hidden — that emptied Sampler cards. Hide a proxy only when the *outer* socket is linked. Writes prefer outer for promoted widgets; patch `outerValueIndex` when known.
- **Convert + subgraphs:** `workflow_converter.py` applies outer `proxyWidgets` onto expanded inners **positionally**, then the same positional zip for API mapping (including non-proxied inners like `SV-LLMArgs`). Coerce bool→0/1 for FLOAT/INT when the saved array has a bool in a numeric slot (LLMArgs `repetition_penalty: false` → `0.0` in Save API).
- **INT control-after-generate:** Only slots that had a `fixed|randomize|…` companion in `widgets_values` show freeze + mode controls (`SvGenIntControl`) — not every INT (Primitive “Integer” has no companion; “Int” does). Modes live in layout `intControlModes` (default `randomize`); freeze/last-used live in the open-session bag (`svgenFrozenSeedsStore` / `svgenLastUsedSeedsStore`, restored with localStorage tabs). After each queued prompt, advance values via `applyIntControlsAfterQueue` and re-convert for the next queue item — do not submit the same seed N times when mode is randomize/inc/dec.
- **Field chrome:** match main-app recipes, not a separate kit — recessed inputs (`rgba(0,0,0,0.22)` + inset shadow, no border, ~7px radius), borderless `accent-soft` toolbar/Generate buttons, status via `--ok-tag`/`--danger` (no blue fallbacks). Cards keep the lighter glass mix + inherited title color (not the darker settings filter-card / accent-header treatment). Header **enable** is a pill only (no “enable” text); card headers use the compact pill (visible even when collapsed). Keep cards dense (tight header/title, 6–8px padding, ~24px control height). Combos use folder-tree picker (`SvGenComboPicker`); menu width up to 320px (not clamped to narrow field); folder rows have no trailing `/`. Combo search is scoped to the **current folder + descendants** (not the whole tree once you’ve drilled into a submenu). Submenu path is remembered per field across close/reopen (and remounts via a module Map keyed by field DOM id); Back still climbs; stale folders are clamped when options change. Search autofocuses on open and when entering/leaving a submenu, only for fine pointer (`(hover: hover) and (pointer: fine)`) so mobile doesn’t pop the keyboard. Card **Edit** (hide/reorder fields) only appears when there are 2+ body widgets — enable toggle does not count. **Hidden fields** stay on the card data (`applyFieldOrderAndHidden` only reorders); normal view omits them, Edit keeps them dimmed with a **Show** toggle (do not strip them before the card or Edit cannot restore them). **Tab order in cards:** only widgets (value inputs / combo / image pickers / enable pill). Card chrome uses `tabindex="-1"` — drag handle, collapse title, Edit, reorder/hide, seed freeze, int-control trigger (`DragHandle` is `-1` globally).
- **Textarea autosize** (`SvGenField.svelte`): reactive remasure must read `field.value` (then `tick()` → `autosize`). Depending only on `useTextarea` leaves height stale after Use params / other store-driven value writes; `on:input` alone does not cover those paths.

- **Image pickers:** match original panel — clickable preview + modal grid. `sd_browser_image` → `SvGenSdBrowserImagePicker` (SSE search via `/api/images/stream`, sort, upload→`local:` via Comfy). `image` (LoadImage) → `SvGenComfyImagePicker` (combo values grid + Comfy upload). Proxies: `/api/svgen/comfy/upload`, `/api/svgen/comfy/view`. Hidden `search`/`random` companions are written via field `companions` metadata. Authorized Comfy preview bytes use a shared LRU blob-URL cache (`peekAuthorizedBlobUrl` / `fetchAuthorizedBlobUrl`); do **not** revoke on unmount or clear the `<img>` before the next URL is ready — layout/collapse/reorder churn remounts pickers and used to flash every preview. Invalidate cache only after overwrite upload. SD Browser picker modal is hosted from `Webui.svelte` (outside the flyout) via `sdBrowserPickerStore` + `SvGenSdBrowserImageModal`, and appended to `document.body` on mount — in-tree `position: fixed` inside the flyout `overflow: hidden` pane clips the dialog (blur stays, content vanishes), and field remounts must not own the open state. Modal grids use max-content rows and non-shrinking `aspect-ratio: 1` thumbs; do **not** use `height: 0` + `padding-bottom: 100%` — it collapses thumbs into horizontal strips. Output preview placeholders fill the card width with a 120px minimum height; they are not square. **SD Browser random mode** shows the last `executed` pick for that node (same `svgenNodePreviewsStore` as output cards); until the first run it stays “Random from search” / “Random (all images)”.
- **Output node previews** (`PreviewImage`, `SV-Danbooru*`, …): cards with `imageDisplay` show the last Comfy `executed` output via `/api/svgen/comfy/view` (same auth blob cache as pickers). Subgraph shells that promote `$$canvas-image-preview` also set `imageDisplay` when they have no image picker field; preview lookup accepts converter ids `outerId:innerId`. `SV-PreviewText` is `textDisplay` — same keep-even-with-no-fields rule; text comes from `executed` `output.text` (tuple/array) into `svgenNodeTextPreviewsStore`. `SvGenPanel` handles `onExecuted` → preview stores keyed by `sessionId\\0nodeId` (`nodePreviews.ts`); match both `node` and `display_node`; map `prompt_id` → session at queue time so mid-run session switches stay correct. Cleared when the session closes; mid-step latent binary WS frames are still dropped by the bridge. Also feeds SD Browser random-mode picker previews.
- **Card reorder:** pointer drag via same geometry as tags/filters (`sortableGeometry` + `DragHandle` ghost/FLIP) in `SvGenColumns` — not HTML5 DnD. While dragging, holding near the top/bottom of a column auto-scrolls that column (`AUTO_SCROLL_*` in `SvGenColumns`) so long lists stay reachable.
- **Field reorder (Edit mode):** same pointer drag as cards/tags — `SortableList` (`axis="xy"`, `asGrid`) + `DragHandle` in `SvGenCard` (not ↑/↓ buttons). Keys are `innerNodeId\\0widgetName\\0valueIndex` — never bare `widgetName` (proxy slots collide). Drag is disabled outside Edit; enable-pill field keeps its slot while body widgets reorder.
- **Column scrollbars:** fade-on-idle overlay via `src/actions/overlayScrollbar.ts` (same pattern as ImageFull); thumb blends toward `--bg`, not bright white native bars. Track is shifted into the column gap / outer padding (`right: -0.4rem`) so it doesn’t sit on cards — do not add card-side gutter padding for this.
- **Generate toolbar** lives with the Generate button (bottom): Stop (■), queue count `x`, Infinite, Keep one queued. Top bar is session dropdown + Save / Queue / burger (Open in Comfy, JSON). Queue list shows running → pending → history with durations (WS `execution_*` timestamps); list scrolls after **4** visible rows (`SvGenQueueList`). Infinite tops up to 1 (or 2 with Keep one queued); turning Infinite off while Keep one queued clears panel-owned pending prompts.
- **Toolbar / picker dropdowns:** SD Browser sort (`SvGenSdBrowserImageModal`) uses shared `Select` (viewport-fixed panel). Modal styles must target `:global(.select .trigger)` (not bare `.trigger`) so they beat Select’s scoped `border: none` / `padding: 0` / `font-size: 1em` — otherwise Sort renders oversized and unbordered next to Upload/Close. Session switcher is custom recessed dropdown in `SvGenQueueBar` (open sessions + saved list).
- **Multi-open sessions (A1):** `svgenOpenSessionsStore` + helpers in `sessions.ts`. Session dropdown replaces name field + Load. Menu = open (switch/close) → separator → saved (open copy / × delete). Deleting a saved workflow asks via shared `askConfirmation` before `DELETE`. Opening saved creates an **unlinked** in-memory copy (`workflowId: null`) with layout cloned from the saved id; name uniquified among open sessions (`Name (2)`…). Save always opens `SvGenSaveModal` (overwrite warning by saved name); POST uses existing id when names match. After save, `workflowId` is set only so layout can auto-persist. Outside opens (image / Comfy) **add** a session. No dirty UI. No Comfy status in the bar — `notify()` on offline / convert loss / generate failures.
- **Open-session localStorage:** `syncOpenSessionsWithLocalStorage` (`sessions.ts`, key `svgenOpenSessions`) restores the open bag + hydrates the active session into live stores. Live session/layout/seed edits flush into the bag (suspend that flush while switching/hydrating so `activeId` cannot lag). Writes are debounced; `pagehide`/`beforeunload` flush immediately. Saved library workflows stay in SQLite; this only restores unsaved open tabs across refresh.
- **Persistence:** `LOCAL_DATA/svgen.sqlite3` (saved workflows + layouts), not MiscDB. Open tabs: localStorage as above.

---

## Fullscreen "Show original" URL reactivity

**File:** `src/lib/items/FullscreenMediaStage.svelte`

Svelte 4 tracks `$:` dependencies from the statement AST only — reads inside helpers like `mediaUrlFor()` do **not** count. `mediaQuery` (and thus `showOriginal`) must appear lexically in the `$: panelEntries = …` expression (inline `` `/api/images/${id}?${mediaQuery}` ``). Putting the helper call in the `$:` block or only in the `{#each}` template is not enough; "Show original" will keep serving the compressed URL. Panel keys should include `mediaQuery` so quality flips remount panels.

---

## Gallery hotkeys

**Files:** `src/routes/+page.svelte` (`keylistener`, `openImage`), `src/lib/components/FilterMultiSelect.svelte` (`openAndFocus`)

- `F` toggles flyout only without Ctrl/⌘/Alt (so browser find stays usable).
- `Ctrl/⌘+S` cycles `sortingOptions` (including temporary similar/uniqueness when present).
- `Ctrl/⌘+D` toggles Filters via `toggleOpenAndFocus()` — arrow keys follow visual direction (DOM index flips when `dropUp` / column-reverse); Space/Enter toggle (native button).
- Plain letter/arrow/Space shortcuts skip when a text field is focused; Ctrl/⌘ chords do not.
- Opening fullscreen from the grid (`openImage`) must `blur()` `document.activeElement` — gallery `Clickable` `preventDefault`s mousedown, so focus would otherwise stay in the flyout (Generate inputs / WebUI iframe) and arrows/Space would not reach the gallery listener.
