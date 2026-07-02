<script lang="ts">
    import { createEventDispatcher } from "svelte";

    export let value = "";
    export let options: readonly string[] = [];
    export let disabled = false;

    const dispatch = createEventDispatcher<{ change: string }>();

    function choose(option: string) {
        if (disabled || option === value)
            return;
        value = option;
        dispatch("change", option);
    }
</script>

<div class="option-select" class:disabled aria-disabled={disabled}>
    {#each options as option, index}
        {#if index > 0}
            <div class="sep" aria-hidden="true"/>
        {/if}
        <button
            type="button"
            class="option"
            class:selected={option === value}
            class:dimmed={option !== value}
            {disabled}
            aria-pressed={option === value}
            on:click={() => choose(option)}
        >
            {option}
        </button>
    {/each}
</div>

<style lang="scss">
    .option-select {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        background-color: #44444444;
        border-radius: 4px;
        padding: 4px;
        gap: 2px;
    }

    .sep {
        // width: 10px;
        // border-right: solid 1px red;
    }

    .option {
        appearance: none;
        border: none;
        background-color: transparent;
        padding: 0 9px;
        font: inherit;
        color: #ddd;
        cursor: pointer;
        border-radius: 3px;
        transition: background-color 100ms ease, color 100ms ease;
        
        &.selected {
            color: rgb(63, 187, 236);
            background-color: #5555;
        }
        
        &.dimmed {
            color: #888;
        }
        
        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        &:focus-visible {
            outline: 1px solid #aaad;
            border-radius: 3px;
        }
    }

    .disabled {
        opacity: 0.7;
    }
</style>
