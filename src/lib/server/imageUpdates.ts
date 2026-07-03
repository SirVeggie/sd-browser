import { getDeletedImageIds, getFreshImageTimestamp, getFreshImages, getImage } from './dataIndex';
import { buildSearchPlan, collectSearchPlanImages, explorationFromRequest } from './searching';
import { mapServerImageToClient } from '$lib/tools/misc';
import type { ServerImage } from '$lib/types/images';
import type { UpdateRequest, UpdateResponse } from '$lib/types/requests';
import type { SearchSession } from './searchSessions';

export type ImageUpdateResult = UpdateResponse | { error: string; status?: number };

function getMetadataMembershipDeletions(
    currentIds: readonly string[],
    sinceTimestamp: number,
    matcher: (image: ServerImage) => boolean,
): string[] {
    const freshImages = getFreshImages(sinceTimestamp);
    if (!freshImages.length) return [];

    const freshIdSet = new Set(freshImages.map((image) => image.id));

    const deletions: string[] = [];
    for (const id of currentIds) {
        if (!freshIdSet.has(id)) continue;
        const image = getImage(id);
        if (!image || !matcher(image)) {
            deletions.push(id);
        }
    }
    return deletions;
}

export async function computeImageUpdate(
    query: UpdateRequest,
    session?: SearchSession,
): Promise<ImageUpdateResult> {
    let images: ServerImage[] = [];
    let resultIds: Set<string>;

    try {
        const exploration = explorationFromRequest(query);
        const plan = await buildSearchPlan(
            query.search,
            query.matching,
            exploration,
            query.sorting,
            session?.imgSearchContext,
        );

        if (session) {
            resultIds = new Set(session.orderedIds);
        } else {
            const limited = collectSearchPlanImages(plan);
            resultIds = new Set(limited.map((image) => image.id));
        }

        images = collectSearchPlanImages(plan, { timestamp: query.timestamp });

        const metadataDeletions = getMetadataMembershipDeletions(
            query.currentIds,
            query.timestamp,
            plan.matcher,
        );
        const staleIds = query.currentIds.filter((id) => !resultIds.has(id));
        const deletions = [...new Set([
            ...getDeletedImageIds(query.timestamp),
            ...staleIds,
            ...metadataDeletions,
        ])];
        const timestamp = images.reduce((latest, image) => {
            return Math.max(latest, getFreshImageTimestamp(image.id) ?? latest);
        }, query.timestamp);

        return {
            additions: mapServerImageToClient(images),
            deletions,
            timestamp,
        };
    } catch (e) {
        if (e instanceof Error) {
            console.log(`${e.message}`);
            return { error: 'Malformed search string', status: 200 };
        }
        console.log(e);
        return { error: 'Malformed search string', status: 400 };
    }
}

export function hasUpdateChanges(res: UpdateResponse, currentIds: Set<string>): boolean {
    if (res.additions.length) return true;
    if (!res.deletions.length) return false;
    return res.deletions.some((id) => currentIds.has(id));
}
