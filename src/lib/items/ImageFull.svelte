<script lang="ts" context="module">
  type PromptFragment = {
    header: string;
    content: string;
    action?: () => void;
  };
</script>

<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { notify } from "$lib/components/Notifier.svelte";
  import {
    getComfyMetadataSections,
    getMetadataVersion,
    getModelCandidates,
    getPrimaryModel,
    getPrompts,
    getSeed,
    getSvNegativePrompt,
    getSvPositivePrompt,
    MULTIPLE_MODELS,
    UNKNOWN_MODEL,
  } from "$lib/tools/metadataInterpreter";
  import { compressedMode, useSmartSubsampling } from "$lib/stores/searchStore";
  import {
    buildImageQueryParams,
    ComfyAuthRequiredError,
    getComfyWorkflowOpenStatus,
    imageAction,
    openWorkflowInComfy,
  } from "$lib/requests/imageRequests";
  import { updateImageAnnotation } from "$lib/requests/annotationRequests";
  import { updateImageTags } from "$lib/requests/tagRequests";
  import AnnotationModal from "$lib/components/AnnotationModal.svelte";
  import TagPillRow from "$lib/components/TagPillRow.svelte";
  import TagPickerPopup from "$lib/components/TagPickerPopup.svelte";
  import TagModal from "$lib/components/TagModal.svelte";
  import { tagsStore, upsertTagDefinition } from "$lib/stores/tagsStore";
  import { DEFAULT_TAG_COLOR } from "$lib/types/tags";
  import { fullscreenStyle, imageFadeMs } from "$lib/stores/styleStore";
  import { get } from "svelte/store";
  import type { ClientImage, ImageInfo } from "$lib/types/images";
  import {
    closeAllContextMenus,
    openContextMenu,
    type ContextMenuOption,
  } from "./ContextMenuManager.svelte";

  export let cancel: () => void;
  export let image: ClientImage | undefined;
  export let data: ImageInfo | undefined;
  export let enabled = true;
  export let live = false;

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
  let annotationModalOpen = false;
  let annotationDraft = "";
  let annotationSaving = false;
  let modalTagName = "";
  let modalTagColor = DEFAULT_TAG_COLOR;
  let imageTags: string[] = [];
  let tagsRowEl: HTMLDivElement | undefined;
  let cardEl: HTMLDivElement | undefined;
  let mediaLoaded = false;
  let imgElement: HTMLImageElement | undefined;
  let videoElement: HTMLVideoElement | undefined;
  let overlayScrollbarVisible = false;
  let overlayScrollbarActive = false;
  let overlayThumbTop = 0;
  let overlayThumbHeight = 0;
  let overlayScrollFadeTimer: ReturnType<typeof setTimeout> | undefined;
  let cardResizeObserver: ResizeObserver | undefined;
  let comfyStatusImageId: string | undefined;
  let comfyWorkflowOpenAvailable = false;
  let comfyWorkflowAuthRequired = false;
  let loadingMediaUrl = "";
  let displayMediaUrl = "";
  let placeholderVisible = true;
  let placeholderLeaving = false;
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  let mediaRetryTimer: ReturnType<typeof setTimeout> | undefined;
  let mediaRetryCount = 0;

  const comfyTokenStorageKey = "comfyWorkflowOpenToken";
  const maxMediaRetries = 6;
  const mediaRetryDelayMs = 400;

  function placeholderLeaveMs(fadeMs: number) {
    return Math.max(0, Math.floor(fadeMs / 2));
  }

  function clearRevealTimer() {
    if (!revealTimer) return;
    clearTimeout(revealTimer);
    revealTimer = undefined;
  }

  function clearMediaRetryTimer() {
    if (!mediaRetryTimer) return;
    clearTimeout(mediaRetryTimer);
    mediaRetryTimer = undefined;
  }

  function buildDisplayMediaUrl(baseUrl: string, retryCount: number): string {
    if (!baseUrl) return "";
    if (retryCount === 0) return baseUrl;
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}retry=${retryCount}`;
  }

  function prefersReducedMotion() {
    return browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function resetReveal(nextUrl: string) {
    clearRevealTimer();
    clearMediaRetryTimer();
    mediaRetryCount = 0;
    loadingMediaUrl = nextUrl;
    displayMediaUrl = buildDisplayMediaUrl(nextUrl, 0);
    mediaLoaded = false;
    placeholderVisible = !!nextUrl;
    placeholderLeaving = false;
  }

  function scheduleMediaRetry(expectedBaseUrl: string) {
    if (imageUrl !== expectedBaseUrl) return;
    if (mediaRetryCount >= maxMediaRetries) return;

    clearMediaRetryTimer();
    mediaRetryCount += 1;
    placeholderVisible = true;
    placeholderLeaving = false;
    mediaLoaded = false;
    mediaRetryTimer = setTimeout(() => {
      mediaRetryTimer = undefined;
      if (imageUrl !== expectedBaseUrl) return;
      displayMediaUrl = buildDisplayMediaUrl(expectedBaseUrl, mediaRetryCount);
    }, mediaRetryDelayMs);
  }

  function revealLoadedMedia(expectedUrl: string) {
    if (imageUrl !== expectedUrl) return;
    placeholderVisible = false;
    placeholderLeaving = false;
    mediaLoaded = true;
    requestAnimationFrame(updateOverlayScrollbar);
  }

  function startReveal(expectedUrl: string) {
    if (imageUrl !== expectedUrl || mediaLoaded) return;
    if (!placeholderVisible || prefersReducedMotion() || get(imageFadeMs) <= 0) {
      revealLoadedMedia(expectedUrl);
      return;
    }

    const leaveMs = placeholderLeaveMs(get(imageFadeMs));
    clearRevealTimer();
    placeholderLeaving = true;
    revealTimer = setTimeout(() => {
      revealTimer = undefined;
      revealLoadedMedia(expectedUrl);
    }, leaveMs);
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

  function createMediaErrorHandler(expectedUrl: string) {
    return () => {
      scheduleMediaRetry(expectedUrl);
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
    if (!displayMediaUrl) return false;
    const elSrc = element.currentSrc || element.src;
    try {
      return new URL(elSrc, location.origin).href === new URL(displayMediaUrl, location.origin).href;
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

  $: mediaStyle = [
    image?.width && image?.height
      ? `--media-ratio: ${image.width / image.height}; aspect-ratio: ${image.width} / ${image.height}`
      : "",
    `--image-fade-ms: ${$imageFadeMs}ms`,
    `--placeholder-fade-ms: ${placeholderLeaveMs($imageFadeMs)}ms`,
  ].filter(Boolean).join("; ");

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
  $: hasMetadataBlobs = !!(data?.prompt != null || data?.workflow != null || data?.extra != null);
  $: prompts = !data || !hasMetadataBlobs
    ? undefined
    : getPrompts(data.prompt, data.workflow, data.extra, true);
  $: svPositivePrompt = !data
    ? ""
    : prompts?.ogpos || (hasMetadataBlobs ? getSvPositivePrompt(data.prompt) : "");
  $: svNegativePrompt = !data
    ? ""
    : prompts?.ogneg || (hasMetadataBlobs ? getSvNegativePrompt(data.prompt) : "");
  $: paramsPrompt = !data ? "" : (prompts?.params ?? data.params ?? "");
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

  function hasBlobs(d: ImageInfo): boolean {
    return d.prompt != null || d.workflow != null || d.extra != null;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024)
      return `${bytes} B`;
    if (bytes < 1024 * 1024) {
      const kb = bytes / 1024;
      return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
    }
    const mb = bytes / (1024 * 1024);
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  }

  function formatMetaDate(ms: number): string {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function extractBasic(d: ImageInfo): string {
    let primary: string;
    if (hasBlobs(d)) {
      const candidates = getModelCandidates(d.prompt, d.workflow, d.extra);
      primary = getPrimaryModel(candidates, d.extra);
    } else {
      const modelsText = d.models ?? "";
      primary = !modelsText
        ? UNKNOWN_MODEL
        : modelsText.includes("\n")
          ? MULTIPLE_MODELS
          : modelsText;
    }

    const parts: string[] = [];
    if (d.width && d.height)
      parts.push(`${d.width} × ${d.height}`);
    if (d.fileExt)
      parts.push(d.fileExt);
    if (d.fileSize != null)
      parts.push(formatFileSize(d.fileSize));
    parts.push(formatMetaDate(d.modifiedDate));

    return `${parts.join(" · ")}\nModel: ${primary}`;
  }

  function buildPromptInfo(d: ImageInfo): PromptFragment[] {
    const blocks = hasBlobs(d)
      ? formatMetadata(d.prompt, d.workflow, d.extra, d.models)
      : formatStoredMetadata(d);
    if (!d.annotation) return blocks;

    blocks.unshift({
      header: "annotation",
      content: d.annotation,
      action: copyAnnotation,
    });
    return blocks;
  }

  function formatStoredMetadata(d: ImageInfo): PromptFragment[] {
    const blocks: PromptFragment[] = [];
    const modelsText = d.models ?? "";
    if (modelsText.includes("\n"))
      blocks.push({
        header: "models",
        content: modelsText,
      });
    if (d.positive)
      blocks.push({
        header: "positive prompt",
        content: d.positive,
        action: copyPositive,
      });
    if (d.negative)
      blocks.push({
        header: "negative prompt",
        content: d.negative,
        action: copyNegative,
      });
    if (d.params)
      blocks.push({
        header: "parameters",
        content: d.params,
        action: copyParams,
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
      if (annotationModalOpen) {
        if (!annotationSaving)
          annotationModalOpen = false;
        return;
      }
      if (tagModalOpen) {
        tagModalOpen = false;
        return;
      }
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

  function getTopMetadataActions(): ContextMenuOption[] {
    const actions: ContextMenuOption[] = [];

    if (data?.workflow) {
      if (comfyWorkflowOpenAvailable) {
        actions.push({ name: "Open in ComfyUI", handler: openInComfy });
      } else if (comfyWorkflowAuthRequired) {
        actions.push({ name: "Connect ComfyUI", handler: connectComfy });
      } else {
        actions.push({ name: "Copy workflow", handler: copyWorkflow });
      }
    } else if (data?.prompt) {
      actions.push({ name: "Copy all", handler: copyPrompt });
    }

    actions.push({
      name: "Copy ID",
      handler: copyId,
    });

    actions.push({
      name: data?.annotation ? "Edit annotation" : "Add annotation",
      handler: openAnnotationModal,
    });

    actions.push({ name: "Delete", handler: deleteImage });

    if ($compressedMode != "original" && !showOriginal) {
      actions.push({ name: "Show original", handler: showOriginalImage });
    }

    return actions;
  }

  function openTopMetadataMenu(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    closeAllContextMenus();
    openContextMenu(
      {
        x: rect.left,
        y: rect.bottom,
      },
      getTopMetadataActions(),
    );
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

  function copyId() {
    if (!image?.id) return;
    if (!navigator?.clipboard?.writeText) return notify("Clipboard unavailable");

    navigator.clipboard
      .writeText(image.id)
      .then(() => {
        notify("Copied id to clipboard");
      })
      .catch(() => {
        notify("Failed to copy id to clipboard");
      });
  }

  function copyPrompt() {
    copyInfo(hiddenElementFull, fullPrompt, "prompt");
  }

  function copyPositive() {
    copyInfo(hiddenElementPos, prompts?.pos ?? data?.positive, "positive");
  }

  function copyNegative() {
    copyInfo(hiddenElementNeg, prompts?.neg ?? data?.negative, "negative");
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

  function openAnnotationModal() {
    annotationDraft = data?.annotation ?? "";
    annotationModalOpen = true;
  }

  function closeAnnotationModal() {
    if (annotationSaving) return;
    annotationModalOpen = false;
  }

  async function saveAnnotation(event: CustomEvent<{ text: string }>) {
    if (!image?.id || annotationSaving) return;
    annotationSaving = true;
    try {
      const annotation = await updateImageAnnotation(image.id, event.detail.text);
      if (data) data = { ...data, annotation };
      annotationModalOpen = false;
    } catch (cause) {
      console.error(cause);
      notify(cause instanceof Error ? cause.message : "Failed to save annotation", "warn");
    } finally {
      annotationSaving = false;
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

  function clearOverlayScrollFadeTimer() {
    if (!overlayScrollFadeTimer) return;
    clearTimeout(overlayScrollFadeTimer);
    overlayScrollFadeTimer = undefined;
  }

  function updateOverlayScrollbar() {
    if (!cardEl) {
      overlayScrollbarVisible = false;
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = cardEl;
    const overflow = scrollHeight - clientHeight;
    if (overflow <= 1) {
      overlayScrollbarVisible = false;
      return;
    }

    const trackHeight = clientHeight;
    const thumbHeight = Math.max(28, (clientHeight / scrollHeight) * trackHeight);
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    overlayThumbHeight = thumbHeight;
    overlayThumbTop = maxThumbTop === 0 ? 0 : (scrollTop / overflow) * maxThumbTop;
    overlayScrollbarVisible = true;
  }

  function onCardScroll() {
    updateOverlayScrollbar();
    overlayScrollbarActive = true;
    clearOverlayScrollFadeTimer();
    overlayScrollFadeTimer = setTimeout(() => {
      overlayScrollbarActive = false;
      overlayScrollFadeTimer = undefined;
    }, 900);
  }

  function bindCardEl(node: HTMLDivElement) {
    cardEl = node;
    updateOverlayScrollbar();
    cardResizeObserver?.disconnect();
    cardResizeObserver = new ResizeObserver(() => updateOverlayScrollbar());
    cardResizeObserver.observe(node);
    for (const child of node.children) {
      if (child instanceof HTMLElement)
        cardResizeObserver.observe(child);
    }

    return {
      destroy() {
        if (cardEl === node)
          cardEl = undefined;
        cardResizeObserver?.disconnect();
        cardResizeObserver = undefined;
        clearOverlayScrollFadeTimer();
      },
    };
  }

  $: if (enabled && image?.id && data) {
    // Recalculate after metadata / layout changes settle.
    queueMicrotask(updateOverlayScrollbar);
  }

  onDestroy(() => {
    clearRevealTimer();
    clearMediaRetryTimer();
    clearOverlayScrollFadeTimer();
    cardResizeObserver?.disconnect();
    cardResizeObserver = undefined;
  });
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
{#if enabled && image?.id}
  <div
    class="image_overlay"
    on:click={cancel}
    transition:fade={{ duration: 300, easing: cubicOut }}
  >
    <div class="layout" class:full class:live>
      <div class="card-frame">
        <div class="card-stack">
          <div class="card" use:bindCardEl on:scroll={onCardScroll}>
            <div
              class="media-container"
              class:full
              class:has-aspect={!!(image?.width && image?.height)}
              class:no-fade={$imageFadeMs <= 0}
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
            {#key displayMediaUrl}
              {#if image.type === "video"}
                <video
                  bind:this={videoElement}
                  autoplay
                  loop
                  muted
                  preload="metadata"
                  src={displayMediaUrl}
                  class:hidden={!mediaLoaded}
                  on:canplay={createMediaReadyHandler(imageUrl)}
                  on:error={createMediaErrorHandler(imageUrl)}
                >
                  <source src={displayMediaUrl} type="video/mp4" />
                </video>
              {:else}
                <img
                  bind:this={imgElement}
                  src={displayMediaUrl}
                  alt={image.id}
                  class:hidden={!mediaLoaded}
                  on:load={createImageReadyHandler(imageUrl)}
                  on:error={createMediaErrorHandler(imageUrl)}
                />
              {/if}
            {/key}
          </div>
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          {#if data}
            <div class="info" on:click={prevent}>
              <div class="basic">
                <p>{basicInfo}</p>
                <button
                  class="metadata-menu-button"
                  type="button"
                  aria-label="Image actions"
                  on:click={openTopMetadataMenu}
                >
                  <span></span>
                  <span></span>
                  <span></span>
                </button>
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
          {#if overlayScrollbarVisible}
            <div
              class="overlay-scrollbar"
              class:active={overlayScrollbarActive}
              aria-hidden="true"
            >
              <div
                class="overlay-scrollbar-thumb"
                style="height: {overlayThumbHeight}px; transform: translateY({overlayThumbTop}px);"
              ></div>
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
  {#if annotationModalOpen}
    <AnnotationModal
      title={data?.annotation ? "Edit annotation" : "Add annotation"}
      bind:text={annotationDraft}
      saving={annotationSaving}
      on:save={saveAnnotation}
      on:close={closeAnnotationModal}
    />
  {/if}
{/if}

<svelte:window on:keydown={handleEsc} on:resize={updateOverlayScrollbar} />

<style lang="scss">
  .image_overlay {
    position: fixed;
    z-index: 40;
    top: 0;
    left: 0;
    right: var(--flyout-width);
    // right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.55);
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

      .card-frame {
        position: relative;
        max-height: 100%;
        max-width: 100%;
        min-width: min(500px, 100%);
        min-height: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .card-stack {
        position: relative;
        max-height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        max-width: 100%;
      }

      .card {
        background-color: rgba(17, 14, 12, 0.78);
        border: 1px solid var(--line);
        border-radius: 0.5em;
        box-sizing: border-box;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        max-height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        color: var(--ink);
        font-size: 2em;
        scrollbar-width: none;

        &::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
      }

      .overlay-scrollbar {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 12px;
        pointer-events: none;
        z-index: 120;
        opacity: 0.28;
        transition: opacity 0.35s ease;

        &.active {
          opacity: 0.9;
        }
      }

      .overlay-scrollbar-thumb {
        position: absolute;
        top: 0;
        right: 3px;
        width: 4px;
        border-radius: 999px;
        background: #ffffffaa;
        box-shadow: 0 0 0.35em #0008;
        will-change: transform;
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
          transition: opacity var(--placeholder-fade-ms, 90ms) ease;

          &.leaving {
            opacity: 0;
          }
        }

        .dot-loader {
          --loader-accent: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.45em;
          filter: drop-shadow(0 0 0.35em rgba(196, 165, 116, 0.75));
          pointer-events: none;

          span {
            width: 0.34em;
            height: 0.34em;
            border-radius: 50%;
            background: var(--loader-accent);
            box-shadow:
              0 0 0.45em rgba(196, 165, 116, 0.9),
              0 0 1em rgba(196, 165, 116, 0.35);
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

        &.no-fade {
          .loading-slot {
            transition: none;
          }

          img,
          video {
            transition: none;
          }
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
          transition: opacity var(--image-fade-ms, 180ms) ease;

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

        & > .card-frame {
          height: 100%;
          width: 100%;
          min-width: 0;
        }

        .card-stack,
        .card {
          width: 100%;
          height: 100%;
        }

        .card {
          border-radius: 0;
          border: none;
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
          background-color: rgba(17, 14, 12, 0.78);
          box-shadow: 0 0 1em 1em rgba(17, 14, 12, 0.78);
        }

        &.live .card {
          justify-content: center;
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
        background-color: rgba(68, 60, 52, 0.35);
        line-height: 1.3em;
        border-radius: 0.5em;
        margin: 1em 0;
        overflow: hidden;
        border: 1px solid var(--line);
      }

      .tags-row {
        position: relative;
        padding: 0 var(--section-pad-x);
        margin: 0;
      }

      p {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        flex-grow: 1;
        min-width: 0;

        margin: 0;
      }

      .basic {
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.65rem 0.75rem;
        border-radius: 0.5em;
        margin: 1em 0;
        background-color: rgba(68, 60, 52, 0.35);
        border: 1px solid var(--line);
        line-height: 1.35;

        p {
          flex: 1;
          min-width: 0;
          margin: 0;
          color: var(--muted);
          white-space: pre-line;
        }

        &::after {
          display: none;
        }
      }

      .metadata-menu-button {
        position: relative;
        top: auto;
        right: auto;
        flex-shrink: 0;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.13em;
        width: 2rem;
        height: 2rem;
        appearance: none;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--ink);
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;

        &:hover,
        &:focus-visible {
          background-color: rgba(255, 255, 255, 0.08);
          color: var(--ink);
          outline: none;
        }

        span {
          width: 0.22em;
          height: 0.22em;
          border-radius: 50%;
          background-color: currentColor;
          box-shadow: 0 0 0.25em rgba(0, 0, 0, 0.7);
        }
      }

      .extra {
        p {
          padding: 0.5em var(--section-pad-x);
        }
      }

      .header {
        margin: 0;
        font-size: 0.8em;
        background-color: rgba(68, 60, 52, 0.35);
        padding: 0.2em var(--section-pad-x);
        overflow-wrap: anywhere;
        word-break: break-word;
        color: var(--accent);
        font-weight: 700;

        button {
          background-color: transparent;
          border: 1px solid var(--line);
          border-radius: 6px;
          color: var(--muted);
          margin: 0;
          padding: 0.15rem 0.45rem;
          cursor: pointer;
          transition: color 0.2s ease, border-color 0.2s ease;
          float: right;
          font-size: 0.85em;

          &:hover {
            color: var(--ink);
            border-color: rgba(196, 165, 116, 0.35);
          }
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
