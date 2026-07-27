import type { SvgenCard } from './types';

/** Auto-layout category priority (lower index = earlier). */
export const AUTO_LAYOUT_CATEGORIES = [
    'seed',
    'model',
    'prompt',
    'negative',
    'sampler',
    'resolution',
    'lora',
    'image',
    'other',
] as const;

export type AutoLayoutCategory = (typeof AUTO_LAYOUT_CATEGORIES)[number];

const CATEGORY_RANK = new Map(
    AUTO_LAYOUT_CATEGORIES.map((category, index) => [category, index]),
);

function normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hasWord(haystack: string, word: string): boolean {
    return new RegExp(`(?:^|\\s)${word}(?:\\s|$)`).test(haystack);
}

/**
 * Classify a panel card for initial auto ordering.
 * Uses title / type / field names — not field values.
 */
export function categorizeCard(card: SvgenCard): AutoLayoutCategory {
    const title = normalize(card.title);
    const type = normalize(card.nodeType);
    const blob = `${title} ${type}`;
    const fieldBlob = card.fields
        .map((field) => normalize(`${field.widgetName} ${field.label}`))
        .join(' ');

    if (
        card.imageDisplay
        || card.fields.some((field) => field.kind === 'image' || field.kind === 'sd_browser_image')
        || /\b(load\s*image|preview\s*image|save\s*image|sd\s*browser)\b/.test(blob)
    ) {
        return 'image';
    }

    if (hasWord(blob, 'lora') || type.includes('lora'))
        return 'lora';

    if (
        /\bnegat/.test(blob)
        || hasWord(blob, 'neg')
        || /\bnegat/.test(fieldBlob)
        || hasWord(fieldBlob, 'negative')
    ) {
        return 'negative';
    }

    if (
        hasWord(blob, 'seed')
        || hasWord(fieldBlob, 'seed')
        || card.fields.some((field) => field.kind === 'seed')
        || (card.fields.length > 0
            && card.fields.every((field) => field.kind === 'number' || field.kind === 'seed')
            && hasWord(blob, 'seed'))
    ) {
        return 'seed';
    }

    if (
        /\b(checkpoint|unet|ckpt|model\s*loader|load\s*checkpoint)\b/.test(blob)
        || type.includes('checkpoint')
        || /^model(\s*\d+)?$/.test(title)
    ) {
        return 'model';
    }

    if (/\b(sampler|ksampler)\b/.test(blob) || type.includes('sampler'))
        return 'sampler';

    if (
        /\b(resolution|empty\s*latent|latent\s*image)\b/.test(blob)
        || (hasWord(blob, 'width') && hasWord(blob, 'height'))
        || type.includes('emptylatent')
    ) {
        return 'resolution';
    }

    if (
        /\b(prompt|clip\s*text|text\s*encode|llm\s*prompt)\b/.test(blob)
        || /cliptextencode|textencode/.test(type.replace(/\s+/g, ''))
        || card.fields.some((field) => {
            if (field.kind !== 'string')
                return false;
            const name = normalize(`${field.widgetName} ${field.label}`);
            return hasWord(name, 'prompt') || hasWord(name, 'text');
        })
    ) {
        return 'prompt';
    }

    return 'other';
}

/** Stable sort: category priority, then title A–Z, then nodeId. */
export function sortCardsForAutoLayout(cards: readonly SvgenCard[]): SvgenCard[] {
    return [...cards].sort((a, b) => {
        const rankA = CATEGORY_RANK.get(categorizeCard(a)) ?? 999;
        const rankB = CATEGORY_RANK.get(categorizeCard(b)) ?? 999;
        if (rankA !== rankB)
            return rankA - rankB;
        const titleCmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        if (titleCmp !== 0)
            return titleCmp;
        return a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true });
    });
}

export function orderedNodeIdsForAutoLayout(cards: readonly SvgenCard[]): string[] {
    return sortCardsForAutoLayout(cards).map((card) => card.nodeId);
}
