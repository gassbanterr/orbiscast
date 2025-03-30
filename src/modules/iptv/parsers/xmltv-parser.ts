import { promises as fs } from 'fs';
import { parseStringPromise } from 'xml2js';
import { getLogger } from '../../../utils/logger';
import { parseDate } from '../utils';
import type { ProgrammeEntry } from '../../../interfaces/iptv';

const logger = getLogger();

/**
 * Parses an XMLTV file to extract programme entries.
 * 
 * @param {string} filePath - Path to the XMLTV file
 * @returns {Promise<ProgrammeEntry[]>} - Array of parsed programme entries
 */
export async function parseXMLTV(filePath: string): Promise<ProgrammeEntry[]> {
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
