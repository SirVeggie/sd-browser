import { PASS } from '$env/static/private';
import { error, success } from '$lib/server/responses';

export function GET({ request }) {
    const auth = request.headers.get('Authorization');
    
    if (!auth) return error('No authorization header', 401);
    if (auth !== PASS) return error('Invalid authorization header', 401);
    
    return success('success');
}