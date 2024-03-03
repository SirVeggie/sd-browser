import { invalidAuth } from "$lib/server/auth";
import { success } from "$lib/server/responses";

export async function GET(e) {
    const err = invalidAuth(e);
    if (err) return err;
    return success(undefined, 200);
}