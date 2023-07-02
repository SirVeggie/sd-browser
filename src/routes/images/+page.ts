import { imageStore } from '$lib/stores/imageStore';
import { log } from '$lib/tools/clientlog';
import { doGet } from '$lib/tools/requests';

export async function load({ fetch }) {
    try {
        log('Loading images...');
        const res = await doGet('/api/images', fetch);
        if ('error' in res) {
            log(res.error);
            return {};
        }
        imageStore.set(res);
    } catch (e: any) {
        log(e.toString());
        return {};
    }
}