import { ActionRowBuilder, ButtonBuilder, ButtonStyle, CommandInteraction, ComponentType, EmbedBuilder, GuildMember } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { config } from '../../utils/config';
import { getChannelEntries, getProgrammeEntries } from '../../modules/database';
import { getVoiceConnection } from '@discordjs/voice';
import { initializeStreamer, joinVoiceChannel, startStreaming, stopStreaming } from '../../modules/streaming';
import { generateProgrammeInfo } from './programme';
import { executeStopStream } from './stop';

const logger = getLogger();
const PROGRAMME_BUTTON_ID = 'show_programme';
const STOP_BUTTON_ID = 'stop_stream';

/**
 * Starts streaming the requested channel to a voice channel
 * @param channelName - Name of the channel to stream
 * @param voiceChannelId - Discord voice channel ID to stream to
 * @returns Object containing success status, message, and UI components
 */
export async function executeStreamChannel(channelName: string, voiceChannelId: string): Promise<{
    success: boolean;
    message: string;
    channel?: any;
    embed?: EmbedBuilder;
    components?: ActionRowBuilder<ButtonBuilder>[];
}> {
    if (!channelName) {
        return { success: false, message: 'Please specify a channel name.' };
    }

    logger.info(`Attempting to stream channel: ${channelName}`);

    try {
        const channels = await getChannelEntries();
        const channel = channels.find(ch => ch.tvg_name?.toLowerCase() === channelName.toLowerCase());

        if (!channel || !channel.tvg_id) {
            return { success: false, message: `Channel not found: ${channelName}` };
        }

        if (!voiceChannelId) {
            return { success: false, message: 'You need to be in a voice channel to use this function.' };
        }

        try {
            await initializeStreamer();
            logger.info('Stopping any existing stream...');
            await stopStreaming();
            await new Promise(resolve => setTimeout(resolve, 750));

            const connection = getVoiceConnection(config.GUILD);
            if (connection && connection.joinConfig.channelId === voiceChannelId) {
                logger.debug('Already connected to the desired voice channel');
            } else {
                logger.info('Joining voice channel...');
                await joinVoiceChannel(config.GUILD, voiceChannelId);
                await new Promise(resolve => setTimeout(resolve, 750));
            }

            const allProgrammes = await getProgrammeEntries();
            const channelProgrammes = allProgrammes.filter(p => p.channel === channel.tvg_id);
            const now = Math.floor(Date.now() / 1000);

            const currentProgramme = channelProgrammes.find(p =>
                (p.start_timestamp ?? 0) <= now &&
                (p.stop_timestamp ?? Infinity) >= now
            );

            const nextProgrammes = channelProgrammes
                .filter(p => (p.start_timestamp ?? 0) > now)
                .sort((a, b) => (a.start_timestamp ?? 0) - (b.start_timestamp ?? 0));

            const nextProgramme = nextProgrammes.length > 0 ? nextProgrammes[0] : null;

            const streamEmbed = new EmbedBuilder()
                .setTitle(`📺 ${channelName} Stream`)
                .setColor('#3fd15e')
                .setTimestamp();

            if (currentProgramme) {
                const startDate = currentProgramme.start
                    ? new Date(currentProgramme.start)
                    : new Date(currentProgramme.start_timestamp ? currentProgramme.start_timestamp * 1000 : Date.now());
                const stopDate = currentProgramme.stop
                    ? new Date(currentProgramme.stop)
                    : new Date(currentProgramme.stop_timestamp ? currentProgramme.stop_timestamp * 1000 : Date.now());

                const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const stopTime = stopDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

                const description = typeof currentProgramme.description === 'string'
                    ? currentProgramme.description.substring(0, 150) + (currentProgramme.description.length > 150 ? '...' : '')
                    : 'No description available';

                streamEmbed.addFields(
                    { name: '🔴 NOW PLAYING', value: currentProgramme.title, inline: false },
                    { name: 'Time', value: `${startTime} - ${stopTime}`, inline: true },
                    { name: 'Description', value: description }
                );
            }

            if (nextProgramme) {
                const startDate = nextProgramme.start
                    ? new Date(nextProgramme.start)
                    : new Date(nextProgramme.start_timestamp ? nextProgramme.start_timestamp * 1000 : Date.now());
                const stopDate = nextProgramme.stop
                    ? new Date(nextProgramme.stop)
                    : new Date(nextProgramme.stop_timestamp ? nextProgramme.stop_timestamp * 1000 : Date.now());

                const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const stopTime = stopDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const timeUntilStart = Math.floor((startDate.getTime() - Date.now()) / 60000); // minutes until start

                streamEmbed.addFields({
                    name: '⏭️ UP NEXT',
                    value: `**${nextProgramme.title}** at ${startTime} (in ${timeUntilStart} minutes)`,
                    inline: false
                });
            }

            streamEmbed.setFooter({ text: 'Stream and programme information is subject to change' });

            // Add buttons for programme guide and stopping the stream
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(PROGRAMME_BUTTON_ID)
                        .setLabel('📋 Show Programme Guide')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(STOP_BUTTON_ID)
                        .setLabel('⏹️ Stop Stream')
                        .setStyle(ButtonStyle.Danger)
                );

            // we will not await this as it's a void function, but we need to call it to start the stream
            startStreaming(channel);
            return {
                success: true,
                message: `Now streaming ${channelName}`,
                channel: channel,
                embed: streamEmbed,
                components: [row]
            };
        } catch (streamError) {
            logger.error(`Stream error: ${streamError}`);
            if (streamError instanceof Error) {
                return { success: false, message: `Error during streaming: ${streamError.message}` };
            } else {
                return { success: false, message: 'An unknown error occurred during streaming.' };
            }
        }
    } catch (error) {
        logger.error(`Error getting stream: ${error}`);
        return { success: false, message: 'An error occurred while fetching the stream information.' };
    }
}

/**
 * Handles the stream command interaction
 * @param interaction - The Discord command interaction
 */
export async function handleStreamCommand(interaction: CommandInteraction) {
    try {
        const channelName = interaction.options.get('channel')?.value as string;
        if (!channelName) {
            await interaction.reply('Please specify a channel name.');
            return;
        }

        logger.info(`Command /stream received with channel: ${channelName}.`);
        await interaction.deferReply();

        const member = interaction.member as GuildMember;
        const voiceChannel = member.voice.channel;
        if (!voiceChannel) {
            await interaction.editReply('You need to be in a voice channel to use this command.');
            return;
        }

        const result = await executeStreamChannel(channelName, voiceChannel.id);

        if (!result.success) {
            await interaction.editReply(result.message);
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
            time: 24 * 60 * 60 * 1000 // 24 hours
        });

        collector.on('collect', async (i) => {
            logger.debug(`Button clicked: ${i.customId}`);
            try {
                await i.deferUpdate();
                if (i.customId === PROGRAMME_BUTTON_ID) {
                    logger.info(`Programme button clicked for channel: ${channelName}`);
                    const programmeInfo = await generateProgrammeInfo(channelName);

                    if (!programmeInfo.success) {
                        await i.followUp({
                            content: programmeInfo.message,
                            ephemeral: true
                        });
                        return;
                    }

                    await i.followUp({
                        content: `📺 Programme Guide for ${channelName}`,
                        embeds: programmeInfo.embeds,
                        ephemeral: true // Only visible to the user who clicked
                    });
                } else if (i.customId === STOP_BUTTON_ID) {
                    logger.info(`Stop button clicked for stream: ${channelName}`);
                    const stopResult = await executeStopStream();

                    if (!stopResult.success) {
                        await i.followUp({
                            content: stopResult.message,
                            embeds: [],
                            ephemeral: true
                        });
                        return;
                    }

                    await i.followUp({
                        content: 'Stream stopped successfully.',
                        ephemeral: false
                    });
                } else if (i.customId.startsWith('play_channel_')) {
                    const playChannelName = i.customId.replace('play_channel_', '');
                    const playResult = await executeStreamChannel(playChannelName, voiceChannel.id);

                    if (playResult.success) {
                        await i.followUp({
                            content: playResult.message,
                            embeds: playResult.embed ? [playResult.embed] : [],
                            components: playResult.components || []
                        });
                    } else {
                        await i.followUp({
                            content: playResult.message,
                            ephemeral: true
                        });
                    }
                }
            } catch (error) {
                logger.error(`Error handling button interaction: ${error}`);
                try {
                    await i.followUp({
                        content: 'An error occurred while processing your request.',
                        ephemeral: true
                    });
                } catch (followUpError) {
                    logger.error(`Error sending follow-up message: ${followUpError}`);
                }
            }
        });
    } catch (error) {
        logger.error(`Error handling stream command: ${error}`);
        try {
            await interaction.reply({
                content: 'An error occurred while processing your request.',
                ephemeral: true
            });
        } catch (replyError) {
            logger.error(`Error sending reply: ${replyError}`);
        }
    }
}
