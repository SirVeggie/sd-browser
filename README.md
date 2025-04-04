# Stable Diffusion Image Browser

A standalone image browser (not a webui extension) made with Node and SvelteKit.

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

### ~ I'm open to feedback! ~

# Usage
## Collapse mode
Hides duplicate images with the same prompt. Browsing old prompts is much easier with this mode. Combine with `random` sorting mode to maximize inspiration from old prompts.

## Searching

### Dates

The search can be restricted into a specific time frame using the `DATE` or `DT` keyword with special syntax.

- Date format: `2024.12.24` | `2024.12.24 23:59` | `2024.12.24 23:59:59`
- Unix timestamp (milliseconds): `1731436728000`
- Offset format: `-1y` | `-1m -10d 12h`
- Date range: `TO` keyword

#### Examples

```
DT -1d -12h | between 36 hours ago and now
DT 2024.6.1 14:00 | between 2024.06.01 14:00:00 and now
DT -1y TO -6m | between 1 year ago and 6 months ago
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

Available searching keywords are `AND, NOT, ALL, NEGATIVE | NEG, FOLDER | FD, PARAMS | PR, DATE | DT`. Keywords must always be upper case. Keywords can be in any order (except AND). Both are valid: `NOT FOLDER img2img` and `FOLDER NOT img2img`.

`AND`: Specify multiple conditions that all have to match  
Example: `red hair AND man`

`NOT`: Inverts a condition  
Example: `red hair AND NOT girl`

`NEG`: Condition matches negative prompt  
Example: `painting AND NEG landscape`

`PARAMS`: Condition matches parameter portion of prompt (Sampler: xxx, etc.)  
Example: `landscape AND PARAMS sampler: euler a`

`FOLDER`: Matches the subfolder the image is located in  
Example: `FOLDER txt2img` or `landscape AND NOT FD img2img|grid`

`ALL`: Condition matches whole prompt (and folder name) instead of only the positive  
Example: `red hair AND NOT ALL girl|boy` (girl or boy not mentioned in any part of the prompt)

`DATE`: Uses special date syntax to restrict search to some time frame (examples above)

## Sorting
- Date: Sorts images based on file modification date
- Name: Sorts images based on file name
- Random: Sorts images randomly

## Image Management
Able to select and delete multiple images.

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
Optimized for both desktop and mobile use.

The image browser has been setup as PWA compatible, so you can set it on your homescreen on mobile to open it in fullscreen (without a url bar).

# ComfyUI support

Due to the nature of ComfyUI it can be difficult to parse information out of the workflow. Currently the image browser will try to detect and show the following information:
- Positive prompt
- Negative prompt
- Model
- Seed

For the app to succesfully find this information, consider renaming the nodes' titles with the following
- Positive prompt -> has to have "positive" or "prompt" in the title
- Negative prompt -> has to have "negative" in the title
- Model -> has to have "model" or "checkpoint" in the title
- Seed -> has to have "seed" in the title

The first two are the most important, since the latter two should already work out of the box.

In addition to these, all of the nodes are formatted and shown, so you can still find all relevant information. It can get pretty unreadable though if you have a lot of nodes.