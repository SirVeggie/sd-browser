
export type ImageList = Record<string, ImageContainer>;
export type ImageContainer = {
    id: string;
    file: string;
    width: number;
    height: number;
    metadata: string;
};

export type ServerError = {
    error: string;
    [key: string]: unknown;
};

export type ServerMessage = {
    message: string;
    [key: string]: unknown;
}