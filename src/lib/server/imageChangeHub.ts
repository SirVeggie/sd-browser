import { recordFreshImage } from './dataIndex';

const listeners = new Set<() => void>();

export function subscribeImageChanges(callback: () => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

export function notifyImageChange(): void {
    for (const callback of listeners) {
        callback();
    }
}

export function notifyMetadataChange(ids: string | readonly string[]): void {
    const list = typeof ids === 'string' ? [ids] : ids;
    for (const id of list) {
        recordFreshImage(id);
    }
    notifyImageChange();
}
