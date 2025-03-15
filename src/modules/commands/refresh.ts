import { CommandInteraction } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { downloadCacheAndFillDb, fillDbChannels, fillDbProgrammes } from '../../modules/iptv';

const logger = getLogger();

export async function handleRefreshCommand(interaction: CommandInteraction) {
    const type = interaction.options.get('type', true).value as string;

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
        }

        await interaction.reply(`Successfully refreshed ${type} data.`);
        logger.info(`Successfully refreshed ${type} data.`);
    } catch (error) {
        logger.error(`Error refreshing ${type} data: ${error}`);
        await interaction.reply(`Failed to refresh ${type} data.`);
    }
}
