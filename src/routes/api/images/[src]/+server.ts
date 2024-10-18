import { image } from '$lib/server/responses.js';

export async function GET(e) {
    const src = e.params.src;
    const type = e.url.searchParams.get('quality') ?? undefined;
    const defer = e.url.searchParams.get('defer') === 'true';
    const preview = e.url.searchParams.get('preview') === 'true';
    return image(src, type, defer, preview);
}