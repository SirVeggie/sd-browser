# Stable Diffusion Image Browser

A standalone image browser (not a webui extension) made with Node and SvelteKit.

![example1](https://i.imgur.com/hcVQDZx.png)
![example2](https://i.imgur.com/963zv3L.png)

## Installation

1) Install latest version of Node.js
2) Clone or download the project.
3) Copy the `.env.example` file and rename it to `.env`
4) Set `IMG_FOLDER` to the output folder of stable diffusion (or any other folder containing images)
5) Run command `npm run setup` using command line in the project root folder
6) Run command `npm start` to start the application
7) Open `localhost:[PORT]` in your browser (default `PORT` is `4200`)

When starting for the first time, the images will be indexed. Depending on the amount of images, this can take seconds (5,000 images), or a tens of minutes (200,000+ images). Indexing speed will also depend on if you're using txt files or embedded image metadata, as well as the speed of your drive. My SSD takes about 3 minutes for 230,000 pngs with exif metadata.

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

Default search settings use Regex matching and keywords. All searching is case insensitive.

By default, all matches are performed on the positive prompt only. This can be modified by keywords.

The current version supports 3 matching modes:
- Regex: powerful text matching syntax (recommended)
- Words: Matches given words in any order
- Contains: Matches the given value anywhere in the prompt

### Examples (Regex)
Search `red` matches `scarred` and `a red cap`  
Search `\bred\b` matches `a red cap` and `(red)` but not `scarred` (\b is a word boundary character)  
Search `happy (girl|boy)` matches `a happy girl` and `a happy boy`.

### Examples (Words)
Search `cute girl` matches `cute, girl` and `girl, ..., cute`, but does not match `cuteness`  
Search `red` matches `a red cap` and `(red) cap` but not `scarred`

### Examples (Contains)
Search `cute girl` matches `a cute girl` but not `cute, girl`  
Search `red` matches `scarred`

## Keywords

Available searching keywords are `AND, NOT, ALL, NEGATIVE | NEG, FOLDER | FD, PARAMS | PR`. Keywords must always be upper case. Keywords can be in any order (except AND). Both are valid: `NOT FOLDER img2img` and `FOLDER NOT img2img`.

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
