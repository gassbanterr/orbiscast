import { CommandInteraction } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { stopStreaming } from '../../utils/discord_stream';

const logger = getLogger();

export async function handleStopCommand(interaction: CommandInteraction) {
    logger.info('Command /stop received');
    try {
        await stopStreaming();
        await interaction.reply('Stopped the stream');
    } catch (error) {
        logger.error(`Error stopping stream: ${error}`);
        await interaction.reply(`Error stopping stream: ${error}`);
    }
}
