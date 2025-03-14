/**
 *  Pokébot - A simulation of the Pokémon video games that runs in the Discord environment.
 *  Copyright (C) 2019 Joshua Sziede
*/

/**
 *  @todo Add table for users who are currently inputting responses. This way if a user tries to do a command while Pokebot is awaiting input, Pokebot won't give two warning messages to the user.
 *  @todo All message sends need to be awaited, otherwise weirdness may happen.
 *  @todo Change message sending functions to return the sent message object rather than a boolean.
 *  @todo Standardize the file names for json and images.
 *  @todo Add evolution table to database that keeps track of trainer, pokemon, name evolving into, and guild where evolution was triggered.
*/

/**
 *  Packages
*/
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const moment = require('moment');
const momentTz = require('moment-timezone');
const schedule = require('node-schedule');
const mysql = require('mysql');
const oak = require('oakdex-pokedex');
const chalk = require('chalk');
//const Sim = require('./Pokemon-Showdown/sim');

/**
 *  Connect to Discord.
*/
const client = new Client({ intents: [GatewayIntentBits.Guilds] });


/**
 *  MySQL DB Connection
*/
const myconfig = require('./config/my_config');

const con = mysql.createConnection(myconfig.database);
con.connect(function(err) {
    if (err) {
        console.log(err);
        process.exit();
    }
    console.log("Connected to MySQL Database.");
});

client.once(Events.ClientReady, readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// Log in to Discord with your client's token
client.login(myconfig.token);

//load command files
client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

client.on(Events.InteractionCreate, async interaction => {
	if (interaction.isChatInputCommand()) {
		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			} else {
				await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			}
		}
	} else if (interaction.isAutocomplete()) {
		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.autocomplete(interaction);

		} catch (error) {
			console.error(error);
		}
	}
});