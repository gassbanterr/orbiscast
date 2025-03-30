import { getLogger } from '../../../utils/logger';
import type { ChannelEntry } from '../../../interfaces/iptv';

const logger = getLogger();

/**
 * Parses a playlist line to extract channel information.
 * Tries multiple formats to ensure compatibility with different playlist providers.
 * 
 * @param {string} line - A line from the M3U playlist starting with #EXTINF
 * @returns {ChannelEntry | null} - Channel entry or null if parsing fails
 */
export function fromPlaylistLine(line: string): ChannelEntry | null {
    // Try each parsing strategy in sequence
    return parseOriginalFormat(line) ||
        parseAlternativeFormat(line) ||
        parseFlexibleFormat(line);
}

/**
 * Attempts to parse a playlist line using the original format pattern.
 * 
 * @param {string} line - A line from the M3U playlist
 * @returns {ChannelEntry | null} - Channel entry or null if parsing fails
 */
function parseOriginalFormat(line: string): ChannelEntry | null {
    const ORIGINAL_PATTERN = /#EXTINF:.*\s*channelID="(?<xui_id>.*?)"\s*tvg-chno="(?<tvg_chno>.*?)"\s*tvg-name="(?<tvg_name>.*?)"\s*tvg-id="(?<tvg_id>.*?)"\s*tvg-logo="(?<tvg_logo>.*?)"\s*group-title="(?<group_title>.*?)"/;
    const matches = line.match(ORIGINAL_PATTERN);

    if (matches?.groups) {
        const { xui_id, tvg_id, tvg_name, tvg_logo, group_title } = matches.groups;
        const [prefix] = (group_title || '').split(': |');
        return {
            xui_id: parseInt(xui_id || '0'),
            tvg_id,
            tvg_name,
            tvg_logo,
            group_title,
            url: '',
            created_at: undefined,
            country: prefix
        };
    }

    return null;
}

/**
 * Attempts to parse a playlist line using the alternative format pattern.
 * 
 * @param {string} line - A line from the M3U playlist
 * @returns {ChannelEntry | null} - Channel entry or null if parsing fails
 */
function parseAlternativeFormat(line: string): ChannelEntry | null {
    const ALT_PATTERN = /#EXTINF:(?<duration>.*?)\s+tvg-id="(?<tvg_id>.*?)"\s+tvg-logo="(?<tvg_logo>.*?)"\s+group-title="(?<group_title>.*?)"(?:,\s*(?<channel_name>.*?)(?:\s+\(.*?\))?)?$/;
    const matches = line.match(ALT_PATTERN);

    if (matches?.groups) {
        const { tvg_id, tvg_logo, group_title, channel_name } = matches.groups;
        // Use the channel name as tvg_name if available
        const tvg_name = channel_name || tvg_id;
        const [prefix] = (group_title || '').split(': |');

        logger.debug(`Parsed alternative format channel: ${tvg_name}`);

        return {
            xui_id: 0, // No xui_id in this format
            tvg_id,
            tvg_name,
            tvg_logo,
            group_title,
            url: '',
            created_at: undefined,
            country: prefix
        };
    }

    return null;
}

/**
 * Attempts to parse a playlist line using a flexible approach when standard patterns fail.
 * Extracts whatever information is available in the line.
 * 
 * @param {string} line - A line from the M3U playlist
 * @returns {ChannelEntry | null} - Channel entry or null if parsing fails
 */
function parseFlexibleFormat(line: string): ChannelEntry | null {
    if (!line.startsWith('#EXTINF:')) {
        return null;
    }

    logger.debug(`Trying flexible parsing for line: ${line.substring(0, 100)}...`);

    // Extract available attributes
    const tvgIdMatch = line.match(/tvg-id="([^"]+)"/);
    const tvgLogoMatch = line.match(/tvg-logo="([^"]+)"/);
    const groupTitleMatch = line.match(/group-title="([^"]+)"/);

    // Extract channel name from after the last comma
    const lastCommaIndex = line.lastIndexOf(',');
    let channelName = '';

    if (lastCommaIndex !== -1) {
        channelName = line.substring(lastCommaIndex + 1).trim();
        // Remove quality indicator if present (anything in parentheses at the end)
        channelName = channelName.replace(/\s+\([^)]+\)\s*$/, '');
    }

    const tvgId = tvgIdMatch ? tvgIdMatch[1] : '';
    const tvgName = channelName || tvgId;
    const tvgLogo = tvgLogoMatch ? tvgLogoMatch[1] : '';
    const groupTitle = groupTitleMatch ? groupTitleMatch[1] : '';
    const country = groupTitle ? groupTitle.split(': |')[0] : '';

    if (tvgName) {
        logger.debug(`Flexible parsing found channel: ${tvgName}`);
        return {
            xui_id: 0,
            tvg_id: tvgId,
            tvg_name: tvgName,
            tvg_logo: tvgLogo,
            group_title: groupTitle,
            url: '',
            created_at: undefined,
            country
        };
    }

    return null;
}
