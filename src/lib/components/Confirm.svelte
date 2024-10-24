<script lang="ts" context="module">
    import Button from "$lib/items/Button.svelte";
    import Modal from "$lib/items/Modal.svelte";
    import { RePromise } from "$lib/tools/RePromise";
    import _ from "lodash";
    import { cubicOut } from "svelte/easing";
    import { writable } from "svelte/store";
    import { fade } from "svelte/transition";
    import { autofocus } from "../../actions/autofocus";

    export type IModal = {
        id: string;
        title: string;
        content: string;
        buttons: string[];
        handler: (button: string) => void;
    };

    const modalStore = writable<IModal[]>([]);
    const promises: Record<string, RePromise<string>> = {};

    export function openConfirm(
        modal: Omit<IModal, "id" | "handler">,
        handler: (button: string) => void
    ) {
        window.addEventListener("keydown", handleEsc);
        const id = _.uniqueId("confirm_");
        modalStore.update((modals) => {
            modals.push({ id, ...modal, handler });
            return modals;
        });

        promises[id] = RePromise<string>();
        return id;
    }

    export function closeConfirm(id?: string) {
        let modal: IModal | undefined;
        modalStore.update((modals) => {
            if (id) {
                const index = modals.findIndex((m) => m.id === id);
                if (index !== -1) modals.splice(index, 1);
            } else {
                modal = modals.pop();
            }

            if (modals.length === 0)
                window.removeEventListener("keydown", handleEsc);
            return modals;
        });

        id = id ?? modal?.id;
        if (id) {
            const p = promises[id];
            if (p.state === "pending") p.resolve("");
        }
    }

    export function closeAllConfirms() {
        modalStore.set([]);
        window.removeEventListener("keydown", handleEsc);

        for (const key in Object.keys(promises)) {
            const p = promises[key];
            if (p.state === "pending") p.resolve("");
        }
    }

    function handleEsc(e: KeyboardEvent) {
        if (e.key === "Escape") closeAllConfirms();
    }

    export async function askConfirmation(
        title: string,
        content?: string
    ): Promise<boolean> {
        const id = openConfirm(
            {
                title,
                content: content ?? "Are you sure?",
                buttons: ["Yes", "No"],
            },
            (button) => {
                const p = promises[id];
                p.resolve(button);
                closeConfirm(id);
            }
        );

        const p = promises[id];
        return (await p) === "Yes";
    }
</script>

{#each $modalStore as modal (modal.id)}
    <Modal close={() => closeConfirm(modal.id)}>
        <h1>{modal.title}</h1>
        <p>{modal.content}</p>
        <div class="buttons">
            {#each modal.buttons as button, i (button)}
                <Button focus={i === 0} on:click={() => modal.handler(button)}>
                    {button}
                </Button>
            {/each}
        </div>
    </Modal>
{/each}

<style lang="scss">
    h1 {
        margin: 0;
    }

    p {
        margin-top: 0;
        margin-bottom: 2em;
    }

    .buttons {
        display: flex;
        justify-content: space-evenly;
        margin-bottom: 1em;
    }
</style>
