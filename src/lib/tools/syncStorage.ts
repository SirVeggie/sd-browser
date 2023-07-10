import type { Writable } from "svelte/store";

export function syncMemory<T>(name: string, store: Writable<T>) {
    if (localStorage.getItem(name)) {
        const value = JSON.parse(localStorage.getItem(name) || '');
        store.set(value);
    }
    store.subscribe(x => {
        localStorage.setItem(name, JSON.stringify(x));
    });
}