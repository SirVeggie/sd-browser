import type { ComfyPrompt, ComfyWorkflow } from '$lib/types/images';

export type IntControlMode = 'fixed' | 'increment' | 'decrement' | 'randomize';

export type SvgenFieldKind =
    | 'boolean'
    | 'number'
    | 'string'
    | 'combo'
    | 'image'
    | 'sd_browser_image'
    | 'lora_tags'
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
        /** Decimal places for rounding (SV-Float `decimals`). */
        precision?: number;
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
    /** Subgraph definition name when this card is a subgraph shell. */
    subgraphName?: string;
    fields: SvgenField[];
    /** Shows an output-image preview slot (Danbooru / PreviewImage / etc.). */
    imageDisplay?: boolean;
    /** Shows a read-only text preview slot (SV-PreviewText, SV-WorkflowTimer). */
    textDisplay?: boolean;
    /**
     * SV-LoraTagLoader — row UI over the text widget (`lora_tags` field).
     * When set, `clipInputWired` controls whether clip-strength columns appear.
     */
    loraTagLoader?: boolean;
    /** True when the optional CLIP input socket has a link. */
    clipInputWired?: boolean;
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
    /**
     * Per Lora Tag Loader card: when false, hide clip-strength column and
     * serialize tags without a separate clip weight (uses model strength).
     * Missing key → true. Ignored when CLIP socket is unwired.
     */
    loraClipStrength: Record<string, boolean>;
    /**
     * Per Lora Tag Loader card: master override. Missing key → true.
     * When false, generation treats every tag as disabled without rewriting
     * per-row enable state in the text widget.
     */
    loraTagMasterEnabled: Record<string, boolean>;
    /**
     * Explicit autocomplete source ids per card. A missing node key means use
     * sources marked enabled-by-default; an empty array explicitly disables all.
     * The record itself is optional because persisted layouts may predate
     * autocomplete support.
     */
    autocompleteSources?: Record<string, string[]>;
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
