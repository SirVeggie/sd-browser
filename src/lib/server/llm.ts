import { MetaCalcDB } from "./db";
import { encodeImageForLlm } from "./convert";
import { getImage } from "./filemanager";
import { applyResultTransform } from "$lib/tools/misc";
import type { BulkAnnotateOptions, BulkLlmConfig } from "$lib/types/requests";

const LLM_REQUEST_TIMEOUT_MS = 120_000;

function formatImagePromptForLlm(prompt: string): string {
    return `--- image prompt start ---\n${prompt}\n--- image prompt end ---`;
}

export function clearAnnotation(id: string) {
    const image = getImage(id);
    if (!image) return;

    MetaCalcDB.setAnnotation(id, "");
    image.annotation = "";
}

export function modifyAnnotation(id: string, options: BulkAnnotateOptions): boolean {
    const image = getImage(id);
    if (!image) return false;

    const existing = MetaCalcDB.get(id)?.annotation ?? image.annotation ?? "";
    const result = applyResultTransform(
        existing,
        options.resultRegex?.trim() || undefined,
        options.resultTemplate?.trim() || undefined,
    );
    if (!result.trim()) return false;

    MetaCalcDB.setAnnotation(id, result);
    image.annotation = result;
    return true;
}

export async function annotateImage(id: string, llm: BulkLlmConfig, options: BulkAnnotateOptions): Promise<boolean> {
    const image = getImage(id);
    if (!image) return false;

    const userContent: ({ type: string; text?: string; image_url?: { url: string } })[] = [];

    if (options.includePrompt && image.positive) {
        userContent.push({ type: "text", text: formatImagePromptForLlm(image.positive) });
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

    result = applyResultTransform(
        result,
        options.resultRegex?.trim() || undefined,
        options.resultTemplate?.trim() || undefined,
    );
    if (!result.trim()) return false;

    let annotation = result;
    if (options.appendResult) {
        const existing = MetaCalcDB.get(id)?.annotation ?? image.annotation ?? "";
        annotation = existing ? `${existing}\n${result}` : result;
    }

    MetaCalcDB.setAnnotation(id, annotation);
    image.annotation = annotation;
    return true;
}
