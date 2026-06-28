<script lang="ts" context="module">
  type PromptFragment = {
    header: string;
    content: string;
    action?: () => void;
  };
</script>

<script lang="ts">
  import "../../scroll.css";
  import { fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import Button from "./Button.svelte";
  import { notify } from "$lib/components/Notifier.svelte";
  import {
    formatModels,
    getComfyMetadataSections,
    getMetadataVersion,
    getModelCandidates,
    getModelHash,
    getPrimaryModel,
    getPrompts,
    getSeed,
    parseStoredModels,
    getSvNegativePrompt,
    getSvPositivePrompt,
  } from "$lib/tools/metadataInterpreter";
  import { compressedMode } from "$lib/stores/searchStore";
  import { getQualityParam, imageAction } from "$lib/requests/imageRequests";
  import { autofocus } from "../../actions/autofocus";
  import { fullscreenStyle } from "$lib/stores/styleStore";
  import type { ClientImage, ImageInfo, ModelCandidate } from "$lib/types/images";

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

  $: full = $fullscreenStyle;
  $: imageUrl = image?.id
    ? `/api/images/${image.id}?${getQualityParam(showOriginal ? "original" : $compressedMode)}`
    : "";
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

  function extractBasic(d: ImageInfo): string {
    const candidates = getUiModelCandidates(d.prompt, d.workflow, d.extra, d.models);
    const primary = getPrimaryModel(candidates, d.extra);
    const hash = getModelHash(d.prompt);
    let info = "";
    info += `Model: ${primary}`;
    if (hash) info += ` [${hash}]`;
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
    const candidates = getUiModelCandidates(prompt, workflow, extra, storedModels);
    const seed = getSeed(prompt, workflow, extra);
    const sv_pos = prompts?.ogpos || getSvPositivePrompt(prompt);
    const sv_neg = prompts?.ogneg || getSvNegativePrompt(prompt);
    const params = prompts?.params;
    const version = getMetadataVersion(prompt);

    if (candidates.length > 1)
      blocks.push({
        header: "models",
        content: formatModels(candidates),
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

  function getUiModelCandidates(
    prompt: string | undefined,
    workflow: string | undefined,
    extra: string | undefined,
    storedModels: string | undefined,
  ): ModelCandidate[] {
    const candidates = getModelCandidates(prompt, workflow, extra);
    if (candidates.length)
      return candidates;
    return parseStoredModels(storedModels).map(model => ({ model }));
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
    if (e.key === "Escape") cancel();
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

  function deleteImage() {
    if (!image?.id) return;
    imageAction(image.id, {
      type: "delete",
    }).then(cancel);
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
          {#if image.type === "video"}
            <!-- svelte-ignore a11y-media-has-caption -->
            <video autoplay loop muted preload="metadata" src={imageUrl}>
              <source src={imageUrl} type="video/mp4" />
            </video>
          {:else}
            <img src={imageUrl} alt={image.id} />
          {/if}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
          {#if data}
            <div class="info" on:click={prevent}>
              <div class="basic">
                <button class="focusButton" use:autofocus></button>
                <p>{basicInfo}</p>
                <div class="buttons">
                  {#if data.workflow}
                    <Button on:click={copyWorkflow}>Copy workflow</Button>
                  {:else if data.prompt}
                    <Button on:click={copyPrompt}>Copy all</Button>
                  {/if}
                  <Button on:click={deleteImage}>Delete</Button>
                  {#if $compressedMode != "original" && !showOriginal}
                    <Button on:click={showOriginalImage}>Show original</Button>
                  {/if}
                </div>
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
  </div>
  <div class="fallback" bind:this={hiddenElementFull}>{fullPrompt}</div>
  <div class="fallback" bind:this={hiddenElementPos}>{prompts?.pos ?? ""}</div>
  <div class="fallback" bind:this={hiddenElementNeg}>{prompts?.neg ?? ""}</div>
  <div class="fallback" bind:this={hiddenElementSvPos}>{svPositivePrompt}</div>
  <div class="fallback" bind:this={hiddenElementSvNeg}>{svNegativePrompt}</div>
  <div class="fallback" bind:this={hiddenElementParams}>{paramsPrompt}</div>
  <div class="fallback" bind:this={hiddenElementAnnotation}>{annotationText}</div>
  <div class="fallback" bind:this={hiddenElementWorkflow}>{workflowPrompt}</div>
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
        font-family: "Open sans", sans-serif;
        font-size: 2em;
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

        .info {
          min-width: auto;
          max-width: auto;
          width: min(calc(100% - max(10vw, 10vh)), 1200px);
          padding-inline: 1em 0.4em;
          background-color: #111b;
          box-shadow: 0 0 1em 1em #111b;
        }

        img,
        video {
          height: 100dvh;
          max-height: 100dvh;
          min-height: 100dvh;
          object-fit: contain;
          z-index: 100;
        }
      }
    }

    img,
    video {
      max-height: calc(100dvh - var(--pad) * 2);
      max-width: 100%;
    }

    .info {
      font-size: 0.5em;
      margin: 0;
      width: 0;
      min-width: calc(100% - 2em);

      & > div {
        // background-color: #123a;
        background-color: #4444;
        line-height: 1.3em;
        border-radius: 0.5em;
        margin: 1em 0;
        overflow: hidden;
        border: 1px solid #fff1;
      }

      p {
        white-space: pre-wrap;
        flex-grow: 1;

        margin: 0;
      }

      .basic {
        display: flex;
        padding: 0.7em 1em;
        border-radius: 0.5em;
        margin: 1em 0;
      }

      .extra {
        p {
          padding: 0.5em 0.7em;
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
        font-weight: normal;
        background-color: #112a;
        padding: 0.2em 0.7em;

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

  .focusButton {
    opacity: 0;
    position: absolute;
    pointer-events: none;
  }

  .fallback {
    pointer-events: none;
    opacity: 0;
    position: fixed;
  }
</style>
