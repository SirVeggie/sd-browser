<script lang="ts">
    import { createEventDispatcher, tick } from 'svelte';
    import { numberDrag } from '../../../actions/numberDrag';
    import {
        computeNextIntControlValue,
        getIntControlMode,
        intControlModeKey,
    } from '$lib/svgen/intControl';
    import {
        svgenFrozenSeedsStore,
        svgenLastUsedSeedsStore,
        svgenLayoutStore,
    } from '$lib/svgen/stores';
    import type { IntControlMode, SvgenField } from '$lib/svgen/types';
    import SvGenComboPicker from './SvGenComboPicker.svelte';
    import SvGenComfyImagePicker from './SvGenComfyImagePicker.svelte';
    import SvGenIntControl from './SvGenIntControl.svelte';
    import SvGenSdBrowserImagePicker from './SvGenSdBrowserImagePicker.svelte';

    export let field: SvgenField;
    export let editMode = false;
    export let hideLabel = false;

    const dispatch = createEventDispatcher<{
        change: string | number | boolean | null;
        companion: {
            widgetName: string;
            value: string | number | boolean | null;
            valueIndex?: number;
            writeMode?: 'outer' | 'inner';
            innerNodeId?: string;
        };
        hide: void;
        persistLayout: void;
    }>();

    let textareaEl: HTMLTextAreaElement | undefined;
    const MULTILINE_MAX_LINES = 12;

    $: numberDragParams = {
        getValue: () => Number(field.value ?? 0),
        getStep: () => {
            const step = field.options?.step;
            return typeof step === 'number' && step > 0 ? step : 1;
        },
        getMin: () => field.options?.min,
        getMax: () => field.options?.max,
        onChange: (value: number) => dispatch('change', value),
    };

    function autosize() {
        if (!textareaEl)
            return;
        textareaEl.style.height = 'auto';
        const styles = getComputedStyle(textareaEl);
        const lineHeight = Number.parseFloat(styles.lineHeight)
            || Number.parseFloat(styles.fontSize) * 1.35;
        const pad = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
        const border = Number.parseFloat(styles.borderTopWidth)
            + Number.parseFloat(styles.borderBottomWidth);
        const maxHeight = lineHeight * MULTILINE_MAX_LINES + pad + border;
        const next = Math.min(textareaEl.scrollHeight, maxHeight);
        textareaEl.style.height = `${next}px`;
        textareaEl.style.overflowY = textareaEl.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }

    $: useTextarea = !!field.options?.multiline || (!!field.tall && field.kind === 'string');
    $: isBool = field.kind === 'boolean';
    $: isCombo = field.kind === 'combo' && !!field.options?.values?.length;
    $: isSdBrowserImage = field.kind === 'sd_browser_image';
    $: isComfyImage = field.kind === 'image';
    $: isImage = isSdBrowserImage || isComfyImage;
    $: isIntControl = !!field.supportsIntControl
        && (field.kind === 'number' || field.kind === 'seed');
    $: fieldDomId = `${field.nodeId}-${field.innerNodeId ?? 'outer'}-${field.widgetName}-${field.valueIndex ?? 0}`;
    $: controlKey = intControlModeKey(field);
    $: intMode = getIntControlMode($svgenLayoutStore.intControlModes, field);
    $: frozen = $svgenFrozenSeedsStore.has(controlKey);

    $: if (useTextarea) {
        void tick().then(autosize);
    }

    function onNumber(e: Event) {
        const raw = (e.currentTarget as HTMLInputElement).value;
        const num = Number(raw);
        dispatch('change', Number.isFinite(num) ? num : raw);
    }

    function setIntMode(mode: IntControlMode) {
        const key = intControlModeKey(field);
        if (mode !== 'fixed') {
            svgenFrozenSeedsStore.update((prev) => {
                if (!prev.has(key))
                    return prev;
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
        svgenLayoutStore.update((prev) => {
            if (prev.intControlModes[key] === mode)
                return prev;
            return {
                ...prev,
                intControlModes: { ...prev.intControlModes, [key]: mode },
            };
        });
        dispatch('persistLayout');
    }

    function toggleFreeze() {
        const key = intControlModeKey(field);
        if ($svgenFrozenSeedsStore.has(key)) {
            svgenFrozenSeedsStore.update((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
            const nextValue = computeNextIntControlValue(field, 'randomize');
            dispatch('change', nextValue);
            setIntMode('randomize');
            return;
        }

        let previous = $svgenLastUsedSeedsStore.get(key);
        if (previous == null || Number.isNaN(Number(previous))) {
            previous = Number(field.value);
            if (Number.isNaN(previous))
                previous = 0;
            svgenLastUsedSeedsStore.update((prev) => {
                const next = new Map(prev);
                next.set(key, previous!);
                return next;
            });
        }
        dispatch('change', previous);
        setIntMode('fixed');
        svgenFrozenSeedsStore.update((prev) => {
            const next = new Set(prev);
            next.add(key);
            return next;
        });
    }

    function freezeIconPath(isFrozen: boolean): string {
        return isFrozen
            ? 'M5 7V5a3 3 0 1 1 6 0v2h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1Zm2-2a1 1 0 1 0 2 0v2H7V5Z'
            : 'M5 7V5a3 3 0 0 1 5.8-1.1l-1.7.7A1 1 0 0 0 7 5v2h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1Z';
    }

    function onText(e: Event) {
        dispatch('change', (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value);
        autosize();
    }

    function onBool(e: Event) {
        dispatch('change', (e.currentTarget as HTMLInputElement).checked);
    }
</script>

<div
    class="field"
    class:editMode
    class:tall={field.tall || useTextarea || isImage}
    class:bool={isBool}
    class:hideLabel
>
    {#if !hideLabel || editMode}
        <div class="label-row">
            {#if !hideLabel}
                <label for={fieldDomId}>{field.label}</label>
            {/if}
            {#if editMode}
                <button type="button" class="hide" on:click={() => dispatch('hide')}>Hide</button>
            {/if}
        </div>
    {/if}

    {#if isBool}
        <label class="check-row" for={fieldDomId}>
            {#if hideLabel && !editMode}
                <span class="check-label">{field.label}</span>
            {/if}
            <input
                id={fieldDomId}
                class="checkbox"
                type="checkbox"
                checked={!!field.value}
                on:change={onBool}
            />
        </label>
    {:else if isSdBrowserImage}
        <SvGenSdBrowserImagePicker
            value={String(field.value ?? '')}
            searchValue={String(field.companions?.search?.value ?? '')}
            randomEnabled={!!field.companions?.random?.value}
            searchCompanion={field.companions?.search}
            randomCompanion={field.companions?.random}
            imageWrite={{
                nodeId: field.nodeId,
                widgetName: field.widgetName,
                valueIndex: field.valueIndex,
                writeMode: field.writeMode,
                innerNodeId: field.innerNodeId,
            }}
        />
    {:else if isComfyImage}
        <SvGenComfyImagePicker
            value={String(field.value ?? '')}
            options={field.options?.values ?? []}
            folderType={field.options?.imageFolder ?? 'input'}
            on:change={(e) => dispatch('change', e.detail)}
        />
    {:else if field.kind === 'number' || field.kind === 'seed'}
        {#if isIntControl}
            <div class="number-row">
                <input
                    id={fieldDomId}
                    class="number"
                    type="number"
                    value={field.value ?? 0}
                    min={field.options?.min}
                    max={field.options?.max}
                    step={field.options?.step ?? 1}
                    use:numberDrag={numberDragParams}
                    on:change={onNumber}
                />
                <button
                    type="button"
                    class="seed-freeze"
                    class:is-frozen={frozen}
                    title={frozen
                        ? 'Unfreeze (randomize, keep last value remembered)'
                        : 'Freeze (restore last used value and keep fixed)'}
                    aria-label={frozen ? 'Unfreeze value' : 'Freeze value'}
                    aria-pressed={frozen}
                    on:pointerdown|stopPropagation
                    on:click|stopPropagation={toggleFreeze}
                >
                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <path fill="currentColor" d={freezeIconPath(frozen)} />
                    </svg>
                </button>
                <SvGenIntControl mode={intMode} on:change={(e) => setIntMode(e.detail)} />
            </div>
        {:else}
            <input
                id={fieldDomId}
                class="number"
                type="number"
                value={field.value ?? 0}
                min={field.options?.min}
                max={field.options?.max}
                step={field.options?.step ?? 1}
                use:numberDrag={numberDragParams}
                on:change={onNumber}
            />
        {/if}
    {:else if isCombo}
        <SvGenComboPicker
            id={fieldDomId}
            value={String(field.value ?? '')}
            options={field.options?.values ?? []}
            on:change={(e) => dispatch('change', e.detail)}
        />
    {:else if useTextarea}
        <textarea
            id={fieldDomId}
            bind:this={textareaEl}
            rows="1"
            value={String(field.value ?? '')}
            on:input={onText}
            on:change={onText}
        />
    {:else}
        <input
            id={fieldDomId}
            type="text"
            value={String(field.value ?? '')}
            on:change={onText}
        />
    {/if}
</div>

<style lang="scss">
    .field {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        font-size: 0.78rem;

        &.tall {
            grid-column: 1 / -1;
        }
    }

    .label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.35rem;
        color: var(--muted);
        font-size: 0.68rem;
        font-weight: 600;
        line-height: 1.15;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .hide {
        appearance: none;
        border: none;
        background: transparent;
        color: inherit;
        opacity: 0.6;
        cursor: pointer;
        font-size: 0.75rem;
        text-decoration: underline;
    }

    .check-row {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        user-select: none;
    }

    .check-label {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--muted);
    }

    .checkbox {
        appearance: none;
        -webkit-appearance: none;
        box-sizing: border-box;
        width: 13px;
        height: 13px;
        margin: 0;
        border: none;
        border-radius: 3px;
        background: rgba(0, 0, 0, 0.28);
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
        cursor: pointer;
        position: relative;
        flex-shrink: 0;

        &::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 3px;
            background: var(--accent);
            transform: scale(0);
            transition: transform 0.12s ease;
        }

        &:checked::before {
            transform: scale(1);
        }
    }

    .number-row {
        display: flex;
        align-items: stretch;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        border: none;
        border-radius: 7px;
        background: rgba(0, 0, 0, 0.22);
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
        overflow: visible;

        &:focus-within {
            box-shadow:
                inset 0 1px 4px rgba(0, 0, 0, 0.55),
                0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
        }

        &:has(.number.dragging) {
            box-shadow:
                inset 0 1px 4px rgba(0, 0, 0, 0.55),
                0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
        }

        > .number {
            flex: 1 1 auto;
            min-width: 0;
            width: auto;
            border: none;
            border-radius: 0;
            background: transparent;
            box-shadow: none;

            &:focus {
                border: none;
                box-shadow: none;
            }
        }
    }

    .seed-freeze {
        appearance: none;
        display: grid;
        place-items: center;
        flex: 0 0 26px;
        width: 26px;
        min-width: 26px;
        min-height: 24px;
        margin: 0;
        padding: 0;
        border: none;
        border-left: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
        border-radius: 0;
        background: transparent;
        color: var(--muted);
        cursor: pointer;

        svg {
            display: block;
            width: 12px;
            height: 12px;
        }

        &:hover {
            color: var(--ink);
            background: var(--accent-soft);
        }

        &.is-frozen {
            color: var(--accent);
            background: var(--accent-soft);
        }
    }

    input[type='text'],
    input[type='number'],
    textarea {
        width: 100%;
        box-sizing: border-box;
        border: none;
        border-radius: 7px;
        background: rgba(0, 0, 0, 0.22);
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
        color: var(--ink);
        padding: 3px 6px;
        font: inherit;
        font-size: 0.78rem;
        line-height: 1.25;
        outline: 0;
        min-height: 24px;
    }

    input.number {
        font-variant-numeric: tabular-nums;
        cursor: ew-resize;
        /* Allow vertical page scroll; horizontal scrubbing locks after axis check. */
        touch-action: pan-y;
        overflow: hidden;
        text-overflow: ellipsis;
        user-select: none;

        &:focus {
            cursor: text;
            user-select: text;
        }

        &.dragging {
            cursor: ew-resize;
        }
    }

    input:focus,
    textarea:focus {
        box-shadow:
            inset 0 1px 4px rgba(0, 0, 0, 0.55),
            0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
    }

    textarea {
        min-height: calc(1.35em + 10px);
        line-height: 1.35;
        resize: none;
        overflow-y: hidden;
    }
</style>
