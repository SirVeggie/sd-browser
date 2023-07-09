import type { ServerError } from "$lib/types";
import { readFile } from "fs/promises";
import { readImageAsWebp } from "./convert";

export function error(message: string | ServerError, status = 500) {
    if (typeof message === 'string') message = { error: message };
    return new Response(JSON.stringify({ error: message }), { status });
}

export function success(message: unknown, status = 200) {
    if (typeof message === 'string') message = { message };
    return new Response(JSON.stringify(message), { status });
}

export async function image(filepath: string | undefined, webp = true) {
    if (!filepath) return error('Image not found', 404);

    let buffer;
    try {
        if (webp) {
            buffer = await readImageAsWebp(filepath);
        } else {
            buffer = await readFile(filepath);
        }
    } catch {
        console.log(`Failed to read file: ${filepath}`);
        return error('Failed to read file', 500);
    }

    return new Response(buffer, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
        }
    });
}