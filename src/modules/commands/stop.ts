import { CommandInteraction } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { leaveVoiceChannel, stopStreaming } from '../../modules/streaming';

const logger = getLogger();

export async function handleStopCommand(interaction: CommandInteraction) {
    logger.info('Command /stop received');
    try {
        await stopStreaming();
        await new Promise(resolve => setTimeout(resolve, 500));
        await leaveVoiceChannel();
        await interaction.reply('Stopped the stream and left the voice channel');
    } catch (error) {
        logger.error(`Error stopping stream: ${error}`);
        await interaction.reply(`Error stopping stream: ${error}`);
    }
}
