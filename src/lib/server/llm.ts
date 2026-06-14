import { MetaCalcDB } from "./db";
import { encodeImageForLlm } from "./convert";
import { getImage } from "./filemanager";
import type { BulkAnnotateOptions, BulkLlmConfig } from "$lib/types/requests";

const LLM_REQUEST_TIMEOUT_MS = 120_000;

function applyResultRegex(text: string, pattern?: string) {
    if (!pattern) return text;
    try {
        const match = text.match(new RegExp(pattern, "si"));
        if (!match) return "";
        return match[1] ?? match[0];
    } catch {
        return text;
    }
}

export function clearAnnotation(id: string) {
    const image = getImage(id);
    if (!image) return;

    MetaCalcDB.setAnnotation(id, "");
    image.annotation = "";
}

export async function annotateImage(id: string, llm: BulkLlmConfig, options: BulkAnnotateOptions) {
    const image = getImage(id);
    if (!image) return;

    const userContent: ({ type: string; text?: string; image_url?: { url: string } })[] = [];

    if (options.includePrompt && image.positive) {
        userContent.push({ type: "text", text: image.positive });
    }

    if (options.includeImage) {
        const buffer = await encodeImageForLlm(image.file);
        const dataUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;
        userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    if (!userContent.length) {
        userContent.push({ type: "text", text: "" });
    }

    const messages: { role: string; content: string | typeof userContent }[] = [];
    if (options.systemInstruction) {
        messages.push({ role: "system", content: options.systemInstruction });
    }
    messages.push({ role: "user", content: userContent });
    if (options.responsePrefix) {
        messages.push({ role: "assistant", content: options.responsePrefix });
    }

    const body: Record<string, unknown> = {
        model: llm.modelId,
        messages,
    };

    if (options.disableThinking) {
        body.chat_template_kwargs = { enable_thinking: false };
    }
    if (options.responsePrefix) {
        body.continue_final_message = true;
        body.add_generation_prompt = false;
    }

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (llm.apiKey) {
        headers.Authorization = `Bearer ${llm.apiKey}`;
    }

    const url = `${llm.baseUrl.replace(/\/$/, "")}/chat/completions`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS),
        });
    } catch (cause) {
        if (cause instanceof Error && cause.name === "TimeoutError") {
            throw new Error(`LLM request timed out after ${LLM_REQUEST_TIMEOUT_MS / 1000}s`);
        }
        throw cause;
    }

    if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`LLM request failed (${response.status}): ${errText || response.statusText}`);
    }

    const data = await response.json() as {
        choices?: { message?: { content?: string } }[];
    };
    let result = data.choices?.[0]?.message?.content ?? "";
    if (options.responsePrefix && !result.startsWith(options.responsePrefix)) {
        result = options.responsePrefix + result;
    }

    result = applyResultRegex(result, options.resultRegex?.trim() || undefined);
    if (!result) return;

    let annotation = result;
    if (options.appendResult) {
        const existing = MetaCalcDB.get(id)?.annotation ?? image.annotation ?? "";
        annotation = existing ? `${existing}\n${result}` : result;
    }

    MetaCalcDB.setAnnotation(id, annotation);
    image.annotation = annotation;
}
