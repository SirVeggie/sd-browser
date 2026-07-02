export type BulkTagMode = 'add' | 'remove' | 'replace';

export type TagDefinition = {
    name: string;
    color: string;
};

export type TagsRegistryState = {
    tags: TagDefinition[];
};

export const DEFAULT_TAGS_REGISTRY: TagsRegistryState = {
    tags: [
        { name: 'favourite', color: '#e6b422' },
        { name: 'nsfw', color: '#e0528f' },
    ],
};

/** Allowed tag-name characters: word chars, hyphen, space, parentheses. */
export const TAG_NAME_PATTERN = /^[\w\- ()]+$/;

export const DEFAULT_TAG_COLOR = '#5b9cf5';

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(color: string): boolean {
    return HEX_COLOR_PATTERN.test(color);
}

export function normalizeHexColor(color: string): string | undefined {
    const trimmed = color.trim();
    if (!HEX_COLOR_PATTERN.test(trimmed))
        return undefined;
    return trimmed.toLowerCase();
}

export function getTagNameValidationError(name: string): string | undefined {
    if (!name.trim())
        return undefined;
    if (isValidTagName(name))
        return undefined;
    return 'Tag name may only use letters, numbers, underscore, hyphen, space, and parentheses';
}

export function isValidTagName(name: string): boolean {
    const trimmed = name.trim();
    return trimmed.length > 0 && TAG_NAME_PATTERN.test(trimmed);
}

export function isExactTagTerm(term: string): boolean {
    return TAG_NAME_PATTERN.test(term);
}

export function tagRegistryNames(registry: TagsRegistryState | undefined): Set<string> {
    return new Set((registry?.tags ?? []).map((tag) => tag.name));
}

export function findTagDefinition(registry: TagsRegistryState | undefined, name: string): TagDefinition | undefined {
    return registry?.tags.find((tag) => tag.name === name);
}

const PRIORITY_TAG_NAMES = ['favourite', 'favorite', 'nsfw'] as const;

export function sortTagNames(names: string[]): string[] {
    const priority = PRIORITY_TAG_NAMES.filter((name) => names.includes(name));
    const rest = names.filter((name) => !PRIORITY_TAG_NAMES.includes(name as typeof PRIORITY_TAG_NAMES[number]));
    rest.sort((a, b) => a.localeCompare(b));
    return [...priority, ...rest];
}

export function tagsNotOnImage(registry: TagsRegistryState, imageTags: string[]): string[] {
    const onImage = new Set(imageTags);
    const available = registry.tags.map((tag) => tag.name).filter((name) => !onImage.has(name));
    return sortTagNames(available);
}
