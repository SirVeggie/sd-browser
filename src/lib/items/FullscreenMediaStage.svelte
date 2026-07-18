<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { compressedMode, useSmartSubsampling } from "$lib/stores/searchStore";
  import { buildImageQueryParams } from "$lib/requests/imageRequests";
  import type { ClientImage } from "$lib/types/images";
  import FullscreenMediaPanel from "./FullscreenMediaPanel.svelte";

  export let image: ClientImage | undefined = undefined;
  export let prevImage: ClientImage | undefined = undefined;
  export let nextImage: ClientImage | undefined = undefined;
  export let showOriginal = false;
  /** On-stage image id (what the user sees). */
  export let stageId = "";
  export let stageWidth: number | undefined = undefined;
  export let stageHeight: number | undefined = undefined;

  const dispatch = createEventDispatcher<{
    stagechange: { id: string; width?: number; height?: number };
  }>();

  let waiting = false;

  let stageImage: ClientImage | undefined;
  let prevSlot: ClientImage | undefined;
  let nextSlot: ClientImage | undefined;

  let stageReady = false;
  let prevReady = false;
  let nextReady = false;
  let neighborsAllowed = false;

  /** Desired selection from parent; may lead the stage while a target loads. */
  let desiredId = "";

  $: qualityMode = showOriginal ? "original" : $compressedMode;
  $: mediaQuery = buildImageQueryParams(qualityMode, $useSmartSubsampling);

  function mediaUrlFor(img: ClientImage | undefined): string {
    if (!img?.id) return "";
    return `/api/images/${img.id}?${mediaQuery}`;
  }

  function publishStage(img: ClientImage | undefined) {
    stageId = img?.id ?? "";
    stageWidth = img?.width;
    stageHeight = img?.height;
    if (img?.id) {
      dispatch("stagechange", {
        id: img.id,
        width: img.width,
        height: img.height,
      });
    }
  }

  function setStage(img: ClientImage | undefined, ready: boolean) {
    stageImage = img;
    stageReady = ready;
    neighborsAllowed = ready;
    publishStage(img);
  }

  function refillNeighbors(from: ClientImage | undefined) {
    if (!from?.id) {
      prevSlot = undefined;
      nextSlot = undefined;
      prevReady = false;
      nextReady = false;
      return;
    }

    if (prevImage?.id === from.id) {
      // Should not happen; clear invalid neighbor.
      prevSlot = undefined;
      prevReady = false;
    } else if (prevSlot?.id !== prevImage?.id) {
      prevSlot = prevImage;
      prevReady = false;
    }

    if (nextImage?.id === from.id) {
      nextSlot = undefined;
      nextReady = false;
    } else if (nextSlot?.id !== nextImage?.id) {
      nextSlot = nextImage;
      nextReady = false;
    }
  }

  function promoteNext() {
    if (!nextSlot) return;
    const promoted = nextSlot;
    const oldStage = stageImage;
    prevSlot = oldStage;
    prevReady = stageReady;
    stageImage = promoted;
    stageReady = true;
    neighborsAllowed = true;
    nextSlot = nextImage?.id === promoted.id ? undefined : nextImage;
    nextReady = false;
    publishStage(promoted);
    waiting = false;
  }

  function promotePrev() {
    if (!prevSlot) return;
    const promoted = prevSlot;
    const oldStage = stageImage;
    nextSlot = oldStage;
    nextReady = stageReady;
    stageImage = promoted;
    stageReady = true;
    neighborsAllowed = true;
    prevSlot = prevImage?.id === promoted.id ? undefined : prevImage;
    prevReady = false;
    publishStage(promoted);
    waiting = false;
  }

  /**
   * Align stage with the parent's desired image.
   * Cold start loads current first; neighbors wait until stage is ready.
   */
  function syncDesired(desired: ClientImage | undefined) {
    const nextDesiredId = desired?.id ?? "";
    desiredId = nextDesiredId;

    if (!nextDesiredId || !desired) {
      setStage(undefined, false);
      prevSlot = undefined;
      nextSlot = undefined;
      prevReady = false;
      nextReady = false;
      neighborsAllowed = false;
      waiting = false;
      return;
    }

    // Already on stage.
    if (stageImage?.id === nextDesiredId) {
      waiting = false;
      if (neighborsAllowed) refillNeighbors(stageImage);
      return;
    }

    // Instant promote from preloaded neighbor.
    if (nextSlot?.id === nextDesiredId && nextReady) {
      promoteNext();
      return;
    }
    if (prevSlot?.id === nextDesiredId && prevReady) {
      promotePrev();
      return;
    }

    // Cold open / jump: nothing on stage yet.
    if (!stageImage?.id) {
      setStage(desired, false);
      prevSlot = prevImage?.id === desired.id ? undefined : prevImage;
      nextSlot = nextImage?.id === desired.id ? undefined : nextImage;
      prevReady = false;
      nextReady = false;
      waiting = false;
      return;
    }

    // Keep stage; ensure target is loading (navigation priority).
    waiting = true;
    if (nextSlot?.id === nextDesiredId || (!nextSlot && nextImage?.id === nextDesiredId)) {
      nextSlot = desired;
      nextReady = false;
    } else if (prevSlot?.id === nextDesiredId || (!prevSlot && prevImage?.id === nextDesiredId)) {
      prevSlot = desired;
      prevReady = false;
    } else {
      // Jump: reuse next slot as incoming target.
      nextSlot = desired;
      nextReady = false;
    }
  }

  $: syncDesired(image);

  // Keep neighbor assignments fresh when parent indices move but stage is stable.
  $: if (stageImage?.id && neighborsAllowed && !waiting) {
    if (prevImage?.id !== prevSlot?.id && prevImage?.id !== stageImage.id) {
      prevSlot = prevImage;
      prevReady = false;
    }
    if (nextImage?.id !== nextSlot?.id && nextImage?.id !== stageImage.id) {
      nextSlot = nextImage;
      nextReady = false;
    }
  }

  function onStageReady(id: string) {
    if (stageImage?.id !== id) return;
    stageReady = true;
    neighborsAllowed = true;
    waiting = false;
    refillNeighbors(stageImage);
    publishStage(stageImage);
  }

  function onStageUnready(id: string) {
    if (stageImage?.id !== id) return;
    stageReady = false;
  }

  function onPrevReady(id: string) {
    if (prevSlot?.id !== id) return;
    prevReady = true;
    if (waiting && desiredId === id) promotePrev();
  }

  function onPrevUnready(id: string) {
    if (prevSlot?.id !== id) return;
    prevReady = false;
  }

  function onNextReady(id: string) {
    if (nextSlot?.id !== id) return;
    nextReady = true;
    if (waiting && desiredId === id) promoteNext();
  }

  function onNextUnready(id: string) {
    if (nextSlot?.id !== id) return;
    nextReady = false;
  }

  // While waiting for a specific neighbor, load that side even before neighborsAllowed.
  $: loadPrev =
    !!prevSlot &&
    (neighborsAllowed || (waiting && desiredId === prevSlot.id));
  $: loadNext =
    !!nextSlot &&
    (neighborsAllowed || (waiting && desiredId === nextSlot.id));
  // Opposite side yields while we urgently need the navigation target.
  $: loadPrevEffective =
    loadPrev && !(waiting && desiredId === nextSlot?.id && desiredId !== prevSlot?.id);
  $: loadNextEffective =
    loadNext && !(waiting && desiredId === prevSlot?.id && desiredId !== nextSlot?.id);

  $: panelEntries = [
    {
      key: stageImage?.id ? `id:${stageImage.id}` : "stage-empty",
      image: stageImage,
      role: "stage" as const,
      loadEnabled: !!stageImage,
      showWaitingLoader: waiting && stageReady,
      onReady: onStageReady,
      onUnready: onStageUnready,
    },
    {
      key: prevSlot?.id ? `id:${prevSlot.id}` : "prev-empty",
      image: prevSlot,
      role: "hidden" as const,
      loadEnabled: loadPrevEffective,
      showWaitingLoader: false,
      onReady: onPrevReady,
      onUnready: onPrevUnready,
    },
    {
      key: nextSlot?.id ? `id:${nextSlot.id}` : "next-empty",
      image: nextSlot,
      role: "hidden" as const,
      loadEnabled: loadNextEffective,
      showWaitingLoader: false,
      onReady: onNextReady,
      onUnready: onNextUnready,
    },
  ];
</script>

<div class="stage">
  {#each panelEntries as entry (entry.key)}
    <FullscreenMediaPanel
      image={entry.image}
      mediaUrl={mediaUrlFor(entry.image)}
      loadEnabled={entry.loadEnabled}
      role={entry.role}
      showWaitingLoader={entry.showWaitingLoader}
      on:ready={(e) => entry.onReady(e.detail.id)}
      on:unready={(e) => entry.onUnready(e.detail.id)}
    />
  {/each}
</div>

<style lang="scss">
  .stage {
    display: grid;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-height: 0;
  }
</style>
