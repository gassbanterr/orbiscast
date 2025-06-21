import { config } from './utils/config';
import { downloadCacheAndFillDb } from './modules/iptv';
import { getLogger } from './utils/logger';
import { client } from './utils/discord';
import { initializeStreamer } from './modules/streaming';

const logger = getLogger();

/**
 * Initialize and start the OrbisCast application
 * Performs database setup, initializes the streamer, and logs in the Discord bot
 */
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

Bun.serve({
    port: 7860,
    hostname: "0.0.0.0",
    fetch(req) {
        return new Response("✅ OrbisCast is running and connected to Discord.", {
            status: 200,
            headers: { "Content-Type": "text/plain" },
        });
    },
});
