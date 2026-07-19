import { image } from '$lib/server/responses.js';

export async function GET(e) {
    const src = e.params.src;
    const type = e.url.searchParams.get('quality') ?? undefined;
    const defer = e.url.searchParams.get('defer') === 'true';
    const preview = e.url.searchParams.get('preview') === 'true';
    const start = Date.now();
    const res = await image(src, type, defer, preview);
    const duration = Date.now() - start;
    if (duration > 1000)
        console.log(`WARN: img-req ${duration} ms | t:${type ?? '--'} d:${defer} p:${preview}`)
    return res;
}
