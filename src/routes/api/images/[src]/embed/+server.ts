import { invalidAuth } from "$lib/server/auth.js";
import { getImage } from "$lib/server/dataIndex.js";
import { EmbeddingDB } from "$lib/server/embeddingDb.js";
import { vectorizeImage } from "$lib/server/embeddings.js";
import { error, success } from "$lib/server/responses.js";
import { isEmbeddingConfigured } from "$lib/types/embeddings.js";
import type { BulkEmbeddingConfig } from "$lib/types/requests.js";

type EmbedRequest = {
    embedding?: BulkEmbeddingConfig;
};

function isEmbedRequest(body: unknown): body is EmbedRequest {
    return typeof body === "object" && body !== null;
}

export async function POST(e) {
    const err = invalidAuth(e);
    if (err) return err;

    const id = e.params.src;
    if (!getImage(id)) {
        return error("Image not found", 404);
    }

    let body: unknown;
    try {
        body = await e.request.json();
    } catch {
        return error("Invalid JSON request body", 400);
    }

    if (!isEmbedRequest(body) || !body.embedding?.baseUrl || !isEmbeddingConfigured(body.embedding)) {
        return error("Embedding settings are incomplete", 400);
    }

    if (EmbeddingDB.hasImageEmbedding(id)) {
        return success({ status: "exists" });
    }

    try {
        const created = await vectorizeImage(id, body.embedding);
        if (created) {
            return success({ status: "created" });
        }
        return success({ status: "exists" });
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Failed to create embedding";
        return success({ status: "failed", error: message });
    }
}
