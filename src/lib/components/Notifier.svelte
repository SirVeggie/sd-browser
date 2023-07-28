<script lang="ts" context="module">
	import { writable } from 'svelte/store';

	export type Notification = {
		id: string;
		message: string;
		type: 'message' | 'error' | 'warning' | 'success';
	};

	let counter = 0;
	const timers = new Map<string, NodeJS.Timeout>();

	export let noteStore = writable<Notification[]>([]);
	export function notify(message: string | undefined | null, type?: Notification['type'], id?: string) {
		if (!message) return;
		const n: Notification = {
			id: id ?? `${counter++}`,
			message,
			type: type ?? 'message'
		};

		noteStore.update((messages) => {
			if (id) {
				clearTimeout(timers.get(id));
				timers.delete(id);
				const index = messages.findIndex((m) => m.id === id);
				if (index !== -1) {
					messages.splice(index, 1);
				}
			}
			messages.push(n);
			return messages;
		});

		const timer = setTimeout(() => {
			timers.delete(n.id);
			noteStore.update((messages) => {
				const index = messages.findIndex((m) => m.id === n.id);
				if (index !== -1) messages.splice(index, 1);
				return messages;
			});
		}, 5000);
		timers.set(n.id, timer);
	}

	export function close(id: string) {
		clearTimeout(timers.get(id));
		timers.delete(id);
		noteStore.update((messages) => {
			const index = messages.findIndex((m) => m.id === id);
			if (index !== -1) {
				messages.splice(index, 1);
			}
			return messages;
		});
	}
</script>

<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
</script>

<div class="notifications">
	{#each $noteStore as n (n.id)}
		<div class="notification" animate:flip={{ duration: 400 }}>
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div class={n.type} transition:fly={{ x: 10, duration: 400 }} on:click={() => close(n.id)}>
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
		font-family: 'Open sans', sans-serif;
		color: #ddd;
		display: flex;
		justify-content: flex-end;

		& > div {
			background-color: #222c;
			padding: 1em;
			border: 1px solid #333;
			border-radius: 0.5em;
			margin-bottom: 0.5em;
			box-shadow: 0px 3px 5px #0005;
			pointer-events: all;
			user-select: none;

			backdrop-filter: blur(5px);
		}

		.success {
			border-color: #afa5;
			color: #afa;
		}

		.warning {
			border-color: #ff55;
			color: #ee7;
		}

		.error {
			border-color: #f55;
			color: #f55;
		}
	}
</style>
