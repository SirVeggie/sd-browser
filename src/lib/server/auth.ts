import type { RequestEvent } from "@sveltejs/kit";
import { error } from "./responses";
import { PASS } from "$env/static/private";

const type = 'Bearer ';

export function invalidAuth(e: RequestEvent) {
    if (!PASS) return false;
    const auth = e.request.headers.get('Authorization');
    if (!auth) return error('No authorization header', 401);
    if (auth !== `${type}${PASS}`) return error('Invalid authorization header', 401);
    return false;
}