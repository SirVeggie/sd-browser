<script lang="ts">
    import { createEventDispatcher, tick } from "svelte";
    import { searchKeywords } from "$lib/types/misc";
    import { imageRefs } from "$lib/stores/imageRefStore";
    import { tagsStore } from "$lib/stores/tagsStore";
    import { tagRegistryNames } from "$lib/types/tags";
    import { getUnknownExactTagRanges, segmentOverlapsRange } from "$lib/tools/tagSearch";
    import {
        getSearchDisplay,
        getTouchedAbbreviatedIdRange,
        inflateSearchDisplay,
        mapDisplaySelectionToCanonical,
        shouldCollapseExpandedSearch,
    } from "$lib/tools/searchDisplay";
    import { getSearchReferenceRanges } from "$lib/tools/searchReferences";

    export let placeholder = "";
    export let value = "";
    export let element: HTMLInputElement | undefined = undefined;

    type Segment = {
        text: string;
        keyword: boolean;
        unknownTag: boolean;
        abbreviatedId: boolean;
        validSearchRef: boolean;
        invalidSearchRef: boolean;
    };

    const keywordAliases = new Set([
        ...searchKeywords.flatMap(keyword => keyword.split("|")),
        "TO",
    ].map(keyword => keyword.toLowerCase()));

    const tokenRegex = /(\s+|[A-Za-z]+|[^A-Za-z\s]+)/g;
    const dispatch = createEventDispatcher();

    let scrollLeft = 0;
    let displayValue = getSearchDisplay(value).text;
    let showExpandedIds = false;
    let lastValue = value;

    $: registryNames = tagRegistryNames($tagsStore);
    $: display = getSearchDisplay(value);
    $: abbreviatedIdRanges = showExpandedIds ? [] : display.ranges;
    $: searchRefRanges = getSearchReferenceRanges(displayValue, $imageRefs);
    $: segments = getSegments(displayValue, registryNames, abbreviatedIdRanges, searchRefRanges);
    $: if (element)
        element.dataset.canonicalValue = value;

    $: if (value !== lastValue) {
        lastValue = value;
        showExpandedIds = false;
        displayValue = getSearchDisplay(value).text;
    }

    async function clear() {
        value = "";
        lastValue = "";
        showExpandedIds = false;
        displayValue = "";
        scrollLeft = 0;
        element?.focus();
        await Promise.resolve();
        dispatch("input");
        dispatch("change");
    }

    function syncScroll() {
        scrollLeft = element?.scrollLeft ?? 0;
    }

    function emitInput() {
        dispatch("input");
    }

    function emitChange() {
        dispatch("change");
    }

    function handleInput(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        value = inflateSearchDisplay(input.value, value);
        lastValue = value;
        showExpandedIds = showExpandedIds && !shouldCollapseExpandedSearch(value);
        displayValue = showExpandedIds ? value : getSearchDisplay(value).text;
        emitInput();
    }

    async function handleBeforeInput(event: InputEvent) {
        const input = element;
        if (!input || showExpandedIds)
            return;

        const selectionStart = input.selectionStart ?? 0;
        const selectionEnd = input.selectionEnd ?? selectionStart;
        const range = getTouchedAbbreviatedIdRange({
            ranges: display.ranges,
            selectionStart,
            selectionEnd,
            inputType: event.inputType,
        });
        if (!range)
            return;

        event.preventDefault();
        showExpandedIds = true;
        displayValue = value;

        const selection = mapDisplaySelectionToCanonical(range, selectionStart, selectionEnd);
        await tick();
        input.setSelectionRange(selection.selectionStart, selection.selectionEnd);
    }

    function getSegments(
        text: string,
        names: Set<string>,
        idRanges: { start: number; end: number }[],
        refRanges: { start: number; end: number; valid: boolean }[],
    ): Segment[] {
        const unknownRanges = getUnknownExactTagRanges(text, names);
        const validRefRanges = refRanges.filter((range) => range.valid);
        const invalidRefRanges = refRanges.filter((range) => !range.valid);
        let offset = 0;
        return Array.from(text.matchAll(tokenRegex), match => {
            const token = match[0];
            const segmentStart = offset;
            const segmentEnd = offset + token.length;
            offset = segmentEnd;
            const escapedKeyword = segmentStart > 0
                && text[segmentStart - 1] === '\\'
                && /^[A-Za-z]+$/.test(token);
            return {
                text: token,
                keyword: !escapedKeyword && keywordAliases.has(token.toLowerCase()),
                unknownTag: segmentOverlapsRange(segmentStart, segmentEnd, unknownRanges),
                abbreviatedId: segmentOverlapsRange(segmentStart, segmentEnd, idRanges),
                validSearchRef: segmentOverlapsRange(segmentStart, segmentEnd, validRefRanges),
                invalidSearchRef: segmentOverlapsRange(segmentStart, segmentEnd, invalidRefRanges),
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
                            class:unknown-tag={segment.unknownTag || segment.invalidSearchRef}
                            class:abbreviated-id={segment.abbreviatedId || segment.validSearchRef}
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
            on:beforeinput={handleBeforeInput}
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
