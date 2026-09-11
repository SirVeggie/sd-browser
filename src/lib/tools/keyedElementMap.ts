/**
 * Svelte action factory: register a node in a Map by key.
 *
 * `destroy` / `update` only remove the entry if it still points at this node.
 * Moving a keyed item into an earlier `{#each}` creates the new node first,
 * then destroys the old one — a naive `map.delete(id)` would drop the live node
 * and later pointerdowns that look up the map silently no-op.
 */
export function bindKeyedElement<K>(map: Map<K, HTMLElement>) {
    return (node: HTMLElement, key: K) => {
        map.set(key, node);
        return {
            update(nextKey: K) {
                if (map.get(key) === node)
                    map.delete(key);
                key = nextKey;
                map.set(key, node);
            },
            destroy() {
                if (map.get(key) === node)
                    map.delete(key);
            },
        };
    };
}
