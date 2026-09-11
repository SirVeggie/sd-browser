import type { ComfyWorkflowNode } from '$lib/types/images';

/**
 * Same node inclusion as Generate panel cards (`discoverCards`).
 * Collapsed nodes and `_`-prefixed title/type stay off the UI.
 */
export function shouldIncludeComfyUiNode(node: ComfyWorkflowNode | undefined): boolean {
    if (!node)
        return false;
    if (node.flags?.collapsed)
        return false;
    const title = node.title || '';
    const type = String(node.type ?? '');
    if (title.startsWith('_') || type.startsWith('_'))
        return false;
    return true;
}
