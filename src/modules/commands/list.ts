import { CommandInteraction } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { getChannelEntries } from '../../utils/database';

const logger = getLogger();

export async function handleListCommand(interaction: CommandInteraction) {
    const page = interaction.options.get('page')?.value as number || 1;
    const channelEntries = await getChannelEntries();
    const itemsPerPage = 25;
    const totalPages = Math.ceil(channelEntries.length / itemsPerPage);

    if (page < 1 || page > totalPages) {
        await interaction.reply(`Invalid page number. Please provide a number between 1 and ${totalPages}.`);
        return;
    }

    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const channelsToDisplay = channelEntries.slice(start, end);

    const channelList = channelsToDisplay.map(channel => `- \`${channel.tvg_name || 'Unknown'}\``).join('\n');
    await interaction.reply(`**Channels (Page ${page}/${totalPages}):**\n${channelList}`);
}
