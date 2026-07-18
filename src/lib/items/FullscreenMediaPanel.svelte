<script lang="ts">
  import { browser } from "$app/environment";
  import { createEventDispatcher, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { imageFadeMs } from "$lib/stores/styleStore";
  import type { ClientImage } from "$lib/types/images";

  export let image: ClientImage | undefined = undefined;
  /** When empty or loadEnabled is false, the panel does not hit the network. */
  export let mediaUrl = "";
  export let loadEnabled = false;
  /** On-stage panel is visible; hidden panels stay off-screen for preload. */
  export let role: "stage" | "hidden" = "hidden";
  /** Show loader over a still-visible stage frame while the desired target loads. */
  export let showWaitingLoader = false;

  const dispatch = createEventDispatcher<{
    ready: { id: string };
    unready: { id: string };
  }>();

  const maxMediaRetries = 6;
  const mediaRetryDelayMs = 400;

  let mediaLoaded = false;
  let placeholderVisible = true;
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  let mediaRetryTimer: ReturnType<typeof setTimeout> | undefined;
  let mediaRetryCount = 0;
  let displayUrl = "";
  let loadingBaseUrl = "";
  let imgElement: HTMLImageElement | undefined;
  let videoElement: HTMLVideoElement | undefined;
  let reportedReadyId = "";

  $: panelId = image?.id ?? "";
  $: isVideo = image?.type === "video";
  $: baseUrl = loadEnabled && mediaUrl ? mediaUrl : "";
  $: if (baseUrl !== loadingBaseUrl) resetMedia(baseUrl);
  $: baseUrl, displayUrl, imgElement, videoElement, checkAlreadyReady();

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

  function buildRetryUrl(url: string, retryCount: number): string {
    if (!url) return "";
    if (retryCount === 0) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}retry=${retryCount}`;
  }

  function prefersReducedMotion() {
    return browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function urlsMatch(left: string, right: string): boolean {
    if (!left || !right) return false;
    try {
      return new URL(left, location.origin).href === new URL(right, location.origin).href;
    } catch {
      return left === right;
    }
  }

  function emitUnready() {
    if (!panelId) return;
    if (reportedReadyId === panelId) {
      reportedReadyId = "";
      dispatch("unready", { id: panelId });
    }
  }

  function emitReady() {
    if (!panelId || reportedReadyId === panelId) return;
    reportedReadyId = panelId;
    dispatch("ready", { id: panelId });
  }

  function resetMedia(nextBaseUrl: string) {
    clearRevealTimer();
    clearMediaRetryTimer();
    mediaRetryCount = 0;
    loadingBaseUrl = nextBaseUrl;
    displayUrl = buildRetryUrl(nextBaseUrl, 0);
    mediaLoaded = false;
    placeholderVisible = !!nextBaseUrl;
    emitUnready();
  }

  function scheduleRetry() {
    if (!loadingBaseUrl) return;
    if (mediaRetryCount >= maxMediaRetries) return;

    clearMediaRetryTimer();
    mediaRetryCount += 1;
    placeholderVisible = true;
    mediaLoaded = false;
    emitUnready();
    mediaRetryTimer = setTimeout(() => {
      mediaRetryTimer = undefined;
      if (!loadingBaseUrl) return;
      displayUrl = buildRetryUrl(loadingBaseUrl, mediaRetryCount);
    }, mediaRetryDelayMs);
  }

  function finishReveal() {
    mediaLoaded = true;
    if (!placeholderVisible || prefersReducedMotion() || get(imageFadeMs) <= 0) {
      placeholderVisible = false;
      emitReady();
      return;
    }

    clearRevealTimer();
    revealTimer = setTimeout(() => {
      revealTimer = undefined;
      placeholderVisible = false;
      emitReady();
    }, get(imageFadeMs));
  }

  function markReady() {
    if (!loadingBaseUrl || mediaLoaded) return;
    finishReveal();
  }

  function onImageLoad(event: Event) {
    const element = event.currentTarget;
    if (!(element instanceof HTMLImageElement)) return;
    void (async () => {
      try {
        await element.decode();
      } catch {
        // Still reveal; decode can reject for benign browser-specific reasons.
      }
      if (!urlsMatch(element.currentSrc || element.src, displayUrl)) return;
      markReady();
    })();
  }

  function elementMatchesDisplay(element: HTMLImageElement | HTMLVideoElement): boolean {
    if (!displayUrl) return false;
    return urlsMatch(element.currentSrc || element.src, displayUrl);
  }

  function checkAlreadyReady() {
    if (!displayUrl) return;
    if (
      imgElement?.complete &&
      imgElement.naturalWidth > 0 &&
      elementMatchesDisplay(imgElement)
    ) {
      markReady();
    } else if (
      videoElement &&
      videoElement.readyState >= 2 &&
      elementMatchesDisplay(videoElement)
    ) {
      markReady();
    }
  }

  $: if (role === "stage" && isVideo && videoElement && mediaLoaded) {
    void videoElement.play().catch(() => {
      // Autoplay can be blocked; muted loop usually succeeds.
    });
  } else if (role === "hidden" && videoElement) {
    videoElement.pause();
  }

  onDestroy(() => {
    clearRevealTimer();
    clearMediaRetryTimer();
  });
</script>

<div
  class="panel"
  class:stage={role === "stage"}
  class:hidden-role={role === "hidden"}
  class:no-fade={$imageFadeMs <= 0}
  style={`--image-fade-ms: ${$imageFadeMs}ms`}
  aria-hidden={role === "hidden" ? "true" : undefined}
>
  {#if (placeholderVisible && !!displayUrl) || showWaitingLoader || (role === "stage" && !displayUrl)}
    <div class="loading-slot">
      <div class="dot-loader" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  {/if}
  {#if displayUrl}
    {#key displayUrl}
      {#if isVideo}
        <video
          bind:this={videoElement}
          autoplay={role === "stage"}
          loop
          muted
          preload={loadEnabled ? "auto" : "none"}
          src={displayUrl}
          class:media-hidden={!mediaLoaded}
          on:canplay={markReady}
          on:error={scheduleRetry}
        >
          <source src={displayUrl} type="video/mp4" />
        </video>
      {:else}
        <img
          bind:this={imgElement}
          src={displayUrl}
          alt={panelId}
          class:media-hidden={!mediaLoaded}
          on:load={onImageLoad}
          on:error={scheduleRetry}
        />
      {/if}
    {/key}
  {/if}
</div>

<style lang="scss">
  .panel {
    grid-area: 1 / 1;
    position: relative;
    display: grid;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-height: 0;

    &.hidden-role {
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
      overflow: hidden;
    }
  }

  .loading-slot {
    grid-area: 1 / 1;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-height: min(40vh, 20em);
    pointer-events: none;
  }

  .dot-loader {
    --loader-accent: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.45em;
    padding: 0.85em 1.1em;
    border-radius: 999px;
    /* Localized shadow so dots stay readable on bright or busy media. */
    background: radial-gradient(
      closest-side,
      rgba(0, 0, 0, 0.45) 0%,
      rgba(0, 0, 0, 0.22) 55%,
      rgba(0, 0, 0, 0) 100%
    );
    filter: drop-shadow(0 0 0.55em rgba(0, 0, 0, 0.55));
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

  img,
  video {
    grid-area: 1 / 1;
    display: block;
    width: 100%;
    height: 100%;
    max-height: calc(100dvh - var(--pad, 0px) * 2);
    max-width: 100%;
    object-fit: contain;
    transition: opacity var(--image-fade-ms, 180ms) ease;

    &.media-hidden {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
  }

  .no-fade img,
  .no-fade video {
    transition: none;
  }
</style>
