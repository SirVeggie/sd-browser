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
    $app-bg: #242424;
    $surface: #2a2a2a;

    .placeholder {
        position: relative;
        display: block;
        width: 100%;
        height: 100%;
        min-height: inherit;
        background-color: $surface;
        border-radius: 0.5em;
        overflow: hidden;
        isolation: isolate;

        &:not(.mosaic) {
            box-shadow:
                inset 0 0 18px 6px $app-bg,
                inset 0 0 36px 12px rgba($app-bg, 0.85);
        }

        &.mosaic {
            border-radius: 0;

            &::after {
                content: "";
                position: absolute;
                inset: 0;
                z-index: 2;
                box-shadow:
                    inset 0 0 18px 6px $app-bg,
                    inset 0 0 36px 12px rgba($app-bg, 0.85);
                pointer-events: none;
            }
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
            rgba(210, 218, 228, 0.03) 40%,
            rgba(225, 232, 240, 0.07) 50%,
            rgba(210, 218, 228, 0.03) 60%,
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
