<script lang="ts">
    export let mosaic = false;
    export let shimmerDelay: string | undefined = undefined;
    export let shimmerIndex: number | undefined = undefined;

    $: resolvedDelay = shimmerDelay ??
        (shimmerIndex === undefined ? "0ms" : `${(shimmerIndex % 12) * 160}ms`);
</script>

<div
    class="placeholder"
    class:mosaic
    aria-hidden="true"
    style:--shimmer-delay={resolvedDelay}
>
    <div class="shimmer"></div>
</div>

<style lang="scss">
    .placeholder {
        position: relative;
        display: block;
        width: 100%;
        height: 100%;
        min-height: inherit;
        background-color: var(--bg-elev);
        border-radius: 0.5em;
        overflow: hidden;
        isolation: isolate;
        box-shadow:
            inset 0 0 18px 6px var(--bg),
            inset 0 0 36px 12px color-mix(in srgb, var(--bg) 85%, transparent);

        &.mosaic {
            border-radius: 0;
            box-shadow: none;
        }
    }

    .shimmer {
        position: absolute;
        top: -50%;
        left: -75%;
        width: 250%;
        height: 200%;
        background: linear-gradient(
            108deg,
            transparent 28%,
            color-mix(in srgb, var(--ink) 4%, transparent) 40%,
            color-mix(in srgb, var(--accent) 10%, transparent) 50%,
            color-mix(in srgb, var(--ink) 4%, transparent) 60%,
            transparent 72%
        );
        z-index: 1;
        opacity: 0;
        transform: translateX(-70%);
        animation: shimmer-sweep 1.9s ease-in-out infinite;
        animation-delay: var(--shimmer-delay, 0ms);
        will-change: transform, opacity;
        pointer-events: none;
    }

    @keyframes shimmer-sweep {
        0%,
        10% {
            opacity: 0;
            transform: translateX(-70%);
        }

        20% {
            opacity: 1;
        }

        70% {
            opacity: 1;
            transform: translateX(70%);
        }

        80%,
        100% {
            opacity: 0;
            transform: translateX(70%);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .shimmer {
            animation: none;
            opacity: 0;
        }
    }
</style>
