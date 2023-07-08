<script lang="ts" context="module">
    import { writable } from "svelte/store";

    export type Notification = {
        id: string;
        message: string;
    };
    
    let counter = 0;
    export let noteStore = writable<Notification[]>([]);
    export function notify(message: string, id?: string) {
        const n = {
            // id: id ?? "default",
            id: id ?? counter++ + "",
            message,
        };

        noteStore.update((messages) => {
            messages.push(n);
            return messages;
        });

        setTimeout(() => {
            noteStore.update((messages) => {
                messages.splice(messages.indexOf(n), 1);
                return messages;
            });
        }, 5000);
    }
</script>

<script lang="ts">
    import { flip } from "svelte/animate";
    import { fly } from "svelte/transition";
</script>

<div class="notifications">
    {#each $noteStore as n (n.id)}
        <div class="notification" animate:flip={{ duration: 400 }}>
            <div transition:fly={{ x: 10, duration: 400 }}>
                {n.message}
            </div>
        </div>
    {/each}
</div>

<style lang="scss">
    .notifications {
        position: fixed;
        z-index: 100;
        top: 20px;
        right: 30px;
        left: 30px;
        pointer-events: none;
    }

    .notification {
        font-family: "Open sans", sans-serif;
        color: #ddd;
        display: flex;
        justify-content: flex-end;
        
        & > div {
            background-color: #222;
            padding: 1em;
            border: 1px solid #333;
            border-radius: 0.5em;
            margin-bottom: 0.5em;
            box-shadow: 0px 3px 5px #0005;
        }
    }
</style>
