import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { getLogger } from '../../utils/logger';
import type { ChannelEntry, ProgrammeEntry } from '../../interfaces/iptv';

const logger = getLogger();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, '../../../data');

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

export async function clearChannels(): Promise<void> {
    await channelsDb.read();
    channelsDb.data = { channels: [] };
    await channelsDb.write();
    logger.debug('Channels table truncated');
}

export async function addChannels(channels: ChannelEntry[]): Promise<void> {
    await channelsDb.read();
    channelsDb.data.channels = channels;
    await channelsDb.write();
    logger.debug(`Added ${channels.length} channels to database`);
}

export async function clearProgrammes(): Promise<void> {
    await programmesDb.read();
    programmesDb.data = { programmes: [] };
    await programmesDb.write();
    logger.debug('Programmes table truncated');
}

export async function addProgrammes(programmes: ProgrammeEntry[]): Promise<void> {
    await programmesDb.read();
    programmesDb.data.programmes = programmes;
    await programmesDb.write();
    logger.debug(`Added ${programmes.length} programmes to database`);
}
