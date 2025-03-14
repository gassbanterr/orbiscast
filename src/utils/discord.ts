import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, CommandInteractionOptionResolver, GuildMember, TextChannel, NewsChannel } from 'discord.js';
import { getLogger } from './logger';
import { config } from './config';
import { getChannelEntries } from './database';
import { getVoiceConnection, joinVoiceChannel as joinVoiceChannelDiscord } from '@discordjs/voice';
import { initializeStreamer, joinVoiceChannel, startStreaming, leaveVoiceChannel, stopStreaming } from './discord_stream';

const logger = getLogger();
export const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
});

client.once('ready', async () => {
    logger.info(`OrbisCast connected as ${client.user?.tag}`);

    // Log the GUILD ID being used
    logger.info(`Attempting to connect to GUILD ID: ${config.GUILD}`);

    const guild = client.guilds.cache.get(config.GUILD);
    if (!guild) {
        logger.error(`Guild ${config.GUILD} not found`);

        // Log the list of guilds the bot is connected to
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

        // Log the list of channels in the guild
        logger.debug('Channels in the guild:');
        guild.channels.cache.forEach(channel => {
            logger.debug(`- ${channel.name} (${channel.id})`);
        });

        return;
    }

    logger.info(`Connected to text channel: ${textChannel.name}`);
    if (config.DEBUG) {
        logger.debug(`Sending debug message to text channel ${textChannel.name} (${config.DEFAULT_TEXT_CHANNEL})`);
        await sendMessage(textChannel.id, `**${client.user?.username} is now connected.** *You can disable this message by setting DEBUG to false.*`);
    }

    if (config.DEBUG) {
        const rest = new REST({ version: '10' }).setToken(config.BOT_TOKEN);
        const commands = [
            new SlashCommandBuilder().setName('stream').setDescription('Stream an IPTV channel')
                .addStringOption(option => option.setName('channel_name').setDescription('The IPTV channel to stream').setAutocomplete(true))
                .addIntegerOption(option => option.setName('length').setDescription('The length of time to stream the channel (in minutes)')),
            new SlashCommandBuilder().setName('stop').setDescription('Stop streaming the IPTV channel'),
            new SlashCommandBuilder().setName('join').setDescription('Join a voice channel'),
            new SlashCommandBuilder().setName('leave').setDescription('Leave the voice channel'),
        ].map(command => command.toJSON());

        try {
            await rest.put(Routes.applicationGuildCommands(client.user!.id, guild.id), { body: commands });
            logger.info('Successfully registered application commands.');
        } catch (error) {
            logger.error(`Error registering application commands: ${error}`);
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'stream') {
        const channelName = (interaction.options as CommandInteractionOptionResolver).getString('channel_name');
        const length = (interaction.options as CommandInteractionOptionResolver).getInteger('length') || config.DEFAULT_STREAM_TIME;
        logger.info(`Command /stream received with channel: ${channelName} and length: ${length}`);

        // Defer the reply immediately to keep the interaction token alive
        await interaction.deferReply();

        const channelEntries = await getChannelEntries();
        const channelEntry = channelEntries.find(entry => entry.tvg_name === channelName);
        if (channelEntry) {
            const url = channelEntry.url;
            try {
                await initializeStreamer();
                logger.info('Stopping any existing stream...');
                await stopStreaming(); // Stop any existing stream
                await new Promise(resolve => setTimeout(resolve, 750));

                const member = interaction.member as GuildMember;
                const voiceChannel = member.voice.channel;
                if (!voiceChannel) {
                    await interaction.editReply('You need to be in a voice channel to use this command.');
                    return;
                }

                const connection = getVoiceConnection(config.GUILD);
                if (connection && connection.joinConfig.channelId === voiceChannel.id) {
                    logger.debug('Already connected to the desired voice channel');
                } else {
                    logger.info('Joining voice channel...');
                    await joinVoiceChannel(config.GUILD, voiceChannel.id);
                    await new Promise(resolve => setTimeout(resolve, 750));
                }

                // Update the deferred reply
                await interaction.editReply(`Streaming ${channelName} for ${length} minutes. Starting stream...`);

                logger.info(`Starting stream ${channelName} for ${length} minutes`);
                try {
                    await startStreaming(url, length);
                    await interaction.editReply(`Started streaming ${channelName} for ${length} minutes`);
                } catch (streamError) {
                    logger.error(`Stream error: ${streamError}`);
                    if (streamError instanceof Error) {
                        await interaction.editReply(`Error during streaming: ${streamError.message}`);
                    } else {
                        await interaction.editReply('An unknown error occurred during streaming.');
                    }
                }
            } catch (error) {
                logger.error(`Error starting stream: ${error}`);
                try {
                    await interaction.editReply(`Error starting stream: ${error}`);
                } catch (editError) {
                    if (editError instanceof Error && (editError as any).code === 10008) {
                        logger.error('Failed to edit reply: Unknown Message');
                    } else {
                        logger.error(`Failed to edit reply: ${editError}`);
                    }
                }
            }
        } else {
            logger.error(`Channel ${channelName} not found in the database`);
            await interaction.editReply(`Channel ${channelName} not found`);
        }
    } else if (commandName === 'stop') {
        logger.info('Command /stop received');
        try {
            await stopStreaming();
            await interaction.reply('Stopped the stream');
        } catch (error) {
            logger.error(`Error stopping stream: ${error}`);
            await interaction.reply(`Error stopping stream: ${error}`);
        }
    } else if (commandName === 'join') {
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
    } else if (commandName === 'leave') {
        try {
            await stopStreaming();
            await leaveVoiceChannel();
            await interaction.reply('Left the voice channel');
        } catch (error) {
            logger.error(`Error leaving voice channel: ${error}`);
            await interaction.reply(`Error leaving voice channel: ${error}`);
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isAutocomplete()) return;

    const { commandName, options } = interaction;

    if (commandName === 'stream') {
        const current = options.getFocused();
        const channelEntries = await getChannelEntries();
        const choices = channelEntries.map(entry => entry.tvg_name).filter((name): name is string => name !== undefined && name.toLowerCase().includes(current.toLowerCase()));

        // Split choices into chunks of 25 items
        const chunks = [];
        for (let i = 0; i < choices.length; i += 25) {
            chunks.push(choices.slice(i, i + 25));
        }

        // Respond with the first chunk of choices
        if (chunks[0]) {
            await interaction.respond(chunks[0].map(choice => ({ name: choice!, value: choice! })));
        }
    }
});

async function sendMessage(channelName: string, message: string) {
    const channel = client.channels.cache.get(channelName.toString());
    if (channel instanceof TextChannel || channel instanceof NewsChannel) {
        await channel.send(message);
        logger.info(`Sent message to channel ${channelName}`);
        logger.debug(`Message: ${message}`);
    } else {
        logger.error(`Channel ${channelName} not found`);
    }
}

client.login(config.BOT_TOKEN).catch(err => {
    logger.error(`Error logging in: ${err}`);
});
