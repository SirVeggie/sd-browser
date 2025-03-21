import { building } from "$app/environment";
import { startFileManager } from "$lib/server/filemanager";
// import { startWebsocket } from "$lib/server/websocketServer";

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



// Server startup
if (!building) {
    startFileManager();
    // startWebsocket();
}