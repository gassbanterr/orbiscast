import { CommandInteraction } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { getChannelEntries, getProgrammeEntries } from '../../modules/database';

const logger = getLogger();

export async function handleProgrammeCommand(interaction: CommandInteraction) {
    await interaction.deferReply(); // Defer reply since fetching programme data might take time

    const channelName = interaction.options.get('channel')?.value as string;
    if (!channelName) {
        await interaction.editReply('Please specify a channel name.');
        return;
    }

    logger.info(`Fetching programme for channel: ${channelName}`);

    try {
        // Get channel ID from channel name
        const channels = await getChannelEntries();
        const channel = channels.find(ch => ch.tvg_name?.toLowerCase() === channelName.toLowerCase());

        if (!channel || !channel.tvg_id) {
            await interaction.editReply(`Channel not found: ${channelName}`);
            return;
        }

        // Get programmes for this channel
        const allProgrammes = await getProgrammeEntries();
        const channelProgrammes = allProgrammes.filter(p => p.channel === channel.tvg_id);

        // Sort by start time and filter to show only current and future programmes
        const now = Math.floor(Date.now() / 1000);
        const futureProgrammes = channelProgrammes
            .filter(p => typeof p.stop_timestamp === 'number' && p.stop_timestamp >= now)
            .sort((a, b) => (a.start_timestamp ?? 0) - (b.start_timestamp ?? 0))
            .slice(0, 10); // Get the next 10 upcoming shows

        if (futureProgrammes.length === 0) {
            await interaction.editReply(`No upcoming programmes found for channel: ${channelName}`);
            return;
        }

        // Format the programme information
        const formattedProgrammes = futureProgrammes.map(programme => {
            const startDate = programme.start ? new Date(programme.start) : new Date(programme.start_timestamp ? programme.start_timestamp * 1000 : Date.now());
            const stopDate = programme.stop ? new Date(programme.stop) : new Date(programme.stop_timestamp ? programme.stop_timestamp * 1000 : Date.now());
            const isLive = (programme.start_timestamp ?? 0) <= now && (programme.stop_timestamp ?? Infinity) >= now;

            const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const stopTime = stopDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const date = startDate.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

            const description = typeof programme.description === 'string' ? programme.description : '';
            return `${isLive ? '🔴 LIVE: ' : ''}**${programme.title}** (${date}, ${startTime}-${stopTime})${description ? `\n${description.substring(0, 100)}${description.length > 100 ? '...' : ''}` : ''}`;
        }).join('\n\n');

        await interaction.editReply(`**Programme for ${channelName}:**\n\n${formattedProgrammes}`);

    } catch (error) {
        logger.error(`Error fetching programme: ${error}`);
        await interaction.editReply('An error occurred while fetching the programme information.');
    }
}
