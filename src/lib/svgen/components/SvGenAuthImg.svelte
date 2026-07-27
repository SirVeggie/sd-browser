<script lang="ts">
    import {
        fetchAuthorizedBlobUrl,
        peekAuthorizedBlobUrl,
    } from '$lib/svgen/comfyImageUrls';

    /** Relative API path that needs Bearer auth (e.g. /api/svgen/comfy/view?…). */
    export let path = '';
    export let alt = '';
    export let loading: 'lazy' | 'eager' = 'lazy';

    let blobUrl: string | null = null;
    let failed = false;
    let loadToken = 0;

    $: {
        const nextPath = path;
        const peeked = peekAuthorizedBlobUrl(nextPath);
        if (peeked) {
            blobUrl = peeked;
            failed = false;
        } else if (!nextPath) {
            blobUrl = null;
            failed = false;
        }
        void load(nextPath);
    }

    async function load(next: string) {
        const token = ++loadToken;
        if (!next) {
            if (token === loadToken) {
                blobUrl = null;
                failed = false;
            }
            return;
        }
        const url = await fetchAuthorizedBlobUrl(next);
        if (token !== loadToken)
            return;
        if (!url) {
            // Keep prior frame if we already had one for a different path race.
            if (!blobUrl)
                failed = true;
            return;
        }
        blobUrl = url;
        failed = false;
    }
</script>

{#if blobUrl}
    <img src={blobUrl} {alt} {loading} draggable="false" />
{:else if failed}
    <slot name="fallback" />
{/if}
