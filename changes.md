# Changes

User-facing updates from the last 156 commits (`052193d` → `31118b8`), relative to the state before that range. Intermediate regressions fixed within the same work (for example, a bug introduced and patched in later commits in this batch) are folded into the feature they belong to and not listed separately.

---

## UI and theming

- **Darkroom theme** across gallery chrome, shared controls, and Settings: warm dark palette, glass surfaces, and gold accent styling.
- **Bottom search dock** restyled; fullscreen chrome, nav arrows, and IMG reference strip polished to match.
- **Modals and tag pickers** portaled above backdrop-filter layers so blur stacking stays correct.
- Shared form controls (buttons, inputs, selects, tags, context menus, dropdowns) updated for consistent Darkroom styling.

---

## Embeddings and semantic search

- **Embedding API** via sv-embed: bulk vectorize from Settings → Data management, with progress streaming and embeddings stored in sqlite-vec.
- **IMG search** for semantic image similarity: text queries, 64-character image-id references, optional similarity threshold and result-count limits (in either order), and `IMG ~` to skip the embedding search template.
- **Weighted IMG clauses** with spaced `+` and `-` separators; a leading spaced `-` runs negative-only similarity.
- **IMG reference strip**: slot syntax (`#n`, `[n]`) with a strip UI and client-side query expansion for multi-reference searches.
- **Multi-image IMG modes**: `avg`, `all`, `any`, `more`, `fringe`, `diff`, `shared`, `analogy`, and `affinity` for combined embedding queries.
- **ID** search keyword for direct lookup by image hash.
- **VIDEO** search keyword; videos are vectorized from their preview PNGs.
- **MMR** search for diverse result shaping; **PRUNE** prunes results to time-neighbors of a seed image.
- Image-to-image similarity moved from **SIMILAR** into **IMG**; **SIMILAR** remains for text-based similarity.
- **Temporary sort modes** (`similar`, `similar (inverse)`, `uniqueness`) auto-apply during IMG and SIMILAR searches; source/reference images pin to the top of results.
- **In-memory JavaScript scoring** for IMG search; use `k -1` to force full client-side scoring while keeping a threshold. The separate optimized-KNN setting was removed.

---

## Quick tag mode

- **Quick tag** for fast tagging from the gallery: apply preset tags image-by-image with minimal UI chrome.
- **Streamed operation progress** over SSE for quick tag, bulk tag, and move actions.
- Selected quick-tag tags persist in local storage; **Done** exits without a confirmation prompt.

---

## Bulk operations and LLM annotation

- **Bulk modal** for acting on the current search: move, copy, delete, and LLM annotate, with streaming progress.
- **MODEL** and **ANNOTATION** search keywords, backed by indexed model metadata and stored annotations.
- **Annotations** stored per image and shown in the fullscreen image view (annotation section moved to the top of the metadata panel).
- **LLM annotate** sends JPEG-encoded images (quality 80) for broader API compatibility and smaller payloads.
- **Bulk annotation progress** shows elapsed time, average/effective task time, ETA, and a fail count for empty LLM responses; hover the progress bar for detailed stats.
- **Saved annotate system instructions** in Settings: reusable presets selectable in the annotate dialog.
- **Extended bulk annotation modes**: modify, clear, and regex template transforms on existing annotations.
- **Bulk cancel** handling improved; search refresh is scoped to the tab that completed the operation.
- **Bulk actions** follow SSE session result order.

---

## Search and filtering

- **Unified query string**: custom filters and the search box share one expression; the standalone filter UI was removed.
- **Implicit clause chaining**: keyword-bearing filters chain without `AND` between them; use explicit `AND` only to separate keywordless positive-prompt terms. Prefix `\` on a keyword token searches for it literally in prompt text.
- **Richer date search**: mixed absolute and relative dates, boundary-aware day anchoring, and consistent keyword handling across input, API sorting, and SKIP behavior.
- **TAKE** keyword to cap result count after sorting and numeric SKIP (e.g. `landscape AND SKIP 10 AND TAKE 5`); **TAKE** can refill via session exclusions while keeping stable masonry order. SKIP and TAKE apply after random sort.
- **SIMILAR** search keyword plus **Show similar** and **Jump** context-menu actions for text-based similarity browsing.
- **Per-query similarity threshold** via an optional trailing number on `similar:` queries, overriding the global setting for that search. Long reference IDs abbreviate in the search input display.
- **Streaming search over SSE**: results arrive in throttled chunks with live match counts while scanning; client holds up to 1000 images. Prior results stay visible until the first chunk replaces them; scroll reset and visible count update with the grid swap rather than on reconnect.
- **SSE stream recovery** after disconnect or app backgrounding; completed search sessions accept reconnects within a 10-minute grace period.
- **History API navigation** for search snapshots and overlays (browser back/forward restores gallery state).
- **Search keyword help** modal in Settings with detailed syntax for every keyword.
- **Custom filters** replace the standalone folder filter. Define named filter expressions and toggle them from the image page; legacy folder filter settings migrate automatically (see `docs/migrations.md`). Default custom filters are empty on fresh installs; drag-handle reordering in Settings.
- **Optional Show NSFW filter** setting: hide NSFW UI and omit the NSFW search clause when disabled.
- **TAG** search (`TAG name`, `NOT TAG name`, regex patterns) for tag-based filtering.

---

## Exploration modes

- **Exploration modes** for varied browsing beyond plain search (sparse, similar, and unique collapse).
- **Unique collapse mode** deduplicates by content hash with a hash-to-image cache built at startup and maintained incrementally on file changes.
- **Exploration pools persist** across restarts (MiscDB + library fingerprinting) with incremental repair on deletes and moves.
- **Similarity exploration** uses positive and negative prompt text together, with a lower default threshold and a settings control to recalculate the similarity cache.
- **Exploration and LLM settings sync globally** so all clients share the same API config and similarity cache parameters.
- **Smart subsampling** toggle synced through global settings.

---

## Image tags

- **First-class image tags**: global registry (name + color), per-image assignments, Settings management, full-image editing, and bulk tag operations.
- **v4 schema migration** adds `extradata.tags`; default registry seeds `favourite` and `nsfw` on fresh installs.
- **TAG as…** in the selection context menu for quick bulk tagging.
- **Live gallery updates** when tags or annotations change on another client via SSE session notifications.
- NSFW and favourites are handled through tags; legacy in-memory NSFW/favourite tracking was removed.
- **Drag-handle reordering** for tags in Settings.

---

## Gallery and layout

- **True windowing** for the gallery: DOM size stays bounded at deep scroll; thumbnail virtualization and scroll-distance prefetch replace per-tile lazy loading.
- **Shimmer loading placeholders** for grid tiles and fullscreen view, with staggered delays in the grid; placeholders fade out after image decode.
- **Configurable image fade-in duration** in Settings (default 100 ms).
- **Compact overlay scrollbars** that stay unobtrusive until hovered.
- **Optional masonry layout** with stable resize handling, partial reflow from the first dirty index, and column ordering that follows the image list for all sort modes.
- **Image flow** and **Image spacing** settings replace the old layout toggles; mosaic mode supports edge-to-edge spacing with in-tile hover zoom.
- **Stored image dimensions** (indexed at ingest, backfilled on v3 migration) reserve thumbnail space to prevent grid layout shift while images load.
- Default **initial gallery load** increased to 50 images.

---

## Context menus, dropdowns, and settings UX

- **Context menus redesigned** to match dropdown panels: aligned submenus, hover open on fine pointers, click open on touch, ARIA roles, and smoother animations. Menus stay within the viewport when flipped or near edges; leaf clicks close immediately.
- **Dropdown animations** and shared outside-click handling for Select and FilterMultiSelect; opening one menu closes others.
- **Move/copy folder menus** load faster (flat API response + client cache), show paths as `folder > subfolder`, and hide the current folder when moving a selection already in one folder.
- **Typography standardized** on Inter and Source Sans 3 for consistent UI text rendering.
- **Data management** section moved to the bottom of Settings, separate from everyday preferences.
- **Responsive burger menu** for narrow topbar navigation; selection actions stay visible on narrow screens.
- **Minimal image quality tier** added; cached WebP folders migrate to tier-named paths (v5 migration removes legacy cache folders).

---

## ComfyUI and metadata

- **Improved Comfy metadata parsing**: subgraph prompts, seed detection on any node, README prompt title rules, and structured detail sections.
- **Comfy params** populated from structured workflow metadata with deduplicated multi-prompt handling and cleaner params text.
- **Seed display** ranked by node title prefix, title match, widget label, and heuristic relevance so the most identifiable seeds appear first.
- **Model detection** reads workflow inputs by filename extension (including subgraph and Hugging Face catalog paths) instead of brittle regex scraping.
- **Model metadata** consolidated into compact DB storage with a shared parser for ingest, search, and UI; models stored as labeled, UI-ready text for direct display and MODEL search. LoRA and auxiliary models sort after checkpoints and are excluded from the primary model display.
- **Stable Comfy params export order** by workflow node id so repeated runs produce consistent text.
- **Manual extradata recalculation** in Settings → Data management: rebuild derived metadata in background worker threads with a progress banner, without blocking the gallery. Annotations and tags are preserved.
- **Open workflow in ComfyUI** from the fullscreen image viewer (with optional API token).
- **Deferred Comfy metadata blobs** so fullscreen opens faster on slow networks; large workflow JSON loads on demand. Fullscreen metadata shows file extension and on-disk size when loaded.
- Fullscreen **metadata actions** moved into a context menu instead of inline buttons.

---

## Performance and infrastructure

- **SSE streams and cached search sessions** replace image polling for gallery updates.
- **SQLite** connections use consistent WAL tuning and immediate write transactions to reduce lock contention under load.
- **ffmpeg replaced with sharp** for image conversion and dimension probing; removes the bundled ffmpeg binary and uses lightweight MP4 parsing for video dimensions.
- **Unified search plan pipeline** with session-only pagination; improved error handling for broad queries and bulk vectorize.

---

## Live view and fullscreen

- **Live view** centers images when maximize fullscreen is enabled.
- Fullscreen **media load retries** on error instead of showing a broken image.
- Fullscreen loading placeholder sizing fixed with CSS grid.

---

## Other

- **Image prompt wrapper** for displaying prompts in the image view.
- Temporary thumbnail index debug overlay removed.
