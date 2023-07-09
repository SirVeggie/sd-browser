<!-- <script>
    import { PUBLIC_WS_PORT } from "$env/static/public";
    import Button from "$lib/items/Button.svelte";
    import { io } from "socket.io-client";
    import { onDestroy, onMount } from "svelte";

    const socket = io(`:${PUBLIC_WS_PORT}`);
    onMount(() => {
        socket.on("connect", () => {
            console.log("connected");
        });

        socket.on("response", (msg) => {
            console.log(msg);
        });
    });

    onDestroy(() => {
        socket.close();
    });

    function click() {
        console.log("click");
        socket.emit("message", "hello");
    }
</script>

<div class="container">
    <Button on:click={click}>Send hello</Button>
</div>

<style lang="scss">
    .container {
        padding: var(--main-padding);
    }
</style> -->
