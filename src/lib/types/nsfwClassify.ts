export const NSFW_CLASSIFY_LABELS = ['general', 'sensitive', 'questionable', 'explicit'] as const;
export type NsfwClassifyLabel = (typeof NSFW_CLASSIFY_LABELS)[number];

export type NsfwClassifyLabelTags = Record<NsfwClassifyLabel, string[]>;

export type NsfwClassifySettings = {
    autoClassify: boolean;
    labels: NsfwClassifyLabelTags;
};

export const NSFW_CLASSIFY_SETTINGS_KEY = 'nsfwClassifySettings';

export const NSFW_CLASSIFY_NOT_CONFIGURED_MESSAGE =
    'Assign tags to at least one rating in Settings before classifying.';

export const NSFW_CLASSIFY_HELP =
    'MobileNetV3 Danbooru rating (general, sensitive, questionable, explicit). Assign one or more tags to each class; those tags are added to the image when it is classified. Classification does not run until at least one class has a tag.';

export const nsfwClassifyStoreDefaults: NsfwClassifySettings = {
    autoClassify: false,
    labels: {
        general: [],
        sensitive: [],
        questionable: [],
        explicit: [],
    },
};

export const nsfwClassifyLabelTitles: Record<NsfwClassifyLabel, string> = {
    general: 'General',
    sensitive: 'Sensitive',
    questionable: 'Questionable',
    explicit: 'Explicit',
};

export function isNsfwClassifyLabel(value: unknown): value is NsfwClassifyLabel {
    return typeof value === 'string' && (NSFW_CLASSIFY_LABELS as readonly string[]).includes(value);
}

function normalizeTagList(value: unknown): string[] {
    if (!Array.isArray(value))
        return [];
    const tags: string[] = [];
    for (const item of value) {
        if (typeof item !== 'string')
            continue;
        const name = item.trim();
        if (!name || tags.includes(name))
            continue;
        tags.push(name);
    }
    return tags;
}

export function emptyClassifyLabelTags(): NsfwClassifyLabelTags {
    return {
        general: [],
        sensitive: [],
        questionable: [],
        explicit: [],
    };
}

export function normalizeNsfwClassifySettings(
    stored: Partial<NsfwClassifySettings> | undefined,
): NsfwClassifySettings {
    const labels = emptyClassifyLabelTags();
    const rawLabels = stored?.labels && typeof stored.labels === 'object' ? stored.labels : undefined;
    if (rawLabels) {
        for (const label of NSFW_CLASSIFY_LABELS)
            labels[label] = normalizeTagList(rawLabels[label]);
    }
    return {
        autoClassify: Boolean(stored?.autoClassify),
        labels,
    };
}

export function hasAssignedClassifyTags(settings: NsfwClassifySettings): boolean {
    for (const label of NSFW_CLASSIFY_LABELS) {
        if (settings.labels[label].length)
            return true;
    }
    return false;
}

export function managedClassifyTags(settings: NsfwClassifySettings): Set<string> {
    const tags = new Set<string>();
    for (const label of NSFW_CLASSIFY_LABELS) {
        for (const tag of settings.labels[label])
            tags.add(tag);
    }
    return tags;
}

/** Replace classifier-owned tags, then add the tags mapped to the predicted label. */
export function applyClassifyTags(
    existing: readonly string[],
    label: NsfwClassifyLabel,
    settings: NsfwClassifySettings,
): string[] {
    const managed = managedClassifyTags(settings);
    const next = existing.filter((tag) => !managed.has(tag));
    for (const tag of settings.labels[label]) {
        if (!next.includes(tag))
            next.push(tag);
    }
    return next;
}

export function addMappedClassifyTag(
    settings: NsfwClassifySettings,
    label: NsfwClassifyLabel,
    name: string,
): NsfwClassifySettings {
    const tag = name.trim();
    if (!tag || settings.labels[label].includes(tag))
        return settings;
    return {
        ...settings,
        labels: {
            ...settings.labels,
            [label]: [...settings.labels[label], tag],
        },
    };
}

export function removeMappedClassifyTagFromLabel(
    settings: NsfwClassifySettings,
    label: NsfwClassifyLabel,
    name: string,
): NsfwClassifySettings {
    if (!settings.labels[label].includes(name))
        return settings;
    return {
        ...settings,
        labels: {
            ...settings.labels,
            [label]: settings.labels[label].filter((tag) => tag !== name),
        },
    };
}

export function renameMappedClassifyTags(
    settings: NsfwClassifySettings,
    oldName: string,
    newName: string,
): NsfwClassifySettings {
    if (oldName === newName)
        return settings;
    const labels = emptyClassifyLabelTags();
    let changed = false;
    for (const label of NSFW_CLASSIFY_LABELS) {
        labels[label] = settings.labels[label].map((tag) => {
            if (tag !== oldName)
                return tag;
            changed = true;
            return newName;
        }).filter((tag, index, list) => list.indexOf(tag) === index);
    }
    if (!changed)
        return settings;
    return { ...settings, labels };
}

export function removeMappedClassifyTag(
    settings: NsfwClassifySettings,
    name: string,
): NsfwClassifySettings {
    const labels = emptyClassifyLabelTags();
    let changed = false;
    for (const label of NSFW_CLASSIFY_LABELS) {
        const next = settings.labels[label].filter((tag) => tag !== name);
        labels[label] = next;
        if (next.length !== settings.labels[label].length)
            changed = true;
    }
    if (!changed)
        return settings;
    return { ...settings, labels };
}

export function softmax(values: readonly number[]): number[] {
    if (!values.length)
        return [];
    let max = -Infinity;
    for (const value of values) {
        if (value > max)
            max = value;
    }
    const exps = values.map((value) => Math.exp(value - max));
    const sum = exps.reduce((total, value) => total + value, 0);
    if (!sum)
        return values.map(() => 0);
    return exps.map((value) => value / sum);
}

export function labelFromScores(scores: readonly number[]): NsfwClassifyLabel {
    if (scores.length !== NSFW_CLASSIFY_LABELS.length)
        throw new Error(`Expected ${NSFW_CLASSIFY_LABELS.length} classifier scores, got ${scores.length}`);
    let bestIndex = 0;
    let best = -Infinity;
    for (let i = 0; i < scores.length; i++) {
        const value = scores[i] ?? -Infinity;
        if (value > best) {
            best = value;
            bestIndex = i;
        }
    }
    const label = NSFW_CLASSIFY_LABELS[bestIndex];
    if (!label)
        throw new Error('Classifier scores were empty');
    return label;
}
