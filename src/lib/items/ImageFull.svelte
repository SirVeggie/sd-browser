<script lang="ts" context="module">
  type PromptFragment = {
    header: string;
    content: string;
    action: () => void;
  }
</script>

<script lang="ts">
  import "../../scroll.css";
  import type { ImageInfo } from "$lib/types";
  import { fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import Button from "./Button.svelte";
  import { notify } from "$lib/components/Notifier.svelte";
  import {
    getNegativePrompt,
    getParams,
    getPositivePrompt,
  } from "$lib/tools/metadataInterpreter";
  import { compressedMode } from "$lib/stores/searchStore";
  import { getQualityParam, imageAction } from "$lib/tools/imageRequests";

  export let cancel: () => void;
  export let imageId: string | undefined;
  export let data: ImageInfo | undefined;
  export let enabled = true;

  let hiddenElementFull: HTMLDivElement;
  let hiddenElementPos: HTMLDivElement;
  let hiddenElementNeg: HTMLDivElement;
  let hiddenElementParams: HTMLDivElement;

  $: imageUrl = imageId
    ? `/api/images/${imageId}?${getQualityParam($compressedMode)}`
    : "";
  $: basicInfo = !data ? "" : extractBasic(data);
  $: promptInfo = !data ? [] : formatMetadata(data.prompt);
  $: fullPrompt = !data ? "" : data.prompt;
  $: positivePrompt = !data ? "" : getPositivePrompt(data.prompt);
  $: negativePrompt = !data ? "" : getNegativePrompt(data.prompt);
  $: paramsPrompt = !data ? "" : getParams(data.prompt);

  function extractBasic(d: ImageInfo): string {
    const model = d.prompt?.match(/Model: (.*?)(,|$)/)?.[1] ?? "Unknown";
    const hash = d.prompt?.match(/Model hash: (.*?)(,|$)/)?.[1] ?? "Unknown";
    let info = "";
    if (model) info += `Model: ${model} [${hash}]`;
    info += `\nCreated: ${new Date(d.createdDate).toLocaleDateString()}`;
    info += `\nModified: ${new Date(d.modifiedDate).toLocaleDateString()}`;
    if (d.folder) info += `\nFolder: ${d.folder}`;
    return info;
  }
  
  function formatMetadata(prompt: string | undefined): PromptFragment[] {
    if (!prompt) return [];
    const blocks: PromptFragment[] = [];
    const pos = getPositivePrompt(prompt);
    const neg = getNegativePrompt(prompt);
    const params = getParams(prompt);
    if (pos)
      blocks.push({ header: "positive prompt", content: pos, action: copyPositive });
    if (neg)
      blocks.push({ header: "negative prompt", content: neg, action: copyNegative });
    if (params)
      blocks.push({ header: "parameters", content: params.split(", ").join("\n"), action: copyParams });
    if (blocks.length === 0)
      blocks.push({ header: "metadata", content: prompt, action: copyPrompt });
    return blocks;
  }

  function handleEsc(e: KeyboardEvent) {
    if (!imageId) return;
    if (e.key === "Escape") cancel();
  }

  function prevent(e: Event) {
    e.stopPropagation();
    e.preventDefault();
  }

  function copyPrompt() {
    if (!imageId) return;
    if (!data?.prompt) return notify("No prompt to copy");
    if (!navigator?.clipboard?.writeText) {
      selectPrompt(hiddenElementFull);
      document.execCommand("copy");
      deselect();
      return;
    }

    navigator.clipboard
      .writeText(data.prompt)
      .then(() => {
        notify("Copied prompt to clipboard");
      })
      .catch(() => {
        notify("Failed to copy prompt to clipboard");
      });
  }

  function copyPositive() {
    if (!imageId) return;
    if (!data?.prompt) return notify("No positive to copy");
    if (!navigator?.clipboard?.writeText) {
      selectPrompt(hiddenElementPos);
      document.execCommand("copy");
      deselect();
    }

    const positive = getPositivePrompt(data.prompt);
    navigator.clipboard
      .writeText(positive)
      .then(() => {
        notify("Copied positive prompt");
      })
      .catch(() => {
        notify("Failed to copy positive prompt");
      });
  }

  function copyNegative() {
    if (!imageId) return;
    if (!data?.prompt) return notify("No negative to copy");
    if (!navigator?.clipboard?.writeText) {
      selectPrompt(hiddenElementNeg);
      document.execCommand("copy");
      deselect();
    }

    const negative = getNegativePrompt(data.prompt);
    navigator.clipboard
      .writeText(negative)
      .then(() => {
        notify("Copied negative prompt");
      })
      .catch(() => {
        notify("Failed to copy negative prompt");
      });
  }
  
  function copyParams() {
    if (!imageId) return;
    if (!data?.prompt) return notify("No parameters to copy");
    if (!navigator?.clipboard?.writeText) {
      selectPrompt(hiddenElementParams);
      document.execCommand("copy");
      deselect();
    }

    const negative = getParams(data.prompt);
    navigator.clipboard
      .writeText(negative)
      .then(() => {
        notify("Copied parameters");
      })
      .catch(() => {
        notify("Failed to copy parameters");
      });
  }

  function deleteImage() {
    if (!imageId) return;
    imageAction(imageId, {
      type: "delete",
    }).then(cancel);
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
{#if enabled && imageId}
  <div
    class="image_overlay"
    on:click={cancel}
    transition:fade={{ duration: 300, easing: cubicOut }}
  >
    <div class="layout">
      <div>
        <div class="card">
          <img src={imageUrl} alt={imageId} />
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
          {#if data}
            <div class="info" on:click={prevent}>
              <div class="basic">
                <p>{basicInfo}</p>
                <div class="buttons">
                  <Button on:click={copyPrompt}>Copy all</Button>
                  <Button on:click={deleteImage}>Delete</Button>
                </div>
              </div>
              {#each promptInfo as info}
                <div class="extra">
                  <h1 class="header">
                    {info.header}
                    <button on:click={info.action}>copy</button>
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
  <div class="fallback" bind:this={hiddenElementPos}>{positivePrompt}</div>
  <div class="fallback" bind:this={hiddenElementNeg}>{negativePrompt}</div>
  <div class="fallback" bind:this={hiddenElementParams}>{paramsPrompt}</div>
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
    }

    img {
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

  .fallback {
    pointer-events: none;
    opacity: 0;
    position: fixed;
  }
</style>
