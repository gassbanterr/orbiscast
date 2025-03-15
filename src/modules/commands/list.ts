import { CommandInteraction } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { getChannelEntries } from '../../modules/database';

const logger = getLogger();

export async function handleListCommand(interaction: CommandInteraction) {
    const pageOption = interaction.options.get('page')?.value;
    const channelEntries = await getChannelEntries();
    const itemsPerPage = 25;

    if (pageOption === 'all') {
        const channelList = channelEntries.map(channel => `- \`${channel.tvg_name || 'Unknown'}\``).join('\n');
        await interaction.reply(`**All Channels:**\n${channelList}`);
        return;
    }

    const page = (pageOption as number) || 1;
    const totalPages = Math.ceil(channelEntries.length / itemsPerPage);

    if (page < 1 || page > totalPages) {
        await interaction.reply(`Invalid page number. Please provide a number between 1 and ${totalPages}, or 'all' to list all channels.`);
        return;
    }

    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const channelsToDisplay = channelEntries.slice(start, end);

    const channelList = channelsToDisplay.map(channel => `- \`${channel.tvg_name || 'Unknown'}\``).join('\n');
    await interaction.reply(`**Channels (Page ${page}/${totalPages}):**\n${channelList}`);
}
