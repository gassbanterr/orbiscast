import { ProgrammeEmbedProcessor, type Programme } from './programme';
import { ChannelEmbedProcessor, type Channel } from './channel';
import type { EmbedOptions, EmbedResult, EmbedProcessor } from './types';
import { createDiscordEmbed, type DiscordEmbedOptions } from './discord-adapter';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';

export type { EmbedOptions, EmbedResult, EmbedProcessor };
export { BaseEmbedProcessor } from './base';
export { ProgrammeEmbedProcessor } from './programme';
export type { Programme } from './programme';
export { ChannelEmbedProcessor } from './channel';
export type { Channel } from './channel';
export { createDiscordEmbed } from './discord-adapter';
export type { DiscordEmbedOptions } from './discord-adapter';

// Create instances of our processors
const programmeProcessor = new ProgrammeEmbedProcessor();
const channelProcessor = new ChannelEmbedProcessor();

// Export a list of all processors
export const embedProcessors = [
    programmeProcessor,
    channelProcessor,
];

// Helper function to process any embeddable content
export async function processEmbed(data: unknown, options: EmbedOptions = {}): Promise<EmbedResult | null> {
    for (const processor of embedProcessors) {
        if (processor.canProcess(data)) {
            return await processor.process(data, options);
        }
    }
    return null;
}

// Helper functions for specific content types
export function isProgramme(data: unknown): data is Programme {
    return programmeProcessor.canProcess(data);
}

export function isChannel(data: unknown): data is Channel {
    return channelProcessor.canProcess(data);
}

// Generate Discord embeds directly
export async function createProgrammeEmbed(
    programme: Programme,
    embedOptions: EmbedOptions = {},
    discordOptions: DiscordEmbedOptions = {}
): Promise<{
    embed?: EmbedBuilder;
    components?: ActionRowBuilder<ButtonBuilder>[];
}> {
    const embedResult = await programmeProcessor.process(programme, embedOptions);
    return createDiscordEmbed(embedResult, {
        title: `📺 ${programme.title}`,
        color: '#3fd15e',
        ...discordOptions
    });
}

export async function createChannelEmbed(
    channel: Channel,
    embedOptions: EmbedOptions = {},
    discordOptions: DiscordEmbedOptions = {}
): Promise<{
    embed?: EmbedBuilder;
    components?: ActionRowBuilder<ButtonBuilder>[];
}> {
    const embedResult = await channelProcessor.process(channel, embedOptions);
    return createDiscordEmbed(embedResult, {
        title: `📺 ${channel.tvg_name || 'Channel'} Stream`,
        color: '#3fd15e',
        ...discordOptions
    });
}

// Utility to generate a stream embed with programme info
export function createStreamEmbed(
    channel: Channel,
    currentProgramme?: Programme | null,
    upcomingProgrammes: Programme[] = []
): EmbedBuilder {
    const streamEmbed = new EmbedBuilder()
        .setTitle(`📺 ${channel.tvg_name || 'Channel'} Stream`)
        .setColor('#3fd15e')
        .setTimestamp();

    if (channel.tvg_logo) {
        streamEmbed.setThumbnail(channel.tvg_logo);
    }

    if (currentProgramme) {
        const info = programmeProcessor.generateProgrammeInfoEmbed(currentProgramme);
        streamEmbed.addFields(
            { name: '🔴 NOW PLAYING', value: info.title, inline: false },
            { name: 'Time', value: info.timeRange, inline: true },
            { name: 'Description', value: info.description }
        );
    } else {
        streamEmbed.addFields(
            { name: '🔴 NOW PLAYING', value: 'No current programme information available', inline: false }
        );
    }

    if (upcomingProgrammes.length > 0) {
        const upcomingCount = Math.min(10, upcomingProgrammes.length);
        const upcomingList = upcomingProgrammes.slice(0, upcomingCount)
            .map(prog => {
                const startDate = prog.start
                    ? new Date(prog.start)
                    : prog.start_timestamp ? new Date(prog.start_timestamp * 1000) : new Date();

                const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const timeUntilStart = Math.floor((startDate.getTime() - Date.now()) / 60000); // minutes until start

                const formatTime = (minutes: number): string => {
                    if (minutes < 60) return `${minutes} min`;
                    const hours = Math.floor(minutes / 60);
                    const remainingMinutes = minutes % 60;
                    if (remainingMinutes === 0) return `${hours}h`;
                    return `${hours}h ${remainingMinutes}min`;
                };

                return `• **${prog.title}** at ${startTime} (in ${formatTime(timeUntilStart)})`;
            });

        streamEmbed.addFields({
            name: '⏭️ UPCOMING',
            value: upcomingList.join('\n'),
            inline: false,
        });
    } else {
        streamEmbed.addFields(
            { name: '⏭️ UPCOMING', value: 'No upcoming programme information available', inline: false }
        );
    }

    streamEmbed.setFooter({ text: 'Stream and programme information is subject to change' });
    return streamEmbed;
}
