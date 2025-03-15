import { Client } from "discord.js-selfbot-v13";
import { Streamer } from '@dank074/discord-video-stream';
import { prepareStream, playStream, Utils } from "@dank074/discord-video-stream";
import { getLogger } from './logger';
import { config } from './config';
import ffmpeg from 'fluent-ffmpeg';
import type { ChannelEntry } from '../interfaces/iptv';

const logger = getLogger();
const streamer = new Streamer(new Client());
let abortController = new AbortController();
let ffmpegCommand: ffmpeg.FfmpegCommand | null = null;
let currentChannelEntry: ChannelEntry | null = null;
let streamTimeout: ReturnType<typeof setTimeout> | null = null;

export async function initializeStreamer() {
    if (streamer.client.isReady()) {
        logger.debug('Streamer client is already logged in');
        return;
    }
    try {
        await (streamer.client as Client).login(config.DISCORD_USER_TOKEN);
        logger.info('Streamer client logged in successfully');
    } catch (error) {
        logger.error(`Error logging in streamer client: ${error}`);
    }
}

export async function joinVoiceChannel(guildId: string, channelId: string) {
    if (!streamer.client.isReady()) {
        logger.error('Streamer client is not logged in');
        return;
    }
    const connection = streamer.voiceConnection;
    if (connection && connection.channelId === channelId) {
        logger.debug(`Already connected to voice channel: ${channelId} in guild: ${guildId}`);
        return;
    }
    try {
        await streamer.joinVoice(guildId, channelId);
        logger.info(`Joined voice channel: ${channelId} in guild: ${guildId}`);
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

export async function startStreaming(channelEntry: ChannelEntry, duration: number) {
    if (!streamer.client.isReady()) {
        logger.error('Streamer client is not logged in');
        return;
    }

    if (isNaN(duration) || duration <= 0) {
        logger.error('Invalid duration specified for streaming');
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

        ffmpegCommand = command;
        currentChannelEntry = channelEntry;

        command.on("error", async (err: any, _stdout: any, _stderr: any) => {
            logger.error(`FFmpeg error: ${err}`);
        });

        // Log the playing channel
        logger.info(`Streaming channel: ${channelEntry.tvg_name} for ${duration} minutes`);

        // Clear any existing timeout
        if (streamTimeout) {
            logger.debug('Clearing existing timeout');
            clearTimeout(streamTimeout);
            streamTimeout = null;
        }

        // Set a timer to disconnect the streamer after the specified duration
        streamTimeout = setTimeout(async (): Promise<void> => {
            await stopStreaming();
            await leaveVoiceChannel();
            logger.info(`Disconnected from the voice channel after ${duration} minutes`);
        }, duration * 60 * 1000); // Convert minutes to milliseconds

        await playStream(output, streamer, {
            type: "go-live",
        }, abortController.signal);
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
        logger.info(`Stopped video stream from ${currentChannelEntry?.tvg_name || 'unknown channel'}`);
        currentChannelEntry = null;
        abortController = new AbortController();

        // Clear the timeout when stopping the stream
        if (streamTimeout) {
            clearTimeout(streamTimeout);
            streamTimeout = null;
        }
    } catch (error) {
        logger.error(`Error stopping stream: ${error}`);
    }
}