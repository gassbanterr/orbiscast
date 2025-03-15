import { CommandInteraction } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { leaveVoiceChannel, stopStreaming } from '../../modules/streaming';

const logger = getLogger();

/**
 * Stops the current stream and disconnects from the voice channel
 * @returns Object containing success status and result message
 */
export async function executeStopStream() {
    try {
        await stopStreaming();
        await new Promise(resolve => setTimeout(resolve, 500));
        await leaveVoiceChannel();
        await new Promise(resolve => setTimeout(resolve, 500));
        return { success: true, message: 'Stopped the stream and left the voice channel' };
    } catch (error) {
        logger.error(`Error stopping stream: ${error}`);
        return { success: false, message: `Error stopping stream: ${error}` };
    }
}

/**
 * Handles the /stop slash command interaction
 * @param interaction - The Discord command interaction
 */
export async function handleStopCommand(interaction: CommandInteraction) {
    logger.info('Command /stop received');
    const result = await executeStopStream();
    await interaction.reply(result.message);
}
