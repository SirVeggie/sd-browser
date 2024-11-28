import { syncMemory } from "$lib/tools/syncStorage";
import { writable } from "svelte/store";

export type AuthStore = {
    password: string;
    valid: boolean;
}

export const authStore = writable({
    password: '',
    valid: true,
} as AuthStore);

export function syncAuthWithLocalStorage() {
    syncMemory('authStore', authStore);
}

export function authLogout() {
    authStore.update(() => ({ password: '', valid: false }));
}

export function isLocalAuthValid() {
    const value = JSON.parse(localStorage.getItem('authStore') || '');
    return !!value.valid;
}