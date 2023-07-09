// import { invalidAuth } from '$lib/server/auth.js';
import { getImage } from '$lib/server/filemanager.js';
import { image } from '$lib/server/responses.js';

export async function GET(e) {
    const src = e.params.src;
    const webp = e.url.searchParams.has('webp');
    return image(getImage(src)?.file, webp);
}