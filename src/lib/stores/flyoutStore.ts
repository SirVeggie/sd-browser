import { writable } from "svelte/store";

export type FlyoutStore = {
    enabled: boolean;
    url: string;
};
export const flyoutStore = writable<FlyoutStore>({
    enabled: false,
    url: 'http://localhost:7860/',
});