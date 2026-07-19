# Stable Diffusion Image Browser

A very optimized standalone image browser (not a webui extension) made with Node and SvelteKit. Browse large local libraries with fast search, tags, semantic image search, bulk tools, and ComfyUI / A1111 metadata support. After initial indexing, supports scrolling and searching through hundreds of thousands of images instantly.

<details>
<summary>Preview images</summary>

![sd-browser-preview](https://github.com/SirVeggie/sd-browser/assets/32365239/bcdcc0c2-4a2f-4e4c-98af-6709086ca0b6)
![sd-browser-preview-full](https://github.com/SirVeggie/sd-browser/assets/32365239/e8481be4-3333-410c-ad1c-b621b1b462b2)
![sd-browser-preview-metadata](https://github.com/SirVeggie/sd-browser/assets/32365239/680b6a6b-6c90-49f3-9e82-fd8d812caa94)
![sd-browser-preview-webui](https://github.com/SirVeggie/sd-browser/assets/32365239/df246a90-ba4a-4d5f-85c8-f7b0987fa4a0)
![sd-browser-preview-comfy](https://github.com/SirVeggie/sd-browser/assets/32365239/623983a7-2771-4afa-a7d9-8b4d7abb5348)
</details>

## Installation

1) Install latest version of Node.js  
2) Clone or download the project.  
3) Copy the `.env.example` file and rename it to `.env`  
4) Set `IMG_FOLDER` to the output folder of stable diffusion (or any other folder containing images)  
5) Run command `npm run setup` using command line in the project root folder  
6) Run command `npm start` to start the application  
7) Open `localhost:[PORT]` in your browser (default `PORT` is `4200`)

When starting for the first time, the images will be indexed. Depending on the amount of images, this can take seconds (5,000 images), or a tens of minutes (200,000+ images). Indexing speed will also depend on if you're using txt files or embedded image metadata, as well as the speed of your drive. My SSD takes about 4 minutes for 230,000 pngs with exif metadata.

During indexing, images will gradually become available for viewing in order from newest to oldest (by file modification date).

After the indexing, the following starts will only take a couple of seconds.

It is highly recommended to install and run my [multimodal embedding server](https://github.com/SirVeggie/sv-embed) as well to enable searching by pure visual content descriptions.

## Updating

1) Pull latest changes with `git pull` in the project root folder (if you used git to download)  
2) Run command `npm run setup`  
3) Start the application with `npm start` like normal

## Authentication

Simple password authentication is supported to prevent third parties from browsing images (when port forwarded for example).  
The environment variable `PASS` defines the current password. Deleting `PASS` from the `.env` file or setting it as blank disables authentication.  
The browser will remember the password, but it can be cleared by pressing `logout` from the settings page.

## Notes

Subfolders under `IMG_FOLDER` are scanned automatically, but setting multiple separate source folders is currently not supported.

Symlinks work, but currently do not support file watching, so the images only update during startup. However switching the direction of the symlink so that the original folder is inside the main image browser, and the link is outside does work.

Optional `.env` values (requires https://github.com/SirVeggie/comfyui-sv-nodes):

- `COMFY_URL` — ComfyUI base URL for **Open in ComfyUI** (defaults to `http://127.0.0.1:8188`)
- `COMFY_TOKEN` — ComfyUI-Login API token, if your Comfy instance requires it

### ~ I'm open to feedback! ~

# Usage

## Gallery

The gallery uses windowed rendering, so large libraries stay responsive no matter how long you scroll down. It is as responsive at 100k images as it is at 1k.

Layout options in Settings include grid or masonry flow, image spacing, and image quality tiers for great scrolling/network performance.

## Exploration modes

Beyond plain search, exploration modes can help limit the image set to unique images, so it's easier to browse for inspiration. There are also some keywords that a geared towards exploration of unique images, like MMR and PRUNE.

## Tags and annotations

Images support custom tags managed in Settings. Tags can be edited per image, searched with the `TAG` keyword, and applied in bulk from the selection menu.

**Quick tag** mode tags images one-by-one from the gallery with a minimal toolbar. Pick tags once, then click through results; tagged images leave the queue until you press Done.

**Annotations** are per-image notes stored by this app (not in file metadata). Search them with `ANNOTATION` / `AN`, edit them in fullscreen view, or generate them in bulk with an LLM.

## Searching

The app has a main search bar for regex search, as well as various special keywords for different functionalities. Searches can also be saved into custom filters which can be applied easily from a multi-select dropdown, as well as an easy optional nsfw toggle.

Results stream in over SSE with live match counts. Browser back/forward restores search state. For full syntax reference, open **Search keyword help** in Settings.

### Dates

The search can be restricted into a specific time frame using the `DATE` or `DT` keyword with special syntax.

- Date format: `2024.12.24` | `2024.12.24 23:59` | `2024.12.24 23:59:59`
- Unix timestamp (milliseconds): `1731436728000`
- Offset format: `-1y` | `-1m -10d 12h` | `-1y 10:00`
- Absolute and relative parts can be combined: `2026.6.27 -5h`
- Date range: `TO` keyword
- Relative hour offsets by themselves stay anchored to the current time
- Absolute dates and relative date offsets (`y`/`m`/`d`) anchor to full days unless an explicit time is specified: start at 00:00:00, end at 23:59:59.999

#### Examples

```
DT -1d -12h | between 36 hours ago and now
DT -2d TO -1d | full calendar days from two days ago through yesterday
DT 2024.6.1 14:00 | between 2024.06.01 14:00:00 and now
DT 2026.6.27 -5h | the full boundary day reached by subtracting five hours from 2026.06.27
DT -1y 10:00 TO -5m -2d 18:00 | from 10:00 one year ago until 18:00 on the day from -5m -2d
DT -1y TO -6m | from start of day one year ago through end of day six months ago
DT 2023.01.01 TO 1731436728000 | between 2023.01.01 00:00:00 and 2024.11.12 18:38:48
```

### Text

Default search settings use Regex matching and keywords. All searching is case insensitive.

By default, all matches are performed on the positive prompt only. This can be modified by keywords.

The current version supports 3 matching modes:
- Regex: powerful text matching syntax (recommended)
- Words: Matches given words in any order
- Contains: Matches the given value anywhere in the prompt

#### Examples (Regex)
Search `red` matches `scarred` and `a red cap`  
Search `\bred\b` matches `a red cap` and `(red)` but not `scarred` (\b is a word boundary character)  
Search `happy (girl|boy)` matches `a happy girl` and `a happy boy`.

#### Examples (Words)
Search `cute girl` matches `cute, girl` and `girl, ..., cute`, but does not match `cuteness`  
Search `red` matches `a red cap` and `(red) cap` but not `scarred`

#### Examples (Contains)
Search `cute girl` matches `a cute girl` but not `cute, girl`  
Search `red` matches `scarred`

## Keywords

Available searching keywords are `AND, NOT, ALL, NEGATIVE | NEG, FOLDER | FD, PARAMS | PR, DATE | DT, MODEL | MD, ANNOTATION | AN, TAG, SIMILAR | SM, IMG, ID, VIDEO | VID, SKIP, TAKE, MMR, PRUNE`. Keywords are case insensitive. Prefix keywords can be stacked in any order within a clause: `NOT FOLDER img2img` and `FOLDER NOT img2img` are equivalent.

### Combining clauses

Keyword-bearing filters are chained implicitly. When a recognized keyword starts a new filter, you do not need `AND` before it.

Examples:
- `landscape FOLDER txt2img` — landscape in the positive prompt and image in the `txt2img` folder
- `red NOT girl` — red in the positive prompt, excluding images matching `girl`
- `IMG misty forest MMR 10` — embedding similarity, then MMR result shaping

Use explicit `AND` only when separating two positive-prompt searches:
- `red AND blue` — two separate positive-prompt conditions
- `red blue` — one positive-prompt condition

Prefix a keyword with `\` to search for that word literally in prompt text instead of starting a new clause:
- `girl \and boy` — matches the phrase `girl and boy` in the positive prompt

`AND`: Explicit delimiter between positive-prompt clauses  
Example: `red hair AND man`

`NOT`: Inverts a condition  
Example: `red hair NOT girl` or `red hair AND NOT girl`

`NEG`: Condition matches negative prompt  
Example: `painting NEG landscape`

`PARAMS`: Condition matches parameter portion of prompt (Sampler: xxx, etc.)  
Example: `landscape PARAMS sampler: euler a`

`FOLDER`: Matches the subfolder the image is located in  
Example: `FOLDER txt2img` or `landscape NOT FD img2img|grid`

`ALL`: Condition matches the entire metadata (and folder name) instead of only the positive. *Very* slow for ComfyUI meta.  
Example: `red hair NOT ALL girl|boy` (girl or boy not mentioned in any part of the prompt)

`DATE`: Uses special date syntax to restrict search to some time frame (examples above)

`MODEL`: Matches detected model names from image metadata  
Example: `MD pony`

`ANNOTATION`: Matches per-image annotations stored in this app  
Example: `AN favorite lighting`

`TAG`: Matches assigned image tags  
Example: `TAG landscape` or `NOT TAG hidden`

`ID`: Matches specific image ids (64-character hashes) or pinned image references  
Example: `ID abc123… def456…` or `ID #2 #3`

`VIDEO`: Keeps only video files  
Example: `VID`

`SIMILAR`: Finds images with similar **prompt text** to a reference image (`#n`, `[n]`, `[refs]` for all slots, or hex id). Optional trailing number sets the similarity threshold. Calculates a fuzzy text similarity score against each candidate from the positive prompt.  
Example: `SM #1 0.6`

`SKIP`: Skips the first N results after sorting. Useful to see later images without scrolling.  
Example: `landscape SKIP 20`

`TAKE`: Limits results to the first N matching images after sorting (and after any numeric SKIP). Useful for bulk editing images.  
Example: `landscape TAKE 20` or `landscape SKIP 10 TAKE 5`

`MMR`: Returns a diverse subset of embedding-ranked matches. First number is result count; optional second is candidate pool size. Keep the values low, it's quite a slow algorithm.  
Example: `IMG cat AND MMR 100 1000`

`PRUNE`: After other filters, prunes embedded matches to a count by dropping near-duplicates in time order.  
Example: `IMG red dress AND PRUNE 200`

## Embeddings and IMG search

Semantic image search uses embeddings stored in sqlite-vec. Configure an embedding API in Settings → **LLM / embeddings** ([sv-embed](https://github.com/SirVeggie/sv-embed) or llama.cpp with a vision model), then run **Bulk vectorize**. The sv-embed is my project that uses a multimodal embedding model that is tested to work great for this use case.

`IMG` searches by embedding similarity:
- Bare `IMG` matches images that already have embeddings.
- Text runs a text-to-image embedding search (optional search template in Settings).
- A 64-character hex id uses that image's embedding.
- Reference strip slots: `#1`, `[1]`, etc. (managed from the gallery UI).
- Weighted clauses: `IMG cat + #1 - beach` (spaced `+` / `-`; leading spaced `-` is negative-only).
- `IMG ~text` skips the search template for that text clause.
- Trailing decimal sets similarity threshold; trailing integer limits result count (either order). -1 k means "return all images, but sorted by score"

Multi-image modes (each needs reference ids): `avg`, `all`, `any`, `more`, `fringe`, `diff`, `shared`, `analogy`, `affinity`. See **Search keyword help** in Settings for mode details and examples.

During IMG and SIMILAR searches, results temporarily sort by similarity and pin reference images to the top.

## Sorting

- **Date** / **Date (asc)**: file modification date
- **Name** / **Name (desc)**: file name
- **Random**: random order (SKIP and TAKE apply after random sort)

IMG and SIMILAR searches also use temporary **similar** / **similar (inverse)** sort modes. MMR can use a **uniqueness** sort while building its candidate pool.

## Image management

Select multiple images to move, copy, delete, tag, or LLM-annotate in bulk.

Context-menu actions include **Show similar**, **Jump** (similarity browsing), and **Tag as…** for quick tagging.

## Live

Opens a fullscreen image to always show the latest image. (The browser gets file updates so it updates in near real time)  
Works as a bigger preview view when used alongside the webui.

## Flyout sidebar

You can use the flyout to embed the stable diffusion or comfy webui, so you can use it seamlessly without switching tabs/applications on mobile.  
You can change the url of the webui in the settings if necessary.

## Slideshow

Cycles through images in order every 4 seconds. The delay can be modified in the settings.

## Hotkeys

You can use the `arrow keys` to cycle through images while in fullscreen.  
You can use `Space` to start and stop the slideshow.

## Mobile

Optimized for both desktop and mobile layouts accross the entire app.

The image browser has been setup as PWA compatible, so you can set it on your homescreen on mobile to open it in fullscreen (without a url bar).

# ComfyUI support

The browser parses ComfyUI workflow metadata embedded in images. It detects positive and negative prompts, models, seeds, and other node details — including subgraphs and less common node layouts. LoRA and auxiliary models are listed separately from the primary checkpoint.

Fullscreen view can **open the workflow in ComfyUI** (set `COMFY_URL` and optionally `COMFY_TOKEN` in `.env`).

For reliable automatic detection, consider renaming node titles:
- Positive prompt → has to have "positive" or "prompt" in the title
- Negative prompt → has to have "negative" in the title
- Model → has to have "model" or "checkpoint" in the title
- Seed → has to have "seed" in the title

The first two are the most important; model and seed detection usually works without renaming. Alternatively you can use the metadata and custom image save nodes from my ComfyUI node pack for setting positive/negative prompt and custom params text.

All nodes are still formatted and shown in metadata, so you can find anything even when auto-detection misses.
