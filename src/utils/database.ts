import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { config } from './config';
import { getLogger } from './logger';
import { cacheFile, clearCache, getCachedFile, getCachedFilePath } from './cache';
import { parseStringPromise } from 'xml2js';
import axios from 'axios';
import type { ChannelEntry, ProgrammeEntry } from '../interfaces/iptv';

const logger = getLogger();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, '../../data');

fs.mkdir(dataDir, { recursive: true }).catch(err => logger.error(`Error creating data directory: ${err}`));

const channelsDb = new Low<{ channels: ChannelEntry[] }>(new JSONFile(join(dataDir, 'channels.db.json')), { channels: [] });
const programmesDb = new Low<{ programmes: ProgrammeEntry[] }>(new JSONFile(join(dataDir, 'programmes.db.json')), { programmes: [] });

export async function getChannelEntries(): Promise<ChannelEntry[]> {
    await channelsDb.read();
    return channelsDb.data?.channels || [];
}

export async function getProgrammeEntries(): Promise<ProgrammeEntry[]> {
    await programmesDb.read();
    return programmesDb.data?.programmes || [];
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

export async function fillDbChannels(force = true): Promise<void> {
    logger.debug('Starting to fill the channels database');
    await channelsDb.read();

    channelsDb.data = { channels: [] };
    logger.debug('Channels table truncated');
    logger.info('Fetching playlist...');

    let playlistContent = await getCachedFile('playlist.m3u');
    if (!playlistContent || force) {
        playlistContent = await fetchWithRetry(config.PLAYLIST, 'playlist.m3u');
    }

    if (playlistContent) {
        logger.info('Adding channels to database...');
        let channel: ChannelEntry | null = null;
        for (const line of playlistContent.toString().split('\n')) {
            if (line.startsWith('#EXTINF:')) {
                channel = fromPlaylistLine(line);
            } else if (channel && !line.startsWith('#') && line.trim()) {
                channel.url = line.trim();
                channel.created_at = new Date().toISOString();
                channelsDb.data.channels.push(channel);
                channel = null;
            }
        }
        await channelsDb.write();

    } else {
        logger.info('Channels table already populated.');
    }
}

function parseDate(dateString: string): Date {
    const [datePart, timePart, offsetPart] = dateString.split(' ');
    if (!datePart) {
        throw new Error('Invalid date string format');
    }
    const year = parseInt(datePart.slice(0, 4));
    const month = parseInt(datePart.slice(4, 6)) - 1;
    const day = parseInt(datePart.slice(6, 8));
    if (!timePart) {
        throw new Error('Invalid date string format');
    }
    const hour = parseInt(timePart.slice(0, 2));
    const minute = parseInt(timePart.slice(2, 4));
    const second = parseInt(timePart.slice(4, 6));
    const offsetSign = offsetPart?.[0] === '+' ? 1 : -1;
    const offsetHour = parseInt(offsetPart?.slice(1, 3) || '0');
    const offsetMinute = parseInt(offsetPart?.slice(3, 5) || '0');
    const offset = offsetSign * (offsetHour * 60 + offsetMinute) * 60000;

    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    return new Date(date.getTime() - offset);
}

export async function fillDbProgrammes(force = false): Promise<void> {
    logger.debug('Starting to fill the programmes database');
    await programmesDb.read();
    const createdAt = programmesDb.data?.programmes?.[0]?.created_at;

    if (!createdAt || force || isOlderThanSetRefreshTime(createdAt)) {
        programmesDb.data = { programmes: [] };
        logger.debug('Programmes table truncated');
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
                const parsedXml = await parseStringPromise(await fs.readFile(xmltvPath, 'utf8'));
                for (const programme of parsedXml.tv.programme) {
                    const title = programme.title?.[0] || '';
                    const description = programme.desc?.[0] || '';
                    const startStr = programme.$.start;
                    const stopStr = programme.$.stop;
                    logger.debug(`Parsing programme with start: ${startStr}, stop: ${stopStr}`);
                    try {
                        const start = parseDate(startStr);
                        const stop = parseDate(stopStr);
                        programmesDb.data.programmes.push({
                            start: start.toISOString(),
                            stop: stop.toISOString(),
                            start_timestamp: Math.floor(start.getTime() / 1000),
                            stop_timestamp: Math.floor(stop.getTime() / 1000),
                            channel: programme.$.channel,
                            title,
                            description,
                            created_at: new Date().toISOString(),
                        });
                    } catch (error) {
                        logger.error(`Error inserting programme with start: ${startStr}, stop: ${stopStr} - ${error}`);
                    }
                }
                await programmesDb.write();
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

export async function downloadCacheAndFillDb(force = false): Promise<void> {
    logger.debug('Cache download started and parsing with force: ' + force);
    await fillDbChannels(force);
    await fillDbProgrammes(force);
    logger.debug('Finished parsing');
    await clearCache();
    logger.debug('Cleared cache');

    scheduleIPTVRefresh();
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
                logger.warning(`Connection error on attempt ${attempt}: ${error.message}`);
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

function isOlderThanSetRefreshTime(dateString: string): boolean {
    const date = new Date(dateString);
    const refreshTime = Math.max(config.REFRESH_IPTV * 60 * 1000 - 3 * 60 * 1000, 0);
    return (Date.now() - date.getTime()) > refreshTime;
}

async function scheduleIPTVRefresh() {
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