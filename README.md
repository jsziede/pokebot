# Pokébot

A simulation of the Pokémon video games that runs in the Discord environment.

Features include:

* Encountering and catching wild Pokémon

* Leveling up system that works similar to the games

* Teach your Pokémon new moves and evolve them as they level up

* Travel across all the main Pokémon regions

* Buy items and use them on your Pokémon

* Trade your Pokémon with other players

* Anti-spam system to prevent users from running many commands in a short amount of time

## Installation

Note: these instructions are for Linux only. Windows instructions will be provided later.

### Requirements

*Node.js* and *npm* must be installed on your machine in order to run Pokébot. To install Node.js, run

```bash
sudo apt install nodejs npm
```

and to install npm, run

```bash
sudo apt install npm
```

The next step is to navigate to the `src` directory and run the command

```bash
npm install
```

This will install all dependencies needed for Pokébot. [Some dependencies may need to be manually installed.](https://stackoverflow.com/questions/35207380/how-to-install-npm-peer-dependencies-automatically/35207983)

### Database Setup

Database creation file coming soon TM!

To connect the bot to your database, copy the `my_config_example.js` file from the `config` directory and rename it to `config.js` and update the username, password, and token with your own credentials.

### Running the Bot

Running the bot is easy. Simply navigate to the `src` directory and run the command

```bash
node index.js
```

If everything goes correctly, you should see the message "Connected to Discord." in your console.

### Testing

To run tests, navigate to the root directory and run
```bash
./node_modules/mocha/bin/mocha
```

### Emoji

Similar to Discord Nitro subscribers, bot accounts are able to use any emoji in any guild if the guild has global emoji permissions. I have taken advantage of this by uploading over 800 custom emoji across many private guilds that the bot is a member of. These emoji include the Pokémon Shuffle icons for all 807 Pokémon as well as other custom emoji, and are used to add extra flavor to the bot. Running the bot on your own machine will result in many messages containing "null" where the emoji should be and will likely throw exceptions for using the null emojis as reactions. I plan on adding generic fallback emojis in the future to fix these potential errors.

## Roadmap

Pokébot is still a major work in progress. This project started off as a solution to my boredom one summer day and quickly snowballed into a large program. I am currently in the process of refactoring and restructuring the code to make it more easily understandable and increase its modularity and maintainability. This also includes increased documentation and added testing. The database is also going to receive a minor facelift so the bot can be used in multiple servers.

Major features still in the work:

* Battling

* Six party system

* Egg moves

* Move tutoring

* Reworking capture mechanics to work like they do in the game

* Adding more items

* And more

## Acknowledgements

Along with the dependencies, this project contains some files that were not created by me and will be noted below.

Most files in the `data` directory, with the exception of the regional subdirectories within `data/region` and the files within `data/items`, are from the [oakdex-pokedex](https://github.com/jalyna/oakdex-pokedex) project. All Pokémon models found inside the `gfx/models` and `gfx/models/shiny` directories were retrived from [Pokémon Showdown](https://pokemonshowdown.com/).
