import { CommandInteraction } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { downloadCacheAndFillDb, fillDbChannels, fillDbProgrammes } from '../../modules/iptv';

const logger = getLogger();

/**
 * Executes a refresh operation for channel or program data
 * @param type - Type of refresh operation ('all', 'channels', or 'programme')
 * @returns Object containing success status and result message
 */
export async function executeRefresh(type: string): Promise<{ success: boolean, message: string }> {
    try {
        if (type === 'all') {
            logger.info('Refreshing all data...');
            await downloadCacheAndFillDb(true);
        } else if (type === 'channels') {
            logger.info('Refreshing channels...');
            await fillDbChannels(true);
        } else if (type === 'programme') {
            logger.info('Refreshing programme...');
            await fillDbProgrammes(true);
        } else {
            return { success: false, message: `Unknown refresh type: ${type}` };
        }

        logger.info(`Successfully refreshed ${type} data.`);
        return { success: true, message: `Successfully refreshed ${type} data.` };
    } catch (error) {
        logger.error(`Error refreshing ${type} data: ${error}`);
        return { success: false, message: `Failed to refresh ${type} data.` };
    }
}

/**
 * Handles the /refresh slash command interaction
 * @param interaction - The Discord command interaction
 */
export async function handleRefreshCommand(interaction: CommandInteraction) {
    const type = interaction.options.get('type', true).value as string;
    const result = await executeRefresh(type);
    await interaction.reply(result.message);
}
