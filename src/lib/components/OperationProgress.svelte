<script lang="ts">
    import { operationStore } from '$lib/stores/operationStore';
    import type { OperationInfo } from '$lib/types/requests';

    const dismissed = new Set<string>();

    $: visible = $operationStore.filter(op => {
        if (dismissed.has(op.id))
            return false;
        if (op.status === 'running')
            return true;
        if (op.status === 'failed')
            return true;
        return op.status === 'complete' && op.finishedAt && Date.now() - op.finishedAt < 10_000;
    });

    function dismiss(id: string) {
        dismissed.add(id);
        operationStore.update(ops => [...ops]);
    }

    function percent(op: OperationInfo): number {
        if (!op.total)
            return op.status === 'complete' ? 100 : 0;
        return Math.min(100, Math.round((op.done / op.total) * 100));
    }
</script>

{#if visible.length}
    <div class="operation-banner" aria-live="polite">
        {#each visible as op (op.id)}
            <div class="operation" class:failed={op.status === 'failed'}>
                <div class="header">
                    <span class="label">{op.label}</span>
                    {#if op.status !== 'running'}
                        <button type="button" class="dismiss" on:click={() => dismiss(op.id)} aria-label="Dismiss">
                            ×
                        </button>
                    {/if}
                </div>

                {#if op.status === 'running'}
                    <div class="progress">
                        <div class="bar" style={`width: ${percent(op)}%`} />
                    </div>
                    <p class="progress-text">{op.done} / {op.total}{op.message ? ` — ${op.message}` : ''}</p>
                {:else if op.status === 'failed'}
                    <p class="error-text">{op.error ?? 'Operation failed'}</p>
                {:else}
                    <p class="complete-text">Complete ({op.total} items)</p>
                {/if}
            </div>
        {/each}
    </div>
{/if}

<style lang="scss">
    .operation-banner {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 0.5em;
        padding: 0.75em 1em;
        padding-bottom: max(0.75em, env(safe-area-inset-bottom));
        background: #1a1a1aee;
        border-top: 1px solid #444;
        backdrop-filter: blur(4px);
    }

    .operation {
        max-width: 40rem;
        margin: 0 auto;
        width: 100%;
    }

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1em;
        margin-bottom: 0.35em;
    }

    .label {
        font-size: 0.95em;
    }

    .dismiss {
        background: none;
        border: none;
        color: #aaa;
        font-size: 1.25em;
        line-height: 1;
        cursor: pointer;
        padding: 0 0.25em;

        &:hover {
            color: #fff;
        }
    }

    .progress {
        width: 100%;
        height: 0.75em;
        background: #333;
        border-radius: 4px;
        overflow: hidden;
    }

    .bar {
        height: 100%;
        background: #6a9bd1;
        transition: width 0.2s ease;
    }

    .failed .bar {
        background: #c55;
    }

    .progress-text,
    .complete-text,
    .error-text {
        margin: 0.35em 0 0;
        font-size: 0.9em;
        color: #aaa;
    }

    .error-text {
        color: #e88;
    }
</style>
