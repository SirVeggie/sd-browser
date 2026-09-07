const MAX_JSON = 800;

/** Readable text for Comfy / HTTP / WS errors. Never returns `[object Object]`. */
export function formatUnknownError(value: unknown, fallback = 'Unknown error'): string {
    const formatted = formatValue(value, 0);
    return formatted || fallback;
}

/** Dump the raw value in the browser console, then return a panel-safe message. */
export function reportSvgenError(value: unknown, fallback: string): string {
    if (value instanceof Error && value.cause !== undefined)
        console.error('[svgen]', value, value.cause);
    else
        console.error('[svgen]', value);
    return formatUnknownError(value, fallback);
}

function formatValue(value: unknown, depth: number): string {
    if (value == null)
        return '';
    if (typeof value === 'string')
        return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
        return String(value);
    if (typeof value === 'symbol' || typeof value === 'function')
        return '';
    if (value instanceof Error) {
        const fromCause = value.cause !== undefined ? formatValue(value.cause, depth + 1) : '';
        const own = value.message.trim();
        if (own && own !== '[object Object]')
            return own;
        if (fromCause)
            return fromCause;
        return value.name || '';
    }
    if (typeof value !== 'object' || depth > 6)
        return '';

    const record = value as Record<string, unknown>;

    if ('exception_message' in record) {
        const parts: string[] = [];
        const node = record.node_type ?? record.node_id;
        if (node != null && String(node))
            parts.push(String(node));
        if (typeof record.exception_type === 'string' && record.exception_type)
            parts.push(record.exception_type);
        const message = formatValue(record.exception_message, depth + 1);
        if (message)
            parts.push(message);
        if (parts.length)
            return parts.join(': ');
    }

    if ('error' in record || 'node_errors' in record || 'detail' in record) {
        const nested = formatValue(record.error, depth + 1);
        const nodes = formatNodeErrors(record.node_errors, depth + 1);
        const fromDetail = nested && nested !== '[object Object]'
            ? ''
            : formatValue(record.detail, depth + 1);
        const head = nested && nested !== '[object Object]' ? nested : fromDetail;
        if (head && nodes)
            return `${head}\n${nodes}`;
        if (head)
            return head;
        if (nodes)
            return nodes;
    }

    if ('message' in record) {
        const message = formatValue(record.message, depth + 1);
        const details = formatValue(record.details, depth + 1);
        if (message && details)
            return `${message}: ${details}`;
        if (message)
            return message;
        if (details)
            return details;
        if (typeof record.type === 'string' && record.type)
            return record.type;
    }

    return stringifyUnknown(value);
}

function formatNodeErrors(nodeErrors: unknown, depth: number): string {
    if (!nodeErrors || typeof nodeErrors !== 'object' || Array.isArray(nodeErrors))
        return '';
    const lines: string[] = [];
    for (const [nodeId, info] of Object.entries(nodeErrors as Record<string, unknown>)) {
        if (!info || typeof info !== 'object')
            continue;
        const rec = info as Record<string, unknown>;
        const classType = typeof rec.class_type === 'string' ? rec.class_type : '';
        const label = classType ? `${classType} (#${nodeId})` : `Node ${nodeId}`;
        const errors = rec.errors;
        if (!Array.isArray(errors) || !errors.length) {
            lines.push(label);
            continue;
        }
        for (const item of errors) {
            const text = formatValue(item, depth);
            lines.push(text ? `${label}: ${text}` : label);
        }
    }
    return lines.join('\n');
}

function stringifyUnknown(value: unknown): string {
    try {
        const json = JSON.stringify(value);
        if (!json || json === '{}' || json === '[]')
            return '';
        return json.length > MAX_JSON ? `${json.slice(0, MAX_JSON)}…` : json;
    } catch {
        return '';
    }
}
