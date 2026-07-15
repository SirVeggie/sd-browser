export async function resolve(specifier, context, nextResolve) {
    const parentUrl = context.parentURL ?? '';
    const parentPath = typeof parentUrl === 'string' ? parentUrl : parentUrl.pathname ?? '';
    if (
        parentPath.includes('/src/')
        && (specifier.startsWith('./') || specifier.startsWith('../'))
        && !specifier.endsWith('.ts')
        && !specifier.endsWith('.js')
        && !specifier.endsWith('.json')
    ) {
        try {
            return await nextResolve(`${specifier}.ts`, context);
        } catch {
            // Fall through to default resolution.
        }
    }

    return nextResolve(specifier, context);
}
