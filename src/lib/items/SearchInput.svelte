<script lang="ts">
    import { searchKeywords } from "$lib/types/misc";
    import { tagsStore } from "$lib/stores/tagsStore";
    import { tagRegistryNames } from "$lib/types/tags";
    import { getUnknownExactTagRanges, segmentOverlapsRange } from "$lib/tools/tagSearch";

    export let placeholder = "";
    export let value = "";
    export let element: HTMLInputElement | undefined = undefined;

    type Segment = {
        text: string;
        keyword: boolean;
        unknownTag: boolean;
    };

    const keywordAliases = new Set([
        ...searchKeywords.flatMap(keyword => keyword.split("|")),
        "TO",
    ].map(keyword => keyword.toLowerCase()));

    const tokenRegex = /(\s+|[A-Za-z]+|[^A-Za-z\s]+)/g;

    let scrollLeft = 0;

    $: segments = getSegments(value, tagRegistryNames($tagsStore));

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

    function getSegments(text: string, registryNames: Set<string>): Segment[] {
        const unknownRanges = getUnknownExactTagRanges(text, registryNames);
        let offset = 0;
        return Array.from(text.matchAll(tokenRegex), match => {
            const token = match[0];
            const segmentStart = offset;
            const segmentEnd = offset + token.length;
            offset = segmentEnd;
            return {
                text: token,
                keyword: keywordAliases.has(token.toLowerCase()),
                unknownTag: segmentOverlapsRange(segmentStart, segmentEnd, unknownRanges),
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
                        <span
                            class:keyword={segment.keyword}
                            class:unknown-tag={segment.unknownTag}
                        >{segment.text}</span>
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

    .unknown-tag {
        color: #f0a0a0;
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
