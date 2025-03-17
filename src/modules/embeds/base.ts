import type { EmbedOptions, EmbedResult } from './types';

export abstract class BaseEmbedProcessor<T> {
    protected abstract validateData(data: unknown): data is T;
    protected abstract generateEmbed(data: T, options: EmbedOptions): EmbedResult | Promise<EmbedResult>;

    public canProcess(data: unknown): boolean {
        return this.validateData(data);
    }

    public async process(data: any, options: EmbedOptions = {}): Promise<EmbedResult> {
        if (!this.validateData(data)) {
            throw new Error('Invalid data for this embed processor');
        }

        return this.generateEmbed(data, options);
    }

    protected getIframeHtml(src: string, width: number, height: number): string {
        return `<iframe src="${src}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`;
    }
}
