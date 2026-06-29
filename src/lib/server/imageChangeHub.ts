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
