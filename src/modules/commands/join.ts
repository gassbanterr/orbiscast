import { CommandInteraction, GuildMember } from 'discord.js';
import { getLogger } from '../../utils/logger';
import { config } from '../../utils/config';
import { joinVoiceChannel, stopStreaming } from '../../utils/discord_stream';

const logger = getLogger();

export async function handleJoinCommand(interaction: CommandInteraction) {
    if (interaction.member instanceof GuildMember && interaction.member.voice.channel) {
        const channel = interaction.member.voice.channel;
        try {
            await stopStreaming();
            await joinVoiceChannel(config.GUILD, channel.id);
            await interaction.reply(`Joined ${channel.name}`);
        } catch (error) {
            logger.error(`Error joining voice channel: ${error}`);
            await interaction.reply(`Error joining voice channel: ${error}`);
        }
    } else {
        logger.info('User not connected to a voice channel');
        await interaction.reply('You are not connected to a voice channel');
    }
}
