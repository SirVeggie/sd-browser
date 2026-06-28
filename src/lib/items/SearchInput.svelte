<script lang="ts">
    import { searchKeywords } from "$lib/types/misc";

    export let placeholder = "";
    export let value = "";
    export let element: HTMLInputElement | undefined = undefined;

    type Segment = {
        text: string;
        keyword: boolean;
    };

    const keywordAliases = new Set([
        ...searchKeywords.flatMap(keyword => keyword.split("|")),
        "TO",
    ].map(keyword => keyword.toLowerCase()));

    const tokenRegex = /(\s+|[A-Za-z]+|[^A-Za-z\s]+)/g;

    let scrollLeft = 0;

    $: segments = getSegments(value);

    async function clear() {
        value = "";
        scrollLeft = 0;
        element?.focus();
        await Promise.resolve();
        element?.dispatchEvent(new Event("input"));
        element?.dispatchEvent(new Event("change"));
    }

    function syncScroll() {
        scrollLeft = element?.scrollLeft ?? 0;
    }

    function getSegments(text: string): Segment[] {
        return Array.from(text.matchAll(tokenRegex), match => {
            const token = match[0];
            return {
                text: token,
                keyword: keywordAliases.has(token.toLowerCase()),
            };
        });
    }
</script>

<div class="input">
    <form>
        <div class="highlight" aria-hidden="true">
            <div class="highlightText" style:transform={`translateX(${-scrollLeft}px)`}>
                {#if value}
                    {#each segments as segment}
                        <span class:keyword={segment.keyword}>{segment.text}</span>
                    {/each}
                {:else}
                    <span class="placeholder">{placeholder}</span>
                {/if}
            </div>
        </div>
        <input
            type="text"
            bind:this={element}
            {placeholder}
            spellcheck="false"
            on:change
            on:input
            on:focus
            on:blur
            on:scroll={syncScroll}
            bind:value
        />
    </form>
    <button type="button" on:click={clear}>x</button>
</div>

<style lang="scss">
    .input {
        position: relative;
        display: flex;
        align-items: center;
    }

    form {
        position: relative;
        width: 100%;
    }

    input,
    .highlight {
        font-family: "Open sans", sans-serif;
        font-size: 13.3333px;
        line-height: normal;
        width: 100%;
        border-radius: 0.5em;
        padding: 0.5em 0.5em;
        box-sizing: border-box;
        white-space: pre;
    }

    input {
        position: relative;
        background-color: transparent;
        color: transparent;
        caret-color: #ddd;
        box-shadow: inset 0px 2px 3px #0005;
        border: 1px solid #1118;

        &::placeholder {
            color: transparent;
        }

        &:focus {
            outline: none;
            border: 1px solid #aaad;
        }
    }

    .highlight {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        background-color: #333;
        color: #ddd;
        border: 1px solid transparent;
    }

    .highlightText {
        display: inline-block;
        min-width: 100%;
        white-space: pre;
        will-change: transform;
    }

    .keyword {
        color: #8fd3ff;
    }

    .placeholder {
        color: #ddd7;
    }

    button {
        appearance: none;
        background-color: transparent;
        border: none;
        position: absolute;
        right: 0.5em;
        cursor: pointer;
        color: #ddd3;
    }
</style>
