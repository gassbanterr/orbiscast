import { config } from './utils/config';
import { downloadCacheAndFillDb } from './utils/database';
import { getLogger } from './utils/logger';
import { client } from './utils/discord';
import { initializeStreamer, joinVoiceChannel, startStreaming } from './utils/discord_stream';

const logger = getLogger();

// Initialize the streamer
initializeStreamer().then(() => {
    // Download and cache the playlist
    downloadCacheAndFillDb().then(() => {
        // Run the bot
        logger.info('Attempting to log in Orbiscast...');
        client.login(config.BOT_TOKEN).then(() => {
            logger.info('Orbiscast logged in successfully');
        }).catch((err: any) => {
            logger.error(`Error logging in: ${err}`);
        });
    }).catch(err => {
        logger.error(`Error downloading and caching data: ${err}`);
    });
}).catch(err => {
    logger.error(`Error initializing streamer: ${err}`);
});