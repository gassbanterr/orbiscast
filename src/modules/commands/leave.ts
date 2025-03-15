import { CommandInteraction } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { leaveVoiceChannel, stopStreaming } from '../../utils/discord_stream';

const logger = getLogger();

export async function handleLeaveCommand(interaction: CommandInteraction) {
    logger.info('Command /leave received');
    try {
        await stopStreaming();
        await leaveVoiceChannel();
        await interaction.reply('Left the voice channel');
    } catch (error) {
        logger.error(`Error leaving voice channel: ${error}`);
        await interaction.reply(`Error leaving voice channel: ${error}`);
    }
}
