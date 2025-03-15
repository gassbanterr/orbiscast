import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { getChannelEntries } from '../../modules/database';

const logger = getLogger();

export async function handleChannelsCommand(interaction: CommandInteraction) {
    await interaction.deferReply();

    logger.info('Fetching available channels');

    try {
        const channels = await getChannelEntries();

        if (channels.length === 0) {
            await interaction.editReply('No channels are currently available.');
            return;
        }

        // Group channels by category if available
        const channelsByCategory: Record<string, typeof channels> = {};

        channels.forEach(channel => {
            const category = channel.group_title || 'Uncategorized';

            if (!channelsByCategory[category]) {
                channelsByCategory[category] = [];
            }

            channelsByCategory[category].push(channel);
        });

        // Create main embed
        const mainEmbed = new EmbedBuilder()
            .setTitle('📺 Available Channels')
            .setColor('#0099ff')
            .setDescription(`Total channels: ${channels.length}`)
            .setTimestamp();

        // Create category embeds (limited to Discord's max of 10 embeds per message)
        const embeds = [mainEmbed];
        let embedCount = 1;

        // Sort categories alphabetically
        const sortedCategories = Object.keys(channelsByCategory).sort();

        for (const category of sortedCategories) {
            // Skip if we've reached Discord's embed limit
            if (embedCount >= 10) {
                break;
            }

            const channelsInCategory = channelsByCategory[category] || [];

            // Sort channels by name
            channelsInCategory.sort((a, b) => {
                return (a.tvg_name || '').localeCompare(b.tvg_name || '');
            });

            const categoryEmbed = new EmbedBuilder()
                .setTitle(`${category} (${channelsInCategory.length} channels)`)
                .setColor('#00AAFF');

            // Add channels to the embed, up to 25 fields per embed (Discord limit)
            const channelList = channelsInCategory.slice(0, 25).map(channel => {
                return {
                    name: channel.tvg_name || 'Unnamed Channel',
                    value: `ID: ${channel.tvg_id || 'N/A'}${channel.country ? ` | Language: ${channel.country}` : ''}`,
                    inline: true
                };
            });

            categoryEmbed.addFields(channelList);
            embeds.push(categoryEmbed);
            embedCount++;
        }

        await interaction.editReply({ embeds });
    } catch (error) {
        logger.error(`Error fetching channels: ${error}`);
        await interaction.editReply('An error occurred while fetching the available channels.');
    }
}
