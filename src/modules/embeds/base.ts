import type { EmbedOptions, EmbedResult } from './types';

/**
 * Base class for embed processors that convert specific data types into Discord embeds
 * @template T The type of data this processor handles
 */
export abstract class BaseEmbedProcessor<T> {
    /**
     * Validates that the provided data is of the correct type for this processor
     * @param data - Data to validate
     * @returns Type guard indicating if the data is valid for this processor
     */
    protected abstract validateData(data: unknown): data is T;

    /**
     * Generates a Discord embed from the provided data
     * @param data - Data to convert to an embed
     * @param options - Customization options for the embed
     * @returns Generated embed result
     */
    protected abstract generateEmbed(data: T, options: EmbedOptions): EmbedResult | Promise<EmbedResult>;

    /**
     * Checks if this processor can handle the provided data
     * @param data - Data to check
     * @returns True if this processor can handle the data
     */
    public canProcess(data: unknown): boolean {
        return this.validateData(data);
    }

    /**
     * Processes the provided data into a Discord embed
     * @param data - Data to process
     * @param options - Customization options for the embed
     * @returns Generated embed result
     * @throws Error if the data is not valid for this processor
     */
    public async process(data: any, options: EmbedOptions = {}): Promise<EmbedResult> {
        if (!this.validateData(data)) {
            throw new Error('Invalid data for this embed processor');
        }

        return this.generateEmbed(data, options);
    }
}
