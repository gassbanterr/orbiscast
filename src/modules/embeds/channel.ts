import { BaseEmbedProcessor } from './base';
import type { EmbedOptions, EmbedResult } from './types';

export interface Channel {
    id?: string;
    tvg_id?: string;
    tvg_name?: string;
    tvg_logo?: string;
    group_title?: string;
    url?: string;
}

export class ChannelEmbedProcessor extends BaseEmbedProcessor<Channel> {
    protected validateData(data: unknown): data is Channel {
        const channel = data as Channel;
        return typeof channel === 'object' && channel !== null &&
            (typeof channel.tvg_id === 'string' || typeof channel.id === 'string') &&
            (typeof channel.tvg_name === 'string' || typeof channel.id === 'string');
    }

    protected generateEmbed(channel: Channel, options: EmbedOptions): EmbedResult {
        const { maxWidth = 640, maxHeight = 360, theme = 'light', autoplay = false } = options;

        const channelId = channel.tvg_id || channel.id;
        if (!channelId) {
            throw new Error('Channel has no valid ID');
        }

        const queryParams = new URLSearchParams();
        queryParams.append('id', channelId);
        if (channel.tvg_name) queryParams.append('name', channel.tvg_name);
        if (channel.tvg_logo) queryParams.append('logo', channel.tvg_logo);
        if (channel.group_title) queryParams.append('group', channel.group_title);
        queryParams.append('theme', theme);
        queryParams.append('autoplay', autoplay ? '1' : '0');

        // In a real implementation, this would be a proper URL to your embed service
        const embedUrl = new URL(`https://your-embed-domain.com/channels/${channelId}`);
        embedUrl.search = queryParams.toString();

        const html = this.getIframeHtml(embedUrl.toString(), maxWidth, maxHeight);

        return {
            html,
            width: maxWidth,
            height: maxHeight
        };
    }

    // Helper method to generate a basic Discord embed from channel data
    public generateChannelInfoEmbed(channel: Channel): any {
        return {
            name: channel.tvg_name || 'Unknown Channel',
            logo: channel.tvg_logo,
            group: channel.group_title
        };
    }
}
