<script lang="ts">
    export let placeholder = "";
    export let value = 0;
    export let step: number | "any" = 1;
    export let element: HTMLInputElement | undefined = undefined;

    $: stepAmount = step === "any" ? 0.1 : step;

    function bump(dir: 1 | -1, e?: Event) {
        e?.preventDefault();
        e?.stopPropagation();
        const current = Number(value);
        const base = Number.isFinite(current) ? current : 0;
        const next = base + dir * stepAmount;
        value = step === "any"
            ? Number(next.toFixed(6))
            : Math.round(next / stepAmount) * stepAmount;
    }
</script>

<div class="num">
    <button
        type="button"
        class="step"
        aria-label="Decrease"
        tabindex="-1"
        on:mousedown|preventDefault|stopPropagation
        on:click={(e) => bump(-1, e)}
    >−</button>
    <input
        type="number"
        bind:this={element}
        {placeholder}
        {step}
        on:change
        on:input
        bind:value={value}
    />
    <button
        type="button"
        class="step"
        aria-label="Increase"
        tabindex="-1"
        on:mousedown|preventDefault|stopPropagation
        on:click={(e) => bump(1, e)}
    >+</button>
</div>

<style lang="scss">
    .num {
        display: inline-flex;
        align-items: stretch;
        width: auto;
        min-width: 7.5rem;
        max-width: 9rem;
        box-sizing: border-box;
        border-radius: 9px;
        border: none;
        background: rgba(0, 0, 0, 0.22);
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.45);
        overflow: hidden;

        &:focus-within {
            box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.55);
        }
    }

    input {
        flex: 1 1 auto;
        min-width: 0;
        width: 100%;
        margin: 0;
        padding: 0.45em 0.35em;
        border: none;
        background: transparent;
        color: var(--ink);
        text-align: center;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        font-size: 0.85rem;
        box-sizing: border-box;
        appearance: textfield;
        -moz-appearance: textfield;

        &:focus {
            outline: none;
        }

        &::-webkit-outer-spin-button,
        &::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
    }

    .step {
        flex: 0 0 auto;
        appearance: none;
        margin: 0;
        padding: 0 0.65em;
        border: none;
        background: rgba(196, 165, 116, 0.1);
        color: var(--accent);
        font-size: 1rem;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        transition: background-color 0.12s ease, color 0.12s ease;

        &:hover,
        &:focus-visible {
            background: var(--accent-soft);
            color: var(--ink);
            outline: none;
        }

        &:active {
            background: rgba(196, 165, 116, 0.28);
        }
    }
</style>
