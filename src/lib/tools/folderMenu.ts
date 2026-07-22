export type FolderNode = {
    path: string;
    name: string;
    children: FolderNode[];
};

/** Compatible with ContextMenuOption; kept local so tests need no Svelte imports. */
export type FolderContextMenuOption = {
    name: string;
    submenu?: boolean;
    handler: () =>
        | void
        | FolderContextMenuOption[]
        | Promise<void | FolderContextMenuOption[]>;
};

type MutableNode = {
    path: string;
    name: string;
    children: Map<string, MutableNode>;
};

function byName(a: { name: string }, b: { name: string }) {
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function mutableToSorted(nodes: Map<string, MutableNode>): FolderNode[] {
    return [...nodes.values()].sort(byName).map((node) => ({
        path: node.path,
        name: node.name,
        children: mutableToSorted(node.children),
    }));
}

/** Build a forest from flat folder paths (`/`, `foo`, `foo/bar`). */
export function buildFolderTree(paths: string[]): FolderNode[] {
    const top = new Map<string, MutableNode>();
    let includeRoot = false;

    for (const path of paths) {
        if (path === "/") {
            includeRoot = true;
            continue;
        }

        const segments = path.split("/").filter(Boolean);
        let current = top;
        let currentPath = "";

        for (const segment of segments) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            let node = current.get(segment);
            if (!node) {
                node = {
                    path: currentPath,
                    name: segment,
                    children: new Map(),
                };
                current.set(segment, node);
            }
            current = node.children;
        }
    }

    const result: FolderNode[] = [];
    if (includeRoot) {
        result.push({ path: "/", name: "/", children: [] });
    }
    result.push(...mutableToSorted(top));
    return result;
}

function hereLabel(type: "move" | "copy"): string {
    return type === "move" ? "Move here" : "Copy here";
}

function nodeToMenuOption(
    node: FolderNode,
    type: "move" | "copy",
    excludedPath: string | undefined,
    onSelect: (folder: string) => void,
): FolderContextMenuOption | null {
    const childOptions = node.children
        .map((child) => nodeToMenuOption(child, type, excludedPath, onSelect))
        .filter((option): option is FolderContextMenuOption => option !== null);
    const canSelect = node.path !== excludedPath;

    if (childOptions.length === 0) {
        if (!canSelect) return null;
        return {
            name: node.name,
            handler: () => {
                onSelect(node.path);
            },
        };
    }

    const items: FolderContextMenuOption[] = [];
    if (canSelect) {
        items.push({
            name: hereLabel(type),
            handler: () => {
                onSelect(node.path);
            },
        });
    }
    items.push(...childOptions);
    if (!items.length) return null;

    return {
        name: node.name,
        submenu: true,
        handler: () => items,
    };
}

export function folderTreeToMenuOptions(
    nodes: FolderNode[],
    options: {
        type: "move" | "copy";
        excludedPath?: string;
        onSelect: (folder: string) => void;
    },
): FolderContextMenuOption[] {
    return nodes
        .map((node) =>
            nodeToMenuOption(
                node,
                options.type,
                options.excludedPath,
                options.onSelect,
            ),
        )
        .filter((option): option is FolderContextMenuOption => option !== null);
}
