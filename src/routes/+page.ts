// import { imageAmountStore, imageStore } from '$lib/stores/imageStore';
// import { searchImages } from '$lib/tools/imageRequests.js';
// import { log } from '$lib/tools/logger';
// import { mapImagesToClient } from '$lib/tools/misc.js';

// export async function load({ fetch }) {
//     try {
//         log('Loading images...');
//         const res = await searchImages({}, fetch);
//         imageStore.set(mapImagesToClient(res.imageIds));
//         imageAmountStore.set(res.amount);
//     } catch (e: any) {
//         log(e.toString());
//     }
// }