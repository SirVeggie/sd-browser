import type { ComfyPrompt, ComfyWorkflow } from '$lib/types/images';

export type IntControlMode = 'fixed' | 'increment' | 'decrement' | 'randomize';

export type SvgenFieldKind =
    | 'boolean'
    | 'number'
    | 'string'
    | 'combo'
    | 'image'
    | 'sd_browser_image'
    | 'seed'
    | 'unknown';

export type SvgenCompanionWrite = {
    value: string | number | boolean | null;
    valueIndex: number;
    writeMode: 'outer' | 'inner';
    innerNodeId?: string;
};

export type SvgenField = {
    nodeId: string;
    nodeType: string;
    nodeTitle: string;
    widgetName: string;
    label: string;
    kind: SvgenFieldKind;
    value: string | number | boolean | null;
    /** Index into widgets_values for reliable writes after filtering. */
    valueIndex?: number;
    /** Multiline string / image — spans full field grid width. */
    tall?: boolean;
    writeMode?: 'outer' | 'inner';
    innerNodeId?: string;
    /** When writing inner proxy values, also patch this outer widgets_values index. */
    outerValueIndex?: number;
    /** Hidden companion widgets (SD Browser search / random). */
    companions?: {
        search?: SvgenCompanionWrite;
        random?: SvgenCompanionWrite;
    };
    options?: {
        min?: number;
        max?: number;
        step?: number;
        multiline?: boolean;
        values?: string[];
        imageUpload?: boolean;
        imageFolder?: 'input' | 'output' | 'temp';
    };
    /** Show fixed/randomize/increment/decrement controls (INT, seed, or control companion). */
    supportsIntControl?: boolean;
};

export type SvgenCard = {
    nodeId: string;
    nodeType: string;
    title: string;
    fields: SvgenField[];
    /** Shows an output-image preview slot (Danbooru / PreviewImage / etc.). */
    imageDisplay?: boolean;
    /** Shows a read-only text preview slot (SV-PreviewText). */
    textDisplay?: boolean;
};

export type ColumnPlacement = {
    columns: string[][];
};

export type SvgenLayoutState = {
    columns: {
        '1': ColumnPlacement;
        '2': ColumnPlacement;
        '3'?: ColumnPlacement;
    };
    collapsedNodeIds: string[];
    hiddenFields: Record<string, string[]>;
    fieldOrder: Record<string, string[]>;
    intControlModes: Record<string, IntControlMode>;
    nodeSignatures: Record<string, string>;
};

export type SvgenSession = {
    /** Set after save for layout persistence only — opening from library never links. */
    workflowId: string | null;
    name: string;
    workflow: ComfyWorkflow;
    prompt: ComfyPrompt | null;
    sourceImageId: string | null;
};

/** One in-memory open tab/session (not necessarily saved). */
export type SvgenOpenSession = {
    id: string;
    workflowId: string | null;
    name: string;
    workflow: ComfyWorkflow;
    prompt: ComfyPrompt | null;
    sourceImageId: string | null;
    layout: SvgenLayoutState;
    frozenSeeds: string[];
    lastUsedSeeds: [string, number][];
};

export type SvgenWorkflowSummary = {
    id: string;
    name: string;
    sourceImageId: string | null;
    updatedAt: number;
    createdAt: number;
};

export type SvgenProgress = {
    value: number;
    max: number;
    node?: string | null;
    promptId?: string | null;
};

export type ObjectInfoMap = Record<string, {
    input?: {
        required?: Record<string, unknown>;
        optional?: Record<string, unknown>;
    };
    input_order?: {
        required?: string[];
        optional?: string[];
    };
    display_name?: string;
}>;
