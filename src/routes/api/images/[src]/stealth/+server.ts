import { image } from '$lib/server/responses.js';

export async function GET(e) {
    const src = e.params.src;
    const type = e.url.searchParams.get('quality') ?? '';
    return image(src, type, true);
}