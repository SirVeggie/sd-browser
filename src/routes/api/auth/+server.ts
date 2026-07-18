import { checkLogin } from "$lib/server/auth";
import { success } from "$lib/server/responses";

export async function GET(e) {
    const err = checkLogin(e);
    if (err) return err;
    return success(undefined, 200);
}
