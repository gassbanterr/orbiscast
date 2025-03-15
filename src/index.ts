import { config } from './utils/config';
import { downloadCacheAndFillDb } from './utils/database';
import { getLogger } from './utils/logger';
import { client } from './utils/discord';
import { initializeStreamer } from './utils/discord_stream';

const logger = getLogger();

async function startOrbisCast() {
    try {
        await initializeStreamer();
        await downloadCacheAndFillDb();
        logger.info('Attempting to log in OrbisCast...');
        await client.login(config.DISCORD_BOT_TOKEN);
        logger.info('OrbisCast logged in successfully');
    } catch (err) {
        logger.error(`Error: ${err}`);
    }
}

startOrbisCast();