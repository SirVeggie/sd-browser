<script lang="ts">
    import Button from "../lib/items/Button.svelte";
    import { notify } from "../lib/components/Notifier.svelte";
    import Box from "../lib/items/Box.svelte";
    import Link from "../lib/items/Link.svelte";
    import Input from "$lib/items/Input.svelte";
    
    let input = "";
    $: input2 = `${input} | ${input}`;
    
    function click() {
        notify("Hello world!");
    }
    
    let pos = 0;
    function click2() {
        pos = 50;
    }
    function release() {
        pos = 0;
    }
</script>

<Link to="/images">Images</Link>
<Button on:click={click}>Notification</Button>
<Button down={click2} up={release}>Move</Button>

<h3>{input}</h3>
<Input bind:value={input} />
<Input bind:value={input2} />

<Box pos={pos}>I am a box</Box>