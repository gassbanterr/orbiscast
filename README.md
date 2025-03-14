# OrbisCast

**OrbisCast** is a Discord bot that streams IPTV channels. It can be controlled by users with discord commands specified at the end of this document.

This tool was made to simplify watch parties with friends, as it allows you to stream IPTV channels directly to Discord. It is also useful for testing IPTV channels without the need for a dedicated IPTV player.

This tool is still in development, so expect bugs and missing features. If you find any issues, please report them in the [Issues](https://github.com/zbejas/orbiscast/issues) section.

_I am not responsible for any misuse of this tool. Use at your own risk._

## Installation

### Before you start

You will need to set a few things up before you can run the bot:


- **Note**: Do not share any of the tokens mentioned below with anyone. If you do, regenerate them immediately.
- Create a bot on the [Discord Developer Portal](https://discord.com/developers/applications) and get the bot token.
  - You can follow the instructions [here](https://discordpy.readthedocs.io/en/stable/discord.html) to create a bot and get the token.
- Get the user token from the Discord web client.
  - The user token is required to join the voice channel and stream video. It is recommended to use a secondary account for this purpose.
  - You can get the token by checking this [gist](https://gist.github.com/MarvNC/e601f3603df22f36ebd3102c501116c6#file-get-discord-token-from-browser-md) I found, or by using a tool like [Discord Get User Token](https://chromewebstore.google.com/detail/discord-get-user-token/accgjfooejbpdchkfpngkjjdekkcbnfd). 
  - **Note**: Be careful when using any third-party tools to get your user token, as they may be malicious. I recommend using the method in the gist.
- Get the bot and the user on your desired server.
  - The user has to manually join the server.
  - The bot can be added following the portal instructions linked above.
- Create a `.env` file in the project directory and fill in the required environment variables (see below). You can use the provided `.env.example` file as a template.

_Note that in my testing, I've been using [Threadfin](https://github.com/Threadfin/Threadfin) as my IPTV provider. I'm not sure if it works with other providers, but it theoretically should. Also, this tool was not built or tested with a large number of channels in mind, so it may not work as expected if you overload it data._

### Docker

In the repo is a provided `compose.yml` file that can be used to run the bot in a Docker container. The bot can be run using the following command:

```bash
docker compose up
```

or

```bash
docker compose up -d
```

All of the app data is stored in `/app/data`. The cache is stored in `/app/cache` or RAM, depending on the `RAM_CACHE` and `CACHE_DIR` environment variables.

You can check the available tags on the [Docker Hub page](https://hub.docker.com/r/zbejas/orbiscast/tags).

### Manual

_The following instructions are for running the bot manually. If you are using Docker, you can skip this section. [Bun](https://bun.sh/) is required. You can install it following the instructions on the website._

The project can also be run manually. To do so, first download the project and install the dependencies:

```bash
git clone https://github.com/zbejas/orbiscast
cd orbiscast
bun install
```

Start the bot using:

```bash
bun run start
```

## Environment Variables

The application uses the following environment variables, which should be defined in a `.env` file (see `.env.example`):

### IPTV Data

| Variable           | Description                                      | Example/Default                          | Required |
|--------------------|--------------------------------------------------|------------------------------------------|----------|
| `PLAYLIST`         | URL to the M3U playlist.                         | `http://example.com/m3u/playlist.m3u`    | ✔        |
| `XMLTV`            | URL to the XMLTV guide.                          | `http://example.com/xmltv/guide.xml`     | ✔        |
| `REFRESH_IPTV`     | Interval in minutes to refresh the IPTV data.    | `1440`                                   | ✘        |
| `DEFAULT_STREAM_TIME` | Default stream time in minutes.               | `120`                                    | ✘        |
| `RAM_CACHE`        | Whether to use RAM for caching.                  | `false`                                  | ✘        |
| `CACHE_DIR`        | Directory for cache storage.                     | `../cache`                                  | ✘        |

### Discord Bot Data

The reason we have a `bot` and a `user` token is because the bot token is used to connect to the Discord API, while the user token is used to join the voice channel and stream video.

| Variable           | Description                                      | Example/Default                          | Required |
|--------------------|--------------------------------------------------|------------------------------------------|----------|
| `BOT_TOKEN`        | Token for the Discord bot.                       | `YOUR_BOT_TOKEN_HERE`                    | ✔        |
| `DISCORD_USER_TOKEN` | Token for the Discord user.                    | `YOUR_USER_TOKEN_HERE`                   | ✔        |
| `GUILD`            | Discord guild (server) ID.                       | `000000000000000000`                     | ✔        |
| `DEFAULT_TEXT_CHANNEL` | Default Discord text channel ID.             | `000000000000000000`              | ✔        |

### Debug Mode

| Variable           | Description                                      | Example/Default                          | Required |
|--------------------|--------------------------------------------------|------------------------------------------|----------|
| `DEBUG`            | Enable debug mode.                               | `false`                                  | ✘        |

## Commands

The bot can be controlled using the following commands in the text channel:

- `/stream <channel_name> <length>`: Start streaming the specified channel. Length is in minutes.
- `/stop`: Stop the current stream.
- `/join`: Join a voice channel.
- `/leave`: Leave the voice channel.

_The available channels will be shown when tab-completing the channel name, but only up to 25 channels will be shown at a time. If you have more than 25 channels, you will have to type the channel name manually. The channel name is case-insensitive. This is a limitation of the Discord API._
