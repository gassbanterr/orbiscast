import { EmbedBuilder } from 'discord.js';
import { BaseEmbedProcessor } from './base';
import type { EmbedOptions, EmbedResult } from './types';
import type { ChannelEntry } from '../../interfaces/iptv';

/**
 * Processor for creating embeds from IPTV channel data
 */
export class ChannelEmbedProcessor extends BaseEmbedProcessor<ChannelEntry> {
    /**
     * Validates that the data is a valid channel entry
     * @param data - Data to validate
     * @returns Type guard indicating if the data is a valid channel entry
     */
    protected validateData(data: unknown): data is ChannelEntry {
        const channel = data as ChannelEntry;
        return typeof channel === 'object' && channel !== null &&
            typeof channel.tvg_id === 'string' &&
            typeof channel.tvg_name === 'string';
    }

    /**
     * Generates a Discord embed from a channel entry
     * @param channel - The channel data
     * @param options - Customization options for the embed
     * @returns Generated embed result
     */
    protected async generateEmbed(channel: ChannelEntry, options: EmbedOptions): Promise<EmbedResult> {
        const { theme = 'light', title, color = '#3fd15e' } = options;

        const embed = new EmbedBuilder()
            .setTitle(title || `📺 ${channel.tvg_name || 'Channel'}`)
            .setColor(color as any)
            .setTimestamp();

        if (channel.tvg_logo) {
            try {
                new URL(channel.tvg_logo);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 250);
                const response = await fetch(channel.tvg_logo, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (response.ok) {
                    embed.setThumbnail(channel.tvg_logo);
                } else {
                    console.warn(`Logo URL for ${channel.tvg_name} returned status ${response.status}: ${channel.tvg_logo}`);
                }
            } catch (error) {
                if (error instanceof TypeError) { // Catch URL format errors
                    console.warn(`Invalid logo URL format for ${channel.tvg_name}: ${channel.tvg_logo}`);
                } else if (error instanceof Error && error.name === 'AbortError') {
                    console.warn(`Timeout fetching logo URL for ${channel.tvg_name}: ${channel.tvg_logo}`);
                } else {
                    console.warn(`Failed to fetch or validate logo URL for ${channel.tvg_name}: ${channel.tvg_logo}`, error);
                }
            }
        }

        embed.addFields(
            { name: 'Channel', value: channel.tvg_name || 'Unknown Channel', inline: true },
            { name: 'Category', value: channel.group_title || 'No Category', inline: true }
        );

        if (channel.country) {
            embed.addFields({ name: 'Country', value: channel.country, inline: true });
        }

        return { embed };
    }

    /**
     * Creates a simplified representation of a channel for use in other embeds
     * @param channel - The channel data
     * @returns Simplified channel information object
     */
    public generateChannelInfoEmbed(channel: ChannelEntry): any {
        return {
            name: channel.tvg_name || 'Unknown Channel',
            logo: channel.tvg_logo,
            group: channel.group_title
        };
    }
}

export type Channel = ChannelEntry;
