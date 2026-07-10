export async function resolve(specifier, context, nextResolve) {
    if (
        (specifier.startsWith('./') || specifier.startsWith('../'))
        && !specifier.endsWith('.ts')
        && !specifier.endsWith('.js')
        && !specifier.endsWith('.json')
    ) {
        try {
            return await nextResolve(`${specifier}.ts`, context);
        } catch {
            // Fall back to the original specifier.
        }
    }

    return nextResolve(specifier, context);
}
