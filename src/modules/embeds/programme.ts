import { BaseEmbedProcessor } from './base';
import { EmbedBuilder } from 'discord.js';
import type { EmbedOptions, EmbedResult } from './types';
import type { ChannelEntry, ProgrammeEntry } from '../../interfaces/iptv';

export interface Programme {
    id?: string;
    title: string;
    channel?: string;
    description?: string;
    start?: string;
    stop?: string;
    start_timestamp?: number;
    stop_timestamp?: number;
}

export class ProgrammeEmbedProcessor extends BaseEmbedProcessor<Programme> {
    protected validateData(data: unknown): data is Programme {
        const programme = data as Programme;
        return typeof programme === 'object' && programme !== null &&
            typeof programme.title === 'string';
    }

    protected generateEmbed(programme: Programme, options: EmbedOptions): EmbedResult {
        const { maxWidth = 640, maxHeight = 360, theme = 'light', autoplay = false } = options;

        const startDate = programme.start
            ? new Date(programme.start)
            : programme.start_timestamp ? new Date(programme.start_timestamp * 1000) : null;

        const stopDate = programme.stop
            ? new Date(programme.stop)
            : programme.stop_timestamp ? new Date(programme.stop_timestamp * 1000) : null;

        // Create a query param string from the programme details
        const queryParams = new URLSearchParams();
        if (programme.id) queryParams.append('id', programme.id);
        queryParams.append('title', programme.title);
        if (programme.channel) queryParams.append('channel', programme.channel);
        if (startDate) queryParams.append('start', startDate.toISOString());
        if (stopDate) queryParams.append('stop', stopDate.toISOString());
        queryParams.append('theme', theme);
        queryParams.append('autoplay', autoplay ? '1' : '0');

        // In a real implementation, this would be a proper URL to your embed service
        const embedUrl = new URL(`https://your-embed-domain.com/programmes`);
        embedUrl.search = queryParams.toString();

        const html = this.getIframeHtml(embedUrl.toString(), maxWidth, maxHeight);

        return {
            html,
            width: maxWidth,
            height: maxHeight
        };
    }

    // Helper methods for Discord integration
    public generateProgrammeInfoEmbed(programme: Programme): any {
        const startDate = programme.start
            ? new Date(programme.start)
            : programme.start_timestamp ? new Date(programme.start_timestamp * 1000) : null;

        const stopDate = programme.stop
            ? new Date(programme.stop)
            : programme.stop_timestamp ? new Date(programme.stop_timestamp * 1000) : null;

        const startTime = startDate ? startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : 'Unknown';
        const stopTime = stopDate ? stopDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : 'Unknown';

        const description = typeof programme.description === 'string'
            ? programme.description.substring(0, 150) + (programme.description.length > 150 ? '...' : '')
            : 'No description available';

        return {
            title: programme.title,
            timeRange: `${startTime} - ${stopTime}`,
            description
        };
    }

    /**
     * Finds the current show from a list of programmes
     */
    public static getCurrentShow(programmes: ProgrammeEntry[], now: number): ProgrammeEntry | undefined {
        return programmes.find(p =>
            (p.start_timestamp ?? 0) <= now && (p.stop_timestamp ?? Infinity) >= now
        ) || programmes[0];
    }

    /**
     * Generates programme information embeds for a given channel
     */
    public static generateProgrammeInfoEmbeds(
        channelName: string,
        channelProgrammes: ProgrammeEntry[]
    ): EmbedBuilder[] {
        const now = Math.floor(Date.now() / 1000);
        const futureProgrammes = channelProgrammes
            .filter(p => typeof p.stop_timestamp === 'number' && p.stop_timestamp >= now)
            .sort((a, b) => (a.start_timestamp ?? 0) - (b.start_timestamp ?? 0))
            .slice(0, 10); // Get the next 10 upcoming shows

        if (futureProgrammes.length === 0) {
            return [];
        }

        const programmesByDate = futureProgrammes.reduce((acc, programme) => {
            const startDate = programme.start
                ? new Date(programme.start)
                : new Date(programme.start_timestamp ? programme.start_timestamp * 1000 : Date.now());

            const dateKey = startDate.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

            if (!acc[dateKey]) {
                acc[dateKey] = [];
            }
            acc[dateKey].push(programme);
            return acc;
        }, {} as Record<string, typeof futureProgrammes>);

        const mainEmbed = new EmbedBuilder()
            .setTitle(`📺 Programme Guide: ${channelName}`)
            .setColor('#0099ff')
            .setTimestamp()
            .setFooter({ text: 'Programme information is subject to change' });

        const currentShow = this.getCurrentShow(futureProgrammes, now);

        if (currentShow) {
            const isLive = (currentShow.start_timestamp ?? 0) <= now && (currentShow.stop_timestamp ?? Infinity) >= now;
            const startDate = currentShow.start
                ? new Date(currentShow.start)
                : new Date(currentShow.start_timestamp ? currentShow.start_timestamp * 1000 : Date.now());
            const stopDate = currentShow.stop
                ? new Date(currentShow.stop)
                : new Date(currentShow.stop_timestamp ? currentShow.stop_timestamp * 1000 : Date.now());

            const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            const stopTime = stopDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            const date = startDate.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

            const description = typeof currentShow.description === 'string' ? currentShow.description : '';

            mainEmbed
                .setDescription(`${isLive ? '🔴 **NOW LIVE**' : '**Next Up**'}: ${currentShow.title}`)
                .addFields(
                    { name: 'Time', value: `${startTime} - ${stopTime}`, inline: true },
                    { name: 'Date', value: date, inline: true },
                    { name: 'Description', value: description ? description.substring(0, 200) + (description.length > 200 ? '...' : '') : 'No description available' }
                );

            if (isLive) {
                mainEmbed.setColor('#FF0000'); // Red for live shows
            }
        }

        const embedsToSend = [mainEmbed];

        Object.entries(programmesByDate).forEach(([date, programmes]) => {
            // Skip if this is just the current show
            if (programmes.length === 1 && programmes[0] === currentShow) {
                return;
            }

            const dateEmbed = new EmbedBuilder()
                .setTitle(`📅 ${date}`)
                .setColor('#00AAFF');

            programmes.forEach(programme => {
                if (programme === currentShow) return; // Skip current show as it's in the main embed

                const startDate = programme.start
                    ? new Date(programme.start)
                    : new Date(programme.start_timestamp ? programme.start_timestamp * 1000 : Date.now());
                const stopDate = programme.stop
                    ? new Date(programme.stop)
                    : new Date(programme.stop_timestamp ? programme.stop_timestamp * 1000 : Date.now());

                const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const stopTime = stopDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const description = typeof programme.description === 'string'
                    ? (programme.description.length > 100
                        ? `${programme.description.substring(0, 100)}...`
                        : programme.description)
                    : 'No description available';

                dateEmbed.addFields({
                    name: `${startTime} - ${stopTime}: ${programme.title}`,
                    value: description
                });
            });

            if (dateEmbed.data.fields?.length) {
                embedsToSend.push(dateEmbed);
            }
        });

        // Discord has a limit of up to 10 embeds per message
        return embedsToSend.slice(0, 10);
    }

    /**
     * Generates channel list embed for programme selection
     */
    public static generateChannelListEmbed(
        channelsToDisplay: ChannelEntry[],
        liveChannel: ChannelEntry | null,
        pageOption: number,
        totalPages: number
    ): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle(`📺 Channel Programme Guide (Page ${pageOption}/${totalPages})`)
            .setDescription('Click a channel to view its programme guide')
            .setColor('#0099ff')
            .setTimestamp();

        const start = (pageOption - 1) * 25; // Using 25 as itemsPerPage

        for (let i = 0; i < channelsToDisplay.length; i += 10) {
            const chunk = channelsToDisplay.slice(i, i + 10);
            const fieldValue = chunk.map(channel => {
                const channelName = channel.tvg_name || 'Unknown';
                const isLive = liveChannel?.tvg_name === channel.tvg_name;
                return `- ${channelName} ${isLive ? '🔴 LIVE' : ''}`;
            }).join('\n');
            embed.addFields({ name: `Channels ${start + i + 1}-${start + i + chunk.length}`, value: fieldValue });
        }

        return embed;
    }
}

// Export the class instance for easier importing
export const programmeEmbedProcessor = new ProgrammeEmbedProcessor();
