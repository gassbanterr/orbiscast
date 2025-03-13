import { config as dotenvConfig } from 'dotenv';
import { getLogger } from './logger';
import { downloadCacheAndFillDb } from './database';

const logger = getLogger();

class Config {
    PLAYLIST: string;
    XMLTV: string;
    REFRESH_IPTV: number;
    DEFAULT_STREAM_TIME: number;
    RAM_CACHE: boolean;
    BOT_TOKEN: string;
    DISCORD_USER_TOKEN: string;
    GUILD: string;
    DEFAULT_TEXT_CHANNEL: string;
    DEBUG: boolean;
    CACHE_DIR: string;

    constructor() {
        logger.info("Loading environment variables");
        dotenvConfig();

        const env = process.env;
        this.PLAYLIST = env.PLAYLIST?.trim() || '';
        this.XMLTV = env.XMLTV?.trim() || '';
        this.REFRESH_IPTV = parseInt(env.REFRESH_IPTV?.trim() || '120');
        this.DEFAULT_STREAM_TIME = parseInt(env.DEFAULT_STREAM_TIME?.trim() || '120');
        this.RAM_CACHE = env.RAM_CACHE?.trim().toLowerCase() === 'true';
        this.BOT_TOKEN = env.BOT_TOKEN?.trim() || '';
        this.DISCORD_USER_TOKEN = env.DISCORD_USER_TOKEN?.trim() || '';
        this.GUILD = env.GUILD?.trim() || '0';
        this.DEFAULT_TEXT_CHANNEL = env.DEFAULT_TEXT_CHANNEL?.trim() || '0';
        this.DEBUG = env.DEBUG?.trim().toLowerCase() === 'true';
        this.CACHE_DIR = env.CACHE_DIR?.trim() || (this.RAM_CACHE ? '/dev/shm' : '');

        // Log the loaded GUILD ID for debugging
        logger.info(`Loaded GUILD ID: ${this.GUILD}`);

        this.validateEnvVars();
        logger.info("Successfully loaded environment variables");

        // Log the configuration values for debugging
        logger.debug(`Configuration values: ${JSON.stringify(this, null, 2)}`);
    }

    private validateEnvVars() {
        const requiredVars = ['PLAYLIST', 'XMLTV', 'BOT_TOKEN', 'DISCORD_USER_TOKEN', 'GUILD', 'DEFAULT_TEXT_CHANNEL'];
        requiredVars.forEach(varName => {
            if (!this[varName as keyof Config]) {
                logger.error(`${varName} environment variable not set`);
            }
        });

        if (!this.REFRESH_IPTV) {
            this.REFRESH_IPTV = 1440;
            logger.info(`REFRESH_IPTV environment variable not set, defaulting to ${this.REFRESH_IPTV} minutes`);
        }
        if (!this.DEFAULT_STREAM_TIME) {
            this.DEFAULT_STREAM_TIME = 120;
            logger.info(`DEFAULT_STREAM_TIME environment variable not set, defaulting to ${this.DEFAULT_STREAM_TIME}`);
        }
        if (!this.DEBUG) {
            this.DEBUG = false;
            logger.info(`DEBUG environment variable not set or set to false, defaulting to ${this.DEBUG}`);
        }
        if (!this.CACHE_DIR) {
            this.CACHE_DIR = '/dev/shm/orbiscast';
            logger.info(`CACHE_DIR environment variable not set, defaulting to ${this.CACHE_DIR}`);
        }
        if (this.RAM_CACHE) {
            logger.info("Using RAM cache");
            this.CACHE_DIR = '/dev/shm/orbiscast';
        }
    }
}

export const config = new Config();
