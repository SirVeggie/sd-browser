import { doGet, doServerGet, doServerPost, type FetchType } from '$lib/tools/requests';
import { isServerError, type OperationsResponse, type StartOperationResponse } from '$lib/types/requests';

export async function getOperations(fetch?: FetchType): Promise<OperationsResponse['operations']> {
    const response = fetch
        ? await doGet('/api/operations', fetch)
        : await doServerGet('/api/operations');

    if (isServerError(response))
        return [];

    return (response as OperationsResponse).operations ?? [];
}

export async function startExtradataRecalc(): Promise<StartOperationResponse | null> {
    const response = await doServerPost('/api/operations/extradata-recalc', {});

    if (isServerError(response))
        throw new Error(response.error);

    return response as StartOperationResponse;
}
