<script lang="ts" context="module">
  type PromptFragment = {
    header: string;
    content: string;
    action?: () => void;
  };
</script>

<script lang="ts">
  import { browser } from "$app/environment";
  import "../../scroll.css";
  import { onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import Button from "./Button.svelte";
  import { notify } from "$lib/components/Notifier.svelte";
  import {
    getComfyMetadataSections,
    getMetadataVersion,
    getModelCandidates,
    getModelHash,
    getPrimaryModel,
    getPrompts,
    getSeed,
    getSvNegativePrompt,
    getSvPositivePrompt,
  } from "$lib/tools/metadataInterpreter";
  import { compressedMode, useSmartSubsampling } from "$lib/stores/searchStore";
  import {
    buildImageQueryParams,
    ComfyAuthRequiredError,
    getComfyWorkflowOpenStatus,
    imageAction,
    openWorkflowInComfy,
  } from "$lib/requests/imageRequests";
  import { updateImageTags } from "$lib/requests/tagRequests";
  import TagPillRow from "$lib/components/TagPillRow.svelte";
  import TagPickerPopup from "$lib/components/TagPickerPopup.svelte";
  import TagModal from "$lib/components/TagModal.svelte";
  import { tagsStore, upsertTagDefinition } from "$lib/stores/tagsStore";
  import { DEFAULT_TAG_COLOR } from "$lib/types/tags";
  import { fullscreenStyle } from "$lib/stores/styleStore";
  import type { ClientImage, ImageInfo } from "$lib/types/images";

  export let cancel: () => void;
  export let image: ClientImage | undefined;
  export let data: ImageInfo | undefined;
  export let enabled = true;

  let hiddenElementFull: HTMLDivElement;
  let hiddenElementPos: HTMLDivElement;
  let hiddenElementNeg: HTMLDivElement;
  let hiddenElementSvPos: HTMLDivElement;
  let hiddenElementSvNeg: HTMLDivElement;
  let hiddenElementParams: HTMLDivElement;
  let hiddenElementAnnotation: HTMLDivElement;
  let hiddenElementWorkflow: HTMLDivElement;

  let showOriginal = false;
  let tagPickerOpen = false;
  let tagModalOpen = false;
  let modalTagName = "";
  let modalTagColor = DEFAULT_TAG_COLOR;
  let imageTags: string[] = [];
  let tagsRowEl: HTMLDivElement | undefined;
  let mediaLoaded = false;
  let imgElement: HTMLImageElement | undefined;
  let videoElement: HTMLVideoElement | undefined;
  let comfyStatusImageId: string | undefined;
  let comfyWorkflowOpenAvailable = false;
  let comfyWorkflowAuthRequired = false;
  let loadingMediaUrl = "";
  let placeholderVisible = true;
  let placeholderLeaving = false;
  let revealTimer: ReturnType<typeof setTimeout> | undefined;

  const comfyTokenStorageKey = "comfyWorkflowOpenToken";
  const placeholderFadeMs = 90;

  function clearRevealTimer() {
    if (!revealTimer) return;
    clearTimeout(revealTimer);
    revealTimer = undefined;
  }

  function prefersReducedMotion() {
    return browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function resetReveal(nextUrl: string) {
    clearRevealTimer();
    loadingMediaUrl = nextUrl;
    mediaLoaded = false;
    placeholderVisible = !!nextUrl;
    placeholderLeaving = false;
  }

  function revealLoadedMedia(expectedUrl: string) {
    if (imageUrl !== expectedUrl) return;
    placeholderVisible = false;
    placeholderLeaving = false;
    mediaLoaded = true;
  }

  function startReveal(expectedUrl: string) {
    if (imageUrl !== expectedUrl || mediaLoaded) return;
    if (!placeholderVisible || prefersReducedMotion()) {
      revealLoadedMedia(expectedUrl);
      return;
    }

    clearRevealTimer();
    placeholderLeaving = true;
    revealTimer = setTimeout(() => {
      revealTimer = undefined;
      revealLoadedMedia(expectedUrl);
    }, placeholderFadeMs);
  }

  function markMediaReady(expectedUrl: string) {
    if (imageUrl !== expectedUrl) return;
    startReveal(expectedUrl);
  }

  function createMediaReadyHandler(expectedUrl: string) {
    return () => {
      markMediaReady(expectedUrl);
    };
  }

  function createImageReadyHandler(expectedUrl: string) {
    return async (event: Event) => {
      const element = event.currentTarget;
      if (!(element instanceof HTMLImageElement)) return;

      try {
        await element.decode();
      } catch {
        // A loaded image may reject decode for browser-specific reasons; still reveal it.
      }
      markMediaReady(expectedUrl);
    };
  }

  function elementMatchesUrl(element: HTMLImageElement | HTMLVideoElement): boolean {
    if (!imageUrl) return false;
    const elSrc = element.currentSrc || element.src;
    try {
      return new URL(elSrc, location.origin).href === new URL(imageUrl, location.origin).href;
    } catch {
      return false;
    }
  }

  function checkMediaAlreadyReady() {
    if (!imageUrl) return;
    if (
      imgElement?.complete &&
      imgElement.naturalWidth > 0 &&
      elementMatchesUrl(imgElement)
    ) {
      startReveal(imageUrl);
    } else if (
      videoElement &&
      videoElement.readyState >= 2 &&
      elementMatchesUrl(videoElement)
    ) {
      startReveal(imageUrl);
    }
  }

  $: mediaStyle =
    image?.width && image?.height
      ? `--media-ratio: ${image.width / image.height}; aspect-ratio: ${image.width} / ${image.height}`
      : undefined;

  $: if (data) imageTags = data.tags ?? [];
  $: availableTags = $tagsStore.tags
    .map((tag) => tag.name)
    .filter((name) => !imageTags.includes(name));

  $: full = $fullscreenStyle;
  $: imageUrl = image?.id
    ? `/api/images/${image.id}?${buildImageQueryParams(showOriginal ? "original" : $compressedMode, $useSmartSubsampling)}`
    : "";
  $: if (imageUrl !== loadingMediaUrl) resetReveal(imageUrl);
  $: imageUrl, imgElement, videoElement, checkMediaAlreadyReady();
  $: basicInfo = !data ? "" : extractBasic(data);
  $: promptInfo = !data ? [] : buildPromptInfo(data);
  $: annotationText = data?.annotation ?? "";
  $: fullPrompt = !data ? "" : data.prompt;
  $: prompts = !data
    ? undefined
    : getPrompts(data.prompt, data.workflow, data.extra, true);
  $: svPositivePrompt = !data ? "" : prompts?.ogpos || getSvPositivePrompt(data.prompt);
  $: svNegativePrompt = !data ? "" : prompts?.ogneg || getSvNegativePrompt(data.prompt);
  $: paramsPrompt = !data ? "" : prompts!.params;
  $: workflowPrompt = !data ? "" : data.workflow;
  $: {
    showOriginal = showOriginal && !!image;
  }
  $: if (enabled && image?.id && data?.workflow && comfyStatusImageId !== image.id) {
    comfyStatusImageId = image.id;
    comfyWorkflowOpenAvailable = false;
    comfyWorkflowAuthRequired = false;
    void refreshComfyWorkflowOpenStatus(image.id);
  }
  $: if (!enabled || !image?.id || !data?.workflow) {
    comfyStatusImageId = undefined;
    comfyWorkflowOpenAvailable = false;
    comfyWorkflowAuthRequired = false;
  }

  function extractBasic(d: ImageInfo): string {
    const candidates = getModelCandidates(d.prompt, d.workflow, d.extra);
    const primary = getPrimaryModel(candidates, d.extra);
    const hash = getModelHash(d.prompt);
    let info = "";
    info += `Model: ${primary}`;
    if (hash) info += ` [${hash}]`;
    if (d.width && d.height) info += `\nSize: ${d.width}x${d.height}`;
    info += `\nCreated: ${new Date(d.createdDate).toLocaleDateString()}`;
    info += `\nModified: ${new Date(d.modifiedDate).toLocaleDateString()}`;
    if (d.folder) info += `\nFolder: ${d.folder}`;
    return info;
  }

  function buildPromptInfo(d: ImageInfo): PromptFragment[] {
    const blocks = formatMetadata(d.prompt, d.workflow, d.extra, d.models);
    if (!d.annotation) return blocks;

    blocks.unshift({
      header: "annotation",
      content: d.annotation,
      action: copyAnnotation,
    });
    return blocks;
  }

  function formatMetadata(
    prompt: string | undefined,
    workflow?: string,
    extra?: string,
    storedModels?: string,
  ): PromptFragment[] {
    let blocks: PromptFragment[] = [];
    const prompts = getPrompts(prompt, workflow, extra, true);
    const modelsText = storedModels ?? "";
    const seed = getSeed(prompt, workflow, extra);
    const sv_pos = prompts?.ogpos || getSvPositivePrompt(prompt);
    const sv_neg = prompts?.ogneg || getSvNegativePrompt(prompt);
    const params = prompts?.params;
    const version = getMetadataVersion(prompt);

    if (modelsText.includes("\n"))
      blocks.push({
        header: "models",
        content: modelsText,
      });
    if (prompts?.pos)
      blocks.push({
        header: "positive prompt",
        content: prompts.pos,
        action: copyPositive,
      });
    if (prompts?.neg)
      blocks.push({
        header: "negative prompt",
        content: prompts.neg,
        action: copyNegative,
      });
    if (sv_pos && prompts?.pos !== sv_pos)
      blocks.push({
        header: "original positive prompt",
        content: sv_pos,
        action: copySvPositive,
      });
    if (sv_neg && prompts?.neg !== sv_neg)
      blocks.push({
        header: "original negative prompt",
        content: sv_neg,
        action: copySvNegative,
      });
    if (seed)
      blocks.push({
        header: "seed",
        content: seed,
      });
    if (params)
      blocks.push({
        header: "parameters",
        content: params,
        action: copyParams,
      });
    if (extra) blocks.push({ header: "extra", content: extra });
    if (version === "comfy" && prompt)
      blocks = blocks.concat(formatComfy(prompt, workflow));
    if (prompt && (blocks.length === 0 || version === "comfy"))
      blocks.push({ header: "metadata", content: prompt, action: copyPrompt });
    if (workflow)
      blocks.push({
        header: "workflow",
        content: workflow,
        action: copyWorkflow,
      });
    return blocks;
  }

  function formatComfy(prompt: string, workflow?: string): PromptFragment[] {
    if (!workflow) return [];

    try {
      const sections = getComfyMetadataSections(prompt, workflow);
      return sections.map(section => ({
        header: section.title,
        content: section.fields.map(field => `${field.label}: ${field.value}`).join("\n"),
      })).filter(section => section.content);
    } catch (e) {
      console.error(e);
      notify("Failed to parse comfy metadata", "error", "comfy_parse_error");
      return [];
    }
  }

  function handleEsc(e: KeyboardEvent) {
    if (!image?.id) return;
    if (e.key === "Escape") {
      if (tagPickerOpen) {
        tagPickerOpen = false;
        return;
      }
      cancel();
    }
  }

  function prevent(e: Event) {
    e.stopPropagation();
    e.preventDefault();
  }

  function copyInfo(
    element: HTMLDivElement,
    content: string | undefined,
    name: string,
  ) {
    if (!image?.id) return;
    if (!element) return;
    if (!content) return notify(`No ${name} to copy`);
    if (!navigator?.clipboard?.writeText) {
      selectPrompt(element);
      document.execCommand("copy");
      deselect();
      return;
    }

    navigator.clipboard
      .writeText(content)
      .then(() => {
        notify(`Copied ${name} to clipboard`);
      })
      .catch(() => {
        notify(`Failed to copy ${name} to clipboard`);
      });
  }

  function copyPrompt() {
    copyInfo(hiddenElementFull, fullPrompt, "prompt");
  }

  function copyPositive() {
    copyInfo(hiddenElementPos, prompts?.pos, "positive");
  }

  function copyNegative() {
    copyInfo(hiddenElementNeg, prompts?.neg, "negative");
  }

  function copySvPositive() {
    copyInfo(hiddenElementSvPos, svPositivePrompt, "sv_positive");
  }

  function copySvNegative() {
    copyInfo(hiddenElementSvNeg, svNegativePrompt, "sv_negative");
  }

  function copyParams() {
    copyInfo(hiddenElementParams, paramsPrompt, "parameters");
  }

  function copyAnnotation() {
    copyInfo(hiddenElementAnnotation, annotationText, "annotation");
  }

  function copyWorkflow() {
    copyInfo(hiddenElementWorkflow, workflowPrompt, "workflow");
  }

  function getStoredComfyToken() {
    if (!browser) return "";
    return sessionStorage.getItem(comfyTokenStorageKey) ?? "";
  }

  function setStoredComfyToken(token: string) {
    if (!browser) return;
    sessionStorage.setItem(comfyTokenStorageKey, token);
  }

  function askComfyToken(): string | undefined {
    if (!browser) return undefined;
    const token = window.prompt(
      "Enter the ComfyUI-Login API token from the Comfy console, not the plain password.",
      getStoredComfyToken(),
    );
    const trimmed = token?.trim();
    if (!trimmed)
      return undefined;
    setStoredComfyToken(trimmed);
    return trimmed;
  }

  async function refreshComfyWorkflowOpenStatus(imageId: string) {
    try {
      const status = await getComfyWorkflowOpenStatus(getStoredComfyToken());
      if (image?.id === imageId && data?.workflow) {
        comfyWorkflowOpenAvailable = status.available;
        comfyWorkflowAuthRequired = !!status.authRequired;
      }
    } catch {
      if (image?.id === imageId) {
        comfyWorkflowOpenAvailable = false;
        comfyWorkflowAuthRequired = false;
      }
    }
  }

  async function connectComfy() {
    if (!image?.id) return;
    const token = askComfyToken();
    if (!token) return;

    await refreshComfyWorkflowOpenStatus(image.id);
    if (comfyWorkflowOpenAvailable) {
      notify("Connected to ComfyUI");
    } else {
      notify("ComfyUI token was not accepted", "warn");
    }
  }

  async function openInComfy() {
    if (!image?.id) return;
    try {
      await openWorkflowInComfy(image.id, getStoredComfyToken());
      notify("Opened workflow in ComfyUI");
    } catch (cause) {
      if (cause instanceof ComfyAuthRequiredError) {
        const token = askComfyToken();
        if (!token) return;
        try {
          await openWorkflowInComfy(image.id, token);
          comfyWorkflowOpenAvailable = true;
          comfyWorkflowAuthRequired = false;
          notify("Opened workflow in ComfyUI");
          return;
        } catch {
          comfyWorkflowOpenAvailable = false;
          comfyWorkflowAuthRequired = true;
          notify("ComfyUI token was not accepted", "warn");
          return;
        }
      }
      notify(
        cause instanceof Error ? cause.message : "Failed to open workflow in ComfyUI",
        "error",
      );
    }
  }

  function deleteImage() {
    if (!image?.id) return;
    imageAction(image.id, {
      type: "delete",
    }).then(cancel);
  }

  async function persistImageTags(next: string[]) {
    if (!image?.id) return;
    try {
      imageTags = await updateImageTags(image.id, next);
      if (data) data = { ...data, tags: imageTags };
    } catch (cause) {
      console.error(cause);
      notify(cause instanceof Error ? cause.message : "Failed to update tags", "warn");
    }
  }

  async function removeImageTag(name: string) {
    await persistImageTags(imageTags.filter((tag) => tag !== name));
  }

  async function addImageTag(name: string) {
    if (imageTags.includes(name)) return;
    await persistImageTags([...imageTags, name]);
  }

  function openCreateTagModal() {
    modalTagName = "";
    modalTagColor = DEFAULT_TAG_COLOR;
    tagModalOpen = true;
  }

  function closeCreateTagModal() {
    tagModalOpen = false;
  }

  async function saveNewTag(event: CustomEvent<{ name: string; color: string }>) {
    const { name, color } = event.detail;
    const duplicate = $tagsStore.tags.some(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      notify(`Tag name '${name}' already exists`, "warn");
      return;
    }

    tagsStore.update((state) => upsertTagDefinition(state, { name, color }));
    tagModalOpen = false;
    await addImageTag(name);
  }

  function toggleTagPicker() {
    tagPickerOpen = !tagPickerOpen;
  }

  function closeTagPicker() {
    tagPickerOpen = false;
  }

  function showOriginalImage() {
    showOriginal = true;
    notify("Showing original quality image");
  }

  function selectPrompt(element: HTMLDivElement) {
    if (!element) return;
    const range = document.createRange();
    range.selectNode(element);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function deselect() {
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
  }

  onDestroy(clearRevealTimer);
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
{#if enabled && image?.id}
  <div
    class="image_overlay"
    on:click={cancel}
    transition:fade={{ duration: 300, easing: cubicOut }}
  >
    <div class="layout" class:full>
      <div>
        <div class="card">
          <div
            class="media-container"
            class:full
            class:has-aspect={!!mediaStyle}
            style={mediaStyle}
          >
            {#if placeholderVisible}
              <div class="loading-slot" class:leaving={placeholderLeaving}>
                <div class="dot-loader" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            {/if}
            {#key imageUrl}
              {#if image.type === "video"}
                <video
                  bind:this={videoElement}
                  autoplay
                  loop
                  muted
                  preload="metadata"
                  src={imageUrl}
                  class:hidden={!mediaLoaded}
                  on:canplay={createMediaReadyHandler(imageUrl)}
                  on:error={createMediaReadyHandler(imageUrl)}
                >
                  <source src={imageUrl} type="video/mp4" />
                </video>
              {:else}
                <img
                  bind:this={imgElement}
                  src={imageUrl}
                  alt={image.id}
                  class:hidden={!mediaLoaded}
                  on:load={createImageReadyHandler(imageUrl)}
                  on:error={createMediaReadyHandler(imageUrl)}
                />
              {/if}
            {/key}
          </div>
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          {#if data}
            <div class="info" on:click={prevent}>
              <div class="basic">
                <p>{basicInfo}</p>
                <div class="buttons">
                  {#if data.workflow}
                    {#if comfyWorkflowOpenAvailable}
                      <Button on:click={openInComfy}>Open in ComfyUI</Button>
                    {:else if comfyWorkflowAuthRequired}
                      <Button on:click={connectComfy}>Connect ComfyUI</Button>
                    {:else}
                      <Button on:click={copyWorkflow}>Copy workflow</Button>
                    {/if}
                  {:else if data.prompt}
                    <Button on:click={copyPrompt}>Copy all</Button>
                  {/if}
                  <Button on:click={deleteImage}>Delete</Button>
                  {#if $compressedMode != "original" && !showOriginal}
                    <Button on:click={showOriginalImage}>Show original</Button>
                  {/if}
                </div>
              </div>
              <div class="tags-row" bind:this={tagsRowEl} on:click={prevent}>
                <TagPillRow
                  tags={imageTags}
                  showAdd
                  deletable
                  compact
                  on:add={toggleTagPicker}
                  on:remove={(event) => removeImageTag(event.detail)}
                />
              </div>
              {#each promptInfo as info}
                <div class="extra">
                  <h1 class="header">
                    {info.header}
                    {#if info.action}
                      <button on:click={info.action}>copy</button>
                    {/if}
                  </h1>
                  <p>
                    {info.content}
                  </p>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
    {#if tagPickerOpen}
      <TagPickerPopup
        anchor={tagsRowEl ?? null}
        tags={availableTags}
        on:select={(event) => addImageTag(event.detail)}
        on:createNew={openCreateTagModal}
        on:close={closeTagPicker}
      />
    {/if}
  </div>
  <div class="fallback" bind:this={hiddenElementFull}>{fullPrompt}</div>
  <div class="fallback" bind:this={hiddenElementPos}>{prompts?.pos ?? ""}</div>
  <div class="fallback" bind:this={hiddenElementNeg}>{prompts?.neg ?? ""}</div>
  <div class="fallback" bind:this={hiddenElementSvPos}>{svPositivePrompt}</div>
  <div class="fallback" bind:this={hiddenElementSvNeg}>{svNegativePrompt}</div>
  <div class="fallback" bind:this={hiddenElementParams}>{paramsPrompt}</div>
  <div class="fallback" bind:this={hiddenElementAnnotation}>{annotationText}</div>
  <div class="fallback" bind:this={hiddenElementWorkflow}>{workflowPrompt}</div>
  {#if tagModalOpen}
    <TagModal
      title="Add tag"
      bind:name={modalTagName}
      bind:color={modalTagColor}
      on:save={saveNewTag}
      on:close={closeCreateTagModal}
    />
  {/if}
{/if}

<svelte:window on:keydown={handleEsc} />

<style lang="scss">
  .image_overlay {
    position: fixed;
    z-index: 2;
    top: 0;
    left: 0;
    right: var(--flyout-width);
    // right: 0;
    bottom: 0;
    background-color: #000a;
    --pad: min(5vh, 5vw);
    padding: var(--pad);
    backdrop-filter: blur(10px);

    :global(.flanimate) & {
      transition: right 0.2s ease;
    }

    .layout {
      display: flex;
      justify-content: center;
      height: 100%;
      position: relative;

      & > div {
        max-height: 100%;
        max-width: 100%;
        min-width: min(500px, 100%);
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .card {
        background-color: #111b;
        border-radius: 0.5em;
        overflow-x: hidden;
        overscroll-behavior-y: contain;
        display: flex;
        flex-direction: column;
        align-items: center;
        color: #ddd;
        font-size: 2em;
      }

      .media-container {
        position: relative;
        display: grid;
        align-items: center;
        justify-content: center;
        width: 100%;
        max-width: 100%;

        &.has-aspect {
          width: min(100%, calc((100dvh - var(--pad) * 2) * var(--media-ratio)));
          aspect-ratio: var(--media-ratio);
        }

        .loading-slot {
          grid-area: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          min-height: min(40vh, 20em);
          opacity: 1;
          transition: opacity 90ms ease;

          &.leaving {
            opacity: 0;
          }
        }

        .dot-loader {
          --loader-accent: rgb(63, 187, 236);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.45em;
          filter: drop-shadow(0 0 0.35em rgba(63, 187, 236, 0.75));
          pointer-events: none;

          span {
            width: 0.34em;
            height: 0.34em;
            border-radius: 50%;
            background: var(--loader-accent);
            box-shadow:
              0 0 0.45em rgba(63, 187, 236, 0.9),
              0 0 1em rgba(63, 187, 236, 0.35);
            opacity: 0.65;
            animation: loader-dot-wave 900ms ease-in-out infinite;
          }

          span:nth-child(2) {
            animation-delay: 120ms;
          }

          span:nth-child(3) {
            animation-delay: 240ms;
          }
        }

        @keyframes loader-dot-wave {
          0%,
          80%,
          100% {
            opacity: 0.45;
            transform: translateY(0);
          }

          40% {
            opacity: 1;
            transform: translateY(-0.45em);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .dot-loader span {
            animation: none;
            opacity: 0.8;
          }
        }

        &.has-aspect .loading-slot {
          min-height: 0;
        }

        img,
        video {
          grid-area: 1 / 1;
          display: block;
          width: 100%;
          height: 100%;
          max-height: calc(100dvh - var(--pad) * 2);
          max-width: 100%;
          object-fit: contain;
          transition: opacity 180ms ease;

          &.hidden {
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
          }
        }

        &.full .loading-slot {
          min-height: 0;
        }
      }

      &.full {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;

        & > div {
          height: 100%;
          width: 100%;
        }

        .card {
          width: 100%;
          border-radius: 0;
          background-color: transparent;
        }

        .media-container {
          &.has-aspect {
            width: min(100%, calc(100dvh * var(--media-ratio)));
          }

          img,
          video {
            max-height: 100dvh;
            z-index: 100;
          }
        }

        .info {
          min-width: auto;
          max-width: auto;
          width: min(calc(100% - max(10vw, 10vh)), 1200px);
          padding-inline: 1em 0.4em;
          background-color: #111b;
          box-shadow: 0 0 1em 1em #111b;
        }
      }
    }

    .info {
      position: relative;
      z-index: 101;
      font-size: 0.5em;
      margin: 0;
      width: 0;
      min-width: calc(100% - 2em);
      --section-pad-x: 1em;

      & > div:not(.tags-row) {
        // background-color: #123a;
        background-color: #4444;
        line-height: 1.3em;
        border-radius: 0.5em;
        margin: 1em 0;
        overflow: hidden;
        border: 1px solid #fff1;
      }

      .tags-row {
        position: relative;
        padding: 0 var(--section-pad-x);
        margin: 0;
      }

      p {
        white-space: pre-wrap;
        flex-grow: 1;

        margin: 0;
      }

      .basic {
        display: flex;
        padding: 0.7em var(--section-pad-x);
        border-radius: 0.5em;
        margin: 1em 0;
      }

      .extra {
        p {
          padding: 0.5em var(--section-pad-x);
        }
      }

      .buttons {
        display: flex;
        flex-direction: column;
        gap: 0.3em;
      }

      .header {
        margin: 0;
        font-size: 0.8em;
        background-color: #112a;
        padding: 0.2em var(--section-pad-x);

        button {
          background-color: transparent;
          border: none;
          color: #aaa;
          margin: 0;
          padding: 0;
          cursor: pointer;
          transition: color 0.2s ease;
          float: right;
        }
      }
    }
  }

  .fallback {
    pointer-events: none;
    opacity: 0;
    position: fixed;
  }
</style>
