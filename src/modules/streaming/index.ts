import { Client } from "discord.js-selfbot-v13";
import { Streamer } from '@dank074/discord-video-stream';
import { prepareStream, playStream, Utils } from "@dank074/discord-video-stream";
import { getLogger } from '../../utils/logger';
import { config } from '../../utils/config';
import ffmpeg from 'fluent-ffmpeg';
import type { ChannelEntry } from '../../interfaces/iptv';

const logger = getLogger();
const streamer = new Streamer(new Client());
let abortController = new AbortController();
let currentChannelEntry: ChannelEntry | null = null;
let streamSpectatorMonitor: ReturnType<typeof setInterval> | null = null;
let streamAloneTime: number = 0;

export async function initializeStreamer() {
    try {
        await loginStreamer();
    } catch (error) {
        logger.error(`Error logging in streamer client: ${error}`);
    }
}

export async function relogUser() {
    try {
        await logoutStreamer();
        await loginStreamer();
    }
    catch (error) {
        logger.error(`Error relogging user: ${error}`);
    }
}

export async function logoutStreamer() {
    if (!streamer.client.isReady()) {
        logger.debug('Streamer client is not logged in');
        return;
    }
    await (streamer.client as Client).logout();
    logger.info('Streamer client logged out successfully');
}

export async function loginStreamer() {
    if (streamer.client.isReady()) {
        logger.debug('Streamer client is already logged in');
        return;
    }
    await (streamer.client as Client).login(config.DISCORD_USER_TOKEN);
    logger.info('Streamer client logged in successfully');
}


export async function joinVoiceChannel(guildId: string, channelId: string) {
    if (!streamer.client.isReady()) {
        logger.error('Streamer client is not logged in.');
        return;
    }

    const connection = streamer.voiceConnection;
    if (connection && connection.channelId === channelId) {
        logger.debug(`Already connected to voice channel: ${channelId} in guild: ${guildId}`);
        return;
    }
    try {
        let response = await streamer.joinVoice(guildId, channelId);
        if (response.ready) {
            logger.info(`Connected to voice channel: ${channelId} in guild: ${guildId}`);
        } else {
            logger.error(`Failed to connect to voice channel: ${channelId} in guild: ${guildId}`);
        }
    } catch (error) {
        logger.error(`Error joining voice channel: ${error}`);
    }
}

export async function leaveVoiceChannel() {
    if (!streamer.client.isReady()) {
        logger.error('Streamer client is not logged in');
        return;
    }
    try {
        await stopStreaming();
        streamer.leaveVoice();
        logger.info('Stopped video stream and disconnected from the voice channel');
    } catch (error) {
        logger.error(`Error leaving voice channel: ${error}`);
    }
}

function startSpectatorMonitoring(): () => void {
    // Reset the alone time counter
    streamAloneTime = 0;

    // Clear any existing monitor
    if (streamSpectatorMonitor) {
        clearInterval(streamSpectatorMonitor);
        streamSpectatorMonitor = null;
    }

    // Start a new monitor
    streamSpectatorMonitor = setInterval(() => {
        const channelId = streamer.voiceConnection?.channelId;
        if (!channelId) return;

        const channel = streamer.client.channels.cache.get(channelId);
        if (!channel || !channel.isVoice()) return;

        const members = channel.members.filter(member => !member.user.bot).size;

        // Check if only the bot is in the channel
        if (members === 1) {
            streamAloneTime += 10;
            logger.debug(`No spectators for ${streamAloneTime} seconds`);

            if (streamAloneTime >= config.DEFAULT_STREAM_TIMEOUT * 60) {
                logger.info(`No spectators for ${config.DEFAULT_STREAM_TIMEOUT} ${config.DEFAULT_STREAM_TIMEOUT > 1 ? 'minutes' : 'minute'}. Stopping stream.`);
                stopStreaming();
                leaveVoiceChannel();
            }
        } else {
            streamAloneTime = 0;
        }
    }, 10000); // Check every 10 seconds

    return () => {
        if (streamSpectatorMonitor) {
            logger.debug('Cleaning up spectator monitor');
            clearInterval(streamSpectatorMonitor);
            streamSpectatorMonitor = null;
        }
        streamAloneTime = 0;
    };
}

export async function startStreaming(channelEntry: ChannelEntry) {
    if (!streamer.client.isReady()) {
        logger.error('Streamer client is not logged in');
        return;
    }

    try {
        const { command, output } = prepareStream(channelEntry.url, {
            noTranscoding: false,
            minimizeLatency: true,
            bitrateVideo: 5000,
            bitrateVideoMax: 7500,
            videoCodec: Utils.normalizeVideoCodec("H264"),
            h26xPreset: "veryfast",
        }, abortController.signal);

        currentChannelEntry = channelEntry;

        command.on("error", async (err: any, _stdout: any, _stderr: any) => {
            if (!err.toString().includes('ffmpeg exited with code 255')) {
                logger.error(`FFmpeg ${err}`);
            }
        });

        logger.info(`Streaming channel: ${channelEntry.tvg_name}.`);

        // Start monitoring spectators and get the cleanup function
        const cleanupMonitoring = startSpectatorMonitoring();

        try {
            await playStream(output, streamer, {
                type: "go-live",
            }, abortController.signal);
        } catch (error) {
            // Clean up monitoring if stream fails
            cleanupMonitoring();
            throw error;
        }
    } catch (error) {
        logger.error(`Error starting stream: ${error}`);
        await stopStreaming();
    }
}

export async function stopStreaming() {
    if (!streamer.client.isReady()) {
        logger.error('Streamer client is not logged in');
        return;
    }

    try {
        abortController.abort();
        await new Promise(resolve => setTimeout(resolve, 1000));
        abortController = new AbortController();

        if (!currentChannelEntry) {
            logger.debug('No channel currently playing');
            return;
        }

        logger.info(`Stopped video stream from ${currentChannelEntry?.tvg_name || 'unknown channel'}`);
        currentChannelEntry = null;

        // Clear the spectator monitor
        if (streamSpectatorMonitor) {
            logger.debug('Clearing spectator monitor');
            clearInterval(streamSpectatorMonitor);
            streamSpectatorMonitor = null;
        }
        streamAloneTime = 0;
    } catch (error) {
        logger.error(`Error stopping stream: ${error}`);
    }
}
