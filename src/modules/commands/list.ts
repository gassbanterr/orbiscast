import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CommandInteraction, EmbedBuilder, GuildMember, MessageFlags } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { getChannelEntries } from '../../modules/database';
import { executeStreamChannel } from './stream';

const logger = getLogger();

/**
 * Generates a paginated channel list with embed and interactive components
 * @param pageOption - Page number or 'all' to display all channels
 * @returns Response object containing embed, components and status information
 */
export async function generateChannelList(pageOption: string | number | undefined): Promise<{
    success: boolean,
    message: string,
    isAllChannels: boolean,
    page: number,
    totalPages: number,
    channels?: any[],
    embed?: EmbedBuilder,
    components?: ActionRowBuilder<ButtonBuilder>[]
}> {
    const channelEntries = await getChannelEntries();
    const itemsPerPage = 25;

    if (pageOption === 'all') {
        const embed = new EmbedBuilder()
            .setTitle(`📺 All Channels`)
            .setColor('#0099ff')
            .setTimestamp();

        for (let i = 0; i < channelEntries.length; i += 10) {
            const chunk = channelEntries.slice(i, i + 10);
            const fieldValue = chunk.map(channel => `- ${channel.tvg_name || 'Unknown'}`).join('\n');
            embed.addFields({ name: `Channels ${i + 1}-${i + chunk.length}`, value: fieldValue });
        }

        return {
            success: true,
            message: `**All Channels:**`,
            isAllChannels: true,
            page: 1,
            totalPages: Math.ceil(channelEntries.length / itemsPerPage),
            channels: channelEntries,
            embed,
            components: []
        };
    }

    const page = (typeof pageOption === 'number') ? pageOption : 1;
    const totalPages = Math.ceil(channelEntries.length / itemsPerPage);

    if (page < 1 || page > totalPages) {
        return {
            success: false,
            message: `Invalid page number. Please provide a number between 1 and ${totalPages}, or 'all' to list all channels.`,
            isAllChannels: false,
            page,
            totalPages
        };
    }

    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const channelsToDisplay = channelEntries.slice(start, end);

    const embed = new EmbedBuilder()
        .setTitle(`📺 Channel List (Page ${page}/${totalPages})`)
        .setColor('#0099ff')
        .setTimestamp();

    for (let i = 0; i < channelsToDisplay.length; i += 10) {
        const chunk = channelsToDisplay.slice(i, i + 10);
        const fieldValue = chunk.map(channel => `- ${channel.tvg_name || 'Unknown'}`).join('\n');
        embed.addFields({ name: `Channels ${start + i + 1}-${start + i + chunk.length}`, value: fieldValue });
    }

    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    const paginationRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`channel_list_prev_${page}`)
                .setLabel('Previous Page')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 1),
            new ButtonBuilder()
                .setCustomId(`channel_list_next_${page}`)
                .setLabel('Next Page')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages)
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
                buttonRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`play_channel_${channel.tvg_name}`)
                        .setLabel(`▶️ ${channel.tvg_name}`)
                        .setStyle(ButtonStyle.Success)
                );
            }
        }

        if (buttonRow.components.length > 0) {
            components.push(buttonRow);
        }
    }

    return {
        success: true,
        message: `Channel List (Page ${page}/${totalPages})`,
        isAllChannels: false,
        page,
        totalPages,
        channels: channelsToDisplay,
        embed,
        components
    };
}

/**
 * Handles the list command interaction, displaying available channels
 * @param interaction - The Discord command interaction
 */
export async function handleListCommand(interaction: CommandInteraction) {
    const rawPageOption = interaction.options.get('page')?.value;
    const pageOption = typeof rawPageOption === 'number' || rawPageOption === 'all' ? rawPageOption : undefined;
    const result = await generateChannelList(pageOption);

    if (result.embed && result.components) {
        await interaction.reply({
            content: result.message,
            embeds: [result.embed],
            components: result.components,
            flags: MessageFlags.Ephemeral
        });
    } else {
        await interaction.reply({
            content: result.message,
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * Handles the play channel button interaction
 * @param interaction - The Discord button interaction
 */
export async function handlePlayChannelButton(interaction: ButtonInteraction) {
    await interaction.deferUpdate();

    const customId = interaction.customId;
    const channelName = customId.replace('play_channel_', '');

    if (interaction.member && 'voice' in interaction.member) {
        const member = interaction.member as GuildMember;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            await interaction.followUp({
                content: 'You need to be in a voice channel to play this channel.',
                ephemeral: true
            });
            return;
        }

        const result = await executeStreamChannel(channelName, voiceChannel.id);

        if (result.success) {
            await interaction.followUp({
                content: result.message,
                embeds: result.embed ? [result.embed] : [],
                components: result.components || []
            });
        } else {
            await interaction.followUp({
                content: result.message,
                ephemeral: true
            });
        }
    }
}
