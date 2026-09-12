import type {
    ComfyProxyWidget,
    ComfySubgraphDefinition,
    ComfyWorkflowNode,
} from '../types/images';

export type ProxyWidgetBinding = {
    proxies: ComfyProxyWidget[];
    /**
     * When set, these are the authoritative outer socket names (subgraph input
     * names). Skip label/title matching — required for modern exports where
     * `value` / `value_1` are already disambiguated on the shell.
     */
    outerNames?: string[];
};

export function findInnerNode(
    subgraph: ComfySubgraphDefinition | undefined,
    innerId: string,
): ComfyWorkflowNode | undefined {
    return subgraph?.nodes?.find((n) => String(n.id) === innerId);
}

export function getProxyWidgets(node: ComfyWorkflowNode): ComfyProxyWidget[] | undefined {
    const raw = node.properties?.proxyWidgets;
    if (!Array.isArray(raw) || !raw.length)
        return undefined;
    const valid: ComfyProxyWidget[] = [];
    for (const entry of raw) {
        if (
            Array.isArray(entry)
            && entry.length >= 2
            && (typeof entry[0] === 'string' || typeof entry[0] === 'number')
            && typeof entry[1] === 'string'
        ) {
            valid.push([String(entry[0]), entry[1]]);
        }
    }
    return valid.length ? valid : undefined;
}

/**
 * Newer Comfy builds stopped serializing `properties.proxyWidgets`. Promoted
 * widgets are ordinary subgraph inputs linked from inputNode (-10) onto an
 * interior widget slot. Rebuild [[innerId, widgetName], …] plus the outer
 * socket name (subgraph input name) from that topology.
 */
export function synthesizeProxyWidgetsFromPromotedInputs(
    subgraph: ComfySubgraphDefinition,
): ProxyWidgetBinding | undefined {
    const inputs = subgraph.inputs;
    const links = subgraph.links;
    if (!Array.isArray(inputs) || !inputs.length || !Array.isArray(links) || !links.length)
        return undefined;

    const linksById = new Map<number, (typeof links)[number]>();
    for (const link of links) {
        if (link && typeof link.id === 'number')
            linksById.set(link.id, link);
    }

    const proxies: ComfyProxyWidget[] = [];
    const outerNames: string[] = [];
    const seen = new Set<string>();
    for (const input of inputs) {
        if (!input?.name || !Array.isArray(input.linkIds))
            continue;
        for (const linkId of input.linkIds) {
            const link = linksById.get(linkId);
            if (!link)
                continue;
            // Promotions originate at the subgraph input boundary node.
            if (Number(link.origin_id) !== -10)
                continue;

            const inner = findInnerNode(subgraph, String(link.target_id));
            if (!inner)
                continue;
            const targetInput = inner.inputs?.[link.target_slot];
            if (!targetInput?.widget)
                continue;
            const widgetName = targetInput.widget.name || targetInput.name;
            if (!widgetName)
                continue;

            const key = `${inner.id}:${widgetName}:${input.name}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            proxies.push([String(inner.id), widgetName]);
            outerNames.push(input.name);
            break;
        }
    }
    return proxies.length ? { proxies, outerNames } : undefined;
}

/** Legacy proxyWidgets, else reconstruct from slot-promoted subgraph inputs. */
export function resolveProxyWidgetBinding(
    node: ComfyWorkflowNode,
    subgraph: ComfySubgraphDefinition | undefined,
): ProxyWidgetBinding | undefined {
    const legacy = getProxyWidgets(node);
    if (legacy?.length)
        return { proxies: legacy };
    return subgraph ? synthesizeProxyWidgetsFromPromotedInputs(subgraph) : undefined;
}

const MAX_PROXY_CHAIN_DEPTH = 32;

export type LeafProxyWidget = {
    node: ComfyWorkflowNode;
    widgetName: string;
};

/** Map a socket/widget name on a subgraph shell to the matching proxy slot. */
function matchProxySlot(
    binding: ProxyWidgetBinding,
    widgetName: string,
): ComfyProxyWidget | undefined {
    if (binding.outerNames?.length) {
        const byOuter = binding.outerNames.indexOf(widgetName);
        if (byOuter >= 0)
            return binding.proxies[byOuter];
    }
    const hits = binding.proxies.filter((proxy, i) => (
        proxy[1] === widgetName || binding.outerNames?.[i] === widgetName
    ));
    return hits.length === 1 ? hits[0] : undefined;
}

/**
 * Walk nested subgraph shells until the concrete widget node.
 * One-level proxies already point at that node; two+ deep they point at an
 * inner subgraph instance whose type is a UUID — schema/combo lookup must
 * not stop there.
 */
export function resolveLeafProxyWidget(
    subgraphsByType: Map<string, ComfySubgraphDefinition>,
    startNode: ComfyWorkflowNode | undefined,
    startWidgetName: string,
): LeafProxyWidget | undefined {
    if (!startNode || !startWidgetName)
        return undefined;

    let node = startNode;
    let widgetName = startWidgetName;
    const visited = new Set<string>();

    for (let depth = 0; depth < MAX_PROXY_CHAIN_DEPTH; depth++) {
        const nested = subgraphsByType.get(String(node.type));
        if (!nested)
            return { node, widgetName };

        const visitKey = `${nested.id}\0${node.id}\0${widgetName}`;
        if (visited.has(visitKey))
            return { node, widgetName };
        visited.add(visitKey);

        const binding = resolveProxyWidgetBinding(node, nested);
        if (!binding)
            return { node, widgetName };

        const proxy = matchProxySlot(binding, widgetName);
        if (!proxy)
            return { node, widgetName };

        const next = findInnerNode(nested, String(proxy[0]));
        if (!next)
            return { node, widgetName };

        node = next;
        widgetName = proxy[1];
    }

    return { node, widgetName };
}
