import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';

/**
 * Options for customizing Discord embeds
 */
export interface EmbedOptions {
    /** Theme for the embed (light or dark) */
    theme?: 'light' | 'dark';
    /** Whether to include interactive buttons with the embed */
    includeButtons?: boolean;
    /** Custom title for the embed */
    title?: string;
    /** Color for the embed sidebar */
    color?: string | number;
}

/**
 * Result object returned by embed processors
 */
export interface EmbedResult {
    /** Discord embed to be sent */
    embed: EmbedBuilder;
    /** Optional interactive components to include with the embed */
    components?: ActionRowBuilder<ButtonBuilder>[];
}

/**
 * Interface for embed data processors
 */
export interface EmbedProcessor<T> {
    /** Checks if this processor can handle the given data */
    canProcess: (data: unknown) => boolean;
    /** Processes data into a Discord embed */
    process: (data: T, options: EmbedOptions) => EmbedResult | Promise<EmbedResult>;
}
