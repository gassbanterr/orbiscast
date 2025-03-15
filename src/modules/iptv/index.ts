import { promises as fs } from 'fs';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { getLogger } from '../../utils/logger';
import { config } from '../../utils/config';
import { cacheFile, clearCache, getCachedFile, getCachedFilePath } from '../../utils/cache';
import { clearChannels, addChannels, clearProgrammes, addProgrammes, getProgrammeEntries } from '../database';
import type { ChannelEntry, ProgrammeEntry } from '../../interfaces/iptv';

const logger = getLogger();

export async function downloadCacheAndFillDb(force = false): Promise<void> {
    logger.debug('Cache download started and parsing with force: ' + force);
    await fillDbChannels(force);
    await fillDbProgrammes(force);
    logger.debug('Finished parsing');

    if (!config.DEBUG) {
        await clearCache();
    }

    scheduleIPTVRefresh();
}

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
                // Extract title, handling nested structure with lang attribute
                let title = '';
                if (typeof programme.title?.[0] === 'string') {
                    title = programme.title[0] || '';
                } else if (programme.title?.[0]?._) {
                    title = programme.title[0]._ || '';
                } else if (programme.title?.[0]?.$?.lang && programme.title[0]._) {
                    title = programme.title[0]._ || '';
                }

                // Extract description, handling nested structure with lang attribute
                let description = '';
                if (typeof programme.desc?.[0] === 'string') {
                    description = programme.desc[0] || '';
                } else if (programme.desc?.[0]?._) {
                    description = programme.desc[0]._ || '';
                } else if (programme.desc?.[0]?.$?.lang && programme.desc[0]._) {
                    description = programme.desc[0]._ || '';
                }

                // Extract category if available
                let category = '';
                if (programme.category?.[0]?._) {
                    category = programme.category[0]._;
                } else if (typeof programme.category?.[0] === 'string') {
                    category = programme.category[0];
                }

                const startStr = programme.$.start;
                const stopStr = programme.$.stop;

                if (!startStr || !stopStr) {
                    logger.error(`Programme missing start/stop times: ${title}`);
                    continue;
                }

                logger.debug(`Parsing programme "${title}" with start: ${startStr}, stop: ${stopStr}`);

                const start = parseDate(startStr);
                const stop = parseDate(stopStr);

                if (start.getTime() === stop.getTime()) {
                    logger.warn(`Programme "${title}" has identical start and stop times: ${startStr}`);
                }

                programmes.push({
                    start: start.toISOString(),
                    stop: stop.toISOString(),
                    start_timestamp: Math.floor(start.getTime() / 1000),
                    stop_timestamp: Math.floor(stop.getTime() / 1000),
                    channel: programme.$.channel,
                    title,
                    description,
                    category,
                    created_at: new Date().toISOString(),
                });
            } catch (error) {
                const title = programme.title?.[0]?._ || programme.title?.[0] || 'unknown';
                logger.error(`Error parsing programme "${title}": ${error}`);
            }
        }

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
    } catch (error) {
        logger.error(`Error parsing XMLTV: ${error}`);
    }
    return programmes;
}

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

async function isProgrammeDataStale(): Promise<boolean> {
    const programmes = await getProgrammeEntries();
    const createdAt = programmes?.[0]?.created_at;
    return !createdAt || isOlderThanSetRefreshTime(createdAt);
}

function isOlderThanSetRefreshTime(dateString: string): boolean {
    const date = new Date(dateString);
    const refreshTime = Math.max(config.REFRESH_IPTV * 60 * 1000 - 3 * 60 * 1000, 0);
    return (Date.now() - date.getTime()) > refreshTime;
}

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
