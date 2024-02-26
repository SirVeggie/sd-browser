import { invalidAuth } from "$lib/server/auth";
import { success } from "$lib/server/responses";

export async function GET(e) {
    const err = invalidAuth(e);
    console.log("Auth failed");
    if (err) return err;
    console.log("Auth succeeded");
    return success(undefined, 200);
}