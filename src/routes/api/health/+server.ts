import { success } from "$lib/server/responses";

export async function GET() {
    return success(undefined, 200);
}