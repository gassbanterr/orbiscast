import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CommandInteraction, ComponentType, EmbedBuilder, MessageFlags, type Channel } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { getChannelEntries, getProgrammeEntries } from '../../modules/database';
import type { ChannelEntry, ProgrammeEntry } from '../../interfaces/iptv';
import { getCurrentChannelEntry } from '../streaming';

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
 * Generates a paginated channel list for programme selection
 * @param pageOption - Page number to display
 * @returns Response object containing embed, components and status information
 */
export async function generateProgrammeList(pageOption: number = 1): Promise<{
    success: boolean,
    message: string,
    page: number,
    totalPages: number,
    channels?: any[],
    embed?: EmbedBuilder,
    components?: ActionRowBuilder<ButtonBuilder>[]
}> {
    const channelEntries = await getChannelEntries();
    const itemsPerPage = 25;

    const totalPages = Math.ceil(channelEntries.length / itemsPerPage);

    if (pageOption < 1 || pageOption > totalPages) {
        return {
            success: false,
            message: `Invalid page number. Please provide a number between 1 and ${totalPages}.`,
            page: pageOption,
            totalPages
        };
    }

    const start = (pageOption - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const channelsToDisplay = channelEntries.slice(start, end);

    const liveChannel: ChannelEntry | null = getCurrentChannelEntry();

    const embed = new EmbedBuilder()
        .setTitle(`📺 Channel Programme Guide (Page ${pageOption}/${totalPages})`)
        .setDescription('Click a channel to view its programme guide')
        .setColor('#0099ff')
        .setTimestamp();

    for (let i = 0; i < channelsToDisplay.length; i += 10) {
        const chunk = channelsToDisplay.slice(i, i + 10);
        const fieldValue = chunk.map(channel => {
            const channelName = channel.tvg_name || 'Unknown';
            const isLive = liveChannel?.tvg_name === channel.tvg_name;
            return `- ${channelName} ${isLive ? '🔴 LIVE' : ''}`;
        }).join('\n');
        embed.addFields({ name: `Channels ${start + i + 1}-${start + i + chunk.length}`, value: fieldValue });
    }

    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    const paginationRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`programme_list_prev_${pageOption}`)
                .setLabel('Previous Page')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(pageOption <= 1),
            new ButtonBuilder()
                .setCustomId(`programme_list_next_${pageOption}`)
                .setLabel('Next Page')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(pageOption >= totalPages)
        );
    components.push(paginationRow);

    const maxButtonsPerRow = 5;
    const maxButtonRows = 4;

    const channelsForButtons = channelsToDisplay.slice(0, maxButtonsPerRow * maxButtonRows);

    for (let i = 0; i < channelsForButtons.length; i += maxButtonsPerRow) {
        const buttonRow = new ActionRowBuilder<ButtonBuilder>();
        const chunk = channelsForButtons.slice(i, i + maxButtonsPerRow);

        for (const channel of chunk) {
            if (channel.tvg_name) {
                const isLive = liveChannel?.tvg_name === channel.tvg_name;
                buttonRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`view_programme_${channel.tvg_name}`)
                        .setLabel(`${isLive ? '🔴 ' : '📋 '}${channel.tvg_name}`)
                        .setStyle(isLive ? ButtonStyle.Danger : ButtonStyle.Primary)
                );
            }
        }

        if (buttonRow.components.length > 0) {
            components.push(buttonRow);
        }
    }

    return {
        success: true,
        message: `Select a channel to view the programme guide:`,
        page: pageOption,
        totalPages,
        channels: channelsToDisplay,
        embed,
        components
    };
}

/**
 * Handles pagination button interaction for programme list
 * @param interaction - Button interaction
 */
export async function handleProgrammeListButtonInteraction(interaction: ButtonInteraction) {
    try {
        await interaction.deferUpdate();

        const customId = interaction.customId;

        if (customId.startsWith('view_programme_')) {
            const channelName = customId.replace('view_programme_', '');
            const programmeInfo = await generateProgrammeInfo(channelName);

            if (!programmeInfo.success) {
                await interaction.followUp({
                    content: programmeInfo.message,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.followUp({
                embeds: programmeInfo.embeds,
                flags: MessageFlags.Ephemeral
            });
        } else if (customId.startsWith('programme_list_prev_') || customId.startsWith('programme_list_next_')) {
            const currentPage = parseInt(customId.split('_').pop() || '1');
            let newPage = currentPage;

            if (customId.startsWith('programme_list_prev_')) {
                newPage = Math.max(1, currentPage - 1);
            } else {
                newPage = currentPage + 1;
            }

            const result = await generateProgrammeList(newPage);

            if (!result.success) {
                await interaction.followUp({
                    content: result.message,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.editReply({
                content: result.message,
                embeds: result.embed ? [result.embed] : [],
                components: result.components || []
            });
        }
    } catch (error) {
        logger.error(`Error handling programme list button: ${error}`);
        await interaction.followUp({
            content: 'An error occurred while processing your request.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * Handles the programme command interaction, showing TV guide for a channel
 * @param interaction - The Discord command interaction
 */
export async function handleProgrammeCommand(interaction: CommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channelName = interaction.options.get('channel')?.value as string | undefined;

    // If no channel is specified, show the channel list for selection
    if (!channelName) {
        const result = await generateProgrammeList();

        if (!result.success) {
            await interaction.editReply({ content: result.message });
            return;
        }

        const reply = await interaction.editReply({
            content: result.message,
            embeds: result.embed ? [result.embed] : [],
            components: result.components || []
        });

        // Create a collector for button interactions
        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30 * 60 * 1000 // 30 minutes timeout
        });

        collector.on('collect', handleProgrammeListButtonInteraction);

        collector.on('end', async () => {
            try {
                // Try to remove components when collector expires
                await interaction.editReply({
                    components: []
                });
            } catch (error) {
                // Message might be deleted or already modified
                logger.debug(`Could not update components: ${error}`);
            }
        });

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
