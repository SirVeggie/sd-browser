<script lang="ts">
    import { onMount } from "svelte";

    export let onVisible: () => void;
    export let once = false;
    const buttonProps = {
        class: $$restProps.class,
    };

    let element: HTMLDivElement;

    onMount(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                onVisible();
                if (once) observer.disconnect();
            }
        });
        observer.observe(element);
    });
</script>

<div bind:this={element} {...buttonProps}>
    <slot />
</div>