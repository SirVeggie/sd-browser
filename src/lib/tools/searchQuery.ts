export function combineSearchQuery(search: string, filters: string[]): string {
    const parts: string[] = [];
    const trimmedSearch = search.trim();
    if (trimmedSearch)
        parts.push(trimmedSearch);
    for (const filter of filters) {
        const trimmed = filter.trim();
        if (trimmed)
            parts.push(trimmed);
    }
    return parts.join(' AND ');
}
