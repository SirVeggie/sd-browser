<script lang="ts">
    export let onLeft: () => void;
    export let onRight: () => void;
    export let left = true;
    export let right = true;
    export let hidden = false;
    export let enabled = true;

    function handleTouch(action: () => void) {
        return (e: TouchEvent) => {
            e.preventDefault();
            e.stopPropagation();
            action();

            continueTouch(action);
        };
    }

    function continueTouch(action: () => void) {
        let counter = 0;
        const interval = setInterval(() => {
            if (++counter < 3) return;
            action();
        }, 200);
        const stop = () => clearInterval(interval);
        window.addEventListener("touchend", stop, { once: true });
        window.addEventListener("touchcancel", stop, { once: true });
    }
</script>

{#if left && enabled}
    <button
        type="button"
        class="nav-arrow left"
        class:hidden
        aria-label="Previous image"
        on:click={onLeft}
        on:touchstart={handleTouch(onLeft)}
    >
        <span class="glow" aria-hidden="true"></span>
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M14.5 5.5 8 12l6.5 6.5"
                fill="none"
                stroke="currentColor"
                stroke-width="2.25"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    </button>
{/if}

{#if right && enabled}
    <button
        type="button"
        class="nav-arrow right"
        class:hidden
        aria-label="Next image"
        on:click={onRight}
        on:touchstart={handleTouch(onRight)}
    >
        <span class="glow" aria-hidden="true"></span>
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M9.5 5.5 16 12l-6.5 6.5"
                fill="none"
                stroke="currentColor"
                stroke-width="2.25"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    </button>
{/if}

<style lang="scss">
    .nav-arrow {
        appearance: none;
        border: none;
        padding: 0;
        margin: 0;
        outline: none;
        cursor: pointer;
        background: transparent;
        position: fixed;
        top: 0;
        bottom: 0;
        z-index: 46;
        width: max(5.5vw, 3.5rem);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--ink);
        transition: color 0.15s ease;

        &:focus-visible .icon {
            color: var(--accent);
            opacity: 1;
        }

        &:hover .glow,
        &:focus-visible .glow {
            opacity: 1;
        }

        &:hover .icon,
        &:focus-visible .icon {
            opacity: 1;
            transform: scale(1.05);
        }

        &:active .icon {
            transform: scale(0.96);
        }
    }

    .glow {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 3.25rem;
        height: 3.25rem;
        border-radius: 50%;
        pointer-events: none;
        opacity: 0.58;
        transform: translate(-50%, -50%);
        background: radial-gradient(
            circle,
            rgba(16, 14, 12, 0.72) 0%,
            rgba(16, 14, 12, 0.48) 38%,
            rgba(16, 14, 12, 0.16) 66%,
            transparent 76%
        );
        transition:
            opacity 0.18s ease,
            transform 0.18s ease;
    }

    .icon {
        position: relative;
        z-index: 1;
        width: clamp(1.25rem, 2.4vw, 1.75rem);
        height: clamp(1.25rem, 2.4vw, 1.75rem);
        opacity: 0.82;
        filter:
            drop-shadow(0 1px 2px rgba(0, 0, 0, 0.95))
            drop-shadow(0 0 6px rgba(0, 0, 0, 0.7));
        transition:
            opacity 0.15s ease,
            color 0.15s ease,
            transform 0.15s ease;
    }

    .left {
        left: 0;

        .icon {
            margin-right: 0.15rem;
        }
    }

    .right {
        right: var(--flyout-width);

        :global(.flanimate) & {
            transition:
                right 0.2s ease,
                color 0.15s ease;
        }

        .icon {
            margin-left: 0.15rem;
        }
    }

    .hidden {
        opacity: 0;
    }
</style>
