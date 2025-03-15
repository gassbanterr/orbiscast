import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { getLogger } from './logger';
import { config } from './config';
import { getChannelEntries } from './database';
import { handleStreamCommand, handleStopCommand, handleJoinCommand, handleLeaveCommand, handleListCommand } from '../modules/commands';

const logger = getLogger();
export const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
});

client.once('ready', async () => {
    logger.info(`OrbisCast connected as ${client.user?.tag}`);
    logger.info(`Attempting to connect to GUILD ID: ${config.GUILD}`);

    const guild = client.guilds.cache.get(config.GUILD);
    if (!guild) {
        logger.error(`Guild ${config.GUILD} not found`);
        logger.info('Connected to the following guilds:');
        client.guilds.cache.forEach(guild => {
            logger.info(`- ${guild.name} (${guild.id})`);
        });
        return;
    }

    logger.info(`Connected to guild: ${guild.name}`);

    const textChannel = guild.channels.cache.get(config.DEFAULT_TEXT_CHANNEL);
    if (!textChannel?.isTextBased()) {
        logger.error(`Text channel ${config.DEFAULT_TEXT_CHANNEL} not found`);
        logger.debug('Channels in the guild:');
        guild.channels.cache.forEach(channel => {
            logger.debug(`- ${channel.name} (${channel.id})`);
        });
        return;
    }

    logger.info(`Connected to text channel: ${textChannel.name}`);

    const rest = new REST({ version: '10' }).setToken(config.BOT_TOKEN);
    const commands = [
        new SlashCommandBuilder().setName('stream').setDescription('Stream an IPTV channel')
            .addStringOption(option => option.setName('channel_name').setDescription('The IPTV channel to stream').setAutocomplete(true))
            .addIntegerOption(option => option.setName('length').setDescription('The length of time to stream the channel (in minutes)')),
        new SlashCommandBuilder().setName('stop').setDescription('Stop streaming the IPTV channel'),
        new SlashCommandBuilder().setName('join').setDescription('Join a voice channel'),
        new SlashCommandBuilder().setName('leave').setDescription('Leave the voice channel'),
        new SlashCommandBuilder().setName('list').setDescription('List all IPTV channels')
            .addIntegerOption(option => option.setName('page').setDescription('Page number to display')),
    ].map(command => command.toJSON());

    try {
        await rest.put(Routes.applicationGuildCommands(client.user!.id, guild.id), { body: commands });
        logger.info('Successfully registered application commands.');
    } catch (error) {
        logger.error(`Error registering application commands: ${error}`);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        const { commandName } = interaction;
        if (commandName === 'stream') {
            await handleStreamCommand(interaction);
        } else if (commandName === 'stop') {
            await handleStopCommand(interaction);
        } else if (commandName === 'join') {
            await handleJoinCommand(interaction);
        } else if (commandName === 'leave') {
            await handleLeaveCommand(interaction);
        } else if (commandName === 'list') {
            await handleListCommand(interaction);
        }
    } else if (interaction.isAutocomplete()) {
        const { commandName, options } = interaction;

        if (commandName === 'stream') {
            const current = options.getFocused();
            const channelEntries = await getChannelEntries();
            const choices = channelEntries.map(entry => entry.tvg_name).filter((name): name is string => name !== undefined && name.toLowerCase().includes(current.toLowerCase()));

            const chunks = [];
            for (let i = 0; i < choices.length; i += 25) {
                chunks.push(choices.slice(i, i + 25));
            }

            if (chunks[0]) {
                await interaction.respond(chunks[0].map(choice => ({ name: choice!, value: choice! })));
            }
        }
    }
});

client.login(config.BOT_TOKEN).catch(err => {
    logger.error(`Error logging in: ${err}`);
});
