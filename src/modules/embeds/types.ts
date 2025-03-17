export interface EmbedOptions {
    maxWidth?: number;
    maxHeight?: number;
    theme?: 'light' | 'dark';
    autoplay?: boolean;
}

export interface EmbedResult {
    html: string;
    width: number;
    height: number;
}

export interface EmbedProcessor<T> {
    canProcess: (data: unknown) => boolean;
    process: (data: T, options: EmbedOptions) => EmbedResult | Promise<EmbedResult>;
}
