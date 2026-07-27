import { randomUUID } from "node:crypto";
import { invalidAuth } from "$lib/server/auth.js";
import { encodeImageForEmbedding } from "$lib/server/convert.js";
import {
    embedEncodedImages,
    getServerEmbeddingSettings,
} from "$lib/server/embeddings.js";
import { error, success } from "$lib/server/responses.js";
import { isEmbeddingConfigured } from "$lib/types/embeddings.js";

const MAX_TEMP_EMBED_BYTES = 25 * 1024 * 1024;

export type TempEmbedResponse = {
    id: string;
    embedding: number[];
};

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const settings = getServerEmbeddingSettings();
    if (!isEmbeddingConfigured(settings)) {
        return error("Embedding settings are incomplete", 400);
    }

    let form: FormData;
    try {
        form = await e.request.formData();
    } catch {
        return error("Expected multipart form data", 400);
    }

    const file = form.get("image");
    if (!(file instanceof File)) {
        return error("Missing image file", 400);
    }
    if (file.size <= 0) {
        return error("Empty image file", 400);
    }
    if (file.size > MAX_TEMP_EMBED_BYTES) {
        return error("Image too large (max 25MB)", 400);
    }

    let bytes: Buffer;
    try {
        bytes = Buffer.from(await file.arrayBuffer());
    } catch {
        return error("Failed to read image file", 400);
    }

    try {
        const encoded = await encodeImageForEmbedding(bytes, settings.apiType);
        const [embedding] = await embedEncodedImages(settings, [encoded]);
        if (!embedding?.length) {
            return error("Embedding API returned an empty vector", 502);
        }

        const response: TempEmbedResponse = {
            id: `temp:${randomUUID()}`,
            embedding: Array.from(embedding),
        };
        return success(response);
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Failed to embed image";
        return error(message, 502);
    }
}
