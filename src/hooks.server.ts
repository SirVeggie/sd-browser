import { startFileManager } from "$lib/server/filemanager";

export async function handle({ resolve, event }) {

    // Apply CORS header for API routes
    if (event.url.pathname.startsWith('/api')) {
        // Required for CORS to work
        if (event.request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': '*',
                },
            });
        }
    }

    const res = await resolve(event);
    if (event.url.pathname.startsWith('/api')) {
        res.headers.append('Access-Control-Allow-Origin', '*');
    }
    return res;
}





// server startup (probably fires at first request?)

startFileManager();