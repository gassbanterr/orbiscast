import { EmbedBuilder, type ColorResolvable } from 'discord.js';
import type { EmbedResult } from './types';
import { getLogger } from '../../utils/logger';

const logger = getLogger();

export interface DiscordEmbedOptions {
    title?: string;
    color?: number | string;
}

export function createDiscordEmbed(
    embedResult: EmbedResult | null,
    options: DiscordEmbedOptions = {}
): {
    embed?: EmbedBuilder;
} {
    if (!embedResult) {
        logger.warn('No embed result provided to discord adapter');
        return {};
    }

    const embed = new EmbedBuilder()
        .setTitle(options.title || '📺 Media Embed')
        .setColor((options.color !== undefined ? options.color : '#3fd15e') as ColorResolvable)
        .setTimestamp();

    // Here we could include a thumbnail or image from the embed if available
    // For now we'll just add the HTML content as a field for debugging purposes

    embed.addFields(
        { name: 'Content', value: 'Media content available' }
    );

    return { embed };
}
