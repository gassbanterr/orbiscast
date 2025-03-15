import { CommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { getChannelEntries, getProgrammeEntries } from '../../modules/database';
import type { ProgrammeEntry } from '../../interfaces/iptv';

const logger = getLogger();

/**
 * Finds the current show from a list of programmes
 * @param programmes - List of programmes
 * @param now - Current timestamp
 * @returns The current show or the next upcoming show
 */
function getCurrentShow(programmes: ProgrammeEntry[], now: number) {
    return programmes.find(p =>
        (p.start_timestamp ?? 0) <= now && (p.stop_timestamp ?? Infinity) >= now
    ) || programmes[0];
}

/**
 * Generates programme information embeds for a given channel
 * @param channelName - Name of the channel to get programme information for
 * @returns Object containing success status, message and programme embeds
 */
export async function generateProgrammeInfo(channelName: string) {
    try {
        const channels = await getChannelEntries();
        const channel = channels.find(ch => ch.tvg_name?.toLowerCase() === channelName.toLowerCase());

        if (!channel || !channel.tvg_id) {
            return { success: false, message: `Channel not found: ${channelName}`, embeds: [] };
        }

        const allProgrammes = await getProgrammeEntries();
        const channelProgrammes = allProgrammes.filter(p => p.channel === channel.tvg_id);

        const now = Math.floor(Date.now() / 1000);
        const futureProgrammes = channelProgrammes
            .filter(p => typeof p.stop_timestamp === 'number' && p.stop_timestamp >= now)
            .sort((a, b) => (a.start_timestamp ?? 0) - (b.start_timestamp ?? 0))
            .slice(0, 10); // Get the next 10 upcoming shows

        if (futureProgrammes.length === 0) {
            return { success: false, message: `No upcoming programmes found for channel: ${channelName}`, embeds: [] };
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

        const currentShow = getCurrentShow(futureProgrammes, now);

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
        const embedsToSendLimited = embedsToSend.slice(0, 10);
        return { success: true, message: '', embeds: embedsToSendLimited };

    } catch (error) {
        logger.error(`Error generating programme info: ${error}`);
        return { success: false, message: 'An error occurred while fetching the programme information.', embeds: [] };
    }
}

/**
 * Handles the programme command interaction, showing TV guide for a channel
 * @param interaction - The Discord command interaction
 */
export async function handleProgrammeCommand(interaction: CommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channelName = interaction.options.get('channel')?.value as string;
    if (!channelName) {
        await interaction.editReply({ content: 'Please specify a channel name.' });
        return;
    }

    logger.info(`Fetching programme for channel: ${channelName}`);

    const programmeInfo = await generateProgrammeInfo(channelName);

    if (!programmeInfo.success) {
        await interaction.editReply({ content: programmeInfo.message });
        return;
    }

    await interaction.editReply({ embeds: programmeInfo.embeds });
}
