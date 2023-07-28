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
        class="left"
        class:hidden
        on:click={onLeft}
        on:touchstart={handleTouch(onLeft)}
    >
        <div>{"<"}</div>
    </button>
{/if}

{#if right && enabled}
    <button
        class="right"
        class:hidden
        on:click={onRight}
        on:touchstart={handleTouch(onRight)}
    >
        <div>{">"}</div>
    </button>
{/if}

<style lang="scss">
    button {
        text-decoration: none;
        appearance: none;
        cursor: pointer;
        background-color: transparent;
        border: none;
        padding: 0;
        margin: 0;
        outline: none;
    }

    div {
        display: flex;
        justify-content: center;
        align-items: center;

        height: max(10vw, 10vh);
        width: max(5vw, 5vh);
        border: none;
        color: #fffa;
        background-color: #000a;
    }

    .left {
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        z-index: 5;
        width: max(5vw, 5vh);
        display: flex;
        justify-content: center;
        align-items: center;

        div {
            border-radius: 0 0.5em 0.5em 0;
        }
    }

    .right {
        position: fixed;
        top: 0;
        bottom: 0;
        right: var(--flyout-width);
        z-index: 5;
        width: max(5vw, 5vh);
        display: flex;
        justify-content: center;
        align-items: center;

        :global(.flanimate) & {
            transition: right 0.2s ease;
        }

        div {
            border-radius: 0.5em 0 0 0.5em;
        }
    }

    .hidden {
        opacity: 0;
    }
</style>
