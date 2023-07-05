
const positiveRegex = /^([\s\S]*?)\n\r?(Negative prompt:|.*$)/;
export function getPositivePrompt(prompt: string | undefined) {
    if (!prompt) return '';
    return positiveRegex.exec(prompt)?.[1] ?? '';
}

const negativeRegex = /\n\r?Negative prompt: (.*?)\n\r?.*$/;
export function getNegativePrompt(prompt: string | undefined) {
    if (!prompt) return '';
    return negativeRegex.exec(prompt)?.[1] ?? '';
}
