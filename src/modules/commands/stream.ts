import { CommandInteraction, GuildMember } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { config } from '../../utils/config';
import { getChannelEntries } from '../../modules/database';
import { getVoiceConnection } from '@discordjs/voice';
import { initializeStreamer, joinVoiceChannel, startStreaming, stopStreaming } from '../../modules/streaming';
import type { ChannelEntry } from '../../interfaces/iptv';

const logger = getLogger();

export async function handleStreamCommand(interaction: CommandInteraction) {
    const channelName = interaction.options.get('channel_name')?.value as string;
    logger.info(`Command /stream received with channel: ${channelName}.`);

    await interaction.deferReply();

    const channelEntries = await getChannelEntries();
    const channelEntry = channelEntries.find(entry => entry.tvg_name === channelName);
    if (channelEntry) {
        const url = channelEntry.url;
        try {
            await initializeStreamer();
            logger.info('Stopping any existing stream...');
            await stopStreaming();
            await new Promise(resolve => setTimeout(resolve, 750));

            const member = interaction.member as GuildMember;
            const voiceChannel = member.voice.channel;
            if (!voiceChannel) {
                await interaction.editReply('You need to be in a voice channel to use this command.');
                return;
            }

            const connection = getVoiceConnection(config.GUILD);
            if (connection && connection.joinConfig.channelId === voiceChannel.id) {
                logger.debug('Already connected to the desired voice channel');
            } else {
                logger.info('Joining voice channel...');
                await joinVoiceChannel(config.GUILD, voiceChannel.id);
                await new Promise(resolve => setTimeout(resolve, 750));
            }

            await interaction.editReply(`Trying to stream ${channelName}...`);

            try {
                await startStreaming(channelEntry);
                await interaction.editReply(`Now streaming ${channelName}`);
            } catch (streamError) {
                logger.error(`Stream error: ${streamError}`);
                if (streamError instanceof Error) {
                    await interaction.editReply(`Error during streaming: ${streamError.message}`);
                } else {
                    await interaction.editReply('An unknown error occurred during streaming.');
                }
            }
        } catch (error) {
            logger.error(`Error starting stream: ${error}`);
            try {
                await interaction.editReply(`Error starting stream: ${error}`);
            } catch (editError) {
                if (editError instanceof Error && (editError as any).code === 10008) {
                    logger.error('Failed to edit reply: Unknown Message');
                } else {
                    logger.error(`Failed to edit reply: ${editError}`);
                }
            }
        }
    } else {
        logger.error(`Channel ${channelName} not found in the database`);
        await interaction.editReply(`Channel ${channelName} not found`);
    }
}
