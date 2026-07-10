<script lang="ts">
    import { tick } from "svelte";
    import { searchKeywords } from "$lib/types/misc";
    import { tagsStore } from "$lib/stores/tagsStore";
    import { tagRegistryNames } from "$lib/types/tags";
    import { getUnknownExactTagRanges, segmentOverlapsRange } from "$lib/tools/tagSearch";
    import {
        applyExpandedIdDeletion,
        canonicalFromDisplay,
        collapseExpandedIds,
        findAbbreviatedIdSegmentAtCursor,
        formatSearchDisplay,
        getAbbreviatedIdDisplayRanges,
    } from "$lib/tools/searchDisplay";

    export let placeholder = "";
    export let value = "";
    export let element: HTMLInputElement | undefined = undefined;

    type Segment = {
        text: string;
        keyword: boolean;
        unknownTag: boolean;
        abbreviatedId: boolean;
    };

    const keywordAliases = new Set([
        ...searchKeywords.flatMap(keyword => keyword.split("|")),
        "TO",
    ].map(keyword => keyword.toLowerCase()));

    const tokenRegex = /(\s+|[A-Za-z]+|[^A-Za-z\s]+)/g;

    let scrollLeft = 0;
    let displayValue = formatSearchDisplay(value);
    let expandedIdStarts = new Set<number>();
    let lastEmittedValue = value;

    $: registryNames = tagRegistryNames($tagsStore);
    $: abbreviatedIdRanges = getAbbreviatedIdDisplayRanges(value, expandedIdStarts);
    $: segments = getSegments(displayValue, registryNames, abbreviatedIdRanges);
    $: if (element)
        element.dataset.canonicalValue = value;

    $: if (value !== lastEmittedValue) {
        lastEmittedValue = value;
        expandedIdStarts = new Set();
        displayValue = formatSearchDisplay(value);
    }

    async function clear() {
        value = "";
        lastEmittedValue = "";
        expandedIdStarts = new Set();
        displayValue = "";
        scrollLeft = 0;
        element?.focus();
        await Promise.resolve();
        element?.dispatchEvent(new Event("input"));
        element?.dispatchEvent(new Event("change"));
    }

    function syncScroll() {
        scrollLeft = element?.scrollLeft ?? 0;
    }

    function emitInput() {
        element?.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function emitChange() {
        element?.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function commitCanonical(nextCanonical: string, nextDisplay: string, nextExpanded: Set<number>) {
        value = nextCanonical;
        lastEmittedValue = nextCanonical;
        displayValue = nextDisplay;
        expandedIdStarts = nextExpanded;
    }

    function handleInput(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const nextDisplay = input.value;
        const nextCanonical = canonicalFromDisplay(nextDisplay, value);
        const nextExpanded = collapseExpandedIds(nextCanonical, expandedIdStarts);
        const formattedDisplay = formatSearchDisplay(nextCanonical, nextExpanded);

        commitCanonical(nextCanonical, formattedDisplay, nextExpanded);

        if (formattedDisplay !== nextDisplay && element) {
            const cursor = input.selectionStart ?? formattedDisplay.length;
            void tick().then(() => {
                element?.setSelectionRange(cursor, cursor);
            });
        }
    }

    async function handleKeydown(event: KeyboardEvent) {
        if (event.key !== "Backspace" && event.key !== "Delete")
            return;

        const input = element;
        if (!input)
            return;

        const cursor = input.selectionStart ?? 0;
        const selectionEnd = input.selectionEnd ?? cursor;
        if (cursor !== selectionEnd)
            return;

        const match = findAbbreviatedIdSegmentAtCursor(
            value,
            expandedIdStarts,
            cursor,
            event.key,
        );
        if (!match)
            return;

        event.preventDefault();

        const result = applyExpandedIdDeletion({
            canonical: value,
            expandedIdStarts,
            span: match.span,
            segmentStart: match.segmentStart,
            cursor,
            key: event.key,
        });

        commitCanonical(result.canonical, result.display, result.expandedIdStarts);
        emitInput();

        await tick();
        input.setSelectionRange(result.cursor, result.cursor);
    }

    function getSegments(
        text: string,
        names: Set<string>,
        idRanges: { start: number; end: number }[],
    ): Segment[] {
        const unknownRanges = getUnknownExactTagRanges(text, names);
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
                abbreviatedId: segmentOverlapsRange(segmentStart, segmentEnd, idRanges),
            };
        });
    }
</script>

<div class="input">
    <form>
        <div class="highlight" aria-hidden="true">
            <div class="highlightText" style:transform={`translateX(${-scrollLeft}px)`}>
                {#if displayValue}
                    {#each segments as segment}
                        <span
                            class:keyword={segment.keyword}
                            class:unknown-tag={segment.unknownTag}
                            class:abbreviated-id={segment.abbreviatedId}
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
            on:change={emitChange}
            on:input={handleInput}
            on:keydown={handleKeydown}
            on:focus
            on:blur
            on:scroll={syncScroll}
            bind:value={displayValue}
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

    .abbreviated-id {
        color: #ffd18f;
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
