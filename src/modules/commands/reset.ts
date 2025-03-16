import { CommandInteraction, MessageFlags } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { resetStreamer } from '../streaming';

const logger = getLogger();

/**
 * Handles the /reset command
 * Resets the streaming client and all associated resources
 * @param interaction - Discord command interaction
 */
export async function handleResetCommand(interaction: CommandInteraction) {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        logger.info(`User ${interaction.user.tag} initiated a streamer reset`);

        await resetStreamer();

        await interaction.editReply({
            content: '✅ Streaming client has been reset successfully.'
        });
    } catch (error) {
        logger.error(`Error handling reset command: ${error}`);
        await interaction.editReply({
            content: '❌ Failed to reset streaming client. Check logs for details.'
        });
    }
}
