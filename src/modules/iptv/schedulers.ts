import { getLogger } from '../../utils/logger';
import { config } from '../../utils/config';
import { downloadCacheAndFillDb } from './index';

const logger = getLogger();

/**
 * Schedules periodic IPTV data refresh based on configuration.
 */
export function scheduleIPTVRefresh() {
    const refreshInterval = config.REFRESH_IPTV * 60 * 1000; // Convert minutes to milliseconds
    setInterval(async () => {
        logger.info('Refreshing IPTV data...');
        try {
            await downloadCacheAndFillDb(true);
            logger.info('IPTV data refreshed successfully');
        } catch (error) {
            logger.error(`Error refreshing IPTV data: ${error}`);
        }
    }, refreshInterval);
}
