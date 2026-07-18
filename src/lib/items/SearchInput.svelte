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

    /** Comparison ops highlighted only inside ASP/ASPECT clauses (like TO for DATE). */
    const aspectOperatorTokens = new Set([">=", "<=", "!=", "=", ">", "<"]);
    const aspectKeywordAliases = new Set(["aspect", "asp"]);

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
        const segments = Array.from(text.matchAll(tokenRegex), match => {
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

        markAspectOperators(segments, text);
        return segments;
    }

    function markAspectOperators(segments: Segment[], text: string) {
        let inAspectClause = false;
        let offset = 0;

        for (const segment of segments) {
            const segmentStart = offset;
            offset += segment.text.length;

            if (/^\s+$/.test(segment.text))
                continue;

            const lower = segment.text.toLowerCase();
            const escaped = segmentStart > 0 && text[segmentStart - 1] === '\\';

            if (!escaped && aspectKeywordAliases.has(lower)) {
                inAspectClause = true;
                segment.keyword = true;
                continue;
            }

            if (!inAspectClause)
                continue;

            if (aspectOperatorTokens.has(segment.text) || /^(>=|<=|!=|=|>|<)/.test(segment.text)) {
                segment.keyword = true;
                continue;
            }

            // Stay in the clause for ratio/decimal values; leave on the next search keyword.
            if (/^\d+(?:\.\d+)?(?::\d+(?:\.\d+)?)?$/.test(segment.text))
                continue;

            if (!escaped && keywordAliases.has(lower))
                inAspectClause = false;
        }
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
        border-radius: 9px;
        padding: 0.5em 0.5em;
        box-sizing: border-box;
        white-space: pre;
    }

    input {
        position: relative;
        background-color: transparent;
        color: transparent;
        caret-color: var(--ink);
        border: none;
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.28);

        &::placeholder {
            color: transparent;
        }

        &:focus {
            outline: none;
            box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.36);
        }
    }

    .highlight {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        background-color: rgba(0, 0, 0, 0.34);
        color: var(--ink);
        border: none;
    }

    .highlightText {
        display: inline-block;
        min-width: 100%;
        white-space: pre;
        will-change: transform;
    }

    .keyword {
        color: var(--keyword);
    }

    .unknown-tag {
        color: var(--danger);
    }

    .abbreviated-id {
        color: #d4c4a0;
    }

    .placeholder {
        color: var(--muted);
        opacity: 0.65;
    }

    button {
        appearance: none;
        background-color: transparent;
        border: none;
        position: absolute;
        right: 0.5em;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        padding: 0;
        height: 1.25em;
        width: 1.25em;
        cursor: pointer;
        color: var(--muted);
    }
</style>
