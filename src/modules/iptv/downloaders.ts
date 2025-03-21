import axios from 'axios';
import { getLogger } from '../../utils/logger';
import { cacheFile, getCachedFile } from '../../utils/cache';

const logger = getLogger();

/**
 * Fetches data from a URL with retry logic.
 * 
 * @param {string} url - URL to fetch data from
 * @param {string} cacheFileName - Name to use when caching the file
 * @returns {Promise<Buffer | null>} - Fetched content or null if failed
 */
export async function fetchWithRetry(url: string, cacheFileName: string): Promise<Buffer | null> {
    const maxRetries = 3;
    let retryDelay = 5;

    logger.info(`Downloading from ${url} to cache as ${cacheFileName}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.info(`Download attempt ${attempt}/${maxRetries}...`);
            const response = await axios.get(url, {
                timeout: 30000,
                responseType: 'arraybuffer'  // Ensure binary data is handled correctly
            });

            if (response.data) {
                const content = Buffer.from(response.data);
                logger.info(`Downloaded ${content.length} bytes, caching as ${cacheFileName}`);
                try {
                    await cacheFile(cacheFileName, content);
                    logger.debug(`Successfully cached file ${cacheFileName}`);
                } catch (cacheError) {
                    logger.error(`Error caching file: ${cacheError}`);
                }
                return content;
            } else {
                logger.warn('Downloaded content was empty');
            }
        } catch (error) {
            if (axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || (error.response?.status ?? 0) >= 500)) {
                logger.warn(`Connection error on attempt ${attempt}: ${error.message}`);
                if (attempt < maxRetries) {
                    logger.info(`Retrying in ${retryDelay} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay * 1000));
                    retryDelay *= 2;
                } else {
                    logger.error('Maximum retries reached. Could not download content.');
                    return await getCachedFile(cacheFileName);
                }
            } else {
                logger.error(`Request error: ${(error as any).message}`);
                return await getCachedFile(cacheFileName);
            }
        }
    }
    return null;
}
