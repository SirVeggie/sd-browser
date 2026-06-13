import fs from 'fs';
import path from 'path';
import { datapath } from './filemanager';
import type { SearchMode } from '$lib/types/misc';
import { fileExistsSync } from './filetools';

const MODELS_FILE = 'image-models.ndjson';

type ImageModelsRow = {
    id: string;
    models: string[];
};

export class ModelIndex {
    private static loaded = false;
    private static modelToIds = new Map<string, Set<string>>();

    private static load() {
        if (ModelIndex.loaded)
            return;
        ModelIndex.loaded = true;

        const filePath = path.join(datapath, MODELS_FILE);
        if (!fileExistsSync(filePath))
            return;

        const content = fs.readFileSync(filePath, 'utf8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;

            let row: ImageModelsRow;
            try {
                row = JSON.parse(trimmed);
            } catch {
                continue;
            }

            if (!row.id || !Array.isArray(row.models))
                continue;

            for (const modelPath of row.models) {
                if (typeof modelPath !== 'string' || !modelPath.length)
                    continue;

                const name = path.basename(modelPath.replace(/\\/g, '/'));
                let ids = ModelIndex.modelToIds.get(name);
                if (!ids) {
                    ids = new Set();
                    ModelIndex.modelToIds.set(name, ids);
                }
                ids.add(row.id);
            }
        }
    }

    static getImageIdsForSearch(term: string, mode: SearchMode): Set<string> {
        ModelIndex.load();

        const ids = new Set<string>();
        for (const [modelName, imageIds] of ModelIndex.modelToIds) {
            if (modelNameMatches(modelName, term, mode)) {
                for (const id of imageIds)
                    ids.add(id);
            }
        }
        return ids;
    }
}

function modelNameMatches(name: string, term: string, mode: SearchMode): boolean {
    if (mode === 'contains') {
        return name.toLowerCase().includes(term.toLowerCase());
    }
    if (mode === 'words') {
        const words = term.split(' ');
        return words.every(word => new RegExp(`\\b${word}\\b`, 'i').test(name));
    }
    return new RegExp(term, 'is').test(name);
}
