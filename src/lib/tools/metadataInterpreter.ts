
const positiveRegex = /^([\s\S]*?)\n\r?(Negative prompt:|.*$)/;
export function getPositivePrompt(prompt: string | undefined) {
    if (!prompt) return '';
    return positiveRegex.exec(prompt)?.[1] ?? '';
}

const negativeRegex = /\n\r?Negative prompt: ([\s\S]*?)\n\r?Steps: \d+[\s\S]*$/;
export function getNegativePrompt(prompt: string | undefined) {
    if (!prompt) return '';
    return negativeRegex.exec(prompt)?.[1] ?? '';
}

const svPositiveRegex = /sv_prompt: ("([^"]|(?<=\\)")*"|[^,"]*)/;
export function getSvPositivePrompt(prompt: string | undefined) {
    if (!prompt) return '';
    let res = svPositiveRegex.exec(prompt)?.[1] ?? '';
    if (res[0] === '"')
        res = JSON.parse(res);
    return res;
}

const svNegativeRegex = /sv_negative: ("([^"]|(?<=\\)")*"|[^,"]*)/;
export function getSvNegativePrompt(prompt: string | undefined) {
    if (!prompt) return '';
    let res = svNegativeRegex.exec(prompt)?.[1] ?? '';
    if (res[0] === '"')
        res = JSON.parse(res);
    return res;
}

const paramsRegex = /\n\r?(Steps: \d+[\s\S]*)$/;
export function getParams(prompt: string | undefined) {
    if (!prompt) return '';
    return paramsRegex.exec(prompt)?.[1] ?? '';
}