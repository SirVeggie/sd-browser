<script lang="ts">
    import { onDestroy, onMount, tick } from 'svelte';
    import { bindDropdownOutsideClick } from '$lib/tools/dropdownOutsideClick';
    import {
        applyAutocompleteMatch,
        autocompleteInputAction,
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

    const TOUCH_TAP_SLOP_PX = 12;

    type TouchGesture = {
        pointerId: number;
        startX: number;
        startY: number;
        index: number | null;
        solidAtStart: boolean;
        dragged: boolean;
    };

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
    let touchGesture: TouchGesture | null = null;
    let composing = false;
    let applyingMatch = false;
    let lastValue = '';
    let lastCaret = 0;
    let lastSourceKey = '';

    $: infoVisible = showInfoOverride ?? $svgenAutocompleteBehaviorStore.showInfo;
    $: idleFade = $svgenAutocompleteBehaviorStore.idleFade !== false;
    $: selectedMatch = matches[selected];
    $: sourceKey = sourceIds.join('\0');
    $: if (open && !idleFade)
        solid = true;
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
        touchGesture = null;
        clearSearchTimer();
        clearFadeTimer();
        controller?.abort();
        controller = undefined;
        requestVersion += 1;
    }

    function holdSolid() {
        solid = true;
        clearFadeTimer();
    }

    function fadeLater() {
        clearFadeTimer();
        if (!open || hovered || touchGesture || $svgenAutocompleteBehaviorStore.idleFade === false)
            return;
        fadeTimer = setTimeout(() => {
            if (!hovered && !touchGesture)
                solid = false;
        }, $svgenAutocompleteBehaviorStore.fadeDelayMs);
    }

    function keepVisible() {
        holdSolid();
        if (!hovered && !touchGesture)
            fadeLater();
    }

    function isCoarsePointer(event: PointerEvent): boolean {
        return event.pointerType === 'touch' || event.pointerType === 'pen';
    }

    function onPointerEnter(event: PointerEvent) {
        if (isCoarsePointer(event))
            return;
        hovered = true;
        holdSolid();
    }

    function onPointerMove(event: PointerEvent) {
        if (isCoarsePointer(event)) {
            if (!touchGesture || event.pointerId !== touchGesture.pointerId)
                return;
            holdSolid();
            markTouchDrag(event);
            return;
        }
        if (!hovered)
            return;
        holdSolid();
    }

    function onPointerLeave(event: PointerEvent) {
        if (isCoarsePointer(event))
            return;
        hovered = false;
        if (!touchGesture)
            fadeLater();
    }

    function onPopupScroll() {
        if (touchGesture)
            touchGesture.dragged = true;
        keepVisible();
    }

    function onPopupWheel() {
        keepVisible();
    }

    function markTouchDrag(event: PointerEvent) {
        if (!touchGesture || event.pointerId !== touchGesture.pointerId)
            return;
        const dx = event.clientX - touchGesture.startX;
        const dy = event.clientY - touchGesture.startY;
        if (dx * dx + dy * dy > TOUCH_TAP_SLOP_PX * TOUCH_TAP_SLOP_PX)
            touchGesture.dragged = true;
    }

    function beginTouchGesture(event: PointerEvent, index: number | null) {
        if (!isCoarsePointer(event))
            return;
        if (touchGesture) {
            if (touchGesture.pointerId !== event.pointerId)
                return;
            if (index != null) {
                touchGesture.index = index;
                selected = index;
            }
            holdSolid();
            return;
        }
        touchGesture = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            index,
            solidAtStart: solid,
            dragged: false,
        };
        holdSolid();
        if (index != null)
            selected = index;
    }

    function onPopupPointerDown(event: PointerEvent) {
        beginTouchGesture(event, null);
    }

    function onTouchGestureEnd(event: PointerEvent) {
        if (!touchGesture || event.pointerId !== touchGesture.pointerId)
            return;
        markTouchDrag(event);
        const gesture = touchGesture;
        touchGesture = null;
        if (!gesture.dragged && gesture.solidAtStart && gesture.index != null && open) {
            accept(gesture.index);
            return;
        }
        fadeLater();
    }

    function caretFromElement(element: HTMLInputElement | HTMLTextAreaElement): number {
        const start = element.selectionStart;
        const end = element.selectionEnd;
        if (start == null && end == null)
            return element.value.length;
        return Math.max(start ?? 0, end ?? 0);
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
        mirror.textContent = element.value.slice(0, caretFromElement(element));
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
        const caret = readTargetCaret();
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
            const alreadySolid = open && solid;
            open = true;
            manualRequest = manual;
            solid = alreadySolid || manual || !idleFade;
            if (solid)
                fadeLater();
            await tick();
            await reposition();
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
        keepVisible();
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
        applyingMatch = true;
        lastValue = applied.value;
        lastCaret = applied.caret;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.focus({ preventScroll: true });
        target.setSelectionRange(applied.caret, applied.caret);
        applyingMatch = false;
        close();
    }

    function readTargetCaret(): number {
        if (!target)
            return lastCaret;
        return caretFromElement(target);
    }

    function syncFromTarget(inputType?: string) {
        if (!target || applyingMatch)
            return;
        const value = target.value;
        const caret = readTargetCaret();
        const action = autocompleteInputAction(inputType, lastValue, value);
        lastValue = value;

        switch (action) {
            case 'search':
                lastCaret = caret;
                if (!$svgenAutocompleteBehaviorStore.autoSuggest) {
                    close();
                    return;
                }
                scheduleSearch(false);
                return;
            case 'delete':
                lastCaret = caret;
                if (open && $svgenAutocompleteBehaviorStore.autoSuggest)
                    scheduleSearch(false);
                return;
            case 'ignore':
                break;
            default: {
                const _exhaustive: never = action;
                return _exhaustive;
            }
        }

        if (caret === lastCaret)
            return;
        lastCaret = caret;
        if (composing)
            return;
        if (open)
            close();
    }

    function onTargetInput(event: Event) {
        const inputType = (event as InputEvent).inputType
            ?? (composing ? 'insertCompositionText' : undefined);
        syncFromTarget(inputType);
    }

    function onTargetClick() {
        syncFromTarget();
    }

    function onTargetKeydown(event: Event) {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === ' ' && (keyboardEvent.ctrlKey || keyboardEvent.metaKey)) {
            keyboardEvent.preventDefault();
            keyboardEvent.stopPropagation();
            if (open) {
                showInfoOverride = !infoVisible;
                keepVisible();
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
    }

    function onCompositionEnd() {
        syncFromTarget('insertCompositionText');
        lastCaret = readTargetCaret();
        composing = false;
    }

    function onSelectionChange() {
        if (document.activeElement === target)
            syncFromTarget();
    }

    function attach(next: typeof target) {
        if (attachedTarget === next)
            return;
        detach();
        attachedTarget = next;
        if (!next)
            return;
        next.addEventListener('input', onTargetInput);
        next.addEventListener('click', onTargetClick);
        next.addEventListener('keydown', onTargetKeydown);
        next.addEventListener('blur', onTargetBlur);
        next.addEventListener('scroll', reposition);
        next.addEventListener('compositionstart', onCompositionStart);
        next.addEventListener('compositionend', onCompositionEnd);
        lastValue = next.value;
        lastCaret = caretFromElement(next);
    }

    function detach() {
        if (!attachedTarget)
            return;
        attachedTarget.removeEventListener('input', onTargetInput);
        attachedTarget.removeEventListener('click', onTargetClick);
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
        if (isCoarsePointer(event)) {
            beginTouchGesture(event, index);
            return;
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
        document.addEventListener('pointerup', onTouchGestureEnd);
        document.addEventListener('pointercancel', onTouchGestureEnd);
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
        document.removeEventListener('pointerup', onTouchGestureEnd);
        document.removeEventListener('pointercancel', onTouchGestureEnd);
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
            on:pointerdown={onPopupPointerDown}
            on:wheel={onPopupWheel}
            on:scroll={onPopupScroll}
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
                on:pointerdown={onPopupPointerDown}
                on:wheel={onPopupWheel}
                on:scroll={onPopupScroll}
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
        touch-action: pan-y;
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
        touch-action: pan-y;
    }
</style>
