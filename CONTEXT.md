# Project context for agents

Living notes for agents working on this repo. Read at the start of a session. Update when you learn or change a durable design decision, gotcha, or convention that a future agent would otherwise miss.

Keep entries short and actionable. Prefer linking to code over restating it.

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

## Bulk vectorize failure isolation

**File:** `src/lib/server/embeddings.ts` (`vectorizeImageBatch`)

One bad image must not fail the rest of an API batch.

- Encode images **one-by-one**; collect encode failures per id.
- Send only successfully encoded images in the batch API request.
- If the batch API still fails and the batch has more than one image, **retry each image individually** and record only the ones that fail.

Do not reintroduce a catch-all that marks every id in the chunk as failed on a single encode/API error — that interacts badly with bulk’s >50% abort threshold (`shouldAbortBulkRun` in `bulk.ts`).

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
