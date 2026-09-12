<script lang="ts">
    import { onDestroy, onMount, tick } from 'svelte';
    import { bindDropdownOutsideClick } from '$lib/tools/dropdownOutsideClick';
    import {
        applyAutocompleteMatch,
        buildAutocompleteQueries,
        usefulAutocompleteMatches,
    } from '$lib/svgen/autocompleteQuery';
    import { searchAutocomplete } from '$lib/svgen/autocompleteClient';
    import {
        svgenAutocompleteBehaviorStore,
        svgenAutocompleteSourcesStore,
    } from '$lib/svgen/stores';
    import type {
        AutocompleteMatch,
        AutocompleteSourceSearch,
    } from '$lib/svgen/autocompleteTypes';

    export let target: HTMLInputElement | HTMLTextAreaElement | undefined;
    export let sourceIds: string[] = [];

    let portal: HTMLDivElement;
    let listEl: HTMLDivElement;
    let attachedTarget: typeof target;
    let open = false;
    let solid = false;
    let hovered = false;
    let showInfoOverride: boolean | null = null;
    let selected = 0;
    let matches: AutocompleteMatch[] = [];
    let listStyle = '';
    let infoStyle = '';
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let requestVersion = 0;
    let manualRequest = false;
    let touchPrimedIndex: number | null = null;
    let composing = false;
    let lastSourceKey = '';

    $: infoVisible = showInfoOverride ?? $svgenAutocompleteBehaviorStore.showInfo;
    $: selectedMatch = matches[selected];
    $: sourceKey = sourceIds.join('\0');
    $: if (sourceKey !== lastSourceKey) {
        lastSourceKey = sourceKey;
        if (open && sourceKey)
            scheduleSearch(manualRequest, 0);
        else if (open)
            close();
    }

    function clearSearchTimer() {
        if (searchTimer)
            clearTimeout(searchTimer);
        searchTimer = undefined;
    }

    function clearFadeTimer() {
        if (fadeTimer)
            clearTimeout(fadeTimer);
        fadeTimer = undefined;
    }

    function close() {
        open = false;
        solid = false;
        hovered = false;
        manualRequest = false;
        showInfoOverride = null;
        matches = [];
        selected = 0;
        touchPrimedIndex = null;
        clearSearchTimer();
        clearFadeTimer();
        controller?.abort();
        controller = undefined;
        requestVersion += 1;
    }

    function fadeLater() {
        clearFadeTimer();
        if (!open || hovered)
            return;
        fadeTimer = setTimeout(() => {
            if (!hovered)
                solid = false;
        }, $svgenAutocompleteBehaviorStore.fadeDelayMs);
    }

    function reveal() {
        solid = true;
        touchPrimedIndex = null;
        fadeLater();
    }

    function onPointerEnter() {
        hovered = true;
        solid = true;
        clearFadeTimer();
    }

    function onPointerMove() {
        if (!hovered)
            return;
        solid = true;
        clearFadeTimer();
    }

    function onPointerLeave() {
        hovered = false;
        fadeLater();
    }

    function inputAnchor(element: HTMLInputElement | HTMLTextAreaElement): { x: number; y: number } {
        const rect = element.getBoundingClientRect();
        if (element instanceof HTMLInputElement)
            return { x: rect.left + 6, y: rect.bottom + 3 };

        const styles = getComputedStyle(element);
        const mirror = document.createElement('div');
        const marker = document.createElement('span');
        mirror.style.position = 'fixed';
        mirror.style.visibility = 'hidden';
        mirror.style.pointerEvents = 'none';
        mirror.style.boxSizing = styles.boxSizing;
        mirror.style.left = `${rect.left}px`;
        mirror.style.top = `${rect.top - element.scrollTop}px`;
        mirror.style.width = `${rect.width}px`;
        mirror.style.padding = styles.padding;
        mirror.style.border = styles.border;
        mirror.style.font = styles.font;
        mirror.style.letterSpacing = styles.letterSpacing;
        mirror.style.lineHeight = styles.lineHeight;
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.overflowWrap = 'break-word';
        mirror.style.wordBreak = styles.wordBreak;
        mirror.textContent = element.value.slice(0, element.selectionStart ?? element.value.length);
        marker.textContent = '\u200b';
        mirror.append(marker);
        document.body.append(mirror);
        const markerRect = marker.getBoundingClientRect();
        const lineHeight = Number.parseFloat(styles.lineHeight)
            || Number.parseFloat(styles.fontSize) * 1.35;
        mirror.remove();
        return {
            x: markerRect.left - element.scrollLeft,
            y: markerRect.top + lineHeight + 3,
        };
    }

    async function reposition() {
        if (!open || !target)
            return;
        const anchor = inputAnchor(target);
        const margin = 8;
        const gap = 6;
        const listWidth = Math.min(
            380,
            Math.max(300, target.getBoundingClientRect().width),
            window.innerWidth - margin * 2,
        );
        const listHeight = Math.min(listEl?.offsetHeight || 320, window.innerHeight - margin * 2);
        let left = Math.max(margin, Math.min(anchor.x, window.innerWidth - listWidth - margin));
        let top = anchor.y;
        if (top + listHeight > window.innerHeight - margin) {
            const targetTop = target.getBoundingClientRect().top;
            top = Math.max(margin, targetTop - listHeight - 3);
        }
        listStyle = `left:${left}px;top:${top}px;width:${listWidth}px;`;

        if (!infoVisible || !selectedMatch?.info) {
            infoStyle = '';
            return;
        }
        const infoWidth = Math.min(280, window.innerWidth - margin * 2);
        const right = left + listWidth + gap;
        if (right + infoWidth <= window.innerWidth - margin) {
            infoStyle = `left:${right}px;top:${top}px;width:${infoWidth}px;`;
        } else if (left - gap - infoWidth >= margin) {
            infoStyle = `left:${left - gap - infoWidth}px;top:${top}px;width:${infoWidth}px;`;
        } else {
            const below = Math.min(
                window.innerHeight - margin - 90,
                top + listHeight + gap,
            );
            infoStyle = `left:${left}px;top:${Math.max(margin, below)}px;width:${listWidth}px;`;
        }
    }

    function sourceSearches(manual: boolean): AutocompleteSourceSearch[] {
        if (!target)
            return [];
        const enabled = new Set(sourceIds);
        const caret = target.selectionStart ?? target.value.length;
        return $svgenAutocompleteSourcesStore
            .filter((source) => enabled.has(source.id) && !source.error)
            .map((source) => ({
                sourceId: source.id,
                queries: buildAutocompleteQueries(
                    target!.value,
                    caret,
                    source.boundary,
                    $svgenAutocompleteBehaviorStore.minChars,
                    manual,
                ),
            }))
            .filter((request) => request.queries.length > 0);
    }

    function scheduleSearch(manual = false, delay = 80) {
        clearSearchTimer();
        const searches = sourceSearches(manual);
        if (!searches.length) {
            close();
            return;
        }
        manualRequest = manual;
        searchTimer = setTimeout(() => {
            void runSearch(searches, manual);
        }, delay);
    }

    async function runSearch(searches: AutocompleteSourceSearch[], manual: boolean) {
        controller?.abort();
        controller = new AbortController();
        const version = ++requestVersion;
        try {
            const next = usefulAutocompleteMatches(
                await searchAutocomplete(
                    searches,
                    $svgenAutocompleteBehaviorStore.maxRows,
                    controller.signal,
                ),
                target?.value ?? '',
            );
            if (version !== requestVersion)
                return;
            if (!next.length) {
                close();
                return;
            }
            matches = next;
            selected = 0;
            open = true;
            manualRequest = manual;
            if (open) {
                solid = manual;
                if (solid)
                    fadeLater();
                await tick();
                await reposition();
            }
        } catch (cause) {
            if (!(cause instanceof DOMException && cause.name === 'AbortError'))
                console.error(cause);
        }
    }

    function scrollSelectedIntoList() {
        void tick().then(() => {
            const row = listEl?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
            if (!row || !listEl)
                return;
            if (row.offsetTop < listEl.scrollTop)
                listEl.scrollTop = row.offsetTop;
            else if (row.offsetTop + row.offsetHeight > listEl.scrollTop + listEl.clientHeight)
                listEl.scrollTop = row.offsetTop + row.offsetHeight - listEl.clientHeight;
        });
    }

    function moveSelection(delta: number) {
        if (!matches.length)
            return;
        selected = (selected + delta + matches.length) % matches.length;
        reveal();
        scrollSelectedIntoList();
        void reposition();
    }

    function accept(index = selected) {
        const match = matches[index];
        if (!target || !match)
            return;
        const applied = applyAutocompleteMatch(
            target.value,
            match.value,
            match.replaceStart,
            match.replaceEnd,
        );
        target.value = applied.value;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.focus({ preventScroll: true });
        target.setSelectionRange(applied.caret, applied.caret);
        close();
    }

    function onTargetInput() {
        if (composing)
            return;
        if (!$svgenAutocompleteBehaviorStore.autoSuggest) {
            close();
            return;
        }
        scheduleSearch(false);
    }

    function onTargetCaret() {
        if (!open)
            return;
        scheduleSearch(false, 0);
    }

    function onTargetKeydown(event: Event) {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === ' ' && (keyboardEvent.ctrlKey || keyboardEvent.metaKey)) {
            keyboardEvent.preventDefault();
            keyboardEvent.stopPropagation();
            if (open) {
                showInfoOverride = !infoVisible;
                reveal();
                void tick().then(reposition);
            } else {
                scheduleSearch(true, 0);
            }
            return;
        }
        if (!open)
            return;
        switch (keyboardEvent.key) {
            case 'Escape':
                keyboardEvent.preventDefault();
                keyboardEvent.stopPropagation();
                close();
                break;
            case 'Tab':
                keyboardEvent.preventDefault();
                keyboardEvent.stopPropagation();
                accept();
                break;
            case 'ArrowDown':
                keyboardEvent.preventDefault();
                keyboardEvent.stopPropagation();
                moveSelection(1);
                break;
            case 'ArrowUp':
                keyboardEvent.preventDefault();
                keyboardEvent.stopPropagation();
                moveSelection(-1);
                break;
        }
    }

    function onTargetBlur() {
        close();
    }

    function onCompositionStart() {
        composing = true;
        close();
    }

    function onCompositionEnd() {
        composing = false;
        if ($svgenAutocompleteBehaviorStore.autoSuggest)
            scheduleSearch(false);
    }

    function onSelectionChange() {
        if (document.activeElement === target)
            onTargetCaret();
    }

    function attach(next: typeof target) {
        if (attachedTarget === next)
            return;
        detach();
        attachedTarget = next;
        if (!next)
            return;
        next.addEventListener('input', onTargetInput);
        next.addEventListener('click', onTargetCaret);
        next.addEventListener('keydown', onTargetKeydown);
        next.addEventListener('blur', onTargetBlur);
        next.addEventListener('scroll', reposition);
        next.addEventListener('compositionstart', onCompositionStart);
        next.addEventListener('compositionend', onCompositionEnd);
    }

    function detach() {
        if (!attachedTarget)
            return;
        attachedTarget.removeEventListener('input', onTargetInput);
        attachedTarget.removeEventListener('click', onTargetCaret);
        attachedTarget.removeEventListener('keydown', onTargetKeydown);
        attachedTarget.removeEventListener('blur', onTargetBlur);
        attachedTarget.removeEventListener('scroll', reposition);
        attachedTarget.removeEventListener('compositionstart', onCompositionStart);
        attachedTarget.removeEventListener('compositionend', onCompositionEnd);
        attachedTarget = undefined;
        composing = false;
        close();
    }

    function rowPointerDown(event: PointerEvent, index: number) {
        event.preventDefault();
        event.stopPropagation();
        selected = index;
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
            if (!solid || touchPrimedIndex !== index) {
                solid = true;
                touchPrimedIndex = index;
                clearFadeTimer();
                scrollSelectedIntoList();
                void reposition();
                return;
            }
        }
        accept(index);
    }

    function onViewportChange() {
        void reposition();
    }

    $: attach(target);

    onMount(() => {
        document.body.append(portal);
        document.addEventListener('selectionchange', onSelectionChange);
        window.addEventListener('resize', onViewportChange);
        window.addEventListener('scroll', onViewportChange, true);
        const unbindOutside = bindDropdownOutsideClick(
            () => open,
            close,
            () => [portal, attachedTarget],
        );
        return () => unbindOutside();
    });

    onDestroy(() => {
        detach();
        document.removeEventListener('selectionchange', onSelectionChange);
        window.removeEventListener('resize', onViewportChange);
        window.removeEventListener('scroll', onViewportChange, true);
        portal?.remove();
    });
</script>

<div bind:this={portal} class="autocomplete-portal">
    {#if open}
        <div
            bind:this={listEl}
            class="list"
            class:solid
            style={`${listStyle}--idle-opacity:${$svgenAutocompleteBehaviorStore.idleOpacity};`}
            role="listbox"
            aria-label="Autocomplete suggestions"
            on:pointerenter={onPointerEnter}
            on:pointermove={onPointerMove}
            on:pointerleave={onPointerLeave}
            on:wheel={reveal}
        >
            {#each matches as match, index (`${match.value}\0${match.sourceId}`)}
                <button
                    type="button"
                    role="option"
                    aria-selected={index === selected}
                    class:active={index === selected}
                    data-index={index}
                    on:pointerdown={(event) => rowPointerDown(event, index)}
                >
                    <span class="value">{match.value}</span>
                    {#if match.matchedAlias}
                        <span class="alias">via {match.matchedText}</span>
                    {/if}
                </button>
            {/each}
        </div>
        {#if infoVisible && selectedMatch?.info}
            <div
                class="info"
                class:solid
                style={`${infoStyle}--idle-opacity:${$svgenAutocompleteBehaviorStore.idleOpacity};`}
                on:pointerenter={onPointerEnter}
                on:pointermove={onPointerMove}
                on:pointerleave={onPointerLeave}
                on:wheel={reveal}
            >
                {selectedMatch.info}
            </div>
        {/if}
    {/if}
</div>

<style lang="scss">
    .autocomplete-portal {
        position: fixed;
        inset: 0;
        z-index: 240;
        pointer-events: none;
    }

    .list,
    .info {
        position: fixed;
        box-sizing: border-box;
        opacity: var(--idle-opacity);
        transition: opacity 250ms ease;
        border: 1px solid color-mix(in srgb, var(--ink) 9%, transparent);
        border-radius: 8px;
        background: color-mix(in srgb, var(--bg) 91%, var(--accent));
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.46);
        backdrop-filter: blur(12px) saturate(1.08);

        &.solid {
            opacity: 1;
        }
    }

    .list {
        max-height: min(360px, calc(100dvh - 16px));
        overflow-y: auto;
        overscroll-behavior: contain;
        pointer-events: auto;
        scrollbar-width: thin;
    }

    button {
        display: flex;
        align-items: baseline;
        width: 100%;
        gap: 0.55rem;
        border: none;
        padding: 0.32rem 0.5rem;
        background: transparent;
        color: var(--ink);
        font: inherit;
        font-size: 0.75rem;
        text-align: left;
        cursor: pointer;

        &.active {
            background: color-mix(in srgb, var(--accent) 22%, transparent);
        }
    }

    .value {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .alias {
        margin-left: auto;
        overflow: hidden;
        color: var(--muted);
        font-size: 0.68rem;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .info {
        max-height: min(260px, calc(100dvh - 16px));
        overflow: auto;
        padding: 0.55rem 0.65rem;
        color: var(--ink);
        font-size: 0.72rem;
        line-height: 1.4;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        pointer-events: auto;
    }
</style>
