import { get, writable } from 'svelte/store';
import { setWidgetValue } from '$lib/svgen/fields';
import { svgenSessionStore } from '$lib/svgen/stores';
import type { SvgenCompanionWrite } from '$lib/svgen/types';

/** Write target for the image_id widget that opened the picker. */
export type SdBrowserPickerImageWrite = {
    nodeId: string;
    widgetName: string;
    valueIndex?: number;
    writeMode?: 'outer' | 'inner';
    innerNodeId?: string;
};

export type SdBrowserPickerSession = {
    value: string;
    searchValue: string;
    randomEnabled: boolean;
    imageWrite: SdBrowserPickerImageWrite;
    searchCompanion?: SvgenCompanionWrite;
    randomCompanion?: SvgenCompanionWrite;
};

/** Hosted outside the flyout so overflow/remount cannot kill the dialog. */
export const sdBrowserPickerStore = writable<SdBrowserPickerSession | null>(null);

export function openSdBrowserPicker(session: SdBrowserPickerSession) {
    sdBrowserPickerStore.set(session);
}

export function closeSdBrowserPicker() {
    sdBrowserPickerStore.set(null);
}

function patchWidget(
    widgetName: string,
    value: string | number | boolean | null,
    write?: Pick<SvgenCompanionWrite, 'valueIndex' | 'writeMode' | 'innerNodeId'> & {
        nodeId?: string;
    },
    fallback?: SdBrowserPickerImageWrite,
) {
    const session = get(svgenSessionStore);
    const picker = get(sdBrowserPickerStore);
    if (!session || !picker)
        return;
    const nodeId = write?.nodeId ?? fallback?.nodeId ?? picker.imageWrite.nodeId;
    const workflow = setWidgetValue(
        session.workflow,
        nodeId,
        widgetName,
        value,
        write?.valueIndex ?? fallback?.valueIndex,
        write?.writeMode ?? fallback?.writeMode,
        write?.innerNodeId ?? fallback?.innerNodeId,
    );
    if (workflow === session.workflow)
        return;
    svgenSessionStore.update((s) => (s ? { ...s, workflow, prompt: null } : s));
}

export function writeSdBrowserPickerImage(imageId: string) {
    const picker = get(sdBrowserPickerStore);
    if (!picker)
        return;
    if (picker.randomEnabled && picker.randomCompanion) {
        patchWidget('random', false, picker.randomCompanion, picker.imageWrite);
    }
    patchWidget(
        picker.imageWrite.widgetName,
        imageId,
        picker.imageWrite,
        picker.imageWrite,
    );
    // Keep store value in sync while open (preview selection highlight).
    sdBrowserPickerStore.update((prev) => (prev ? { ...prev, value: imageId, randomEnabled: false } : prev));
}

export function writeSdBrowserPickerSearch(search: string) {
    const picker = get(sdBrowserPickerStore);
    if (!picker?.searchCompanion)
        return;
    if (String(picker.searchCompanion.value ?? '') === String(search ?? ''))
        return;
    patchWidget('search', search, picker.searchCompanion, picker.imageWrite);
    sdBrowserPickerStore.update((prev) => {
        if (!prev?.searchCompanion)
            return prev;
        return {
            ...prev,
            searchValue: search,
            searchCompanion: { ...prev.searchCompanion, value: search },
        };
    });
}

export function writeSdBrowserPickerRandom(enabled: boolean) {
    const picker = get(sdBrowserPickerStore);
    if (!picker?.randomCompanion)
        return;
    patchWidget('random', enabled, picker.randomCompanion, picker.imageWrite);
    sdBrowserPickerStore.update((prev) => (prev ? { ...prev, randomEnabled: enabled } : prev));
}
