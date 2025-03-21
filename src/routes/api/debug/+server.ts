// import { remoteDebug } from "$lib/server/filemanager";
import { success } from "$lib/server/responses";

export async function GET() {
    // remoteDebug();
    return success(undefined, 200);
}