import { promises as fs } from 'fs';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { getLogger } from '../../utils/logger';
import { config } from '../../utils/config';
import { cacheFile, clearCache, getCachedFile, getCachedFilePath } from '../../utils/cache';
import { clearChannels, addChannels, clearProgrammes, addProgrammes, getProgrammeEntries } from '../database';
import type { ChannelEntry, ProgrammeEntry } from '../../interfaces/iptv';

const logger = getLogger();

/**
 * Downloads IPTV data, caches it, and fills the database with channels and programmes.
 * After completion, schedules regular refresh.
 * 
 * @param {boolean} force - Whether to force download even if cache exists
 * @returns {Promise<void>}
 */
export async function downloadCacheAndFillDb(force = false): Promise<void> {
    logger.debug('Cache download started and parsing with force: ' + force);
    await fillDbChannels(force);
    await fillDbProgrammes(force);
    logger.debug('Finished parsing');
    await clearCache();
    scheduleIPTVRefresh();
}

/**
 * Clears and fills the channels database with data from the playlist file.
 * 
 * @param {boolean} force - Whether to force download even if cache exists
 * @returns {Promise<void>}
 */
export async function fillDbChannels(force = true): Promise<void> {
    logger.debug('Starting to fill the channels database');

    await clearChannels();
    logger.info('Fetching playlist...');

    let playlistContent = await getCachedFile('playlist.m3u');
    if (!playlistContent || force) {
        playlistContent = await fetchWithRetry(config.PLAYLIST, 'playlist.m3u');
    }

    if (playlistContent) {
        logger.info('Adding channels to database...');
        const channels: ChannelEntry[] = [];
        let channel: ChannelEntry | null = null;
        for (const line of playlistContent.toString().split('\n')) {
            if (line.startsWith('#EXTINF:')) {
                channel = fromPlaylistLine(line);
            } else if (channel && !line.startsWith('#') && line.trim()) {
                channel.url = line.trim();
                channel.created_at = new Date().toISOString();
                channels.push(channel);
                channel = null;
            }
        }
        await addChannels(channels);
    } else {
        logger.error('Failed to fetch playlist content');
    }
}

/**
 * Clears and fills the programme database with data from the XMLTV file.
 * Only refreshes if data is stale or forced.
 * 
 * @param {boolean} force - Whether to force download even if cache exists
 * @returns {Promise<void>}
 */
export async function fillDbProgrammes(force = false): Promise<void> {
    logger.debug('Starting to fill the programmes database');

    const isStale = await isProgrammeDataStale();

    if (isStale || force) {
        await clearProgrammes();
        logger.info('Fetching XMLTV...');

        let xmltvContent = await getCachedFile('xmltv.xml');
        if (!xmltvContent || force) {
            xmltvContent = await fetchWithRetry(config.XMLTV, 'xmltv.xml');
        }

        if (xmltvContent) {
            logger.info('Adding programmes to database...');
            const xmltvPath = await getCachedFilePath('xmltv.xml');
            if (xmltvPath) {
                await fs.writeFile(xmltvPath, xmltvContent);
                const programmes = await parseXMLTV(xmltvPath);
                await addProgrammes(programmes);
            } else {
                logger.error('XMLTV path is null. Cannot read file.');
            }
        } else {
            logger.error('No XMLTV content available. Cannot process.');
        }
    } else {
        logger.info('TV Schedule up to date');
    }
}

/**
 * Parses a playlist line to extract channel information.
 * 
 * @param {string} line - A line from the M3U playlist starting with #EXTINF
 * @returns {ChannelEntry | null} - Channel object or null if parsing fails
 */
function fromPlaylistLine(line: string): ChannelEntry | null {
    const PATTERN = /#EXTINF:.*\s*channelID="(?<xui_id>.*?)"\s*tvg-chno="(?<tvg_chno>.*?)"\s*tvg-name="(?<tvg_name>.*?)"\s*tvg-id="(?<tvg_id>.*?)"\s*tvg-logo="(?<tvg_logo>.*?)"\s*group-title="(?<group_title>.*?)"/;
    const matches = line.match(PATTERN);
    if (matches?.groups) {
        const { xui_id, tvg_id, tvg_name, tvg_logo, group_title } = matches.groups;
        const [prefix] = (group_title || '').split(': |');
        return { xui_id: parseInt(xui_id || '0'), tvg_id, tvg_name, tvg_logo, group_title, url: '', created_at: undefined, country: prefix };
    }
    return null;
}

/**
 * Parses an XMLTV file to extract programme entries.
 * 
 * @param {string} filePath - Path to the XMLTV file
 * @returns {Promise<ProgrammeEntry[]>} - Array of parsed programme entries
 */
async function parseXMLTV(filePath: string): Promise<ProgrammeEntry[]> {
    const programmes: ProgrammeEntry[] = [];
    try {
        const xmlContent = await fs.readFile(filePath, 'utf8');
        logger.debug(`XMLTV file size: ${xmlContent.length} bytes`);

        const parsedXml = await parseStringPromise(xmlContent);
        logger.info(`Found ${parsedXml.tv.programme?.length || 0} programmes in XMLTV`);

        if (!parsedXml.tv.programme || parsedXml.tv.programme.length === 0) {
            logger.error('No programmes found in XMLTV file');
            return programmes;
        }

        // Debug first programme structure
        const sampleProgramme = parsedXml.tv.programme[0];
        logger.debug(`Sample programme structure: ${JSON.stringify(sampleProgramme).substring(0, 500)}...`);

        for (const programme of parsedXml.tv.programme) {
            try {
                const parsedProgramme = parseProgrammeEntry(programme);
                programmes.push(parsedProgramme);
            } catch (error) {
                const title = extractTextContent(programme.title?.[0]) || 'unknown';
                logger.error(`Error parsing programme "${title}": ${error}`);
            }
        }

        logProgrammeStatistics(programmes);
    } catch (error) {
        logger.error(`Error parsing XMLTV: ${error}`);
    }
    return programmes;
}

/**
 * Parses a single programme entry from XMLTV data.
 * 
 * @param {any} programme - Raw programme data from XMLTV
 * @returns {ProgrammeEntry} - Structured programme entry
 * @throws {Error} - If programme is missing required fields
 */
function parseProgrammeEntry(programme: any): ProgrammeEntry {
    const title = extractTextContent(programme.title?.[0]);
    const description = extractTextContent(programme.desc?.[0]);
    const category = extractTextContent(programme.category?.[0]);

    const startStr = programme.$.start;
    const stopStr = programme.$.stop;

    if (!startStr || !stopStr) {
        throw new Error(`Programme missing start/stop times: ${title}`);
    }

    logger.debug(`Parsing programme "${title}" with start: ${startStr}, stop: ${stopStr}`);

    const start = parseDate(startStr);
    const stop = parseDate(stopStr);

    if (start.getTime() === stop.getTime()) {
        logger.warn(`Programme "${title}" has identical start and stop times: ${startStr}`);
    }

    return {
        start: start.toISOString(),
        stop: stop.toISOString(),
        start_timestamp: Math.floor(start.getTime() / 1000),
        stop_timestamp: Math.floor(stop.getTime() / 1000),
        channel: programme.$.channel,
        title,
        description,
        category,
        created_at: new Date().toISOString(),
    };
}

/**
 * Extracts text content from an XMLTV element.
 * 
 * @param {any} element - XML element that may contain text
 * @returns {string} - Extracted text or empty string if not found
 */
function extractTextContent(element: any): string {
    if (!element) {
        return '';
    }

    if (typeof element === 'string') {
        return element;
    } else if (element._) {
        return element._;
    }

    return '';
}

/**
 * Logs statistics about the parsed programme data.
 * 
 * @param {ProgrammeEntry[]} programmes - Array of programme entries
 */
function logProgrammeStatistics(programmes: ProgrammeEntry[]): void {
    // Add summary statistics
    const channels = new Set(programmes.map(p => p.channel)).size;
    logger.info(`Parsed ${programmes.length} programmes across ${channels} channels from XMLTV file`);

    // Check for date range in the data
    if (programmes.length > 0) {
        const dates = programmes.map(p => new Date(p.start));
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        logger.info(`Programme date range: ${minDate.toISOString()} to ${maxDate.toISOString()}`);
    }
}

/**
 * Parses a date string in the XMLTV format.
 * 
 * @param {string} dateString - Date string in YYYYMMDDHHMMSS format with optional timezone
 * @returns {Date} - Parsed date object
 * @throws {Error} - If the date string format is invalid
 */
function parseDate(dateString: string): Date {
    // Split by space to separate timestamp from timezone offset
    const parts = dateString.split(' ');

    // Extract the timestamp and offset
    const timestamp = parts[0];
    const offsetPart = parts[1];

    if (!timestamp || timestamp.length < 14) {
        throw new Error(`Invalid date string format: ${dateString}`);
    }

    // Extract date parts from the timestamp
    const year = parseInt(timestamp.slice(0, 4));
    const month = parseInt(timestamp.slice(4, 6)) - 1; // JS months are 0-indexed
    const day = parseInt(timestamp.slice(6, 8));

    // Extract time parts from the timestamp
    const hour = parseInt(timestamp.slice(8, 10));
    const minute = parseInt(timestamp.slice(10, 12));
    const second = parseInt(timestamp.slice(12, 14));

    // Handle timezone offset
    let offset = 0;
    if (offsetPart) {
        const offsetSign = offsetPart[0] === '+' ? 1 : -1;
        const offsetHour = parseInt(offsetPart.slice(1, 3) || '0');
        const offsetMinute = parseInt(offsetPart.slice(3, 5) || '0');
        offset = offsetSign * (offsetHour * 60 + offsetMinute) * 60000;
    }

    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    return new Date(date.getTime() - offset);
}

/**
 * Fetches data from a URL with retry logic.
 * 
 * @param {string} url - URL to fetch data from
 * @param {string} cacheFileName - Name to use when caching the file
 * @returns {Promise<Buffer | null>} - Fetched content or null if failed
 */
async function fetchWithRetry(url: string, cacheFileName: string): Promise<Buffer | null> {
    const maxRetries = 3;
    let retryDelay = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.info(`Download attempt ${attempt}/${maxRetries}...`);
            const response = await axios.get(url, { timeout: 30000 });
            const content = response.data;
            if (content) {
                await cacheFile(cacheFileName, Buffer.from(content));
                return Buffer.from(content);
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

/**
 * Checks if the programme data in the database is stale.
 * 
 * @returns {Promise<boolean>} - True if data is stale, false otherwise
 */
async function isProgrammeDataStale(): Promise<boolean> {
    const programmes = await getProgrammeEntries();
    const createdAt = programmes?.[0]?.created_at;
    return !createdAt || isOlderThanSetRefreshTime(createdAt);
}

/**
 * Checks if a date is older than the configured refresh time.
 * 
 * @param {string} dateString - ISO date string to check
 * @returns {boolean} - True if the date is older than the refresh interval
 */
function isOlderThanSetRefreshTime(dateString: string): boolean {
    const date = new Date(dateString);
    const refreshTime = Math.max(config.REFRESH_IPTV * 60 * 1000 - 3 * 60 * 1000, 0);
    return (Date.now() - date.getTime()) > refreshTime;
}

/**
 * Schedules periodic IPTV data refresh based on configuration.
 */
function scheduleIPTVRefresh() {
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
