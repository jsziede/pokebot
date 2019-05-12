/**
 *  Pokébot - A simulation of the Pokémon video games that runs in the Discord environment.
 *  Copyright (C) 2019 Joshua Sziede
*/

/**
 *  @todo Check TM learning for pokemon who have different movesets based on form but still have the same TM learnset.
 *  @todo In the games, when a Pokemon is in the Day Care, its moves are replaced one by one in order of the move slot. Pokebot currently does an experimental optimal move replacement calculation instead. Will need to run tests to see how optimal this algorithm is, otherwise it should fall back to the day care method.
 *  @todo Add table for users who are currently inputting responses. This way if a user tries to do a command while Pokebot is awaiting input, Pokebot won't give two warning messages to the user.
 *  @todo All message sends need to be awaited, otherwise weirdness may happen.
*/

/**
 *  Packages
*/
const Discord = require('discord.js');
const fs = require('fs');
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
const client = new Discord.Client({autoReconnect:true});

/**
 *  MySQL DB Connection
*/
const myconfig = require('../config/my_config');
const con = mysql.createConnection(myconfig.database);
con.connect(function(err) {
    if (err) {
        console.log(err);
        process.exit();
    }
    console.log("Connected to MySQL Database.");
});

/**
 *  Custom Emoji Used Globally
*/
var duck;
var tail;
var pew;
var kukui;
var dollar;
var birb;

/**
 *  Debug Tools
*/
const enableSpam = true;        //default = false
const spamXpMult = 2;           //default = 1
const spamEncounterMult = 1;    //default = 1
const baseMoneyChance = 20;     //default = 20

/**
 *  Global Variables
 *  @todo These might be better as database tables. 
*/
var evolving = [];      // Stores all the users who have an evolving pokemon as well as the Pokemon that is evolving
var trading = [];       // Stores all the users who are in the process of trading a Pokemon
var transactions = [];  // Stores all users currently using a command
var raining = [];       // Stores locations in which rain is happening
var hailing = [];       // Stores locations in which hail is happening
var snowing = [];       // Stores locations in which snow is happening
var sandstorm = [];     // Stores locations in which a sandstorm is happening

var cooldown = new Date();
cooldown = cooldown.getTime();

/**
 *  Standard Pokemon object for Pokemon that have been caught.
 *  @todo this should maybe be a class.
 *  name:Official name of the Pokemon.
 *  nick: Nickname of the Pokemon provided by its trainer.
 *  no: National Pokedex number.
 *  caughtIn: Type of ball the Pokemon was caught in.
 *  type: The type (Grass, Fire, Water, etc.).
 *  item: The item the Pokemon is holding.
 *  level: Current level of the Pokemon.
 *  totalxp: Total amount of xp earned by the Pokemon.
 *  moves: A list of moves known by the Pokemon.
 *  ability: The ability of the Pokemon.
 *  abilitySlot: The ability slot in case the Pokemon can have multiple abilities.
 *  nature: The nature of the Pokemon.
 *  stats: A list of the Pokemon's current stats in order of hp, attack, defense, s. attack, s. defense, speed.
 *  IVs: A list of the Pokemon's current IVs in order of hp, attack, defense, s. attack, s. defense, speed.
 *  EVs: A list of the Pokemon's current EVs in order of hp, attack, defense, s. attack, s. defense, speed.
 *  gender: The gender of the Pokemon.
 *  ot: The name of the original trainer.
 *  otid: The id of the original trainer.
 *  date: The date the Pokemon was caught.
 *  region: The region the Pokemon was caught at.
 *  location: The location within the region the Pokemon was caught at.
 *  caughtAtLevel: The level the Pokemon was at when it was caught.
 *  shiny: If the Pokemon is shiny.
 *  lead: If the Pokemon is the trainer's lead Pokemon. Will be deprecated eventually when the party system is implemented.
 *  form: The current form the Pokemon is in.
 *  friendship: The amount of friendship the Pokemon has.
 *  evolving: If the Pokemon is evolving.
 *  status: The status condition of the Pokemon.
 *  pv: The personality value of the Pokemon.
*/
function Pokemon(name, nick, no, form, type, item, level, totalxp, moves, ability, abilitySlot, nature, stats, iv, ev, gender, region, location, caughtAtLevel, shiny) {
    this.name = name;
    this.nick = nick;
    this.no = no;
    this.caughtIn = "Poké Ball";
    this.type = type;
    this.item = item;
    this.level = level;
    this.totalxp = totalxp;
    this.moves = moves;
    this.ability = ability;
    this.abilitySlot = abilitySlot;
    this.nature = nature;
    this.stats = stats;
    this.IVs = iv;
    this.EVs = ev;
    this.gender = gender;
    this.ot = "None";
    this.otid = 0;
    this.date = moment().format();
    this.region = region;
    this.location = location;
    this.caughtAtLevel = caughtAtLevel;
    this.shiny = shiny;
    this.lead = 0;
    this.form = form;
    this.friendship = 50;
    this.evolving = 0;
    this.status = "None";
    this.pv = Math.floor(Math.random() * 4294967296);
}

/**
 *  Standard item object.
 *  @todo perhaps this should be a class.
 *  name: Name of the item.
 *  quantity: The amount of the item the trainer has.
 *  holdable: If a Pokemon can hold the item.
 *  isKey: If the item is a key item.
*/
function Item(name, quantity, holdable, isKey) {
    this.name = name;
    this.quantity = quantity;
    this.holdable = holdable;
    this.isKey = isKey;
}

/**
 *  Standard Pokemon object for Pokemon that have not been caught.
 *  @todo Perhaps this should be a child class of Pokemon().
 *  name: The name of the Pokemon.
 *  level: The current level the Pokemon.
 *  rarity: How rare the Pokemon appears in the current location.
 *  method: The method required to encounter the Pokemon (grass, surf, headbutt, etc.).
*/
function WildPokemon(name, level, rarity, method) {
    this.name = name;
    this.level = level;
    this.rarity = rarity;
    this.method = method;
}

/**
 *  Transactions lock the user out of using most other commands.
 *  userID: Id of the user who ran the command.
 *  type: The type of command being run.
*/
function Transaction(userID, type) {
    this.userID = userID;
    this.type = type;
}

/**
 *  Standard evolution object.
 *  @todo This needs to be reworked so Pokemon id is passed as well so a Trainer can have multiple Pokemon evolving.
 *  userID: Id of the user who owns the evolving Pokemon.
 *  from: The name of the Pokemon that is evolving.
 *  to: The name the Pokemon is evolving into to differentiate branched evolutions.
 *  time: What time the Pokemon started to evolve.
*/
function Evolution(userID, from, to) {
    this.userID = userID;
    this.from = from;
    this.to = to;
    this.time = new Date();
    this.time = this.time.getTime();
}

/**
 *  Standard trade object.
 *  userAsk: The Trainer who initiated the trade.
 *  userRespond: The Trainer who was asked to trade.
 *  askPokemon: The Pokemon that the initiator wants to send.
 *  respondPokemon: The Pokemon the initiator wants to receive.
*/
function Trade(userAsk, userRespond, askPokemon, respondPokemon) {
    this.userAsk = userAsk;
    this.userRespond = userRespond;
    this.askPokemon = askPokemon;
    this.respondPokemon = respondPokemon;
}

/**
 *  Start up procedures.
*/
client.login(myconfig.token);
client.on('ready', () => {
    /**
     *  Shows text under Pokebot's username in the members list.
    */
    client.user.setActivity('Pokémon XP: Gale of Flannery');
    
    /**
     *  Load the global emojis.
    */
    duck = client.emojis.find(duck => duck.name === "001");
    tail = client.emojis.find(tail => tail.name === "002");
    pew = client.emojis.find(pew => pew.name === "003");
    kukui = client.emojis.find(kukui => kukui.name === "004");
    blobSweat = client.emojis.find(blobSweat => blobSweat.name === "005");
    lfcparty = client.emojis.find(lfcparty => lfcparty.name === "006");
    dollar = client.emojis.find(dollar => dollar.name === "007");
    birb = client.emojis.find(birb => birb.name === "008");

    /**
     *  Checks the database for any Pokemon that are in the process of evolving and triggers the evolution process for them.
     *  This is necessary in case the bot shuts down while a Pokemon is evolving.
    */
    fixEvolutions();
    
    /**
     *  Sets the weather condition for locations where weather can happen.
    */
    updateWeather();

    console.log("Connected to Discord.")
});

/**
 *  Restart the bot if an error occurs.
 *  @todo This could probably be handled on a per error basis
 *  or at the very least should be more robust.
 *  @todo Log the errors into a file.
*/
process.on('error', error => {
    client.destroy();
    console.error(error);
    setTimeout(function () {
        client.login(myconfig.token);
    }, 10000);
});

/**
 *  Restart the bot if an unhandled rejection occurs.
 *  @todo This could probably be be more robust.
 *  @todo Log the errors into a file.
*/
process.on('unhandledRejection', error => {
    client.destroy();
    console.error(error);
    setTimeout(function () {
        client.login(myconfig.token);
    }, 10000);
});

/**
 *  Restart the bot if an unhandled exception occurs.
 *  @todo: This could probably be be more robust.
 *  @todo Log the errors into a file.
*/
process.on('uncaughtException', error => {
    client.destroy();
    console.error(error);
    setTimeout(function () {
        client.login(myconfig.token);
    }, 10000);
});

/**
 *  Log error messages to the console.
 *  @todo This could probably be more robust.
*/
client.on('error', (e) => {
    console.error(e);
    client.destroy();
    setTimeout(function () {
        client.login(myconfig.token);
    }, 10000);
});
client.on('warn', (e) => console.warn(e));
client.on('debug', (e) => console.info(e));

/**
 *  Update the weather five seconds after every hour.
*/
schedule.scheduleJob({minute: 0, second: 5}, function(){
    updateWeather();
});

/**
 *  Triggers upon joining a server.
 *  Send welcome message to first text channel with send permissions.
*/
client.on("guildCreate", async guild => {
    for (let channel of guild.channels) {
        if (channel[1].type === 'text' && channel[1].permissionsFor(guild.me).has(`SEND_MESSAGES`)) {
            await sendMessage(client.channels.get(channel[0]), (`Hello, thank you for adding me to your guild. My default command prefix is \`!pb\`. To enable commands, go to the channel that you want me to read from and run the \`!pb activate\` command. The command channel can be changed at any time by running the activate command in whichever channel you want, as long as I have message sending permissions in it.`));
            break;
        }
    }
})

/**
 *  Triggers every time any user sends a message.
*/
client.on('message', async (message) => {
    /** Ignore messages from bot accounts. */
    if (message.author.bot) {
        return;
    }

    /** Don't do anything if user is trading a Pokemon.  */
    if (isInTrade(message.author.id) != null) {
        return;
    }

    /** @todo replace this with a function to check if message begins with the guild's prefix once prefix customization has been added. */
    if (message.content.trim() === `!pb activate`) {
        await setBotChannel(message);
        return;
    }
    
    /** Only read commands sent in the bot channel. */
    if (await isBotChannel(message)) {
        /** Splits message into an array of words. */
        let input = message.content.trim().split(/ +/g);
        /** The command is the first word in the message, not including the prefix. */
        const command = input.shift().toLowerCase();
        
        /** Only allow some commands if a user is evolving one of their Pokemon. */
        if (await checkIfUserIsEvolving(message, command)) {
            return;
        }
        
        /** Perform the command action if message contains a command. */
        if (await doCommand(message, input, command)) {
            return;
        }
    }

    let exists = await userExists(message.author.id);
    if (exists && (isInEvolution(message.author.id) === null) && (isInTransaction(message.author.id) === null)) {
        await doNonCommandMessage(message);
    }
});

/**
 * Performs various actions for the user if the user
 * sent a message that wasn't a command, including giving
 * experience to the user's lead Pokemon, possibly
 * having the user encounter a wild Pokemon, and possibly
 * giving money to the user.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors were encountered.
 */
async function doNonCommandMessage(message) {
    if (!enableSpam) {
        //user did not post in the spam channel
        let lastUser = null;
        if (message.author.id === lastUser) {
            return; //dont do anything if sender posted a consecutive message
        }
        
        //bot wont do anything until at least after a second since the last message passed
        let currentTime = new Date();
        currentTime = currentTime.getTime();
        if ((currentTime - cooldown) < 1000) {
            return;
        } else {
            cooldown = currentTime;
        }
    }
    
    let random = Math.ceil(Math.random() * 100);
    
    let user = await getUser(message.author.id);
    if (user === null) {
        return;
    }

    let lead = await getLeadPokemon(message.author.id);
    if (lead === null) {
        console.warn(chalk`yellow {[Warning]} User` + message.author.id + `exists but doesn't have lead Pokemon.`);
        return;
    }
    
    let encounterChance = getEncounterChanceForLocation(lead.ability, lead.item, user.region, user.location, user.field);

    /* User encounters a wild Pokemon. */
    if (random <= encounterChance) {
        let encounter = await generateWildPokemon(message, user, lead);
        if (encounter != null) {
            await encounterWildPokemon(message, encounter, user, lead);
        }
    /* User is given money. */
    } else if (random <= baseMoneyChance) {
        /* Give a random amount of money to the user. */
        let moneyAmnt = Math.ceil(Math.random() * 150);
        moneyAmnt += Math.ceil(Math.random() * 100);
        moneyAmnt += Math.ceil(Math.random() * 50);
        await giveMoney(moneyAmnt, user);
    /* User's lead Pokemon is given XP. */
    } else {
        /* Give a random amount of XP to the user lead Pokemon. */
        let xpAmount = Math.ceil(Math.random() * 5);
        xpAmount += Math.ceil(Math.random() * 10);
        xpAmount += Math.ceil(Math.random() * 20);
        xpAmount = xpAmount * spamXpMult;
        await giveXP(message, xpAmount);
        await giveDayCareXP(message);
    }
}

/**
 * Walks a user through the process of catching a wild Pokemon.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {Pokemon} encounter The wild Pokemon to be encountered.
 * @param {User} user The Pokebot user.
 * @param {Pokemon} lead The user's lead Pokemon.
 */
async function encounterWildPokemon(message, encounter, user, lead) {
    /* Show details about the wild Pokemon. */
    await displayAWildPkmn(encounter, message);

    transactions[transactions.length] = new Transaction(message.author.id, "your encounter with " + encounter.name);
    
    let shuffle_icon = await getShuffleEmoji(encounter.no);
    await message.react(shuffle_icon.id);

    //waits for user to either catch pokemon or run away
    await throwPokeBall(message, encounter, user, lead);

    removeTransaction(message.author.id);
}

/**
 * Gets a Pokemon's Shuffle icon as an emoji. If argument
 * is not a number, then attempts to get an emoji with
 * that name.
 * 
 * @param {string} number The national Pokedex number of the Pokemon.
 * 
 * @returns {Emoji} The Shuffle emoji of the Pokemon.
 */
async function getShuffleEmoji(number) {
    let shuffle_icon;
    let pattern = /^\d+$/;
    if (pattern.test(number)) {
        let dexnum = number.toString();
        while (dexnum.length < 3) {
            dexnum = '0' + dexnum;
        }
        shuffle_icon = await client.emojis.find(shuffle_icon => shuffle_icon.name === dexnum);
    } else {
        shuffle_icon = await client.emojis.find(shuffle_icon => shuffle_icon.name === number);
    }
    return new Promise(function(resolve) {
        resolve(shuffle_icon);
    });
}

/**
 * Adds Pokemon dollars to a user's account.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {number} amount The amount of money.
 * @param {User} user The Pokebot user.
 * 
 * @returns {any[]} The result of the query that adds money to a user.
 */
async function giveMoney(message, amount, user) {
    let queryStatus = await doQuery("UPDATE user SET user.money = user.money + ? WHERE user.user_id = ?", [amount, user.user_id]);
    if (queryStatus != null) {
        await message.react(kukui.id);
        await sendMessage(message.channel, message.author.username + " found " + dollar + moneyAmnt.toString() + "! You now have " + dollar + user.money + ".");
    }
    return new Promise(function(resolve) {
        resolve(queryStatus);
    });
}

/**
 * Determines the percentage of a user encountering a wild Pokemon
 * in their current location based on their lead Pokemon's ability
 * and held item.
 * 
 * @param {string} ability The ability of the lead Pokemon.
 * @param {string} item The item held by the lead.
 * @param {string} region The region the user is currently at.
 * @param {string} location The location the user is currently at.
 * @param {string} field The field the user is using to encounter Pokemon. 
 * 
 * @returns {number} The chance (in percent out of 100) of a user encountering a Pokemon.
 */
function getEncounterChanceForLocation(ability, item, region, location, field) {
    let encounterChance = 8 * spamEncounterMult;
    /** Doubles encounter chance everywhere. */
    if (ability === "Arena Trap" || ability === "Illuminate" || ability === "Swarm") {
        encounterChance = encounterChance * 2;
    /** Increases encounter chance by 50% everywhere. */
    } else if (ability === "No Guard") {
        encounterChance = encounterChance * 1.5;
    /** Halves encounter chance everywhere. */
    } else if (ability === "Quick Feet" || ability === "Stench" || ability === "White Smoke") {
        encounterChance = encounterChance / 2;
    /** Halves encounter chance in sandstorm. */
    } else if (ability === "Sand Veil") {
        for (location in sandstorm) {
            if (location.region === region && location.location === location) {
                encounterChance = encounterChance / 2;
            }
        }
    /** Halves encounter chance in snow and hail. */
    } else if (ability === "Snow Cloak") {
        for (location in hailing) {
            if (location.region === region && location.location === location) {
                encounterChance = encounterChance / 2;
            }
        }
        for (location in snowing) {
            if (location.region === region && location.location === location) {
                encounterChance = encounterChance / 2;
            }
        }
    /** Doubles encounter rate while fishing. */
    } else if (ability === "Sticky Hold" || ability === "Suction Cups") {
        if (field === "Super Rod" || field === "Good Rod" || field === "Old Rod") {
            encounterChance = encounterChance * 2;
        }
    }

    /** Reduces encounter chance to a third. */
    if (item === "Cleanse Tag") {
        encounterChance = encounterChance / 3;
    }

    return encounterChance;
}

/**
 * Checks if user sent a command, and performs that command's
 * actions if so.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} input The content of the user's message.
 * @param {string} command The text command sent from the user within the message.
 * 
 * @returns {boolean} True if user sent a command.
 */
async function doCommand(message, input, command) {
    let isMessageACommand = true;
    let commandStatus = false;
    if (command === "a" || command === "ability") {
        commandStatus = await runAbilityCommand(message, input);
        if (!commandStatus) {
            console.log("[ERROR] runAbilityCommand() : input=" + input)
        }
    } else if (command === "begin") {
        commandStatus = await runBeginCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runBeginCommand()");
        }
    } else if (command === "b" || command === "bag" || command === "🅱") {
        commandStatus = await runBagCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runBagCommand()");
        }
    } else if (command === "d" ||command === "dex" || command === "pokedex" || command === "pokédex") {
        commandStatus = await runDexCommand(message, input);
        if (!commandStatus) {
            console.log("[ERROR] runDexCommand() : input=" + input);
        }
    } else if (command === "daycare") {
        commandStatus = await runDaycareCommand(message, input);
        if (!commandStatus) {
            console.log("[ERROR] runDaycareCommand() : input=" + input);
        }
    } else if (command === "dive") {
        commandStatus = await runDiveCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runDiveCommand()");
        }
    } else if (command === "e" || command === "encounter" || command === "encounters") {
        commandStatus = await runEncounterCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runEncounterCommand()");
        }
    } else if (command === "fish" || command === "f") {
        commandStatus = await runFishCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runFishCommand()");
        }
    } else if ((command === "g" || command === "give") && input.length > 0) {
        commandStatus = await runGiveCommand(message, input);
        if (!commandStatus) {
            console.log("[ERROR] runGiveCommand() : input=" + input);
        }
    } else if ((command === "goto" || command === "go") && input.length > 0) {
        commandStatus = await runGotoCommand(message, input);
        if (!commandStatus) {
            console.log("[ERROR] runGotoCommand() : input=" + input);
        }
    } else if (command === "h" || command === "help") {
        commandStatus = await runHelpCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runHelpCommand() : input=" + input);
        }
    } else if (command === "headbutt") {
        commandStatus = await runHeadbuttCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runHeadbuttCommand()");
        }
    } else if (command === "l" ||command === "lead" || command === "main" || command === "front" || command === "first" || command === "current") {
        commandStatus = await runLeadCommand(message, input);
        if (!commandStatus) {
            console.log("[ERROR] runLeadCommand()");
        }
    } else if (command === "locations") {
        commandStatus = await runLocationsCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runLocationsCommand()");
        }
    } else if (command === "lotto" ||command === "daily" || command === "lottery") {
        commandStatus = await runLottoCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runLottoCommand() : user id=" + message.author.id);
        }
    } else if (command === "m" || command === "move" || command === "attack") {
        commandStatus = await runMoveCommand(message, input);
        if (!commandStatus) {
            console.log("[ERROR] runMoveCommand() : input=" + input);
        }
    } else if (command === "mart" || command === "shop" || command === "sell" || command === "buy") {
        commandStatus = await runMartCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runMartCommand()");
        }
    } else if (command === "p" || command === "pokemon" || command === "pokémon") {
        commandStatus = await runPokemonCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runPokemonCommand()");
        }
    } else if ((command === "r" || command === "release") && input.length > 0) {
        commandStatus = await runReleaseCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runReleaseCommand()");
        }
    } else if (command === "rock" || command === "rocksmash") {
        commandStatus = await runRocksmashCommand(message, input);
        if (!commandStatus) {
            console.log("[ERROR] runRocksmashCommand() : input=" + input);
        }
    } else if ((command === "s" || command === "swap" || command === "switch" || command === "select" || command === "setlead") && input.length > 0) {
        commandStatus = await runSetLeadCommand(message, input);
        if (!commandStatus) {
            console.log("[ERROR] runSetLeadCommand() : input=" + input);
        }
    } else if (command === "surf") {
        commandStatus = await runSurfCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runSurfCommand()");
        }
    } else if (command === "t" || command === "take") {
        commandStatus = await runTakeCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runTakeCommand()");
        }
    } else if (command === "travel") {
        commandStatus = await runTravelCommand(message, input);
        if (!commandStatus) {
            console.log("[ERROR] runTravelCommand() : input=" + input);
        }
    } else if (command === "trade") {
        commandStatus = await runTradeCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runTradeCommand()");
        }
    } else if ((command === "u" || command === "use") && input.length > 0) {
        commandStatus = await runUseCommand(message, input);
        if (!commandStatus) {
            console.log("[ERROR] runUseCommand() : input=" + input);
        }
    } else if (command === "w" || command === "where" || command === "locate") {
        commandStatus = await runWhereCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runWhereCommand()");
        }
    } else if (command === "walk") {
        commandStatus = await runWalkCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runWalkCommand()");
        }
    } else if (command === "weather" || command === "forecast") {
        commandStatus = await runWeatherCommand(message);
        if (!commandStatus) {
            console.log("[ERROR] runWeatherCommand()");
        }
    } else {
        isMessageACommand = false;
    }

    return new Promise(function(resolve) {
        resolve(isMessageACommand);
    });
}

/**
 * Checks if user is in the process of evolving a Pokemon.
 * This function contains commands that the user is allowed
 * to run while evolving a Pokemon.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} command The text command sent from the user within the message.
 * 
 * @returns {boolean} True if user has a Pokemon that is evolving.
 */
async function checkIfUserIsEvolving(message, command) {
    let ev = isInEvolution(message.author.id);
    let isEvolving = false;
    if(ev != null) { //if sender has a pokemon evolving
        isEvolving = true;
        if(command === "a") { //sender accepts evo
            await evolve(message);
        } else if (command === "b") { //sender cancels evo
            await cancelEvolve(message);
        } else if (command === "l" || command === "lead" || command === "main" || command === "front" || command === "first" || command === "current") {
            commandStatus = await runLeadCommand(message, input);
            if (!commandStatus) {
                console.log("[ERROR] runLeadCommand()");
            }
        } else {
            await sendMessage(message.channel, (message.author.username + " please finish " + ev.from + "'s evolution into " + ev.to + ". Type \"B\" to cancel or  \"A\" to accept."));
        }
    }
    return new Promise(function(resolve) {
        resolve(isEvolving);
    });
}

/**
 * Sends a Discord message to a specific channel and catches any possible errors.
 * 
 * @param {TextChannel} channel The Discord channel to send the message to.
 * @param {any} content The content of the message. Can be a string or an embed object.
 * 
 * @returns {boolean} True if message was sent.
 */
async function sendMessage(channel, content) {
    let didMessageGetSent = false;
    await channel.send(content)
    .then(() => {
        didMessageGetSent = true;
    })
    .catch(err => {
        console.error(chalk`{red [ERROR]} Failed to send message: ` + err);
    });

    return new Promise(function(resolve) {
        resolve(didMessageGetSent);
    });
}

/**
 * Performs a database query.
 * 
 * @param {string} query The MySQL query to perform.
 * @param {any[]} variables The list of variables for the query string.
 * 
 * @returns {any[]} The query results.
 */
async function doQuery(query, variables) {
    return new Promise(async function(resolve) {
        await con.query(query, variables, function (err, rows) {
            if (err) {
                console.error(err);
                resolve(null);
            } else {
                resolve(rows);
            }
        });
    });
}

/**
 * Checks if a user is in a transaction and prints that transaction
 * if they are.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} commandWarning A string representing the command
 * the user is trying to run.
 * 
 * @returns {boolean} True if user is in transaction.
 */
async function printTransactionIfTrue(message, commandWarning) {
    let status = false;
    let activeUserTransaction = isInTransaction(message.author.id);
    if (activeUserTransaction != null) {
        await sendMessage(message.channel, (message.author.username + " please finish " + activeUserTransaction + commandWarning));
        status = true;
    }

    return new Promise(function(resolve) {
        resolve(status);
    });
}

/**
 * Handles the process for running the `ability` command, which
 * sends a message with details about an ability.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string[]} abilityName Name of the ability as input by the user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runAbilityCommand(message, abilityName) {
    let commandStatus = false;
    abilityName = abilityName.join(' ');
    let ability = getAbilityInfo(abilityName);
    commandStatus = await printAbilityInfo(message.channel, ability[0], ability[1]);
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `begin` command, which
 * initializes data for a new user. This includes their starter
 * Pokemon, their starting region, and default bag items.
 * 
 * @todo This should establish their timezone and user prefs as well.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runBeginCommand(message) {
    let commandStatus = false;
    let cancelled = true;
    if (await printTransactionIfTrue(message, " before trying to begin a new adventure.") === false) {
        let exists = await userExists(message.author.id);
        if (!exists) {
            transactions[transactions.length] = new Transaction(message.author.id, "creating your adventure");
            let awaitingUserInput = true;
            //lets the user pick their region and starter Pokemon, and populates the user's bag with starting items.
            while (awaitingUserInput) {
                let region = await selectRegion(message);
                let starter = await selectStarter(message, region);
                awaitingUserInput = await createNewUser(message.author.id, starter, message, region);
                if (awaitingUserInput) {
                    cancelled = false;
                    awaitingUserInput = false;
                    commandStatus = await sendMessage(message.channel, (message.author.username + " has started their Pokémon adventure with a " + starter + "! Since you chose to begin in the " + region + " region, you will find yourself in " + getDefaultLocationOfRegion(region) + ". Use the \"goto <location_name>\" command to move to another location within the region, provided you have a Pokémon strong enough to protect you."));
                    removeTransaction(message.author.id);
                }
            }
            //if user decided to cancel (likely because they didn't like their starter Pokemon, or because they timed out).
            if (cancelled) {
                removeTransaction(message.author.id);
                commandStatus = await sendMessage(message.channel, (message.author.username + " has decided to cancel their region selection. Begin your adventure another time when you are ready."));
            }
        } else {
            commandStatus = await sendMessage(message.channel, (message.author.username + " already has an adventure in progress."));
        }
    }

    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `bag` command, which
 * sends a message that shows the contents of the user's bag.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runBagCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before you can have a bag to store items in. " + duck);
    } else {
        let bag = printBag(message);
        if (!bag) {
            return new Promise(function(resolve) {
                resolve(false);
            });
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `dex` command, which
 * sends a message containing detailed information about a 
 * Pokemon.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input Pokemon name as input by the user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runDexCommand(message, input) {
    if (input.length === 0) {
        let exists = await userExists(message.author.id);
        if (!exists) {
            message.channel.send(message.author.username + " you will need to begin your adventure before you can check your Pokédex progress. " + duck);
        } else {
            printDex(message);
        }
    } else {
        input = input.join(' ');
        let foundInfo = await getDexInfo(message, input, "None");
        if (foundInfo == null) {
            message.channel.send("Pokémon not found. " + duck);
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    })
}

/**
 * Handles the process for running the `daycare` command, which
 * allows a user to drop off and pick up their Pokemon from the
 * day care.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runDaycareCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before you can send a Pokémon to the day care. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to send a Pokémon to the day care.") === false) {
            transactions[transactions.length] = new Transaction(message.author.id, "your current business at the day care");
            await dayCare(message);
            removeTransaction(message.author.id);
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `dive` command, which
 * sets a user to only encounter Pokemon found by diving.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runDiveCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before you can dive with a Pokémon. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to dive with your Pokémon.") === false) {
            setField(message, "Dive");
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `encounter` command, which
 * sends a message containing all the different Pokemon that the
 * user can encounter in their current location.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runEncounterCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before being able to find wild Pokémon. " + duck);
    } else {
        printPossibleEncounters(message);
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `fish` command, which
 * sets a user to only encounter Pokemon found by fishing.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runFishCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before you can fish for Pokémon. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to begin fishing.") === false) {
            await setField(message, "Fish");
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `give` command, which
 * gives an item to the user's lead Pokemon.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input Name of item as input by the user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runGiveCommand(message, input) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before you can give an item to your Pokémon. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to give a Pokémon an item.") === false) {
            transactions[transactions.length] = new Transaction(message.author.id, "your current item assignment");
            input = input.join(' ');
            let gaveItem = await giveItem(message, input);
            if (gaveItem === false) {
                message.channel.send(message.author.username + " was unable to give the " + input + ". " + duck);
            }
            removeTransaction(message.author.id);
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `goto` command, which
 * changes the location of the user to somewhere else within
 * the same region.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input Location name as input by the user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runGotoCommand(message, input) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before being able to travel the world. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to move to a new location.") === false) {
            if (input.length > 1 && input[0] === "to" && input[1] != "to") {
                input.splice(0, 1);
            }
            input = input.join(' ');
            if (await setLocation(message, input) === false) {
                return new Promise(function(resolve) {
                    resolve(false);
                });
            }
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `help` command, which
 * will send a DM to the user containing information about
 * all of the Pokebot commands.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runHelpCommand(message) {
    await printHelp(message);
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `headbutt` command, which
 * sets a user to only encounter Pokemon found by headbutting trees.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runHeadbuttCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before you can headbutt trees with a Pokémon. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to headbutt trees with your Pokémon.") === false) {
            setField(message, "Headbutt");
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `lead` command, which
 * changes the user's lead Pokemon to another Pokemon that they own.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input Optional user input that will show the lead Pokemon's hidden stats if this value is equal to `"hidden"`.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runLeadCommand(message, input) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure to obtain Pokémon. " + duck);
    } else {
        let pkmn = await getLeadPokemon(message.author.id);
        if (pkmn === null) {
            return new Promise(function(resolve) {
                resolve(false);
            });
        }
        // if user added 'hidden' to the command, then show hidden
        if (input.length > 0 && input[0].toLowerCase() === "hidden") {
            displayHiddenStats(pkmn, message);
        } else { 
            displayAnOwnedPkmn(pkmn, message);
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `locations` command, which
 * sends a message containing all locations within the user's current
 * region.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runLocationsCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before viewing the locations you can visit. " + duck);
    } else {
        if (await printAllLocations(message) === false) {
            return new Promise(function(resolve) {
                resolve(false);
            });
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `lotto` command, which
 * randomly generates a number and matches that number to the
 * user's id to determine what prizes the user will receive.
 * 
 * @todo Move most of this command into a separate function to
 * keep it consistent with other command functions.
 * 
 * @todo Possibly make the lotto winning number global for all users
 * instead of randomly generated for each user.
 * 
 * @todo Change prize rewards to let user pick from a selection of items.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runLottoCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure to enter the lottery. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to enter the lottery.") === false) {
            //gets the day when the user last ran the lotto command, in their timezone
            let user = await getUser(message.author.id);
            if (user === null) {
                return new Promise(function(resolve) {
                    resolve(false);
                });
            }
            let cur = convertToTimeZone(user);
            let lastDaily = moment(user.lotto);
            let zone = momentTz.tz(lastDaily, user.timezone);
            zone = zone.clone().tz(user.timezone);

            //if lotto command has not been ran on the current day
            if (moment(cur).format('D') != zone.format('D')) {
                let winNum = "";
                let possible = "0123456789";
                let matches = 0;

                //randomly generate a winning number string
                for(let i = 0; i < 9; i++) {
                    winNum += possible.charAt(Math.floor(Math.random() * possible.length));
                }
            
                //cut the user'd id string in half so only the first half is matched with the winning number string
                let uid = message.author.id;
                uid = uid.substring(0, (uid.length/2));
            
                //count how many of the same numbers are in the same position for the user's id and the winning number
                for(let i = 0; i < 9; i++) {
                    if (winNum.charAt(i) === uid.charAt(i)) {
                        matches++;
                    }
                }
            
                // lotto prizes
                if (matches === 0) {
                    message.channel.send(message.author.username + " you had 0 matches. As a consolation prize, you won " + dollar + "1000 and a Poké Ball.");
                    user.money += 1000;
                    addItemToBag(message.author.id, "Poké Ball", 1, true, "Ball");
                } else if (matches === 1) {
                    message.channel.send(message.author.username + " you had 1 match! You won " + dollar + "2000 and an Ultra Ball!");
                    user.money += 2000;
                    addItemToBag(message.author.id, "Ultra Ball", 1, true, "Ball");
                } else if (matches === 2) {
                    message.channel.send(message.author.username + " you had 2 matches! You won " + dollar + "4000 and three Ultra Balls!");
                    user.money += 4000;
                    addItemToBag(message.author.id, "Ultra Ball", 3, true, "Ball");
                } else if (matches === 3) {
                    message.channel.send(message.author.username + " you had 3 matches! You won " + dollar + "7000 and five Ultra Balls!");
                    user.money += 7000;
                    addItemToBag(message.author.id, "Ultra Ball", 5, true, "Ball");
                } else if (matches === 4) {
                    message.channel.send(message.author.username + " you had 4 matches! You won " + dollar + "10000 and a Leaf Stone!");
                    user.money += 10000;
                    addItemToBag(message.author.id, "Leaf Stone", 1, true, "Item");
                } else if (matches === 5) {
                    message.channel.send(message.author.username + " you had 5 matches! You won " + dollar + "13000 and a Fire Stone!");
                    user.money += 13000;
                    addItemToBag(message.author.id, "Fire Stone", 1, true, "Item");
                } else if (matches === 6) {
                    message.channel.send(message.author.username + " you had 6 matches! You won " + dollar + "18000 and a Water Stone!");
                    user.money += 18000;
                    addItemToBag(message.author.id, "Water Stone", 1, true, "Item");
                } else if (matches === 7) {
                    message.channel.send(message.author.username + " you had 7 matches! You won " + dollar + "25000 and 10 Ultra Balls!");
                    user.money += 25000;
                    addItemToBag(message.author.id, "Ultra Ball", 10, true, "Ball");
                } else if (matches === 8) {
                    message.channel.send(message.author.username + " you had 8 matches! You won " + dollar + "35000, 30 Ultra Balls, and 5 Rare Candies!");
                    user.money += 35000;
                    addItemToBag(message.author.id, "Ultra Ball", 30, true, "Ball");
                    addItemToBag(message.author.id, "Rare Candy", 5, true, "Item");
                } else if (matches === 9) {
                    message.channel.send(message.author.username + " you had 9 matches! You won " + dollar + "50000, 50 Ultra Balls, 10 Rare Candies, and a Master Ball!");
                    user.money += 50000;
                    addItemToBag(message.author.id, "Ultra Ball", 50, true, "Ball");
                    addItemToBag(message.author.id, "Rare Candy", 10, true, "Item");
                    addItemToBag(message.author.id, "Master Ball", 1, true, "Ball");
                } 
            
                //tell user what their id is and what the winning number is
                message.channel.send("Your trainer id: " + uid + "\nYour lotto number: " + winNum);
            
                //update the user's lotto time to be the current day
                user.lotto = convertToTimeZone(user).format();
                let query = "UPDATE user SET money = ?, lotto = ? WHERE user.user_id = ?";
                con.query(query, [user.money, user.lotto, message.author.id], function (err) {
                    if (err) {
                        return reject(err);
                    }
                });
            } else {    //if user already ran the lotto command today, tell them how much time they have until they can run it again for the next day
                /**  @todo are these two zone statements necessary? */
                zone = momentTz.tz(moment(), 'America/Detroit');
                zone = zone.clone().tz(user.timezone);
                let timeDiff = moment(zone).endOf('day') - zone;
            
                let dur = moment.duration(timeDiff);
                let min = "minutes";
                let hr = "hours";
                let sec = "seconds";
                if (dur.hours() === 1) {
                    hr = "hour";
                }
                if (dur.minutes() === 1) {
                    min = "minute";
                }
                if (dur.seconds() === 1) {
                    sec = "second";
                }
                message.channel.send(message.author.username + " you have already participated in the daily lottery.\nPlease try again in " + dur.hours() + " " + hr + ", " + dur.minutes() + " " + min + ", and " + dur.seconds() + " " + sec + ". " + duck);
            }
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `move` command, which
 * sends a message containing details about a Pokemon move.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input Name of the move as input by the user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runMoveCommand(message, input) {
    input = input.join(' ');
    let foundInfo = await printMoveInfo(message, input);
    let commandStatus = true;
    if (foundInfo === false) {
        await message.channel.send("Move not found. " + duck)
        .catch(err => {
            console.error("[ERROR] Failed to send message - " + err);
            commandStatus = false;
        });
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `mart` command, which
 * lets a user to buy items.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runMartCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before being able to buy items. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to buy items.") === false) {
            transactions[transactions.length] = new Transaction(message.author.id, "your item shopping");
            await buyItems(message);
            removeTransaction(message.author.id);
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `pokemon` command, which
 * sends a message showing all Pokemon currently owned by the user.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runPokemonCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure to obtain Pokémon. " + duck);
    } else {
        //do not await
        printPokemon(message, null);
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `release` command, which
 * releases a Pokemon owned by the user.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runReleaseCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before being able to release a Pokémon. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to release a Pokémon.") === false) {
            transactions[transactions.length] = new Transaction(message.author.id, "your current Pokémon release");
            input = input.join(' ');
            await releasePokemon(message, input);
            removeTransaction(message.author.id);  
        } 
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `rocksmash` command, which
 * sets a user to encounter only Pokemon that are found by smashing
 * rocks.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input Optional user input that allows a user to accidentally input `"rock smash"` as two words if `input` is equal to `"smash"`.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runRocksmashCommand(message, input) {
    input = input.join(' ').toLowerCase();
    //allow user to input "rock smash" or "rocksmash"
    if (input === "smash" || command === "rocksmash") {
        let exists = await userExists(message.author.id);
        if (!exists) {
            message.channel.send(message.author.username + " you will need to begin your adventure before you can smash rocks with a Pokémon. " + duck);
        } else {
            if (await printTransactionIfTrue(message, " before trying to smash rocks with your Pokémon.") === false) {
                setField(message, "Rock Smash");
            }
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `setlead` command, which
 * changes the user's lead Pokemon to another Pokemon that the
 * user owns.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input The name of the Pokemon that the user wants to set as their lead Pokemon.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runSetLeadCommand(message, input) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before being able to select a Pokémon. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to change your lead Pokémon.") === false) {
            transactions[transactions.length] = new Transaction(message.author.id, "your current leader assignment");
            input = input.join(' ');
            let swap = await setActivePokemon(message, input);
            if (!swap) {
                message.channel.send(message.author.username + " failed to change their lead Pokémon. " + duck);
            }
            removeTransaction(message.author.id);
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `surf` command, which
 * sets a user to encounter only Pokemon that are found by surfing.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runSurfCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before you can surf with a Pokémon. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to surf with your Pokémon.") === false) {
            setField(message, "Surfing");
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `take` command, which
 * takes the item held by the user's lead Pokemon if it is holding
 * any item.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runTakeCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before you can take items from your Pokémon. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to take items from your Pokémon.") === false) {
            takeItem(message);
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `travel` command, which
 * changes the region that the user is currently in.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input The name of the region as input by the user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runTravelCommand(message, input) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before you can travel to a new region. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to travel to a new region.") === false) {
            input = input.join(' ');
            let traveled = await setRegion(message, input);
            if (!traveled) {
                message.channel.send(message.author.username + " failed to travel to " + input + ". " + duck);
            }
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `trade` command, which
 * establishes a Pokemon trade between two users.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runTradeCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before you can trade Pokémon. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to start a new trade.") === false) {
            if (message.mentions.users.first() === undefined) {
                message.channel.send(message.author.username + " please mention the user you want to trade with. " + duck);
            } else {
                await tradeOffer(message, message.mentions.users.first());
            }
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `use` command, which
 * uses an item on either a Pokemon or the user, depending
 * on the item.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input The name of the item as input by the user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runUseCommand(message, input) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before you can use items. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to use an item.") === false) {
            transactions[transactions.length] = new Transaction(message.author.id, "your current item use");
            input = input.join(' ');
            let usedItem = await useItem(message, input);
            if (!usedItem) {
                message.channel.send(message.author.username + " was unable to use the " + input + ". " + duck);
            }
            removeTransaction(message.author.id);
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `where` command, which
 * sends a message that shows where the user is currently
 * located at.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runWhereCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before heading into the Pokémon world. " + duck);
    } else {    //does not need to be awaited
        if (await printLocation(message) === false) {
            return new Promise(function(resolve) {
                resolve(false);
            });
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `walk` command, which
 * sets a user to encounter only Pokemon that are found in
 * tall grass.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runWalkCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before you can walk around. " + duck);
    } else {
        if (await printTransactionIfTrue(message, " before trying to walk around.") === false) {
            await setField(message, "Walking");
        }
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Handles the process for running the `weather` command, which
 * sends a message showing all locations that currently experiencing
 * some type of weather, as well as the current season.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runWeatherCommand(message) {
    let exists = await userExists(message.author.id);
    if (!exists) {
        message.channel.send(message.author.username + " you will need to begin your adventure before checking the weather. " + duck);
    } else {
        await getWeather(message);
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Establishes the channel contained in `message` as the channel
 * that the bot will read commands from, for the guild contained
 * in `message`. This is to prevent users from being able to spam
 * all channels in a guild and instead consolidate spam to a single
 * channel.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function setBotChannel(message) {
    let query = "SELECT * FROM guilds WHERE guild_id = ?";
    con.query(query, [message.guild.id], async function (err, rows) {
        if (err) {
            console.log(err);
            return new Promise(function(resolve) {
                resolve(false);
            });
        // if guild doesn't exist in database
        } else if (rows.length === 0) {
            let guild = {
                guild_id: message.guild.id,
                prefix: `!pb`,
                last_message_sent: moment().format(),
                last_user: message.author.id,
                channel: message.channel.id
            }
            //insert guild into database
            let query = "INSERT INTO guilds SET ?";
            con.query(query, [guild], async function (err) {
                if (err) {
                    console.log(err);
                    return new Promise(function(resolve) {
                        resolve(false);
                    });
                } else {
                    await message.channel.send(`I will now be reading commands from this channel. Type \`!pb begin\` to start your adventure!`);
                }
            });
        // if guild is in database
        } else {
            //update the channel that the bot will read from for the current guild
            let query = "UPDATE guilds SET guilds.channel = ? WHERE guilds.guild_id = ?";
            con.query(query, [message.channel.id, message.guild.id], async function (err) {
                if (err) {
                    console.log(err);
                    return new Promise(function(resolve) {
                        resolve(false);
                    });
                } else {
                    await message.channel.send(`I will now be reading commands from this channel.`);
                }
            });
        }
    });
    

    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Checks if the channel contained in `message` is the
 * designated bot channel for the guild contained in
 * `message`.
 * 
 * @param {Message} message Discord message sent by a user.
 * @returns {boolean} True if the channel is the bot channel, otherwise false.
 */
async function isBotChannel(message) {
    return new Promise(function(resolve) {
        let query = "SELECT * FROM guilds WHERE guilds.guild_id = ? AND guilds.channel = ?";
        con.query(query, [message.guild.id, message.channel.id], function (err, rows) {
            if (err) {
                console.log(err);
                resolve(false);
            } else if (rows.length > 0) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

/**
 * Checks if a user is currently in a transaction.
 * A user should only have one transaction at any given moment.
 * 
 * @param {UserID} userID ID of a Pokebot user.
 * @returns {string} String of the transaction type the user
 * is currently in, or null if the user is not in a transaction.
 */
function isInTransaction(userID) {
    var index = transactions.map(function(t) { return t.userID; }).indexOf(userID);
    if (index > -1) {
        return transactions[index].type;
    } else {
        return null;
    }
}

/**
 * Removes a user from their active transaction
 * if they are in one.
 * 
 * @param {UserID} userID ID of a Pokebot user.
 */
function removeTransaction(userID) {
    var index = transactions.map(function(t) { return t.userID; }).indexOf(userID);
    if (index > -1) {
        transactions.splice(index, 1);
    }
}

/**
 * Checks if a user currently has a Pokemon that
 * is evolving.
 * 
 * @param {UserID} userID ID of a Pokebot user.
 * @returns {Evolution} Evolution object of the currently
 * evolving Pokemon, or null if the user does not have any
 * Pokemon that are evolving.
 */
function isInEvolution(userID) {
    var index = evolving.map(function(t) { return t.userID; }).indexOf(userID);
    if (index > -1) {
        return evolving[index];
    } else {
        return null;
    }
}

/**
 * Removes a user from the evolution list.
 * This means none of their Pokemon are evolving.
 * 
 * @param {UserID} userID ID of a Pokebot user.
 */
function removeEvolution(userID) {
    var index = evolving.map(function(t) { return t.userID; }).indexOf(userID);
    if (index > -1) {
        evolving.splice(index, 1);
    }
}

/**
 * Checks if a user is currently trading Pokemon
 * with another user.
 * 
 * @param {UserID} userID ID of a Pokebot user.
 * @returns {Trade} Trade object of the users who are trading
 * with each other, or null if the user is not in the trading
 * process.
 */
function isInTrade(userID) {
    var index = trading.map(function(t) { return t.userAsk; }).indexOf(userID);
    if (index > -1) {
        return trading[index];
    } else {
        return null;
    }
}

/**
 * Removes a user from the trade list.
 * This means the user is not currently trading Pokemon.
 * 
 * @param {UserID} userID ID of a Pokebot user.
 */
function removeTrade(userID) {
    var index = trading.map(function(t) { return t.userAsk; }).indexOf(userID);
    if (index > -1) {
        trading.splice(index, 1);
    }
}

/**
 * Generates a file path to a 3D Pokemon model
 * found in `gfx/models/`.
 * 
 * @param {string} name Name of the Pokemon.
 * @param {boolean} shiny If the Pokemon is shiny.
 * @param {string} gender The gender of the Pokemon. Should only be `"male"`, `"female"`, or `"none"`.
 * @param {string} form The form of the Pokemon.
 * 
 * @returns {string} The relative file path to the Pokemon model image.
 */
function generateModelLink(name, shiny, gender, form) {
    var path = generatePokemonJSONPath(name);
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.error(err);
        return null;
    }
    var pkmn = JSON.parse(data);
    var url;

    var dexnum = pkmn.national_id;
    var lower = pkmn.names.en.toLowerCase();
    
    //pokemon names are not always the same as the file names
    if (lower === "mr. mime") {
        lower = "mr.-mime";
    }
    
    if (lower === "mime jr.") {
        lower = "mime-jr";
    }
    
    if (lower === "type: null") {
        lower = "typenull";
    }
    
    if (lower === "flabébé") {
        lower = "flabebe";
    }
    
    if (lower === "nidoran♂") {
        lower = "nidoran-m";
    }
    
    if (lower === "nidoran♀") {
        lower = "nidoran-f";
    }

    if (lower === "farfetch'd") {
        lower = "farfetch_d";
    }

    if (lower === "farfetch\'d") {
        lower = "farfetch_d";
    }

    if (lower === "kommo-o") {
        lower = "kommo_o";
    }

    if (lower === "hakamo-o") {
        lower = "hakamo_o";
    }
    
    if (lower === "jangmo-o") {
        lower = "jangmo_o";
    }
    
    if (form === "Alolan") {
        lower += "-alola";
    } else if (gender === "Female") {
        if (hasGenderDifference(name) === true) {
            lower += "-f";
        }
    }
    
    if (name === "Burmy" || name === "Wormadam") {
        if (form === "Sandy Cloak") {
            lower += "-sandy";
        } else if (form == "Trash Cloak") {
            lower += "-trash";
        }
    } else if (name === "Flabébé" || name === "Floette" || name === "Florges") {
        if (form === "Orange") {
            lower += "-orange";
        } else if (form == "Yellow") {
            lower += "-yellow";
        } else if (form == "Blue") {
            lower += "-blue";
        } else if (form == "White") {
            lower += "-white";
        }
    } else if (name === "Unown") {
        if (form === "!") {
            lower += "-exclamation";
        } else if (form === "?") {
            lower += "-question";
        } else {
            lower += "-" + form.toLowerCase();
        }
    } else if (name === "Shellos" || name === "Gastrodon") {
        if (form === "East Sea") {
            lower += "-east";
        }
    } else if (name === "Basculin") {
        if (form === "Blue-Striped") {
            lower += "-blue";
        }
    } else if (name === "Pumpkaboo" || name === "Gourgeist") {
        if (form === "Small Size") {
            lower += "-small";
        } else if (form === "Large Size") {
            lower += "-large";
        } else if (form === "Super Size") {
            lower += "-super";
        }
    } else if (name === "Oricorio") {
        if (form === "Pom-Pom Style") {
            lower += "-pompom";
        } else if (form === "Pa'u Style") {
            lower += "-pau";
        } else if (form === "Sensu Style") {
            lower += "-sensu";
        }
    } else if (name === "Lycanroc") {
        if (form === "Midnight") {
            lower += "-midnight";
        } else if (form === "Dusk") {
            lower += "-dusk";
        }
    }
    
    //if pokemon is shiny
    var dir = "../gfx/models";
    if (shiny === 1) {
        dir = "../gfx/models/shiny";
    }
    
    //gen 6 and 7 models have different links
    if (dexnum <= 721 && form != "Alolan") {
        url = dir + "/" + lower + ".gif";
    } else {
        url = dir + "/" + lower + ".gif";
    }
    return url;
}

/**
 * Generates a URL to a Pokemon sprite from the Oakdex-Pokedex sprite repository on Github.
 * @todo Host sprites within the Pokebot repository.
 * 
 * @param {string} name The name of the Pokemon.
 * @param {string} gender The gender of the Pokemon. Should only be `"male"`, `"female"`, or `"none"`.
 * @param {string} form The form of the Pokemon.
 * 
 * @returns {string} URL to the Pokemon sprite.
 */
function generateSpriteLink(name, gender, form) {
    let path = generatePokemonJSONPath(name);
    let data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.error(err);
        return null;
    }
    let pkmn = JSON.parse(data);
    
    let dexnum = pkmn.national_id;
    let url;
    url = dexnum.toString();
    while (url.length < 3) { //prepends 0s to the string if less than three characters long
        url = '0' + url;
    }
    
     //gets proper image if the pokemon has a form
    if (form === "Alolan") {
        url += "-alola";
    } else if (name === "Burmy" || name === "Wormadam") {
        if (form === "Sandy Cloak") {
            url += "-sandy";
        } else if (form == "Trash Cloak") {
            url += "-trash";
        }
    } else if (name === "Unfezant" || name === "Meowstic" || name === "Frillish" || name === "Jellicent" || name === "Pyroar") {
        if (gender === "Female") {
            url += "-female";
        }
    } else if (name === "Flabébé" || name === "Floette" || name === "Florges") {
        if (form === "Orange") {
            url += "-orange";
        } else if (form == "Yellow") {
            url += "-yellow";
        } else if (form == "Blue") {
            url += "-blue";
        } else if (form == "White") {
            url += "-white";
        }
    } else if (name === "Unown") {
        if (form === "!") {
            url += "-exclamation";
        } else if (form === "?") {
            url += "-question";
        } else {
            url += "-" + form.toLowerCase();
        }
    } else if (name === "Shellos" || name === "Gastrodon") {
        if (form === "East Sea") {
            url += "-east";
        }
    } else if (name === "Basculin") {
        if (form === "Red-Striped") {
            url += "-striped";
        }
    } else if (name === "Pumpkaboo" || name === "Gourgeist") {
        if (form === "Avergae Size") {
            url += "-average";
        } else if (form === "Large Size") {
            url += "-large";
        } else if (form === "Super Size") {
            url += "-super";
        }
    } else if (name === "Oricorio") {
        if (form === "Pom-Pom Style") {
            url += "-pompom";
        } else if (form === "Pa'u Style") {
            url += "-pau";
        } else if (form === "Sensu Style") {
            url += "-sensu";
        }
    }
    
    url = "https://raw.githubusercontent.com/jalyna/oakdex-pokedex-sprites/master/icons/" + url + ".png";
    return url;
}

/**
 * Generates a file path for a location's image.
 * 
 * @param {string} region The name of the region where the location is.
 * @param {string} location The name of the location.
 * 
 * @returns {string} File path to the location's image.
 */
function generateLocationImagePath(region, location) {
    let path = '../gfx/maps/' + region + '/' + location + '.png';
    return path;
}

/**
 * Generates a file path to the JSON file for a specific Pokemon species.
 * 
 * @param {string} name The name of the Pokemon.
 * 
 * @returns {string} File path to the JSON file.
 */
function generatePokemonJSONPath(name) {
    let lower = name.toLowerCase();
    //pokemon names are not always the same as the file names
    if (lower === "mr. mime") {
        lower = "mr_mime";
    }
    
    if (lower === "mime jr.") {
        lower = "mime_jr";
    }
    
    if (lower === "type: null") {
        lower = "type_null";
    }
    
    if (lower === "flabébé") {
        lower = "flabebe";
    }
    
    if (lower === "nidoran♂") {
        lower = "nidoran";
    }
    
    if (lower === "nidoran♀") {
        lower = "nidoran_f";
    }

    if (lower === "farfetch'd") {
        lower = "farfetch_d";
    }

    if (lower === "farfetch\'d") {
        lower = "farfetch_d";
    }

    if (lower === "kommo-o") {
        lower = "kommo_o";
    }

    if (lower === "hakamo-o") {
        lower = "hakamo_o";
    }
    
    if (lower === "jangmo-o") {
        lower = "jangmo_o";
    }

    let path = '../data/pokemon/' + lower + '.json';
    return path;
}

/**
 * Generates a file path to the JSON file for a specific nature.
 * 
 * @param {string} nature The name of the nature.
 * 
 * @returns {string} File path to the JSON file.
 */
function generateNatureJSONPath(nature) {
    let lower = nature.toLowerCase();
    
    let path = '../data/nature/' + lower + '.json';
    return path;
}

/**
 * Generates a file path to the JSON file for a specific region.
 * 
 * @param {string} region The name of the region.
 * 
 * @returns {string} File path to the JSON file.
 */
function generateRegionJSONPath(region) {
    let lower = region.toLowerCase();
    
    let path = '../data/region/' + lower + '.json';
    return path;
}

/**
 * Generates a file path to the JSON file for a specific location.
 * 
 * @param {string} region The name of the region that contains the location.
 * @param {string} location The name of the location.
 * 
 * @returns {string} File path to the JSON file.
 */
function generateLocationJSONPath(region, location) {
    let path = '../data/region/' + region + "/" + location + '.json';
    return path;
}

/**
 * Checks if a user is known to Pokebot.
 * 
 * @param {string} userID The id of the user.
 * 
 * @returns {boolean} True if user is known, otherwise false.
 */
async function userExists(userID) {
    let search = await getUser(userID);
    return new Promise(function(resolve) {
        if (search != null) {
            resolve(true);
        } else {
            resolve(false);
        }
    });
}

/**
 * Creates a new Pokebot user and adds their information to the database.
 * 
 * @param {string} userID The Discord id of the user.
 * @param {string} name The name of the user's starter Pokemon.
 * @param {Message} message The Discord message sent from the user.
 * @param {string} region The region that the user selected to begin in.
 * 
 * @returns {string} Returns true if user was successfully created,
 * otherwise false.
 */
async function createNewUser(userID, name, message, region) {
    let location = getDefaultLocationOfRegion(region);
    if (location === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    let starter = await generatePokemonByName(message, name, 5, region, location, false);
    
    //var starter = await generatePokemonByName(message, "Rockruff", 23, region, location, false);
    //starter.gender = "Female";
    //starter.form = "Sandy Cloak";
    
    starter.ot = message.author.username;
    starter.otid = message.author.id;
    starter.lead = 1;
    
    displayAWildPkmn(starter, message);
    
    let accept = await confirmStarter(message, userID);
    if (!accept) { //if user rejects starter
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    //user begins with an everstone, 10 poke balls, and a visa for their region
    let everstone = new Item("Everstone", 1, true, false);
    let balls = new Item("Poké Ball", 10, true, false);
    let visa = new Item((region + " Visa"), 1, false, true);
    
    starter.nick = await nicknamePokemon(message, starter.name);

    let user_set = {
        user_id: userID,
        level: 5,
        region: starter.region,
        location: starter.location,
        field: "Walking",
        lead: null,
        money: 5000,
        lotto: "2018-06-21T00:12:45-04:00"
    }

    let prefs_set = {
        user_id: userID,
        react_money: 1,
        react_encounter: 1,
        react_move: 1,
        react_level: 1,
        ping_money: 0,
        ping_move: 1,
        ping_encounter: 1,
        ping_level: 0,
        timezone: "America/Detroit"
    }

    let everstone_set = {
        owner: userID,
        name: everstone.name,
        quantity: 1,
        holdable: 1,
        category: "Item"
    }

    let ball_set = {
        owner: userID,
        name: balls.name,
        quantity: 10,
        holdable: 1,
        category: "Ball"
    }

    let visa_set = {
        owner: userID,
        name: visa.name,
        quantity: 1,
        holdable: 0,
        category: "Key"
    }

    await doQuery("INSERT INTO user SET ?", [user_set]);
    await doQuery("INSERT INTO user_prefs SET ?", [prefs_set]);
    await doQuery("INSERT INTO item SET ?", [everstone_set]);
    await doQuery("INSERT INTO item SET ?", [ball_set]);
    await doQuery("INSERT INTO item SET ?", [visa_set]);
    let newPokemon = await addPokemon(userID, starter);
    await doQuery("UPDATE user SET user.lead = ? WHERE user.user_id = ?", [newPokemon, userID]);

    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Sends a message containing detailed information about a new
 * user's starter Pokemon and sends another message asking if
 * the user will accept the starter Pokemon.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if user accepted the starter Pokemon,
 * otherwise false.
 */
async function confirmStarter(message) {
    message.channel.send(message.author.username + " are you ok with this Pokémon? Type \"Yes\" to accept or \"No\" to choose a new starter Pokémon. You can also type \"Cancel\" to begin your adventure later.");
    
    let cancel = false;
    let input = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 60000, errors: ['time'] })
        .then(collected => {
            input = collected.first().content.toString().toLowerCase();
        })
        .catch(() => {
            input = "cancel";
            cancel = true;
        });

        if (input === "cancel" || input === "no") {
            cancel = true;
            input = false;
        } else if (input === "yes") {
            cancel = true;
            input = true;
        } else if (input != null) {
            message.channel.send(message.author.username + ", your response was not recognized. Type \"Yes\" to accept or \"No\" to choose a new starter Pokémon. You can also type \"Cancel\" to begin your adventure later.");
            input = false;
        } else {
            input = false;
        }
    }
    return new Promise(function(resolve) {
        resolve(input);
    });
}

/**
 * Sends messages asking the user what starter Pokemon
 * they want, based on the region the user selected.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} region The name of the region selected by the user.
 * 
 * @returns {string} The name of the starter Pokemon selected by
 * the user, or null if the user did not select a starter.
 */
async function selectStarter(message, region) {
    if (region === null) {
        return null;
    } else if (region === "Kanto") {
        message.channel.send(message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Bulbasaur\n2. Charmander\n3. Squirtle```");
    } else if (region === "Johto") {
        message.channel.send(message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Chikorita\n2. Cyndaquil\n3. Totodile```");
    } else if (region === "Hoenn") {
        message.channel.send(message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Treecko\n2. Torchic\n3. Mudkip```");
    } else if (region === "Sinnoh") {
        message.channel.send(message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Turtwig\n2. Chimchar\n3. Piplup```");
    } else if (region === "Unova") {
        message.channel.send(message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Snivy\n2. Tepig\n3. Oshawott```");
    } else if (region === "Kalos") {
        message.channel.send(message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Chespin\n2. Fennekin\n3. Froakie```");
    } else { //alola
        message.channel.send(message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Rowlet\n2. Litten\n3. Popplio```");
    }
    let cancel = false;
    let selectedStarter = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
        .then(collected => {
            selectedStarter = collected.first().content.toString().toLowerCase();
        })
        .catch(() => {
            selectedStarter = "cancel";
            cancel = true;
        });
        if (selectedStarter === "cancel") {
            cancel = true;
            selectedStarter = null;
        } else if (selectedStarter != null) {
            if (region === "Kanto") {
                if (selectedStarter === "bulbasaur" || selectedStarter === "1") {
                    cancel = true;
                    selectedStarter = "Bulbasaur";
                } else if (selectedStarter === "charmander" || selectedStarter === "2") {
                    cancel = true;
                    selectedStarter = "Charmander";
                } else if (selectedStarter === "squirtle" || selectedStarter === "3") {
                    cancel = true;
                    selectedStarter = "Squirtle";
                } else {
                    message.channel.send(name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection.");
                    selectedStarter = null;
                }
            } else if (region === "Johto") {
                if (selectedStarter === "chikorita" || selectedStarter === "1") {
                    cancel = true;
                    selectedStarter = "Chikorita";
                } else if (selectedStarter === "cyndaquil" || selectedStarter === "2") {
                    cancel = true;
                    selectedStarter = "Cyndaquil";
                } else if (selectedStarter === "totodile" || selectedStarter === "3") {
                    cancel = true;
                    selectedStarter = "Totodile";
                } else {
                    message.channel.send(name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection.");
                    selectedStarter = null;
                }
            } else if (region === "Hoenn") {
                if (selectedStarter === "treecko" || selectedStarter === "1") {
                    cancel = true;
                    selectedStarter = "Treecko";
                } else if (selectedStarter === "torchic" || selectedStarter === "2") {
                    cancel = true;
                    selectedStarter = "Torchic";
                } else if (selectedStarter === "mudkip" || selectedStarter === "3") {
                    cancel = true;
                    selectedStarter = "Mudkip";
                } else {
                    message.channel.send(name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection.");
                    selectedStarter = null;
                }
            } else if (region === "Sinnoh") {
                if (selectedStarter === "turtwig" || selectedStarter === "1") {
                    cancel = true;
                    selectedStarter = "Turtwig";
                } else if (selectedStarter === "chimchar" || selectedStarter === "2") {
                    cancel = true;
                    selectedStarter = "Chimchar";
                } else if (selectedStarter === "piplup" || selectedStarter === "3") {
                    cancel = true;
                    selectedStarter = "Piplup";
                } else {
                    message.channel.send(name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection.");
                    selectedStarter = null;
                }
            } else if (region === "Unova") {
                if (selectedStarter === "snivy" || selectedStarter === "1") {
                    cancel = true;
                    selectedStarter = "Snivy";
                } else if (selectedStarter === "tepig" || selectedStarter === "2") {
                    cancel = true;
                    selectedStarter = "Tepig";
                } else if (selectedStarter === "oshawott" || selectedStarter === "3") {
                    cancel = true;
                    selectedStarter = "Oshawott";
                } else {
                    message.channel.send(name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection.");
                    selectedStarter = null;
                }
            } else if (region === "Kalos") {
                if (selectedStarter === "chespin" || selectedStarter === "1") {
                    cancel = true;
                    selectedStarter = "Chespin";
                } else if (selectedStarter === "fennekin" || selectedStarter === "2") {
                    cancel = true;
                    selectedStarter = "Fennekin";
                } else if (selectedStarter === "froakie" || selectedStarter === "3") {
                    cancel = true;
                    selectedStarter = "Froakie";
                } else {
                    message.channel.send(name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection.");
                    selectedStarter = null;
                }
            } else if (region === "Alola") {
                if (selectedStarter === "rowlet" || selectedStarter === "1") {
                    cancel = true;
                    selectedStarter = "Rowlet";
                } else if (selectedStarter === "litten" || selectedStarter === "2") {
                    cancel = true;
                    selectedStarter = "Litten";
                } else if (selectedStarter === "popplio" || selectedStarter === "3") {
                    cancel = true;
                    selectedStarter = "Popplio";
                } else {
                    message.channel.send(name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection.");
                    selectedStarter = null;
                }
            } else {
                message.channel.send(name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection.");
                selectedStarter = null;
            }
        } else {
            selectedStarter = null;
        }
    }
    return new Promise(function(resolve) {
        resolve(selectedStarter);
    });
}

/**
 * Sends messages asking the user to select a starting region.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {string} The name of the region selected by the user,
 * otherwise null if the user did not select a region.
 */
async function selectRegion(message) {
    message.channel.send(message.author.username + ", please select a region to start in by either typing its number in the list or its name:\n```1. Kanto\n2. Johto\n3. Hoenn\n4. Sinnoh\n5. Unova\n6. Kalos\n7. Alola```\nBe aware that you will not immediately be able to change regions. Type \"cancel\" to cancel region selection.");
    
    var cancel = false;
    var selectedRegion = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
        .then(collected => {
            selectedRegion = collected.first().content.toString().toLowerCase();
        })
        .catch(collected => {
            selectedRegion = null;
            cancel = true;
        });
        
        if (selectedRegion === "cancel") {
            cancel = true;
            selectedRegion = null;
        } else if (selectedRegion === "kanto" || selectedRegion === "1") {
            cancel = true;
            selectedRegion = "Kanto";
        } else if (selectedRegion === "johto" || selectedRegion === "2") {
            cancel = true;
            selectedRegion = "Johto";
        } else if (selectedRegion === "hoenn" || selectedRegion === "3") {
            cancel = true;
            selectedRegion = "Hoenn";
        } else if (selectedRegion === "sinnoh" || selectedRegion === "4") {
            cancel = true;
            selectedRegion = "Sinnoh";
        } else if (selectedRegion === "unova" || selectedRegion === "5") {
            cancel = true;
            selectedRegion = "Unova";
        } else if (selectedRegion === "kalos" || selectedRegion === "6") {
            cancel = true;
            selectedRegion = "Kalos";
        } else if (selectedRegion === "alola" || selectedRegion === "7") {
            cancel = true;
            selectedRegion = "Alola";
        } else if (selectedRegion != null) {
            message.channel.send(message.author.username + " selected an invalid region. Please select a region by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection.");
            selectedRegion = null;
        } else {
            selectedRegion = null;
        }
    }
    return new Promise(function(resolve) {
        resolve(selectedRegion);
    });
}

/**
 * Changes a user's region if the user is not already in that region.
 * The user's location is also changed to the default location of
 * that region. The user must own a visa for a region to travel to it.
 * 
 * @param {Message} message The Discord message sent from the user/
 * @param {string} regionName The lowercase name of the region.
 * 
 * @returns {boolean} False if any errors are encountered,
 * otherwise true.
 */
async function setRegion(message, regionName) {
    var region = regionName.toLowerCase();
    if (region === "kanto") {
        region = "Kanto";
    } else if (region === "johto") {
        region = "Johto";
    } else if (region === "hoenn") {
        region = "Hoenn";
    } else if (region === "sinnoh") {
        region = "Sinnoh";
    } else if (region === "unova") {
        region = "Unova";
    } else if (region === "kalos") {
        region = "Kalos";
    } else if (region === "alola") {
        region = "Alola";
    } else {
        return false;
    }
    let user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    let bag = await getBag(message.author.id);
    if (bag === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    if (region === user.region) {
        message.channel.send(message.author.username + " you are already in the " + region + " region.");
        return new Promise(function(resolve) {
            resolve(false);
        });
    } else {
        let doesUserHaveIt = bag.map(function(t) { return t.name; }).indexOf(region + " Visa");
        return new Promise(function(resolve) {
            if (doesUserHaveIt >= 0 ) {
                let loc = getDefaultLocationOfRegion(region);
                let query = "UPDATE user SET region = ?, location = ? WHERE user.user_id = ?";
                con.query(query, [region, loc, message.author.id], function(err) {
                    if (err) {
                        console.error(err);
                        resolve(false);
                    } else {
                        message.channel.send(message.author.username + " traveled to the " + region + " region! You are now located at " + loc + ".");
                        resolve(true);
                    }
                });
            } else {
                message.channel.send(message.author.username + " you must obtain a " + region + " Visa before you can travel to " + region + ".");
                resolve(true);
            }
        });
    }
}

/**
 * Changes a user's location if the user was not already at
 * that location. The location must be in the user's current
 * region.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} name The lowercase name of the location.
 * 
 * @returns {boolean} False if any errors are encountered,
 * otherwise true.
 */
async function setLocation(message, locationName) {
    let user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    let region = user.region;
    if (region == null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    let loc = getFullLocationName(region, locationName);
    return new Promise(function(resolve) {
        if (loc != null) {
            let query = "UPDATE user SET location = ?, field = 'Walking' WHERE user.user_id = ?";
            con.query(query, [loc, message.author.id], function(err) {
                if (err) {
                    console.log(err);
                    resolve(false);
                } else {
                    message.channel.send(message.author.username + " is now walking at " + loc + ".");
                    resolve(true);
                }
            });
        } else {
            message.channel.send(message.author.username + " failed to go to " + locationName + ". " + duck);
            resolve(true);
        }
    });
}

/**
 * Sends a message containing all location names within the
 * user's current region.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} False if errors are encountered, otherwise
 * true.
 */
async function printAllLocations(message) {
    let user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    let region = user.region;
    if (region == null) {
        console.error("[ERROR] printAllLocations(): User " + message.author.id + " has a null region!");
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    let path = generateRegionJSONPath(region);
    let data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.error(err);
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    region = JSON.parse(data);

    let i;
    let fields = [];
    let fieldsCount = 0;
    let string = null;
    for (i = 0; i < region.locations.length; i++) {
        if (string == null) {
            string = region.locations[i].names.en;
        } else if (i % 20 === 0) {
            let name = "Locations";
            if (fieldsCount > 0) {
                name = "Locations (cont.)";
            }
            fields[fieldsCount] = {
                "name": name,
                "value": string,
                "inline": true
            }
            string = region.locations[i].names.en;
            fieldsCount++;
        }else {
            string += "\n" + region.locations[i].names.en;
        }
    }

    if (string != null) {
        let name = "Locations";
            if (fieldsCount > 0) {
                name = "Locations (cont.)";
            }
            fields[fieldsCount] = {
                "name": name,
                "value": string,
                "inline": true
            }
    }

    let embed = {
        "author": {
            "name": "The " + user.region + " Region"
        },
        "fields": fields
    };

    let messageSent = true;
    await message.channel.send({embed})
    .catch(err => {
        console.error("[ERROR] Failed to send Locations message - " + err);
        messageSent = false;
    });

    return new Promise(function(resolve) {
        resolve(messageSent);
    });
}

/**
 * Sends a message containing information about where
 * the user is located.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} False if errors are encountered, otherwise
 * true.
 */
async function printLocation(message) {
    let user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    let region = user.region;
    let location = user.location;
    
    let image = generateLocationImagePath(region, location);
    let field = "Walking in the grass.";
    if (user.field === "Rock Smash") {
        field = "Smashing rocks into pieces.";
    } else if (user.field === "Headbutt") {
        field = "Headbutting trees to shake them up."
    } else if (user.field.includes("Rod")) {
        if (user.field === "Old Rod") {
            field = "Fishing with an " + user.field + ".";
        } else {
            field = "Fishing with a " + user.field + ".";
        }
    } else if (user.field === "Surfing") {
        field = "Surfing over the water."
    } else if (user.field === "Dive") {
        field = "Diving under the sea."
    }

    let embed = {
        "author": {
            "name":  message.author.username + "'s Location"
        },
        "image": {
            "url": "attachment://location.png"
        },
        "fields": [
            {
                "name":  "\u200b",
                "value": "**Region:** " + region + "\n**Location:** " + location + "\n*" + field + "*",
                "inline": false
            }
        ]
    };

    let messageSent = true;
    await message.channel.send({embed, files: [{ attachment: image, name: "location.png" }] })
    .catch(err => {
        console.error("[ERROR] Failed to send Where message - " + err);
        messageSent = false;
    });

    return new Promise(function(resolve) {
        resolve(messageSent);
    });
}

/**
 * Gets the full name of a location based on a partial name,
 * if it exists.
 * 
 * @param {string} region The name of the region where the desired
 * location is at.
 * @param {string} name The partial name of a location.
 * 
 * @returns {string} The full name of a location, or null
 * if the location does not exist.
 */
function getFullLocationName(region, name) {
    var path = generateRegionJSONPath(region);
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    var list = JSON.parse(data);
    
    var locationName = name.toLowerCase();
    var i;
    for (i = 0; i < list.locations.length; i++) {
        var loc = list.locations[i].names.en.toLowerCase();
        if (~loc.indexOf(locationName)) {
            return list.locations[i].names.en;
        }
    }
    return null;
}

/**
 * Gets the default location of a region for when a user either
 * travels to that region or begins their adventure in that region.
 * 
 * @param {string} region The name of the region in which the default
 * location is requested.
 * 
 * @returns {string} The default location of a region.
 */
function getDefaultLocationOfRegion(region) {
    if (region === null) {
        return null;
    } else if (region === "Kanto") {
        return "Pallet Town";
    } else if (region === "Johto") {
        return "New Bark Town";
    } else if (region === "Hoenn") {
        return "Littleroot Town";
    } else if (region === "Sinnoh") {
        return "Twinleaf Town";
    } else if (region === "Unova") {
        return "Aspertia City";
    } else if (region === "Kalos") {
        return "Vaniville Town";
    } else { //alola
        return "Route 1"; //aka Hau'oli outskirts
    }
}

/**
 * Gets the names of the most recent games that take place
 * in a specified region.
 * 
 * @param {string} region The name of the region.
 * 
 * @returns {string[]} The pair of most recent games that took place in the specified region.
 */
function getDefaultGamesOfRegion(region) {
    var arr = [" ", " "];
    if (region === "Kanto") {
        arr[0] = "FireRed";
        arr[1] = "LeafGreen";
        return arr;
    } else if (region === "Johto") {
        arr[0] = "HeartGold";
        arr[1] = "SoulSilver";
        return arr;
    } else if (region === "Hoenn") {
        arr[0] = "Omega Ruby";
        arr[1] = "Alpha Sapphire";
        return arr;
    } else if (region === "Sinnoh") {
        arr[0] = "Diamond";
        arr[1] = "Pearl";
        return arr;
    } else if (region === "Unova") {
        arr[0] = "Black 2";
        arr[1] = "White 2";
        return arr;
    } else if (region === "Kalos") {
        arr[0] = "X";
        arr[1] = "Y";
        return arr;
    } else { //alola
        arr[0] = "Ultra Sun";
        arr[1] = "Ultra Moon";
        return arr;
    }
}

/**
 * Gets the user's lead Pokemon.
 * 
 * @param {string} userid The Discord id of the user.
 * 
 * @returns {Pokemon} The user's lead Pokemon if they have one,
 * otherwise null.
 */
function getLeadPokemon(userid) {
    return new Promise(function(resolve) {
        var query_str = 'SELECT user.lead FROM user WHERE user_id = ?';

        con.query(query_str, userid, function (err, rows) {
            if (err) {
                console.log(err);
                return resolve(null);
            }
            var p_id = rows[0].lead;
            query_str2 = 'SELECT * FROM pokemon WHERE pokemon_id = ?';

            con.query(query_str2, p_id, function (err, rows2) {
                if (err) {
                    console.log(err);
                    return resolve(null);
                }
                resolve(rows2[0]);
            });
        });
    });
}

/**
 * Gets a user's evolving Pokemon. A user should only have
 * at most one evolving Pokemon at any given time.
 * 
 * @param {string} userid The Discord id of the user.
 * 
 * @returns {Pokemon} The user's evolving Pokemon,
 * or null if the user does not have an evolving Pokemon.
 */
async function getEvolvingPokemon(userid) {
    return new Promise(function(resolve) {
        var query_str = 'SELECT * FROM pokemon WHERE pokemon.evolving = 1 AND pokemon.current_trainer = ?';
        con.query(query_str, [userid], function (err, rows) {
            if (err) {
                console.log(err);
                resolve(null);
            }
            resolve(rows[0]);
        });
    });
}

/**
 * Gets a Discord user who uses Pokebot.
 * 
 * @param {string} userid The Discord id of the user.
 * 
 * @returns {User} The User object of the requested user,
 * or null if the user doesn't exist in the database.
 */
async function getUser(userid) {
    return new Promise(function(resolve) {
        var query_str = 'SELECT * FROM user, user_prefs WHERE user.user_id = ? AND user_prefs.user_id = ?';
        con.query(query_str, [userid, userid], function (err, rows) {
            if (err) {
                console.log(err);
                resolve(null);
            }
            if (!rows.length) {
                resolve(null);
            }
            resolve(rows[0]);
        });
    });
}

/**
 * Gets all items owned by a user.
 * 
 * @param {string} userid The Discord id of the user.
 * 
 * @returns {Item[]} All items owned by a user, or null
 * if no items were found.
 */
async function getBag(userid) {
    return new Promise(function(resolve) {
        var query_str = 'SELECT * FROM item WHERE item.owner = ? AND item.quantity > 0';
        con.query(query_str, userid, function (err, rows) {
            if (err) {
                console.log(err);
                resolve(null);
            }
            resolve(rows);
        });
    });
}

/**
 * Gets all Pokemon owned by a user.
 * 
 * @param {string} userid The Discord id of the user.
 * 
 * @returns {Pokemon[]} A list of all Pokemon currently owned
 * by the user.
 */
async function getPokemon(userid) {
    return new Promise(function(resolve) {
        var query_str = 'SELECT * FROM pokemon WHERE current_trainer = ? AND pokemon.storage IS NULL';
        con.query(query_str, userid, function (err, rows) {
            if (err) {
                console.log(err);
                resolve(null);
            }
            resolve(rows);
        });
    });
}

/**
 * Gets all Pokemon owned by a user that are currently
 * in the day care.
 * 
 * @param {string} userid The Discord id of the user.
 * 
 * @returns {Pokemon[]} A list of all the user's Pokemon
 * that are currently in the day care.
 */
async function getDaycare(userid) {
    return new Promise(function(resolve) {
        var query_str = 'SELECT * FROM pokemon WHERE current_trainer = ? AND pokemon.storage = "daycare"';
        con.query(query_str, userid, function (err, rows) {
            if (err) {
                console.log(err);
                resolve(null);
            }
            resolve(rows);
        });
    });
}

/**
 * Gets all Pokemon that are currently evolving and adds them to the
 * global evolving list. This prevents evolutions from breaking if the
 * bot shuts down while a Pokemon is evolving.
 * 
 * @returns {boolean} True if all evolving Pokemon were added to the
 * evolving list, otherwise false.
 */
async function fixEvolutions() {
    let wereAllEvolutionsFixed = true;
    var query_str = 'SELECT * FROM pokemon WHERE pokemon.evolving = 1';
    await con.query(query_str, async function (err, pokemon) {
        if (err) {
            console.log(err);
            wereAllEvolutionsFixed = false;
        }
        var i;
        for (i = 0; i < pokemon.length; i++) {
            if (pokemon[i].evolving === 1) {
                var user = await getUser(pokemon[i].current_trainer);
                if (user === null) {
                    wereAllEvolutionsFixed = false;
                }
                var to = await checkEvolve(user, pokemon, "level", null);
                evolving[evolving.length] = new Evolution(pokemon[i].current_trainer, pokemon[i].name, to);
            }
        }
    });

    return new Promise(function(resolve) {
        resolve(wereAllEvolutionsFixed);
    });
}

/**
 * Gets all Poke Balls owned by a user, including
 * Great Balls, Net Balls, etc.
 * 
 * @param {string} userid The Discord id of the user.
 * 
 * @returns {Item[]} All Poke Balls owned by a user.
 */
async function getBalls(userid) {
    return new Promise(function(resolve) {
        var query_str = `SELECT * FROM pokebot.item WHERE owner = ? AND category = "Ball" AND quantity > 0;`;
        con.query(query_str, [userid], function (err, rows) {
            if (err) {
                console.error(err);
                resolve(null);
            }
            resolve(rows);
        });
    });
}

/**
 * Gets all fishing rods owned by a user.
 * 
 * @param {string} userid The Discord id of the user.
 * 
 * @returns {Item[]} All fishing rods owned by the user.
 */
async function getRods(userid) {
    return new Promise(function(resolve) {
        var query_str = `SELECT * FROM pokebot.item WHERE owner = ? AND category = "Key" AND name LIKE '% Rod' AND quantity > 0;`;
        con.query(query_str, [userid], function (err, rows) {
            if (err) {
                console.error(err);
                resolve(null);
            }
            resolve(rows);
        });
    });
}

/**
 * Gets an item from the item table in the database.
 * 
 * @param {string} itemid The primary key of the item.
 * 
 * @returns {Item} The item with the specified id, or
 * null if there is no item with that id.
 */
async function getItem(itemid) {
    return new Promise(function(resolve) {
        var query_str = 'SELECT * FROM item WHERE item.item_id = ?';
        con.query(query_str, [itemid], function (err, rows) {
            if (err) {
                console.error(err);
                resolve(null);
            } else if (rows.length < 1) {
                resolve(null);
            } else {
                resolve(rows[0]);
            }
        });
    });
}

/**
 * Changes a list of move objects into a list of just the move names.
 * 
 * @param {Move[]} moves The list of moves to convert.
 * 
 * @returns {string[]} The name of each move in the same order as the objects were.
 */
function convertMovesObjectToNames(moves) {
    let i = 0;
    for (i; i < moves.length; i++) {
        moves[i] = moves[i].name;
    }
    return moves;
}

/**
 * Sets a user's field (walking, surfing, diving, etc).
 * 
 * @param {Message} message The Discord message sent from the user
 * @param {string} field The name of the field to set the user to.
 * 
 * @returns {boolean} True if the user's field was changed.
 */
async function setField(message, field) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    var lead = await getLeadPokemon(user.user_id);
    if (lead === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    var rods = await getRods(user.user_id);
    if (rods === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var locationData;
    var rpath = generateLocationJSONPath(user.region, user.location);
    var rdata;
    try {
        rdata = fs.readFileSync(rpath, "utf8");
        locationData = JSON.parse(rdata);
    } catch (err) {
        locationData = null;
    }

    let moves = await getPokemonKnownMoves(lead.pokemon_id);
    moves = convertMovesObjectToNames(moves);
    
    var curField = user.field;
    var canSurf = false;
    if (field === "Walking") {
        if (curField === "Walking") {
            message.channel.send(message.author.username + " you are already walking.");
            return false;
        } else {
            var query = "UPDATE user SET field = ? WHERE user.user_id = ?";
            con.query(query, [field, message.author.id], function(err) {
                if (err) {
                    console.log(err);
                    message.channel.send(message.author.username + " failed to walk.");
                    return false;
                } else {
                    message.channel.send(message.author.username + " is now walking.");
                    return true;
                }
            });
        }
    } else if (field === "Surfing") {
        if (curField === "Surfing") {
            message.channel.send(message.author.username + " you are already surfing.");
            return false;
        } else if (locationData == null) {
            message.channel.send(message.author.username + " you cannot surf here.");
            return false;
        } else {
            if (moves.indexOf("Surf") >= 0) {
                var i;
                for (i = 0; i < locationData.pokemon.length; i++) {
                    var a;
                    for (a = 0; a < locationData.pokemon.length; a++) {
                        if (locationData.pokemon[a].field === "Surfing") {
                            canSurf = true;
                            i = locationData.pokemon.length;
                        }
                    }
                }
                if (canSurf) {
                    var query = "UPDATE user SET field = ? WHERE user.user_id = ?";
                    con.query(query, [field, message.author.id], function(err) {
                        if (err) {
                            console.log(err);
                            message.channel.send(message.author.username + " failed to surf.");
                            return false;
                        } else {
                            message.channel.send(message.author.username + " is now surfing.");
                            return true;
                        }
                    });
                } else {
                    message.channel.send(message.author.username + " you cannot surf here.");
                    return false;
                }
            } else {
                message.channel.send(message.author.username + " your lead Pokémon must know the move Surf!");
                return false;
            }
        }
    } else if (field === "Dive") {
        if (curField === "Dive") {
            message.channel.send(message.author.username + " you are already diving.");
            return false;
        } else if (locationData == null) {
            message.channel.send(message.author.username + " you cannot dive here.");
            return false;
        } else {
            if (moves.indexOf("Dive") >= 0) {
                var i;
                for (i = 0; i < locationData.pokemon.length; i++) {
                    var a;
                    for (a = 0; a < locationData.pokemon.length; a++) {
                        if (locationData.pokemon[a].field === "Dive") {
                            canSurf = true;
                            i = locationData.pokemon.length;
                        }
                    }
                }
                if (canSurf) {
                    var query = "UPDATE user SET field = ? WHERE user.user_id = ?";
                    con.query(query, [field, message.author.id], function(err) {
                        if (err) {
                            console.log(err);
                            message.channel.send(message.author.username + " failed to dive.");
                            return false;
                        } else {
                            message.channel.send(message.author.username + " is now diving.");
                            return true;
                        }
                    });
                } else {
                    message.channel.send(message.author.username + " you cannot dive here.");
                    return false;
                }
            } else {
                message.channel.send(message.author.username + " your lead Pokémon must know the move Dive!");
                return false;
            }
        }
    } else if (field === "Headbutt") {
        if (curField === "Headbutt") {
            message.channel.send(message.author.username + " you are already headbutting trees.");
            return false;
        } else if (locationData == null) {
            message.channel.send(message.author.username + " there are no trees worth headbutting here.");
            return false;
        } else {
            if (moves.indexOf("Headbutt") >= 0) {
                var i;
                for (i = 0; i < locationData.pokemon.length; i++) {
                    var a;
                    for (a = 0; a < locationData.pokemon.length; a++) {
                        if (locationData.pokemon[a].field === "Headbutt") {
                            canSurf = true;
                            i = locationData.pokemon.length;
                        }
                    }
                }
                if (canSurf) {
                    var query = "UPDATE user SET field = ? WHERE user.user_id = ?";
                    con.query(query, [field, message.author.id], function(err) {
                        if (err) {
                            console.log(err);
                            message.channel.send(message.author.username + " failed to headbutt any trees.");
                            return false;
                        } else {
                            message.channel.send(message.author.username + " is now headbutting trees.");
                            return true;
                        }
                    });
                } else {
                    message.channel.send(message.author.username + " there are no trees worth headbutting here.");
                    return false;
                }
            } else {
                message.channel.send(message.author.username + " your lead Pokémon must know the move Headbutt!");
                return false;
            }
        }
    } else if (field === "Rock Smash") {
        if (curField === "Rock Smash") {
            message.channel.send(message.author.username + " you are already smashing rocks.");
            return false;
        } else if (locationData == null) {
            message.channel.send(message.author.username + " there are no rocks worth smashing here.");
            return false;
        } else {
            if (moves.indexOf("Rock Smash") >= 0) {
                var i;
                for (i = 0; i < locationData.pokemon.length; i++) {
                    var a;
                    for (a = 0; a < locationData.pokemon.length; a++) {
                        if (locationData.pokemon[a].field === "Rock Smash") {
                            canSurf = true;
                            i = locationData.pokemon.length;
                        }
                    }
                }
                if (canSurf) {
                    var query = "UPDATE user SET field = ? WHERE user.user_id = ?";
                    con.query(query, [field, message.author.id], function(err) {
                        if (err) {
                            console.log(err);
                            message.channel.send(message.author.username + " failed to smash any rocks.");
                            return false;
                        } else {
                            message.channel.send(message.author.username + " is now smashing rocks.");
                            return true;
                        }
                    });
                } else {
                    message.channel.send(message.author.username + " there are no rocks worth smashing here.");
                    return false;
                }
            } else {
                message.channel.send(message.author.username + " your lead Pokémon must know the move Rock Smash!");
                return false;
            }
        }
    } else if (field === "Fish") {
        var rodFound = false;
        var selectedRod;
        var canFish = false;
        var rod_count;
        var unusedRods = [];
        for (rod_count = 0; rod_count < rods.length; rod_count++) {
            unusedRods[unusedRods.length] = rods[rod_count].name;
            rodFound = true;
        }
        if (unusedRods.length < 1) {
            if (rodFound) {
                message.channel.send(message.author.username + " you are already fishing with a " + user.field + ".");
                return false;
            } else {
                message.channel.send(message.author.username + " you do not own any fishing rods.");
                return false;
            }
        } else if (unusedRods.length === 1){
            selectedRod = unusedRods[0];
        } else if (unusedRods.length > 1) {
            transactions[transactions.length] = new Transaction(message.author.id, "selecting a fishing rod");
            var input = null;
            var cancel = false;
            var string = (message.author.username + " you have multiple fishing rods. Please select a rod from the list below by typing its name or number as shown in the list, or type \"Cancel\" to stop selecting a rod.\n ```");
            for (i = 0; i < rods.length; i++) {
                string += ((i + 1).toString() + ". " + rods[i].name + "\n");
            }
            string += "```";
            
            message.channel.send(string);

            while (cancel == false) {
                await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
                .then(collected => {
                    input = collected.first().content.toString().toLowerCase();
                })
                .catch(collected => {
                    input = "cancel";
                    cancel = true;
                });
                if (input === "cancel") {
                    cancel = true;
                    input = null
                } else if (/^\d+$/.test(input)) {
                    var num = Number(input);
                    if (num > 0 && num <= rods.length) {
                        cancel = true;
                        input = (num - 1);
                    } else {
                        message.channel.send("Number is out of range. " + string);
                        input = null;
                    }
                } else if (input != null) {
                    var a;
                    var match = false;
                    for (a = 0; a < rods.length; a++) {
                        if (rods[a].name.toLowerCase() === input) {
                            input = a;
                            match = true;
                            cancel = true;
                        }
                    }
                    if (!match) {
                        message.channel.send("Choice not recognized. " + string);
                        input = null;
                    }
                } else {
                    input = null;
                }
            }
            
            removeTransaction(message.author.id);
            
            if (input == null) {
                message.channel.send(message.author.username + " cancelled their fishing rod selection.");
                return false;
            } else {
                selectedRod = rods[input].name;
            }
        } else {
            message.channel.send(message.author.username + " your don't have any fishing rods!");
            return false;
        }
        
        
        if (locationData == null) {
            message.channel.send(message.author.username + " there are no Pokémon to fish for here.");
            return false;
        }
        var a;
        for (a = 0; a < locationData.pokemon.length; a++) {
            if (locationData.pokemon[a].field === selectedRod) {
                canFish = true;
            }
        }
        
        if (canFish) {
            var query = "UPDATE user SET field = ? WHERE user.user_id = ?";
            con.query(query, [selectedRod, message.author.id], function(err) {
                if (err) {
                    console.log(err);
                    message.channel.send(message.author.username + " failed to fish.");
                    return false;
                } else {
                    message.channel.send(message.author.username + " is now fishing with the " + selectedRod + ".");
                    return true;
                }
            });
        } else {
            message.channel.send(message.author.username + " there are no Pokémon to fish for here using the " + selectedRod + ".");
            return false;
        }
    }
}

/**
 * Asks a user if they want to nickname a Pokemon.
 * Prompts to the user to input a nickname if the user complies.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} name The regular name of the Pokemon species
 * that is being nicknamed.
 * 
 * @returns {string} The nickname of the Pokemon as input by
 * the user, or the Pokemon's regular name if the user opts
 * out of nicknaming the Pokemon.
 */
async function nicknamePokemon(message, name) {
    await message.channel.send(message.author.username + " would you like to nickname your " + name + "? Type \"Yes\" to enter a nickname or \"No\" to keep its current name.");
    var cancel = false;
    var input = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
        .then(collected => {
            input = collected.first().content.toString().toLowerCase();
        })
        .catch(collected => {
            input = "cancel";
            cancel = true;
        });

        if (input === "no" || input === "cancel") {
            cancel = true;
            input = 0;
        } else if (input === "yes") {
            cancel = true;
            input = 1;
        } else if (input != null) {
            message.channel.send(message.author.username + ", your response was not recognized. Type \"Yes\" to enter a nickname for " + name + " or \"No\" to keep its current name.");
            input = null;
        } else {
            input = 0;
        }
    }
    
    if (input < 1) {
        await message.channel.send(message.author.username + " decided not to nickname their " + name + ".");
        return name;
    }
    
    await message.channel.send(message.author.username + " enter the nickname of the " + name + " you just received. Type its name exactly how you want it to be nicknamed, or type its current name to cancel the nicknaming. The nickname cannot be longer than 20 characters and must not be empty.");
    cancel = false;
    input = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
        .then(collected => {
            input = collected.first().content.toString();
        })
        .catch(collected => {
            input = null;
            cancel = true;
        });
        
        if (input != null) {
            input = input.trim();
            if (input === name) {
                message.channel.send(message.author.username + " decided not to nickname their " + name + ".");
                cancel = true;
            } else if (input.length > 0 && input.length <= 20) {
                cancel = true;
            } else if (input.length <= 0 || input.length > 20) {
                message.channel.send(message.author.username + ", your nickname was not valid. Enter the nickname of the " + name + " you just received. Type its name exactly how you want it to be nicknamed, or type its current name to cancel the nicknaming. The nickname cannot be longer than 20 characters and must not be empty.");
                input = null;
            } else {
                input = null;
            }
        }
    }
    
    if (input == null) {
        return name;
    } else {
        await message.channel.send(message.author.username + " nicknamed their " + name + " '" + input + "'.");
        return input;
    }
}

/**
 * Gets the base Power Points of a move.
 * 
 * @param {string} moveName The name of the move.
 * 
 * @returns {number} The base Power Points of the move,
 * or null if an error was encountered.
 */
function getMovePP(moveName) {
    moveName = moveName.toLowerCase();
    if (moveName === "10000000 volt thunderbolt" || moveName === "10,000,000 volt thunderbolt") {
        moveName = "10 000 000 volt thunderbolt";
    }
    
    moveName = moveName.replace(/-/g,"_");
    moveName = moveName.replace(/'/g,"_");
    moveName = moveName.replace(/ /g,"_");
    
    var path = "../data/move/" + moveName + ".json";
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        return null;
    }
    
    var move = JSON.parse(data);
    return move.pp;
}

/**
 * Updates a user's Pokedex string by setting an index
 * of that string to '`1`'.
 * 
 * @todo Check if user already has the Pokemon registered in their
 * Pokedex. This will save time by preventing both the substring call
 * and the database query.
 * 
 * @param {User} user The Pokebot user whose Pokedex is being updated.
 * @param {number} dexNum The national Pokedex number of the Pokemon
 * being added to the user's Pokedex.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
function addToPokedex(user, dexNum) {
    user.pokedex = user.pokedex.substring(0, dexNum) + '1' + user.pokedex.substring(dexNum + 1);
    var query = "UPDATE user SET user.pokedex = ? WHERE user.user_id = ?";
    con.query(query, [user.pokedex, user.user_id], function (err) {
        if (err) {
            console.log(err);
        }
    });
}

/**
 * Inserts a new Pokemon into the database.
 * 
 * @param {string} userid The id of the user who owns the Pokemon.
 * @param {Pokemon} pokemon The Pokemon object to insert into the database. 
 * 
 * @returns {number} The database id of the Pokemon.
 */
async function addPokemon(userid, pokemon) {
    var movePP = [null, null, null, null];
    if (pokemon.moves[0] != null) {
        movePP[0] = getMovePP(pokemon.moves[0]);
    }
    if (pokemon.moves[1] != null) {
        movePP[1] = getMovePP(pokemon.moves[1]);
    }
    if (pokemon.moves[2] != null) {
        movePP[2] = getMovePP(pokemon.moves[2]);
    }
    if (pokemon.moves[3] != null) {
        movePP[3] = getMovePP(pokemon.moves[3]);
    }

    let national_id = pokemon.no.toString();
    while (national_id.length < 3) {
        national_id = '0' + national_id;
    }
    let pokemon_set = {
        original_trainer: userid.toString(),
        current_trainer: userid.toString(),
        number: national_id,
        name: pokemon.name,
        nickname: pokemon.nick,
        region: pokemon.region,
        location: pokemon.location,
        date: pokemon.date,
        ball: pokemon.caughtIn,
        level_caught: pokemon.level,
        level_current: pokemon.level,
        xp: pokemon.totalxp,
        friendship: pokemon.friendship,
        stat_hp: pokemon.stats[0],
        iv_hp: pokemon.IVs[0],
        ev_hp: pokemon.EVs[0],
        stat_atk: pokemon.stats[1],
        iv_atk: pokemon.IVs[1],
        ev_atk: pokemon.EVs[1],
        stat_def: pokemon.stats[2],
        iv_def: pokemon.IVs[2],
        ev_def: pokemon.EVs[2],
        stat_spatk: pokemon.stats[3],
        iv_spatk: pokemon.IVs[3],
        ev_spatk: pokemon.EVs[3],
        stat_spdef: pokemon.stats[4],
        iv_spdef: pokemon.IVs[4],
        ev_spdef: pokemon.EVs[4],
        stat_spd: pokemon.stats[5],
        iv_spd: pokemon.IVs[5],
        ev_spd: pokemon.EVs[5],
        type_1: pokemon.type[0],
        type_2: pokemon.type[1],
        item: pokemon.item,
        ability: pokemon.ability,
        ability_slot: pokemon.abilitySlot,
        gender: pokemon.gender,
        nature: pokemon.nature,
        form: pokemon.form,
        status: pokemon.status,
        shiny: pokemon.shiny,
        lead: pokemon.lead,
        evolving: pokemon.evolving,
        personality: pokemon.pv
    }

    let newPokemon = await doQuery("INSERT INTO pokemon SET ?", [pokemon_set]);
    let i = 0;
    for (i; i < pokemon.moves.length; i++) {
        if (pokemon.moves[i] != null) {
            let move_set = {
                pokemon: newPokemon.insertId,
                name: pokemon.moves[i],
                max_pp: movePP[i],
                current_pp: movePP[i],
                known: 1
            }
            await doQuery("INSERT INTO move SET ?", [move_set]);
        }
    }

    return new Promise(function(resolve) {
        resolve(newPokemon.insertId);
    });
}

/**
 * Gets a usable item from a user's bag.
 * 
 * @param {Item[]} bag The user's items to search from.
 * @param {string} item The name of the usable item to
 * search for.
 * 
 * @returns {Item} The usable item if the user owns it,
 * otherwise null.
 */
function doesUserHaveUsableItem(bag, item) {
    item = item.toLowerCase();
    
    var isLetters = /^\d+$/.test(item);
    
    if (!isLetters) {
        var i;
        for (i = 0; i < bag.length; i++) {
            var lowerItem = bag[i].name.toLowerCase();
            if(lowerItem === item && (bag[i].category === "Item" || bag[i].category === "TM")) {
                return bag[i];
            }
        }
    } else {
        if (item <= bag.length && bag[item].holdable === 1 && (bag[item].category === "Item" || bag[item].category === "TM") && bag[item].category != "Key") {
            return bag[item];
        } else {
            return null;
        }
    }
    return null;
}

/**
 * Gets a holdable item from a user's bag.
 * 
 * @param {Item[]} bag The user's items to search from.
 * @param {string} item The name of the holdable item to
 * search for.
 * 
 * @returns {Item} The holdable item if the user owns it,
 * otherwise null.
 */
function doesUserHaveHoldableItem(bag, item) {
    item = item.toLowerCase();
    
    var isLetters = /^\d+$/.test(item);
    
    if (!isLetters) {
        var i;
        for (i = 0; i < bag.length; i++) {
            var lowerItem = bag[i].name.toLowerCase();
            if(lowerItem === item && bag[i].holdable === 1 && (bag[i].category === "Item" || bag[i].category === "TM" || bag[i].category === "Ball")) {
                return bag[i];
            }
        }
    } else {
        if (item <= bag.length && bag[item].holdable === 1 && (bag[item].category === "Item" || bag[item].category === "TM")) {
            return bag[item];
        } else {
            return null;
        }
    }
    return null;
}

/**
 * Inserts a certain quantity of one item into a user's bag.
 * 
 * @param {string} userid The Discord id of the user.
 * @param {string} itemName The name of the item being added.
 * @param {number} amount The quantity of the item being added.
 * @param {boolean} isHoldable If the item can be held by a Pokemon.
 * @param {string} cat The category of the item being added (key, medicine, etc).
 * 
 * @returns {boolean} True if the item was added to the user's bag.
 */
function addItemToBag(userid, itemName, amount, isHoldable, cat) {
    return new Promise(function(resolve) {
        var query = "SELECT * from item WHERE item.owner = ? AND item.name = ?";
        con.query(query, [userid, itemName], function (err, bag) {
            if (err) {
                resolve(false);
            }
            if (bag.length < 1) {
                var hold = 0;
                if (isHoldable) {
                    hold = 1;
                }
                var set = {
                    owner: userid,
                    name: itemName,
                    quantity: amount,
                    holdable: hold,
                    category: cat
                }
                var newQuery = "INSERT INTO item SET ?";
                con.query(newQuery, set, function(err) {
                    if (err) {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                });
            } else {
                var quantity = bag[0].quantity + amount;
                var newQuery = "UPDATE item SET quantity = ? WHERE item.owner = ? AND item.name = ?";
                con.query(newQuery, [quantity, userid, itemName], function(err) {
                    if (err) {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                });
            }
        });
    });
}

/**
 * Removes a certain quantity of one item from a user's bag.
 * 
 * @param {string} userid The Discord id of the user.
 * @param {string} itemName The name of the item being added.
 * @param {number} amount The quantity of the item being added.
 * 
 * @returns {boolean} True if the item was removed from the user's bag.
 */
function removeItemFromBag(userid, itemName, amount) {
    return new Promise(function(resolve, reject) {
        var query = "SELECT * from item WHERE item.owner = ? AND item.name = ? AND item.quantity > 0";
        con.query(query, [userid, itemName], function (err, bag) {
            if (err) {
                return reject(err);
            }
            if (bag.length > 0) {
                var updatedQuantity = bag[0].quantity - amount;
                var newQuery = " UPDATE item SET item.quantity = ? WHERE item.owner = ? AND item.name = ?";
                con.query(newQuery, [updatedQuantity, userid, itemName], function(err) {
                    if (err) {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                });
            } else {
                resolve(false);
            }
        });
    });
}

/**
 * Removes one item from a user's bag and gives it to the user's
 * lead Pokemon.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} item The name of the item to give.
 * 
 * @returns {boolean} False if any errors are encountered.
 */
async function giveItem(message, item) {
    var bag = await getBag(message.author.id);
    if (bag === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    item = doesUserHaveHoldableItem(bag, item);
    if (item == null) {
        return false;
    }
    
    var lead = await getLeadPokemon(message.author.id);
    if (lead === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    if (lead.item === "None" || lead.item == null) {
        var query = " UPDATE pokemon SET pokemon.item = ? WHERE pokemon.pokemon_id = ?";
        con.query(query, [item.item_id, lead.pokemon_id], function(err) {
            if (err) {
                console.log(err);
                return false;
            } else {
                message.channel.send(message.author.username + " gave the " + item.name + " to " + lead.name + ".");
                removeItemFromBag(message.author.id, item.name, 1);
                return true;
            }
        });
    } else {
        var heldItem = await getItem(lead.item);
        if (heldItem === null) {
            return new Promise(function(resolve) {
                resolve(false);
            });
        }
        message.channel.send(message.author.username + ", your " + lead.name + " is currently holding one " + heldItem.name + ". Would you like to swap items? Type \"Yes\" to swap or \"No\" to cancel the item assignment.");
        var cancel = false;
        var input = null;
        while(cancel == false) {
            await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
            .then(collected => {
                input = collected.first().content.toString().toLowerCase();
            })
            .catch(collected => {
                input = 0;
                cancel = true;
            });

            if (input === "no") {
                cancel = true;
                input = 0;
            } else if (input === "yes") {
                cancel = true;
                input = 1;
            } else if (input != null) {
                message.channel.send(message.author.username + ", your response was not recognized. Type \"Yes\" to swap " + heldItem.name + " with " + item.name + " or \"No\" to cancel the item assignment.");
                input = 0;
            } else {
                input = 0;
            }
        }
        
        if (input === 1) {
            var query = " UPDATE pokemon SET pokemon.item = ? WHERE pokemon.pokemon_id = ?";
            con.query(query, [item.item_id, lead.pokemon_id], function(err) {
                if (err) {
                    console.log(err);
                    return false;
                } else {
                    message.channel.send(message.author.username + " gave the " + item.name + " to " + lead.name + ".");
                    addItemToBag(message.author.id, heldItem.name, 1, heldItem.holdable, heldItem.cat);
                    removeItemFromBag(message.author.id, item.name, 1);
                    return true;
                }
            });
        } else {
            return false;
        }
    }
    return true;
}

/**
 * Sets a Pokemon as evolving.
 * 
 * @param {string} pokemon The id of the Pokemon.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
function addEvolutionToPokemon(pokemon) {
    return new Promise(function(resolve, reject) {
        var query_str = 'UPDATE pokemon SET pokemon.evolving = 1 WHERE pokemon.pokemon_id = ?';
        con.query(query_str, [pokemon.pokemon_id], function (err) {
            if (err) {
                return reject(err);
            } else {
                resolve(true);
            }
        });
    });
}

/**
 * Updates a Pokemon's moves in the database.
 * 
 * @todo Only pass PokemonID instead of the whole Pokemon.
 * 
 * @param {Pokemon} pokemon The Pokemon object that is having its moves updated.
 * @param {move[]} moves The list of four move objects that is being assigned to the Pokemon.
 * 
 * @returns {boolean} True if the Pokemon's moves were updated.
 */
async function updateMoves(pokemon, moves) {
    const moveNames = moves.map(move => move.name);
    await doQuery('UPDATE move SET move.known = 0 WHERE move.pokemon = ? AND NOT move.name IN (?)', [pokemon.pokemon_id, moveNames]);
    let i = 0;
    for (i; i < moves.length; i++) {
        if (moves[i].name != null && moves[i].pp != null) {
            let status = await doQuery('UPDATE move SET move.known = 1 WHERE move.pokemon = ? AND move.name = ?', [pokemon.pokemon_id, moves[i].name]);
            if (status.affectedRows === 0) {
                let move_set = {
                    pokemon: pokemon.pokemon_id,
                    name: moves[i].name,
                    max_pp: moves[i].pp,
                    current_pp: moves[i].pp,
                    known: 1
                }
                await doQuery('INSERT INTO move SET ?', [move_set]);
            }
        }
    }
}

/**
 * Performs the use action of an item owned by a user.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} item The name of the item being user.
 * 
 * @returns {boolean} True if the item was used.
 */
async function useItem(message, item) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var bag = await getBag(user.user_id);
    if (bag === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    item = doesUserHaveUsableItem(bag, item);

    if (item == null) {
        return false;
    }
    
    item = item.name;

    var lead = await getLeadPokemon(user.user_id);
    if (lead === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    var disposedItem = "None";
    var to;
    if (item === "Fire Stone") {
        if (lead.form === "Alolan") {
            return false;
        }
        if (lead.name === "Vulpix") {
            to = "Ninetails";
        } else if (lead.name === "Growlithe") {
            to = "Arcanine";
        } else if (lead.name === "Eevee") {
            to = "Flareon";
        } else if (lead.name === "Pansear") {
            to = "Simisear";
        } else {
            return false;
        }
        message.channel.send("<@" + message.author.id + "> your " + lead.name + " is evolving into " + to + "!");
        evolving[evolving.length] = new Evolution(message.author.id, lead.name, to);
        await addEvolutionToPokemon(lead);
        disposedItem = item;
        removeItemFromBag(message.author.id, disposedItem, 1);
        await evolve(message);
    } else if (item === "Water Stone") {
        if (lead.form === "Alolan") {
            return false;
        }
        if (lead.name === "Poliwhirl") {
            to = "Poliwrath";
        } else if (lead.name === "Shellder") {
            to = "Cloyster";
        } else if (lead.name === "Staryu") {
            to = "Starmie";
        } else if (lead.name === "Eevee") {
            to = "Vaporeon";
        } else if (lead.name === "Lombre") {
            to = "Ludicolo";
        } else if (lead.name === "Panpour") {
            to = "Simipour";
        } else {
            return false;
        }
        message.channel.send("<@" + message.author.id + "> your " + lead.name + " is evolving into " + to + "!");
        evolving[evolving.length] = new Evolution(message.author.id, lead.name, to);
        await addEvolutionToPokemon(lead);
        disposedItem = item;
        removeItemFromBag(message.author.id, disposedItem, 1);
        await evolve(message);
    } else if (item === "Thunder Stone") {
        if (lead.form === "Alolan") {
            return false;
        }
        if (lead.name === "Pikachu") {
            to = "Raichu";
        } else if (lead.name === "Eevee") {
            to = "Jolteon";
        } else if (lead.name === "Eelektrik") {
            to = "Eelektross";
        } else {
            return false;
        }
        message.channel.send("<@" + message.author.id + "> your " + lead.name + " is evolving into " + to + "!");
        evolving[evolving.length] = new Evolution(message.author.id, lead.name, to);
        await addEvolutionToPokemon(lead);
        disposedItem = item;
        removeItemFromBag(message.author.id, disposedItem, 1);
        await evolve(message);
    } else if (item === "Leaf Stone") {
        if (lead.form === "Alolan") {
            return false;
        }
        if (lead.name === "Gloom") {
            to = "Vileplume";
        } else if (lead.name === "Weepinbell") {
            to = "Victreebel";
        } else if (lead.name === "Exeggcute") {
            to = "Exeggutor";
        } else if (lead.name === "Nuzleaf") {
            to = "Shiftry";
        } else if (lead.name === "Pansage") {
            to = "Simisage";
        } else {
            return false;
        }
        message.channel.send("<@" + message.author.id + "> your " + lead.name + " is evolving into " + to + "!");
        evolving[evolving.length] = new Evolution(message.author.id, lead.name, to);
        await addEvolutionToPokemon(lead);
        disposedItem = item;
        removeItemFromBag(message.author.id, disposedItem, 1);
        await evolve(message);
    } else if (item === "Moon Stone") {
        if (lead.form === "Alolan") {
            return false;
        }
        if (lead.name === "Nidorina") {
            to = "Nidoqueen";
        } else if (lead.name === "Nidorino") {
            to = "Nidoking";
        } else if (lead.name === "Clefairy") {
            to = "Clefable";
        } else if (lead.name === "Jigglypuff") {
            to = "Wigglytuff";
        } else if (lead.name === "Skitty") {
            to = "Delcatty";
        } else if (lead.name === "Munna") {
            to = "Musharna";
        } else {
            return false;
        }
        message.channel.send("<@" + message.author.id + "> your " + lead.name + " is evolving into " + to + "!");
        evolving[evolving.length] = new Evolution(message.author.id, lead.name, to);
        await addEvolutionToPokemon(lead);
        disposedItem = item;
        removeItemFromBag(message.author.id, disposedItem, 1);
        await evolve(message);
    } else if (item === "Sun Stone") {
        if (lead.form === "Alolan") {
            return false;
        }
        if (lead.name === "Gloom") {
            to = "Bellossom";
        } else if (lead.name === "Sunkern") {
            to = "Sunflora";
        } else if (lead.name === "Cottonee") {
            to = "Whimsicott";
        } else if (lead.name === "Petilil") {
            to = "Lilligant";
        } else if (lead.name === "Helioptile") {
            to = "Heliolisk";
        } else {
            return false;
        }
        message.channel.send("<@" + message.author.id + "> your " + lead.name + " is evolving into " + to + "!");
        evolving[evolving.length] = new Evolution(message.author.id, lead.name, to);
        await addEvolutionToPokemon(lead);
        disposedItem = item;
        removeItemFromBag(message.author.id, disposedItem, 1);
        await evolve(message);
    } else if (item === "Shiny Stone") {
        if (lead.form === "Alolan") {
            return false;
        }
        if (lead.name === "Togetic") {
            to = "Togekiss";
        } else if (lead.name === "Roselia") {
            to = "Roserade";
        } else if (lead.name === "Minccino") {
            to = "Cinccino";
            await evolve(message);
        } else if (lead.name === "Floette") {
            to = "Florges";
        } else {
            return false;
        }
        message.channel.send("<@" + message.author.id + "> your " + lead.name + " is evolving into " + to + "!");
        evolving[evolving.length] = new Evolution(message.author.id, lead.name, to);
        await addEvolutionToPokemon(lead);
        disposedItem = item;
        removeItemFromBag(message.author.id, disposedItem, 1);
        await evolve(message);
    } else if (item === "Dusk Stone") {
        if (lead.form === "Alolan") {
            return false;
        }
        if (lead.name === "Murkrow") {
            to = "Honchkrow";
        } else if (lead.name === "Misdreavus") {
            to = "Mismagius";
        } else if (lead.name === "Lampent") {
            to = "Chandelure";
        } else if (lead.name === "Doublade") {
            to = "Aegislash";
        } else {
            return false;
        }
        message.channel.send("<@" + message.author.id + "> your " + lead.name + " is evolving into " + to + "!");
        evolving[evolving.length] = new Evolution(message.author.id, lead.name, to);
        await addEvolutionToPokemon(lead);
        disposedItem = item;
        removeItemFromBag(message.author.id, disposedItem, 1);
        await evolve(message);
    } else if (item === "Dawn Stone") {
        if (lead.form === "Alolan") {
            return false;
        }
        if (lead.name === "Kirlia" && lead.gender === "Male") {
            to = "Gallade";
        } else if (lead.name === "Snorunt" && lead.gender === "Female") {
            to = "Frosslass";
        } else {
            return false;
        }
        message.channel.send("<@" + message.author.id + "> your " + lead.name + " is evolving into " + to + "!");
        evolving[evolving.length] = new Evolution(message.author.id, lead.name, to);
        await addEvolutionToPokemon(lead);
        disposedItem = item;
        removeItemFromBag(message.author.id, disposedItem, 1);
        await evolve(message);
    } else if (item === "Ice Stone") {
        if (lead.form === "Alolan") {
            if (lead.name === "Sandshrew") {
                to = "Sandslash";
            } else if (lead.name === "Vulpix") {
                to = "Ninetails";
            } else {
                return false;
            }
            message.channel.send("<@" + message.author.id + "> your " + lead.name + " is evolving into " + to + "!");
            evolving[evolving.length] = new Evolution(message.author.id, lead.name, to);
            await addEvolutionToPokemon(lead);
            disposedItem = item;
            removeItemFromBag(message.author.id, disposedItem, 1);
            await evolve(message);
        } else {
            return false;
        }
    } else if (item.startsWith("TM")) {
        var ppath = generatePokemonJSONPath(lead.name);
        var pdata;
        try {
            pdata = fs.readFileSync(ppath, "utf8");
        } catch (err) {
            console.log(err);
            return false;
        }
        var pkmn = JSON.parse(pdata);
        
        var moveName;
        if (item.includes("Confide")) {
            moveName = item.substring(6, item.length);
        } else {
            moveName = item.substring(5, item.length);
        }
        let knownMoves = await getPokemonKnownMoves(lead.pokemon_id);
        let moves = [
            {
                name: null,
                pp: null
            },
            {
                name: null,
                pp: null
            },
            {
                name: null,
                pp: null
            },
            {
                name: null,
                pp: null
            }
        ]
        let i = 0;
        for (i; i < knownMoves.length; i++) {
            moves[i].name = knownMoves[i].name;
            moves[i].pp = knownMoves[i].current_pp;
        }
        var alreadyKnowsMove = false;
        var canLearnTM = false;
        if (lead.form === "Alolan") {
            for (i = 0; i < pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset.length; i++) {
                if (pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].hasOwnProperty("variations") && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].hasOwnProperty("tm") && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].variations[0] === (pokemon.form + " " + pokemon.name) && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].tm === moveName) {
                    canLearnTM = true;
                    var m;
                    for (m = 0; m < moves.length; m++) {
                        if (moves[m].name === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                            alreadyKnowsMove = true;
                        }
                    }
                    if ((moves[0].name === '---' || moves[0].name === null) && !alreadyKnowsMove) {
                        moves[0].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                        message.channel.send(message.author.username + "'s " + lead.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    } else if ((moves[1].name === '---' || moves[1].name === null) && !alreadyKnowsMove) {
                        moves[1].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                        message.channel.send(message.author.username + "'s " + lead.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    } else if ((moves[2].name === '---' || moves[2].name === null) && !alreadyKnowsMove) {
                        moves[2].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                        message.channel.send(message.author.username + "'s " + lead.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    } else if ((moves[3].name === '---' || moves[3].name === null) && !alreadyKnowsMove) {
                        moves[3].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                        message.channel.send(message.author.username + "'s " + lead.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    } else if (!alreadyKnowsMove) {
                        transactions[transactions.length] = new Transaction(message.author.id, "teaching your " + lead.name + " " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                        moves = await teachNewMove(message, lead, pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                        removeTransaction(message.author.id);
                    } else {
                        message.channel.send(message.author.username + " your " + lead.name + " already knows " + moveName + ".");
                    }
                    await updateMoves(lead, moves);
                }
            }
            if (!canLearnTM) {
                message.channel.send(message.author.username + " your " + lead.name + " is unable to learn " + moveName + ".");
            }
        } else {
            for (i = 0; i < pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset.length; i++) {
                if (pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].hasOwnProperty("tm") && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move === moveName) {
                    canLearnTM = true;
                    var m;
                    for (m = 0; m < moves.length; m++) {
                        if (moves[m].name === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                            alreadyKnowsMove = true;
                        }
                    }
                    if ((moves[0].name === '---' || moves[0].name === null) && !alreadyKnowsMove) {
                        moves[0].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                        message.channel.send(message.author.username + "'s " + lead.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    } else if ((moves[1].name === '---' || moves[1].name === null) && !alreadyKnowsMove) {
                        moves[1].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                        message.channel.send(message.author.username + "'s " + lead.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    } else if ((moves[2].name === '---' || moves[2].name === null) && !alreadyKnowsMove) {
                        moves[2].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                        message.channel.send(message.author.username + "'s " + lead.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    } else if ((moves[3].name === '---' || moves[3].name === null) && !alreadyKnowsMove) {
                        moves[3].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                        message.channel.send(message.author.username + "'s " + lead.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    } else if (!alreadyKnowsMove) {
                        transactions[transactions.length] = new Transaction(message.author.id, "teaching your " + lead.name + " " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                        moves = await teachNewMove(message, lead, pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                        removeTransaction(message.author.id);
                    } else {
                        message.channel.send(message.author.username + " your " + lead.name + " already knows " + moveName + ".");
                    }
                    await updateMoves(lead, moves);
                }
            }
            if (!canLearnTM) {
                message.channel.send(message.author.username + " your " + lead.name + " is unable to learn " + moveName + ".");
            }
        }
    } else {
        return false;
    }
    
    return true;
}

/**
 * Removes an item being held by a user's lead Pokemon and adds it to a user's bag.
 * 
 * @todo Allow this to work for any Pokemon by passing the Pokemon's
 * id, not just the lead Pokemon.
 * @todo Maybe make it return true if item was added to bag, rather
 * than no errors being encountered.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if the two trainers traded Pokemon.
 */
async function takeItem(message) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    var lead = await getLeadPokemon(user.user_id);
    if (lead === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    if (lead.item === "None" || lead.item === null) {
        message.channel.send(message.author.username + " your " + lead.name + " is not holding anything.");
    } else {
        var heldItem = await getItem(lead.item);
        if (heldItem === null) {
            heldItem = {
                name: lead.item,
                holdable: 1,
                category: "Item"
            }
        }
        lead.item = null;
        message.channel.send(message.author.username + " took the " + heldItem.name + " from " + lead.name + " and put it in their bag.");
        await addItemToBag(message.author.id, heldItem.name, 1, heldItem.holdable, heldItem.category);
        var query = "UPDATE pokemon SET pokemon.item = null WHERE pokemon.pokemon_id = ?";
        await con.query(query, [lead.pokemon_id], function (err) {
            if (err) {
                return reject(err);
            }
        });
    }
    return true;
}

/**
 * Allows a user to trade a Pokemon with another user.
 * 
 * @todo This function could use some serious modularity.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} tradeTo The Discord id of the trainer that the
 * user wants to trade with.
 * 
 * @returns {boolean} True if the item was added to the user's bag.
 */
async function tradeOffer(message, tradeTo) {
    var tradeFromIndex = trading.length;
    trading[trading.length] = new Trade(message.author.id, tradeTo.id, null, null);
    
    if (tradeTo.id === message.author.id) {
        message.channel.send(message.author.username + " you cannot trade with yourself.");
        removeTrade(message.author.id);
        return false;
    }
    var exists = await userExists(tradeTo.id);
    if (!exists) {
        message.channel.send(message.author.username + " that user is unknown to me.");
        removeTrade(message.author.id);
        return false;
    }
    
    if (isInEvolution(tradeTo.id) != null || (isInTrade(tradeTo.id) != null) || (isInTransaction(tradeTo.id) != null)) {
        message.channel.send(tradeTo.username + " is currently unavailable to trade.");
        removeTrade(message.author.id);
        return false;
    }
    
    var tradeToIndex = trading.length;
    trading[trading.length] = new Trade(tradeTo.id, message.author.id, null, null);
    
    message.channel.send(tradeTo.username + " you have received a trade offer from " + message.author.username + ". Do you accept?");
    var inp = null;
    var cancl = false;
    while(cancl == false) {
        inp = null;
        await message.channel.awaitMessages(response => response.author.id === tradeTo.id, { max: 1, time: 30000, errors: ['time'] })
            .then(collected => {
                inp = collected.first().content;
            })
            .catch(collected => {
                inp = "cancel";
                cancel = true;
            });

        if (inp === "cancel" || inp === "no") {
            cancl = true;
            inp = false;
            t = 60;
        } else if (inp === "accept" || inp === "yes") {
            cancl = true;
            inp = true;
            t = 60;
        } else {
            inp = null;
        }
    }
    
    if (inp == null || inp === false) {
        message.channel.send(tradeTo.username + " denied the trade request.");
        removeTrade(message.author.id);
        removeTrade(tradeTo.id);
        return false;
    } else {
        message.channel.send(tradeTo.username + " accepted the trade request.");
    }
    
    var askIndex;
    var receiveIndex;
    
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    var pokemon = await getPokemon(message.author.id);
    if (pokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    var matchedIndexes = [];
    
    function pkmnObj(pkmn, index) {
        this.pkmn = pkmn;
        this.index = index;
    }
    
    printPokemon(message, null);
    
    var selecting = true;
    var selectedPokemon = null;
    while (selecting) {
        message.channel.send(message.author.username + " please enter the name of the Pokémon you want to trade.");
        var cancel = false;
        var name = null;
        while(cancel == false) {
            await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
            .then(collected => {
                name = collected.first().content.toString().toLowerCase();
            })
            .catch(collected => {
                name = "cancel";
                cancel = true;
            });

            if (name === "cancel") {
                cancel = true;
                name = null;
            } else if (name != null) {
                cancel = true;
            } else {
                name = null;
            }
        }
        
        if (name == null) {
            message.channel.send(message.author.username + " cancelled the trade.");
            removeTrade(message.author.id);
            removeTrade(tradeTo.id);
            return false;
        }
        
        var i;
        for (i = 0; i < pokemon.length; i++) {
            if (name === pokemon[i].name.toLowerCase() || (pokemon[i].nickname != null && name === pokemon[i].nickname.toLowerCase())) {
                ind = i;
                matchedIndexes[matchedIndexes.length] = new pkmnObj(pokemon[i], i);
            }
        }

        if (matchedIndexes.length <= 0) {
            message.channel.send(message.author.username + " you do not have that Pokémon.");
        } if (matchedIndexes.length === 1) {
            selectedPokemon = pokemon[matchedIndexes[0].index];
            selectedIndex = matchedIndexes[0].index;
            askIndex = matchedIndexes[0].index;
            selecting = false;
        } else if (matchedIndexes.length > 1) {
            var string = message.author.username + " you have multiple " + matchedIndexes[0].pkmn.name + " . Please select which one you would like to trade by typing its number as shown in the list, or type \"Cancel\" to keep your current leader.\n```";
            for (i = 0; i < matchedIndexes.length; i++) {
                string += ((i + 1).toString() + ". " + matchedIndexes[i].pkmn.name);
                if (matchedIndexes[i].pkmn.shiny === 1) {
                    string += " ⭐";
                }
                string += (" | " + matchedIndexes[i].pkmn.gender + " | Level: " + matchedIndexes[i].pkmn.level_current + "\n");
            }
            string += "```\n";

            message.channel.send(string);

            cancel = false;
            var input = null;
            while(cancel == false) {
                await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
                .then(collected => {
                    input = collected.first().content.toString().toLowerCase();
                })
                .catch(collected => {
                    input = "cancel";
                    cancel = true;
                });

                if (input === "cancel") {
                    cancel = true;
                    input = null;
                } else if (/^\d+$/.test(input)) {
                    var num = Number(input);
                    if (num > 0 && num <= matchedIndexes.length) {
                        cancel = true;
                        input = (num - 1);
                    } else {
                        message.channel.send("Number is out of range. " + string);
                        input = -1;
                    }
                } else if (input != null) {
                    message.channel.send("Command not recognized. " + string);
                    input = -1;
                } else {
                    input = null;
                }
            }

            if (input == null) {
                message.channel.send(message.author.username + " cancelled the trade.");
                removeTrade(message.author.id);
                removeTrade(tradeTo.id);
                return false;
            } else if (input === -1) {
                //do nothing
            } else {
                selectedPokemon = pokemon[matchedIndexes[input].index];
                selectedIndex = matchedIndexes[input].index;
                askIndex = matchedIndexes[input].index;
                selecting = false;
            }
        }
    }
    
    message.channel.send(message.author.username + " selected a " + selectedPokemon.name + " to trade.");
    
    var tuser = await getUser(tradeTo.id);
    if (tuser === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    var tpokemon = await getPokemon(tradeTo.id);
    if (tpokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    matchedIndexes = [];
    
    printPokemon(message, tradeTo);
    
    var selecting = true;
    var tselectedPokemon = null;
    while (selecting) {
        message.channel.send(tradeTo.username + " please enter the name of the Pokémon you want to trade.");
        cancel = false;
        name = null;
        while(cancel == false) {
            await message.channel.awaitMessages(response => response.author.id === tradeTo.id, { max: 1, time: 30000, errors: ['time'] })
            .then(collected => {
                name = collected.first().content.toString().toLowerCase();
            })
            .catch(collected => {
                name = "cancel";
                cancel = true;
            });

            if (name === "cancel") {
                cancel = true;
                name = null;
            } else if (name != null) {
                cancel = true;
            } else {
                name = null;
            }
        }
        
        if (name == null) {
            message.channel.send(tradeTo.username + " cancelled the trade.");
            removeTrade(message.author.id);
            removeTrade(tradeTo.id);
            return false;
        }
    
        ind = 0;
        for (i = 0; i < tpokemon.length; i++) {
            if (name === tpokemon[i].name.toLowerCase() || (tpokemon[i].nickname != null && name === tpokemon[i].nickname.toLowerCase())) {
                ind = i;
                matchedIndexes[matchedIndexes.length] = new pkmnObj(tpokemon[i], i);
            }
        }

        if (matchedIndexes.length <= 0) {
            message.channel.send(tradeTo.username + " you do not have that Pokémon.");
        } if (matchedIndexes.length === 1) {
            tselectedPokemon = tpokemon[matchedIndexes[0].index];
            tselectedIndex = matchedIndexes[0].index;
            receiveIndex = matchedIndexes[0].index;
            selecting = false;
        } else if (matchedIndexes.length > 1) {
            var string = tradeTo.username + " you have multiple " + matchedIndexes[0].pkmn.name + " . Please select which one you would like to trade by typing its number as shown in the list, or type \"Cancel\" to keep your current leader.\n```";
            for (i = 0; i < matchedIndexes.length; i++) {
                string += ((i + 1).toString() + ". " + matchedIndexes[i].pkmn.name);
                if (matchedIndexes[i].pkmn.shiny === 1) {
                    string += " ⭐";
                }
                string += (" | " + matchedIndexes[i].pkmn.gender + " | Level: " + matchedIndexes[i].pkmn.level_current + "\n");
            }
            string += "```\n";

            message.channel.send(string);

            cancel = false;
            input = null;
            while(cancel == false) {
                await message.channel.awaitMessages(response => response.author.id === tradeTo.id, { max: 1, time: 30000, errors: ['time'] })
                .then(collected => {
                    input = collected.first().content.toString().toLowerCase();
                })
                .catch(collected => {
                    input = "cancel";
                    cancel = true;
                });

                if (input === "cancel") {
                    cancel = true;
                    input = null;
                } else if (/^\d+$/.test(input)) {
                    var num = Number(input);
                    if (num > 0 && num <= matchedIndexes.length) {
                        cancel = true;
                        input = (num - 1);
                    } else {
                        message.channel.send("Number is out of range. " + string);
                        input = -1;
                    }
                } else if (input != null) {
                    message.channel.send("Command not recognized. " + string);
                    input = -1;
                } else {
                    input = null;
                }
            }

            if (input == null) {
                message.channel.send(tradeTo.username + " cancelled the trade.");
                removeTrade(message.author.id);
                removeTrade(tradeTo.id);
                return false;
            } else if (input === -1) {
                //do nothing
            } else {
                tselectedPokemon = tpokemon[matchedIndexes[input].index];
                tselectedIndex = matchedIndexes[input].index;
                receiveIndex = matchedIndexes[input].index;
                selecting = false;
            }
        }
    }
    
    message.channel.send(tradeTo.username + " selected a " + tselectedPokemon.name + " to trade.");
    
    trading[tradeFromIndex].askPokemon = selectedPokemon.name;
    trading[tradeFromIndex].respondPokemon = tselectedPokemon.name;
    trading[tradeToIndex].askPokemon = tselectedPokemon.name;
    trading[tradeToIndex].respondPokemon = selectedPokemon.name;
    
    await displayAnOwnedPkmn(tselectedPokemon, message);
    await message.channel.send(message.author.username + " are you ok with the selected " + tselectedPokemon.name + "? Type \"Yes\" to accept or \"No\" to cancel the trade.");
    
    await displayAnOwnedPkmn(selectedPokemon, message);
    await message.channel.send(tradeTo.username + " are you ok with the selected " + selectedPokemon.name + "? Type \"Yes\" to accept or \"No\" to cancel the trade.");
    
    i = 0;
    var accept = null;
    var taccept = null;
    var inputConfirm = null;
    var tinputConfirm = null;
    while((accept == null || taccept == null) && i < 60) {
        i++;
        const response = await message.channel.awaitMessages(msg => {
            if (msg.author.id === message.author.id) {
                inputConfirm = msg.content.toLowerCase();
            }
            if (msg.author.id === tradeTo.id) {
                tinputConfirm = msg.content.toLowerCase();
            }
        }, {max: 1, time: 1000});

        if (inputConfirm === "cancel" || inputConfirm === "no") {
            accept = false;
        } else if (inputConfirm === "yes") {
            accept = true;
        } else {
            accept = null;
        }

        if (tinputConfirm === "cancel" || tinputConfirm === "no") {
            taccept = false;
        } else if (tinputConfirm === "yes") {
            taccept = true;
        } else {
            taccept = null;
        }
    }

    if (accept != null && accept != false && taccept != null && taccept != false) {
        if (pokemon[askIndex].lead === 1) {
            var query = "UPDATE pokemon SET pokemon.lead = 0, pokemon.current_trainer = ? WHERE pokemon.pokemon_id = ?";
            con.query(query, [tradeTo.id, selectedPokemon.pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            query = "UPDATE pokemon SET pokemon.lead = 1, pokemon.current_trainer = ? WHERE pokemon.pokemon_id = ?";
            con.query(query, [message.author.id, tselectedPokemon.pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            query = "UPDATE user SET user.lead = ? WHERE user.user_id = ?";
            con.query(query, [tselectedPokemon.pokemon_id, message.author.id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
        } else {
            query = "UPDATE pokemon SET pokemon.lead = 0, pokemon.current_trainer = ? WHERE pokemon.pokemon_id = ?";
            con.query(query, [message.author.id, tselectedPokemon.pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
        }
        if (tpokemon[receiveIndex].lead === 1) {
            var query = "UPDATE pokemon SET pokemon.lead = 0, pokemon.current_trainer = ? WHERE pokemon.pokemon_id = ?";
            con.query(query, [message.author.id, selectedPokemon.pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            query = "UPDATE pokemon SET pokemon.lead = 1, pokemon.current_trainer = ? WHERE pokemon.pokemon_id = ?";
            con.query(query, [tradeTo.id, selectedPokemon.pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            query = "UPDATE user SET user.lead = ? WHERE user.user_id = ?";
            con.query(query, [selectedPokemon.pokemon_id, tradeTo.id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
        } else {
            query = "UPDATE pokemon SET pokemon.lead = 0, pokemon.current_trainer = ? WHERE pokemon.pokemon_id = ?";
            con.query(query, [tradeTo.id, selectedPokemon.pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
        }
        message.channel.send("Congratulations! " + message.author.username + " traded their " + selectedPokemon.name + " for " + tradeTo.username + "'s " + tselectedPokemon.name + "!");
        
        var tradeEvos = ["Kadabra", "Machoke", "Graveler", "Haunter", "Boldore", "Gurdurr", "Phantump", "Pumpkaboo"];
        var tradeEvosTo = ["Alakazam", "Machamp", "Golem", "Gengar", "Gigalith", "Conkeldurr", "Gourgeist", "Trevenant"];
        var tradeEvoIndex = -1;

        var item = await getItem(tselectedPokemon.item);
        if (item === null) {
            item = tselectedPokemon.item;
        } else {
            item = item.name;
        }
        
        if (tselectedPokemon.item != "Everstone") {
            var evolveTo = null;
            if (tselectedPokemon.name === "Shelmet") {
                if (selectedPokemon.name === "Karrablast") {
                    evolveTo = "Accelgor";
                }
            } else if (tselectedPokemon.name === "Karrablast") {
                if (selectedPokemon.name === "Shelmet") {
                    evolveTo = "Escavalier";
                }
            } else if ((tradeEvoIndex = tradeEvos.indexOf(tselectedPokemon.name)) >= 0) {
                evolveTo = tradeEvosTo[tradeEvoIndex];
            } else if (tselectedPokemon.name === "Poliwhirl" && item === "King's Rock") {
                evolveTo = "Politoed";
            } else if (tselectedPokemon.name === "Slowpoke" && item === "King's Rock") {
                evolveTo = "Slowking";
            } else if (tselectedPokemon.name === "Onix" && item === "Metal Coat") {
                evolveTo = "Steelix";
            } else if (tselectedPokemon.name === "Seadra" && item === "Dragon Scale") {
                evolveTo = "Kindgra";
            } else if (tselectedPokemon.name === "Scyther" && item === "Metal Coat") {
                evolveTo = "Scizor";
            } else if (tselectedPokemon.name === "Porygon" && item === "Up-Grade") {
                evolveTo = "Porygon2";
            } else if (tselectedPokemon.name === "Clamperl" && item === "Deep Sea Tooth") {
                evolveTo = "Huntail";
            } else if (tselectedPokemon.name === "Clamperl" && item === "Deep Sea Scale") {
                evolveTo = "Gorebyss";
            } else if (tselectedPokemon.name === "Feebas" && item === "Prism Scale") {
                evolveTo = "Milotic";
            } else if (tselectedPokemon.name === "Rhydon" && item === "Protector") {
                evolveTo = "Rhyperior";
            } else if (tselectedPokemon.name === "Electabuzz" && item === "Electirizer") {
                evolveTo = "Electivire";
            } else if (tselectedPokemon.name === "Magmar" && item === "Magmarizer") {
                evolveTo = "Magmortar";
            } else if (tselectedPokemon.name === "Porygon2" && item === "Dubious Disc") {
                evolveTo = "Porygon-Z";
            } else if (tselectedPokemon.name === "Dusclops" && item === "Reaper Cloth") {
                evolveTo = "Dusknoir";
            } else if (tselectedPokemon.name === "Feebas" && item === "Prism Scale") {
                evolveTo = "Milotic";
            } else if (tselectedPokemon.name === "Spritzee" && item === "Sachet") {
                evolveTo = "Aromatisse";
            } else if (tselectedPokemon.name === "Swirlix" && item === "Whipped Dream") {
                evolveTo = "Slurpuff";
            }
            
            if (evolveTo != null) {
                message.channel.send("<@" + message.author.id + "> your " + tselectedPokemon.name + " is evolving into " + evolveTo + "! Type \"B\" to cancel or  \"A\" to accept.");
                query = "UPDATE pokemon SET pokemon.evolving = 1 WHERE pokemon.pokemon_id = ?";
                con.query(query, [tselectedPokemon.pokemon_id], function (err) {
                    if (err) {
                        return reject(err);
                    }
                });
                evolving[evolving.length] = new Evolution(message.author.id, tselectedPokemon.name, evolveTo);
            }
        }
        
        evolveTo = null;
        
        item = await getItem(selectedPokemon.item);
        if (item === null) {
            item = selectedPokemon.item;
        } else {
            item = item.name;
        }

        if (selectedPokemon.item != "Everstone") {
            var evolveTo = null;
            if (selectedPokemon.name === "Shelmet") {
                if (tselectedPokemon.name === "Karrablast") {
                    evolveTo = "Accelgor";
                }
            } else if (selectedPokemon.name === "Karrablast") {
                if (tselectedPokemon.name === "Shelmet") {
                    evolveTo = "Escavalier";
                }
            } else if ((tradeEvoIndex = tradeEvos.indexOf(selectedPokemon.name)) >= 0) {
                evolveTo = tradeEvosTo[tradeEvoIndex];
            } else if (selectedPokemon.name === "Poliwhirl" && item === "King's Rock") {
                evolveTo = "Politoed";
            } else if (selectedPokemon.name === "Slowpoke" && item === "King's Rock") {
                evolveTo = "Slowking";
            } else if (selectedPokemon.name === "Onix" && item === "Metal Coat") {
                evolveTo = "Steelix";
            } else if (selectedPokemon.name === "Seadra" && item === "Dragon Scale") {
                evolveTo = "Kindgra";
            } else if (selectedPokemon.name === "Scyther" && item === "Metal Coat") {
                evolveTo = "Scizor";
            } else if (selectedPokemon.name === "Porygon" && item === "Up-Grade") {
                evolveTo = "Porygon2";
            } else if (selectedPokemon.name === "Clamperl" && item === "Deep Sea Tooth") {
                evolveTo = "Huntail";
            } else if (selectedPokemon.name === "Clamperl" && item === "Deep Sea Scale") {
                evolveTo = "Gorebyss";
            } else if (selectedPokemon.name === "Feebas" && item === "Prism Scale") {
                evolveTo = "Milotic";
            } else if (selectedPokemon.name === "Rhydon" && item === "Protector") {
                evolveTo = "Rhyperior";
            } else if (selectedPokemon.name === "Electabuzz" && item === "Electirizer") {
                evolveTo = "Electivire";
            } else if (selectedPokemon.name === "Magmar" && item === "Magmarizer") {
                evolveTo = "Magmortar";
            } else if (selectedPokemon.name === "Porygon2" && item === "Dubious Disc") {
                evolveTo = "Porygon-Z";
            } else if (selectedPokemon.name === "Dusclops" && item === "Reaper Cloth") {
                evolveTo = "Dusknoir";
            } else if (selectedPokemon.name === "Feebas" && item === "Prism Scale") {
                evolveTo = "Milotic";
            } else if (selectedPokemon.name === "Spritzee" && item === "Sachet") {
                evolveTo = "Aromatisse";
            } else if (selectedPokemon.name === "Swirlix" && item === "Whipped Dream") {
                evolveTo = "Slurpuff";
            }
            
            if (evolveTo != null) {
                message.channel.send("<@" + tradeTo.id + "> your " + selectedPokemon.name + " is evolving into " + evolveTo + "! Type \"B\" to cancel or  \"A\" to accept.");
                query = "UPDATE pokemon SET pokemon.evolving = 1 WHERE pokemon.pokemon_id = ?";
                con.query(query, [selectedPokemon.pokemon_id], function (err) {
                    if (err) {
                        return reject(err);
                    }
                });
                evolving[evolving.length] = new Evolution(tradeTo.id, selectedPokemon.name, evolveTo);
            }
        }
        
        removeTrade(message.author.id);
        removeTrade(tradeTo.id);
        
        return true;
        
    } else {
        message.channel.send("The trade between " + message.author.username + " and " + tradeTo.username + " has been cancelled.");
        removeTrade(message.author.id);
        removeTrade(tradeTo.id);
        return false;
    }
    
}

/**
 * Evolves a user's evolving Pokemon and updates all its stats.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if the Pokemon successfully evolved.
 */
async function evolve(message) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    var evolvingPokemon = await getEvolvingPokemon(message.author.id);
    if (evolvingPokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var ppath = generatePokemonJSONPath(evolvingPokemon.name);
    var pdata;
    try {
        pdata = fs.readFileSync(ppath, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    var pkmn = JSON.parse(pdata);
    
    var evo = isInEvolution(message.author.id);
    if (evo === null) {
        console.warn("Evolve function called but isInEvolution() returned null for user= " + message.author.id);
        return new Promise(function(resolve) {
            resolve(false);
        })
    }
    
    if (evolvingPokemon.name === evolvingPokemon.nickname) {
        evolvingPokemon.nickname = null;
    }
    
    evolvingPokemon.name = evo.to;
    
    ppath = generatePokemonJSONPath(evo.to);
    pdata;
    try {
        pdata = fs.readFileSync(ppath, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    pkmn = JSON.parse(pdata);
    
    if (evo.to === "Lycanroc") {
        var cur = convertToTimeZone(user);
        var n = moment(cur).format('H');
        if (n == 17) {
            evolvingPokemon.form = "Dusk";
        } else if (n > 17 || n < 6) {
            evolvingPokemon.form = "Midnight";
        } else {
            evolvingPokemon.form = "Midday";
        }
    }
    
    let national_id = pkmn.national_id.toString();
    while (national_id.length < 3) {
        national_id = '0' + national_id;
    }

    var hidden = [];
    var abilities = [];
    
    if (user.region === "Alola" && !user.location.includes("Ultra Space")) {
        if (evo.to === "Exeggutor" || evo.to === "Marowak" || evo.to === "Raichu") {
            evolvingPokemon.form = "Alolan";
        }
    }
    
    var i;
    if (evolvingPokemon.form === "Alolan") {
        for (i = 0; i < pkmn.variations[0].abilities.length; i++) {
            if(pkmn.variations[0].abilities[i].hasOwnProperty('hidden')) {
                hidden[hidden.length] = pkmn.variations[0].abilities[i].name;
            } else {
                abilities[abilities.length] = pkmn.variations[0].abilities[i].name;
            }
        }
    } else {
        for (i = 0; i < pkmn.abilities.length; i++) {
            if(pkmn.abilities[i].hasOwnProperty('hidden')) {
                hidden[hidden.length] = pkmn.abilities[i].name;
            } else {
                abilities[abilities.length] = pkmn.abilities[i].name;
            }
        }
    }
    
    var final_ability;
    var abilitySlot = evolvingPokemon.abilitySlot;
    
    if (abilitySlot === 2 && hidden.length > 0) {
        final_ability = hidden[0];
    } else if (abilitySlot === 1 && abilities.length > 1) {
        final_ability = abilities[1];
    } else {
        final_ability = abilities[0];
    }
    
    if (evolvingPokemon.name === "Espurr" && evolvingPokemon.abilitySlot === 2) {
        if (evolvingPokemon.gender === "Female") {
            evolvingPokemon.abilitySlot = 3;
            final_ability = "Competitive";
        }
    }
    
    if (evo.to === "Lycanroc") {
        if (evolvingPokemon.form === "Midday") {
            evolvingPokemon.ability = pkmn.abilities[evolvingPokemon.abilitySlot].name;
        } else if (evolvingPokemon.form === "Midnight") {
            evolvingPokemon.ability = pkmn.variations[0].abilities[evolvingPokemon.abilitySlot].name;
        } else {
            evolvingPokemon.ability = "Tough Claws";
        }
    }
    
    evolvingPokemon.ability = final_ability;
    evolvingPokemon.no = pkmn.national_id;
    var stats = [evolvingPokemon.stat_hp, evolvingPokemon.stat_atk, evolvingPokemon.stat_def, evolvingPokemon.stat_spatk, evolvingPokemon.stat_spdef, evolvingPokemon.stat_spd];
    var EVs = [evolvingPokemon.ev_hp, evolvingPokemon.ev_atk, evolvingPokemon.ev_def, evolvingPokemon.ev_spatk, evolvingPokemon.ev_spdef, evolvingPokemon.ev_spd];
    var IVs = [evolvingPokemon.iv_hp, evolvingPokemon.iv_atk, evolvingPokemon.iv_def, evolvingPokemon.iv_spatk, evolvingPokemon.iv_spdef, evolvingPokemon.iv_spd];
    var nature = evolvingPokemon.nature;
    
    var level = evolvingPokemon.level_current;
    
    var baseStats;
    if ((evolvingPokemon.name === "Pumpkaboo" || evolvingPokemon.name === "Gourgeist") && evolvingPokemon.form != "Small Size") {
        if (evolving.form === "Average Size") {
            baseStats = [pkmn.variations[0].base_stats.hp, pkmn.variations[0].base_stats.atk, pkmn.variations[0].base_stats.def, pkmn.variations[0].base_stats.sp_atk, pkmn.variations[0].base_stats.sp_def, pkmn.variations[0].base_stats.speed];
        } else if (evolvingPokemon.form === "Large Size") {
            baseStats = [pkmn.variations[1].base_stats.hp, pkmn.variations[1].base_stats.atk, pkmn.variations[1].base_stats.def, pkmn.variations[1].base_stats.sp_atk, pkmn.variations[1].base_stats.sp_def, pkmn.variations[1].base_stats.speed];
        } else {
            baseStats = [pkmn.variations[2].base_stats.hp, pkmn.variations[2].base_stats.atk, pkmn.variations[2].base_stats.def, pkmn.variations[2].base_stats.sp_atk, pkmn.variations[2].base_stats.sp_def, pkmn.variations[2].base_stats.speed];
        }
    } else if (evolvingPokemon.name === "Lycanroc" && evolvingPokemon.form != "Midday") {
        if (evolvingPokemon.form === "Midnight") {
            baseStats = [pkmn.variations[0].base_stats.hp, pkmn.variations[0].base_stats.atk, pkmn.variations[0].base_stats.def, pkmn.variations[0].base_stats.sp_atk, pkmn.variations[0].base_stats.sp_def, pkmn.variations[0].base_stats.speed];
        } else {
            baseStats = [pkmn.variations[1].base_stats.hp, pkmn.variations[1].base_stats.atk, pkmn.variations[1].base_stats.def, pkmn.variations[1].base_stats.sp_atk, pkmn.variations[1].base_stats.sp_def, pkmn.variations[1].base_stats.speed];
        }
    } else {
        baseStats = [pkmn.base_stats.hp, pkmn.base_stats.atk, pkmn.base_stats.def, pkmn.base_stats.sp_atk, pkmn.base_stats.sp_def, pkmn.base_stats.speed];
    }
    
    stats[0] = calculateStatAtLevel(level, baseStats[0], IVs[0], EVs[0], nature, "hp");
    stats[1] = calculateStatAtLevel(level, baseStats[1], IVs[1], EVs[1], nature, "atk");
    stats[2] = calculateStatAtLevel(level, baseStats[2], IVs[2], EVs[2], nature, "def");
    stats[3] = calculateStatAtLevel(level, baseStats[3], IVs[3], EVs[3], nature, "sp_atk");
    stats[4] = calculateStatAtLevel(level, baseStats[4], IVs[4], EVs[4], nature, "sp_def");
    stats[5] = calculateStatAtLevel(level, baseStats[5], IVs[5], EVs[5], nature, "speed");
    
    evolvingPokemon.stat_hp = stats[0];
    evolvingPokemon.stat_atk = stats[1];
    evolvingPokemon.stat_def = stats[2];
    evolvingPokemon.stat_spatk = stats[3];
    evolvingPokemon.stat_spdef = stats[4];
    evolvingPokemon.stat_spd = stats[5];
    
    if (evolvingPokemon.form === "Alolan") {
        evolvingPokemon.type_1 = pkmn.variations[0].types[0];
        if(pkmn.variations[0].types.length > 1) {
            evolvingPokemon.type_2 = pkmn.variations[0].types[1];
        } else {
            evolvingPokemon.type_2 = null;
        }
    } else {
        evolvingPokemon.type_1 = pkmn.types[0];
        if(pkmn.types.length > 1) {
            evolvingPokemon.type_2 = pkmn.types[1];
        } else {
            evolvingPokemon.type_2 = null;
        }
    }
    
    if (evolvingPokemon.name === "Wormadam") {
        if (evolvingPokemon.form === "Sandy Cloak") {
            evolvingPokemon.type_1 = pkmn.variations[0].types[1];
        } else if (evolvingPokemon.form === "Trash Cloak") {
            evolvingPokemon.type_2 = pkmn.variations[1].types[1];
        }
    } else if (evolvingPokemon.name === "Mothim") {
        evolvingPokemon.form = null;
    }
    
    var heldItemEvoPokemon = ["Chansey", "Gliscor", "Weavile", "Politoed", "Slowking", "Steelix", "Kindgra", "Scizor", "Porygon2", "Huntail", "Gorebyss", "Milotic", "Rhyperior", "Electivire", "Magmortar", "Porygon-Z", "Dusknoir", "Milotic", "Aromatisse", "Slurpuff"];

    if (heldItemEvoPokemon.indexOf(evolvingPokemon.name) >= 0) {
        evolvingPokemon.item = null;
    }
    
    if (evo.to === "Malamar") {
        message.channel.send("¡ɹɐɯɐlɐW oʇuᴉ pǝʌloʌǝ sɐɥ ʎɐʞuI s," + flipString(message.author.username));
    } else {
        message.channel.send(message.author.username + "'s " + evo.from + " has evolved into " + evo.to + "!");
    }
    
    removeEvolution(message.author.id);
    
    var evoMove = checkForNewMoveUponEvo(evo.to, evolvingPokemon.form);
    var evolvingMoves = [
        {
            name: evolvingPokemon.move_1,
            pp: evolvingPokemon.move_1_pp
        },
        {
            name: evolvingPokemon.move_2,
            pp: evolvingPokemon.move_2_pp
        },
        {
            name: evolvingPokemon.move_3,
            pp: evolvingPokemon.move_3_pp
        },
        {
            name: evolvingPokemon.move_4,
            pp: evolvingPokemon.move_4_pp
        }
    ]
    if (evoMove[0] != "None") {
        message.react(duck.id);
        var x;
        for (x = 0; x < evoMove.length; x++) {
            if (evolvingPokemon.move_1 != evoMove[x] && evolvingPokemon.move_2 != evoMove[x] && evolvingPokemon.move_3 != evoMove[x] && evolvingPokemon.move_4 != evoMove[x]) {
                if (evolvingPokemon.move_1 === "---" || evolvingPokemon.move_1 === null) {
                    evolvingPokemon.move_1 = evoMove[x];
                    evoevolvingPokemonlving.move_1_pp = getMovePP(evoMove[x]);
                    message.channel.send(message.author.username + "'s " + evolvingPokemon.name + " learned " + evoMove[x] + "!");
                } else if (evolvingPokemon.move_2 === "---" || evolvingPokemon.move_2 === null) {
                    evolvingPokemon.move_2 = evoMove[x];
                    evolvingPokemon.move_2_pp = getMovePP(evoMove[x]);
                    message.channel.send(message.author.username + "'s " + evolvingPokemon.name + " learned " + evoMove[x] + "!");
                } else if (evolvingPokemon.move_3 === "---" || evolvingPokemon.move_3 === null) {
                    evolvingPokemon.move_3 = evoMove[x];
                    evolvingPokemon.move_3_pp = getMovePP(evoMove[x]);
                    message.channel.send(message.author.username + "'s " + evolvingPokemon.name + " learned " + evoMove[x] + "!");
                } else if (evolvingPokemon.move_4 === "---" || evolvingPokemon.move_4 === null) {
                    evolvingPokemon.move_4 = evoMove[x];
                    evolvingPokemon.move_4_pp = getMovePP(evoMove[x]);
                    message.channel.send(message.author.username + "'s " + evolvingPokemon.name + " learned " + evoMove[x] + "!");
                } else {
                    transactions[transactions.length] = new Transaction(message.author.id, ("teaching your " + evo.to + " " + evoMove[x]));
                    evolvingMoves = await teachNewMove(message, evolvingPokemon, evoMove[x]);
                    evolvingPokemon.move_1 = evolvingMoves[0].name;
                    evolvingPokemon.move_1_pp = evolvingMoves[0].pp;
                    evolvingPokemon.move_2 = evolvingMoves[1].name;
                    evolvingPokemon.move_2_pp = evolvingMoves[1].pp;
                    evolvingPokemon.move_3 = evolvingMoves[2].name;
                    evolvingPokemon.move_3_pp = evolvingMoves[2].pp;
                    evolvingPokemon.move_4 = evolvingMoves[3].name;
                    evolvingPokemon.move_4_pp = evolvingMoves[3].pp;
                    removeTransaction(message.author.id);
                }
            }
        }
    }
    
    evolvingMoves = await checkForNewMove(message, evolvingPokemon, true);
    evolvingPokemon.move_1 = evolvingMoves[0].name;
    evolvingPokemon.move_1_pp = evolvingMoves[0].pp;
    evolvingPokemon.move_2 = evolvingMoves[1].name;
    evolvingPokemon.move_2_pp = evolvingMoves[1].pp;
    evolvingPokemon.move_3 = evolvingMoves[2].name;
    evolvingPokemon.move_3_pp = evolvingMoves[2].pp;
    evolvingPokemon.move_4 = evolvingMoves[3].name;
    evolvingPokemon.move_4_pp = evolvingMoves[3].pp;
    
    if (evo.from === "Nincada" && evo.to === "Ninjask") {
        var bag = await getBag(user.user_id);
        if (bag === null) {
            return new Promise(function(resolve) {
                resolve(false);
            });
        }
        if (doesUserHaveHoldableItem(bag, "Poké Ball") != false) {
            removeItemFromBag(user.items, "Poké Ball", 1);
            var shedinja = await generatePokemonByName(message, "Shedinja", evolvingPokemon.level_current, user.region, user.location, false);
            shedinja.otid = message.author.id;
            await addPokemon(user.user_id, shedinja);
        }
    }

    var set = {
        name: evolvingPokemon.name,
        nickname: evolvingPokemon.nickname,
        number: national_id,
        friendship: evolvingPokemon.friendship,
        move_1: evolvingPokemon.move_1,
        move_1_pp: evolvingPokemon.move_1_pp,
        move_2: evolvingPokemon.move_2,
        move_2_pp: evolvingPokemon.move_2_pp,
        move_3: evolvingPokemon.move_3,
        move_3_pp: evolvingPokemon.move_3_pp,
        move_4: evolvingPokemon.move_4,
        move_4_pp: evolvingPokemon.move_4_pp,
        stat_hp: evolvingPokemon.stat_hp,
        stat_atk: evolvingPokemon.stat_atk,
        stat_def: evolvingPokemon.stat_def,
        stat_spatk: evolvingPokemon.stat_spatk,
        stat_spdef: evolvingPokemon.stat_spdef,
        stat_spd: evolvingPokemon.stat_spd,
        type_1: evolvingPokemon.type_1,
        type_2: evolvingPokemon.type_2,
        item: evolvingPokemon.item,
        ability: evolvingPokemon.ability,
        form: evolvingPokemon.form,
        evolving: 0
    }
    var query = "UPDATE pokemon SET ? WHERE pokemon.pokemon_id = ?";
    con.query(query, [set, evolvingPokemon.pokemon_id], function (err) {
        if (err) {
            console.log(err);
            return false;
        }
    });

    await addToPokedex(user, pkmn.national_id);

    return true;
}

/**
 * Cancels a Pokemon's evolution.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if the evolution was successfully cancelled.
 */
async function cancelEvolve(message) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var pokemon = await getPokemon(message.author.id);
    if (pokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var i;
    for (i = 0; i < pokemon.length; i++) {
        if(pokemon[i].evolving === 1) {
            var query = "UPDATE pokemon SET pokemon.evolving = 0 WHERE pokemon.pokemon_id = ?";
            con.query(query, [pokemon[i].pokemon_id], function (err) {
                if (err) {
                    console.log(err);
                    return false;
                }
                message.channel.send(message.author.username + " has canceled " + user.pokemon[i].name + "'s evolution.");
                removeEvolution(message.author.id);
                return true;
            });
        }
    }
    return true;
}

/**
 * Checks if a Pokemon has met its evolution requirement.
 * 
 * @todo The `method` argument seems to do nothing, is it necessary?
 * 
 * @param {User} user The Pokebot user who owns the Pokemon.
 * @param {Pokemon} pokemon The Pokemon that is being checked for evolution.
 * @param {string} method The evolution method. Should only be "`level`", "`trade`", or "`item`".
 * 
 * @returns {string} The name of the Pokemon that it will evolve into, or null
 * if the Pokemon is not ready to evolve.
 */
async function checkEvolve(user, pokemon, method) {
    var ownedPokemon = await getPokemon(user.user_id);
    if (ownedPokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var moves = [pokemon.move_1, pokemon.move_2, pokemon.move_3, pokemon.move_4];

    var heldItem = "None";
    if (pokemon.item != "None" && pokemon.item != null) {
        heldItem = await getItem(pokemon.item);
        if (heldItem != null) {
            heldItem = heldItem.name;
        } else {
            heldItem = pokemon.item;
        }
    }

    var path = generatePokemonJSONPath(pokemon.name);
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    var pkmn = JSON.parse(data);

    var cur = convertToTimeZone(user);
    var n = moment(cur).format('H');
    
    if (method === "level") {
        if (pokemon.form === "Alolan") { //alolan forms
            if (pokemon.name === "Meowth") {
                if (pokemon.friendship >= 220) {
                    return "Persian";
                }
            } else if (pokemon.name === "Rattata") {
                if (pokemon.level_current >= 20 && ((n >= 0 && n < 6) || n >= 18)) {
                    return "Raticate";
                }
            } else if (pokemon.name === "Diglett") {
                if (pokemon.level_current >= 26) {
                    return "Dugtrio";
                }
            } else if (pokemon.name === "Geodude") {
                if (pokemon.level_current >= 25) {
                    return "Graveler";
                }
            } else if (pokemon.name === "Grimer") {
                if (pokemon.level_current >= 38) {
                    return "Muk";
                }
            } else {
                return null;
            }
        }
        
        if(pkmn.hasOwnProperty('evolutions')) {
            //cosmoem will evolve based on time
            if (pokemon.name === "Cosmoem") {
                if (pokemon.level_current >= 53) {
                    if ((n >= 0 && n < 6) || n >= 18) {
                        return "Lunala"; 
                    } else {
                        return "Solgaleo";
                    }
                }
            }
            //mantyke requires user to own a remoraid
            if (pokemon.name === "Mantyke") {
                var m;
                for (m = 0; m < ownedPokemon.length; m++) {
                    if (ownedPokemon[m].name === "Remoraid") {
                        return "Mantine";
                    }
                }
            }
            //pangoro requires user to have a dark type
            if (pokemon.name === "Pancham") {
                if (pokemon.level_current >= 32) {
                    var m;
                    for (m = 0; m < ownedPokemon.length; m++) {
                        if ((ownedPokemon[m].type_1 === "Dark" || ownedPokemon[m].type_2 === "Dark") && ownedPokemon[m].lead === 0) {
                            return "Pangoro";
                        }
                    }
                }
            }
            //inkay normally requires user to hold device upside down, but in this case only has level requirement
            if (pokemon.name === "Inkay") {
                if (pokemon.level_current >= 30) {
                    return "Malamar";
                }
            }
            //sliggoo requires it to be raining
            if (pokemon.name === "Sliggoo") {
                if (pokemon.level_current >= 50) {
                    if (user.region === "Johto") {
                        if (user.location === "Route 33" || user.location === "Lake of Rage") {
                            return "Goodra";
                        }
                    }
                    if (user.region === "Hoenn") {
                        if (user.location === "Route 119" || user.location === "Route 120" || user.location === "Route 123") {
                            return "Goodra";
                        }
                    }
                    if (user.region === "Sinnoh") {
                        if (user.location === "Route 212" || user.location === "Route 213" || user.location === "Route 214" || user.location === "Route 215") {
                            return "Goodra";
                        }
                    }
                    if (user.region === "Unova") {
                        if (user.location === "Route 6" || user.location === "Route 7" || user.location === "Route 8" || user.location === "Route 12") {
                            return "Goodra";
                        }
                    }
                    if (user.region === "Kalos") {
                        if (user.location === "Route 14 (Laverre Nature Trail)" || user.location === "Route 19 (Grande Vallée Way)" || user.location === "Route 21 (Dernière Way)" || user.location === "Laverre City") {
                            return "Goodra";
                        }
                    }
                    if (user.region === "Alola") {
                        if (user.location === "Po Town" || user.location === "Route 17") {
                            return "Goodra";
                        }
                    }
                }
            }
            //tyrogue evolves based on its highest stat
            if (pokemon.name === "Tyrogue") {
                if (pokemon.level_current >= 20) {
                    if (pokemon.stats_atk > pokemon.stat_def) {
                        return "Hitmonlee";
                    } else if (pokemon.stat_def > pokemon.stat_atk) {
                        return "Hitmonchan";
                    } else {
                        return "Hitmontop";
                    }
                }
            }
            //wurmple normally evolves based on its personality value, but in this case it evolves based on its IV total
            if (pokemon.name === "Wurmple") {
                if (pokemon.level_current >= 7) {
                    var pval = Math.trunc(pokemon.personality / 65536);
                    if (pval % 10 < 5) {
                        return "Silcoon";
                    } else {
                        return "Cascoon";
                    }
                }
            }
            var i;
            for (i = 0; i < pkmn.evolutions.length; i++) {
                //holding an item
                if (pkmn.evolutions[i].hasOwnProperty('hold_item')) {
                    if (heldItem.name === pkmn.evolutions[i].hold_item) {
                        if (pkmn.evolutions[i].conditions[0] === "Nighttime") { //night holding an item
                            if ((n >= 0 && n < 6) || n >= 18) {
                                return pkmn.evolutions[i].to; 
                            }
                        }
                        if (pkmn.evolutions[i].conditions[0] === "Daytime") { //day holding an item
                            if (n >= 6 && n < 18) {
                                return pkmn.evolutions[i].to; 
                            }
                        }
                    }
                }
                //know a specific move
                if (pkmn.evolutions[i].hasOwnProperty('move_learned')) {
                    if (moves[0] === pkmn.evolutions[i].move_learned || moves[1] === pkmn.evolutions[i].move_learned || moves[2] === pkmn.evolutions[i].move_learned || moves[3] === pkmn.evolutions[i].move_learned) {
                        return pkmn.evolutions[i].to; 
                    }
                }
                if (pkmn.evolutions[i].hasOwnProperty('conditions')) {
                    //specific to sylveon, only checks for Fairy moves that eevee can learn
                    if (pkmn.evolutions[i].conditions[0] === "Fairy Type Move") {
                        if (moves[0] === "Charm" || moves[0] === "Baby-Doll Eyes" || moves[1] === "Charm" || moves[1] === "Baby-Doll Eyes" || moves[2] === "Charm" || moves[2] === "Baby-Doll Eyes" || moves[3] === "Charm" || moves[3] === "Baby-Doll Eyes") {
                            return pkmn.evolutions[i].to; 
                        }
                    }
                    //level up in a magnetic field area
                    if (pkmn.evolutions[i].conditions[0] === "In a Magnetic Field area") {
                        var magnetic_fields = ["New Mauville", "Mt. Coronet", "Chargestone Cave", "Route 13 (Lumiose Badlands)", "Vast Poni Canyon", "Blush Mountain"];
                        if (magnetic_fields.indexOf(user.location) >= 0) {
                            return pkmn.evolutions[i].to; 
                        }
                    }
                    //level up near a mossy rock
                    if (pkmn.evolutions[i].conditions[0] === "Near a Mossy Rock") {
                        var mossy_rocks = ["Petalburg Woods", "Eterna Forest", "Pinwheel Forest", "Route 20 (Winding Woods)", "Lush Jungle"];
                        if (mossy_rocks.indexOf(user.location) >= 0) {
                            return pkmn.evolutions[i].to; 
                        }
                    }
                    //level up near an icy rock
                    if (pkmn.evolutions[i].conditions[0] === "Near an Icy Rock") {
                        var mossy_rocks = ["Shoal Cave", "Route 217", "Twist Mountain", "Frost Cavern", "Mount Lanakila"];
                        if (mossy_rocks.indexOf(user.location) >= 0) {
                            return pkmn.evolutions[i].to; 
                        }
                    }
                    //level up at mount lanakila (aka Crabrawler -> Crabominable)
                    if (pkmn.evolutions[i].conditions[0] === "At Mount Lanakila") {
                        if (user.location === "Mount Lanakila") {
                            return pkmn.evolutions[i].to; 
                        }
                    }
                }
                //friendship
                if (pkmn.evolutions[i].hasOwnProperty('happiness') && pokemon.friendship >= 220) {
                    if(!pkmn.evolutions[i].hasOwnProperty('conditions')) {
                        return pkmn.evolutions[i].to;
                    } else if (pkmn.evolutions[i].hasOwnProperty('conditions')) {
                        if (pkmn.evolutions[i].conditions[0] === "Nighttime") { //night friendship
                            if ((n >= 0 && n < 6) || n >= 18) {
                                return pkmn.evolutions[i].to; 
                            }
                        }
                        if (pkmn.evolutions[i].conditions[0] === "Daytime") { //day friendship
                            if (n >= 6 && n < 18) {
                                return pkmn.evolutions[i].to; 
                            }
                        }
                        if (pkmn.evolutions[i].conditions[0] === "Male") { //male only
                            if (pokemon.gender === "Male") {
                                return pkmn.evolutions[i].to; 
                            }
                        }
                        if (pkmn.evolutions[i].conditions[0] === "Female") { //female only
                            if (pokemon.gender === "Female") {
                                return pkmn.evolutions[i].to; 
                            }
                        }
                    }
                }
                //level
                if (pkmn.evolutions[i].hasOwnProperty('level')) {
                    if (pkmn.evolutions[i].level <= pokemon.level_current && !pkmn.evolutions[i].hasOwnProperty('conditions')) {
                        return pkmn.evolutions[i].to;
                    } else if (pkmn.evolutions[i].level <= pokemon.level_current && pkmn.evolutions[i].hasOwnProperty('conditions')) {
                        if (pkmn.evolutions[i].conditions[0] === "Nighttime") { //night level up
                            if ((n >= 0 && n < 6) || n >= 18) {
                                return pkmn.evolutions[i].to; 
                            }
                        }
                        if (pkmn.evolutions[i].conditions[0] === "Daytime") { //day level up
                            if (n >= 6 && n < 18) {
                                return pkmn.evolutions[i].to; 
                            }
                        }
                        if (pkmn.evolutions[i].conditions[0] === "Male") { //male only
                            if (pokemon.gender === "Male") {
                                return pkmn.evolutions[i].to; 
                            }
                        }
                        if (pkmn.evolutions[i].conditions[0] === "Female") { //female only
                            if (pokemon.gender === "Female") {
                                return pkmn.evolutions[i].to; 
                            }
                        }
                    }
                }
            }
        } else {
            return null;
        }
    } else if (method === "trade") {
        return null;
    } else if (method === "item") {
        return null;
    }
}

/**
 * Raises a Pokemon's level by one and updates its stats accordingly.
 * 
 * @param {Pokemon} Pokemon The Pokemon to level up.
 * 
 * @returns {number[]} The Pokemon's stats after it leveled up, or null
 * if an error was encountered.
 */
function levelUp(pokemon) {
    var path = generatePokemonJSONPath(pokemon.name);
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    var pkmn = JSON.parse(data);
    
    var stats = [pokemon.stat_hp, pokemon.stat_atk, pokemon.stat_def, pokemon.stat_spatk, pokemon.stat_spdef, pokemon.stat_spd];
    var EVs = [pokemon.ev_hp, pokemon.ev_atk, pokemon.ev_def, pokemon.ev_spatk, pokemon.ev_spdef, pokemon.ev_spd];
    var IVs = [pokemon.iv_hp, pokemon.iv_atk, pokemon.iv_def, pokemon.iv_spatk, pokemon.iv_spdef, pokemon.iv_spd];
    var nature = pokemon.nature;
    
    pokemon.level_current++;
    var level = pokemon.level_current;
    
    var baseStats;
    if ((pokemon.name === "Pumpkaboo" || pokemon.name === "Gourgeist") && pokemon.form != "Small Size") {
        if (pokemon.form === "Average Size") {
            baseStats = [pkmn.variations[0].base_stats.hp, pkmn.variations[0].base_stats.atk, pkmn.variations[0].base_stats.def, pkmn.variations[0].base_stats.sp_atk, pkmn.variations[0].base_stats.sp_def, pkmn.variations[0].base_stats.speed];
        } else if (pokemon.form === "Large Size") {
            baseStats = [pkmn.variations[1].base_stats.hp, pkmn.variations[1].base_stats.atk, pkmn.variations[1].base_stats.def, pkmn.variations[1].base_stats.sp_atk, pkmn.variations[1].base_stats.sp_def, pkmn.variations[1].base_stats.speed];
        } else {
            baseStats = [pkmn.variations[2].base_stats.hp, pkmn.variations[2].base_stats.atk, pkmn.variations[2].base_stats.def, pkmn.variations[2].base_stats.sp_atk, pkmn.variations[2].base_stats.sp_def, pkmn.variations[2].base_stats.speed];
        }
    } else if (pokemon.name === "Lycanroc" && pokemon.form != "Midday") {
        if (pokemon.form === "Midnight") {
            baseStats = [pkmn.variations[0].base_stats.hp, pkmn.variations[0].base_stats.atk, pkmn.variations[0].base_stats.def, pkmn.variations[0].base_stats.sp_atk, pkmn.variations[0].base_stats.sp_def, pkmn.variations[0].base_stats.speed];
        } else {
            baseStats = [pkmn.variations[1].base_stats.hp, pkmn.variations[1].base_stats.atk, pkmn.variations[1].base_stats.def, pkmn.variations[1].base_stats.sp_atk, pkmn.variations[1].base_stats.sp_def, pkmn.variations[1].base_stats.speed];
        }
    } else {
        baseStats = [pkmn.base_stats.hp, pkmn.base_stats.atk, pkmn.base_stats.def, pkmn.base_stats.sp_atk, pkmn.base_stats.sp_def, pkmn.base_stats.speed];
    }
    
    stats[0] = calculateStatAtLevel(level, baseStats[0], IVs[0], EVs[0], nature, "hp");
    stats[1] = calculateStatAtLevel(level, baseStats[1], IVs[1], EVs[1], nature, "atk");
    stats[2] = calculateStatAtLevel(level, baseStats[2], IVs[2], EVs[2], nature, "def");
    stats[3] = calculateStatAtLevel(level, baseStats[3], IVs[3], EVs[3], nature, "sp_atk");
    stats[4] = calculateStatAtLevel(level, baseStats[4], IVs[4], EVs[4], nature, "sp_def");
    stats[5] = calculateStatAtLevel(level, baseStats[5], IVs[5], EVs[5], nature, "speed");
    
    if (pokemon.name === "Shedinja") {
        stats[0] = 1;
    }
    
    pokemon.stat_hp = stats[0];
    pokemon.stat_atk = stats[1];
    pokemon.stat_def = stats[2];
    pokemon.stat_spatk = stats[3]
    pokemon.stat_spdef = stats[4]
    pokemon.stat_spd = stats[5];
    
    return stats;
}

/**
 * Checks if a Pokemon can learn a new move based on its level.
 * 
 * @todo Maybe check if the Pokemon is in the Day Care from this
 * function rather than pass an argument.
 * @todo This should simply return a list of moves that the Pokemon can learn
 * and the actual move learning should be handled in a different function.
 * @todo Add a flag that determines whether or not moves were changed so that a DB hit
 * isn't always needed.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {Pokemon} pokemon The Pokemon that is being checked for a new move,
 * @param {boolean} askForResponse If the owner of the Pokemon should be asked
 * if they want their Pokemon to learn a new move if the Pokemon already knows
 * four moves. This should only be false if the Pokemon is in the Day Care.
 * 
 * @returns {move[]} The list of moves known by the Pokemon.
 */
async function checkForNewMove(message, pokemon, askForResponse) {
    var path = generatePokemonJSONPath(pokemon.name);
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    var pkmn = JSON.parse(data);

    var alreadyKnowsMove = false;
    let knownMoves = await getPokemonKnownMoves(pokemon.pokemon_id);
    let moves = [
        {
            name: null,
            pp: null
        },
        {
            name: null,
            pp: null
        },
        {
            name: null,
            pp: null
        },
        {
            name: null,
            pp: null
        }
    ]
    let i = 0;
    for (i; i < knownMoves.length; i++) {
        moves[i].name = knownMoves[i].name;
        moves[i].pp = knownMoves[i].current_pp;
    }

    if (pokemon.form === "Alolan" && pokemon.name != "Rattata" && pokemon.name != "Raticate") {
        for (i = 0; i < pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset.length; i++) {
            if (pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].hasOwnProperty("variations") && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].level === pokemon.level_current && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].variations[0] === (pokemon.form + " " + pokemon.name)) {
                if (askForResponse) {
                    message.react(duck.id);
                }
                var m;
                for (m = 0; m < moves.length; m++) {
                    if (moves[m].name === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                        alreadyKnowsMove = true;
                    }
                }
                if (moves[0].name == null && !alreadyKnowsMove) {
                    moves[0].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[0].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (moves[1].name == null && !alreadyKnowsMove) {
                    moves[1].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[1].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (moves[2].name == null && !alreadyKnowsMove) {
                    moves[2].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[2].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (moves[3].name == null && !alreadyKnowsMove) {
                    moves[3].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[3].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (!alreadyKnowsMove) {
                    if (askForResponse) {
                        transactions[transactions.length] = new Transaction(message.author.id, "teaching your " + pokemon.name + " " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                        moves = await teachNewMove(message, pokemon, pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                        removeTransaction(message.author.id);
                    } else {
                        moves = await teachNewMoveAI(pokemon, pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    }
                } else {
                    //already knows the move
                }
                await updateMoves(pokemon, moves);
            }
        }
    } else if (pokemon.name === "Wormadam" || pokemon.name === "Shaymin" || pokemon.name === "Deoxys" || pokemon.name === "Hoopa" || pokemon.name === "Lycanroc") {
        for (i = 0; i < pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset.length; i++) {
            if (pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].hasOwnProperty("variations") && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].level === pokemon.level_current && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].variations[0] === pokemon.form) {
                if (askForResponse) {
                    message.react(duck.id);
                }
                var m;
                for (m = 0; m < moves.length; m++) {
                    if (moves[m].name === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                        alreadyKnowsMove = true;
                    }
                }
                if (moves[0].name == null && !alreadyKnowsMove) {
                    moves[0].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[0].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (moves[1].name == null && !alreadyKnowsMove) {
                    moves[1].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[1].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (moves[2].name == null && !alreadyKnowsMove) {
                    moves[2].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[2].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (moves[3].name == null && !alreadyKnowsMove) {
                    moves[3].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[3].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (!alreadyKnowsMove) {
                    if (askForResponse) {
                        transactions[transactions.length] = new Transaction(message.author.id, "teaching your " + pokemon.name + " " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                        moves = await teachNewMove(message, pokemon, pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                        removeTransaction(message.author.id);
                    } else {
                        moves = await teachNewMoveAI(pokemon, pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    }
                } else {
                    //already knows the move
                }
                await updateMoves(pokemon, moves);
            }
        }
    } else if (pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[0].hasOwnProperty("variations")) {
        for (i = 0; i < pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset.length; i++) {
            if (pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].hasOwnProperty("variations") && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].level === pokemon.level_current && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].variations === pokemon.name) {
                if (askForResponse) {
                    message.react(duck.id);
                }
                var m;
                for (m = 0; m < moves.length; m++) {
                    if (moves[m].name === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                        alreadyKnowsMove = true;
                    }
                }
                if (moves[0].name == null && !alreadyKnowsMove) {
                    moves[0].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[0].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (moves[1].name == null && !alreadyKnowsMove) {
                    moves[1].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[1].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (moves[2].name == null && !alreadyKnowsMove) {
                    moves[2].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[2].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (moves[3].name == null && !alreadyKnowsMove) {
                    moves[3].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[3].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (!alreadyKnowsMove) {
                    if (askForResponse) {
                        transactions[transactions.length] = new Transaction(message.author.id, "teaching your " + pokemon.name + " " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                        moves = await teachNewMove(message, pokemon, pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                        removeTransaction(message.author.id);
                    } else {
                        moves = await teachNewMoveAI(pokemon, pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    }
                } else {
                    //already knows the move
                }
                await updateMoves(pokemon, moves);
            }
        }
    } else {
        for (i = 0; i < pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset.length; i++) {
            if (pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].level === pokemon.level_current) {
                if (askForResponse) {
                    message.react(duck.id);
                }
                var m;
                for (m = 0; m < moves.length; m++) {
                    if (moves[m].name === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                        alreadyKnowsMove = true;
                    }
                }
                if (moves[0].name == null && !alreadyKnowsMove) {
                    moves[0].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[0].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (moves[1].name == null && !alreadyKnowsMove) {
                    moves[1].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[1].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (moves[2].name == null && !alreadyKnowsMove) {
                    moves[2].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[2].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                } else if (moves[3].name == null && !alreadyKnowsMove) {
                    moves[3].name = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                    moves[3].pp = getMovePP(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    if (askForResponse) {
                        message.channel.send(message.author.username + "'s " + pokemon.name + " learned " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move + "!");
                    }
                    
                } else if (!alreadyKnowsMove) {
                    if (askForResponse) {
                        transactions[transactions.length] = new Transaction(message.author.id, "teaching your " + pokemon.name + " " + pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                        moves = await teachNewMove(message, pokemon, pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                        removeTransaction(message.author.id);
                    } else {
                        moves = await teachNewMoveAI(pokemon, pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move);
                    }
                } else {
                    //already knows the move
                }
                await updateMoves(pokemon, moves);
            }
        }
    }    

    return new Promise(function(resolve) {
        resolve(moves);
    });
}

/**
 * Asks the Pokemon's owner which move the Pokemon should forget if the
 * Pokemon already knows four moves but wants to learn a new move. The
 * move selected by the user is replaced with the new move.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {Pokemon} pokemon The Pokemon that wants to learn a new move.
 * @param {string} moveName The name of the new move the Pokemon wants to learn.
 * 
 * @returns {move[]} The Pokemon's moveset after the owner has made a choice. 
 */
async function teachNewMove(message, pokemon, moveName) {
    let knownMoves = await getPokemonKnownMoves(pokemon.pokemon_id);
    let moves = [
        {
            name: null,
            pp: null
        },
        {
            name: null,
            pp: null
        },
        {
            name: null,
            pp: null
        },
        {
            name: null,
            pp: null
        }
    ]
    let i = 0;
    for (i; i < knownMoves.length; i++) {
        moves[i].name = knownMoves[i].name;
        moves[i].pp = knownMoves[i].current_pp;
    }
    var m;
    var fields = [];
    var name;
    for (m = 0; m <= moves.length; m++) {
        if (m < 4) {
            if (moves[m].name != null) {
                name = moves[m].name.toLowerCase();
            }
        } else {
            name = moveName.toLowerCase();
        }
        
        if (name === "10000000 volt thunderbolt" || name === "10,000,000 volt thunderbolt") {
            name = "10 000 000 volt thunderbolt";
        }

        name = name.replace(/-/g,"_");
        name = name.replace(/'/g,"_");
        name = name.replace(/ /g,"_");

        var path = "../data/move/" + name + ".json";
        var data;
        try {
            data = fs.readFileSync(path, "utf8");
        } catch (err) {
            return null;
        }

        var move = JSON.parse(data);

        var acc = move.accuracy;
        if (acc === 0) {
            acc = "---"
        }

        var pow = move.power;
        if (pow === 0) {
            pow = "---"
        }

        var pp = move.pp;
        if (pp === 0) {
            pp = "---"
        }
        
        var type_icon = client.emojis.find(type_icon => type_icon.name === move.type);
        var nameField;
        var valueField;
        var cat_icon = client.emojis.find(cat_icon => cat_icon.name === move.category);
        var moveCat = `${move.category[0].toUpperCase()}${move.category.slice(1)}`;
        if (m < 4) {
            nameField = "Known move " + (m + 1).toString() + ":";
            valueField = type_icon + " " + moves[m].name + "\n" + cat_icon + " " + moveCat + "\nPower: " + pow + "\nAccuracy: " + acc + "\nPP: " + pp;
        } else {
            nameField = "New move to learn:";
            valueField = type_icon + " " + moveName + "\n" + cat_icon + " " + moveCat + "\nPower: " + pow + "\nAccuracy: " + acc + "\nPP: " + pp;
        }
        
        fields[fields.length] = {
            "name": nameField,
            "value": valueField,
            "inline": true
        }
    }
    
    fields[fields.length] = {
            "name": "Stats",
            "value": "HP: " + pokemon.stat_hp + "\n" +
                    "Attack: " + pokemon.stat_atk + "\n" +
                    "Defense: " + pokemon.stat_def + "\n" +
                    "Sp. Attack: " + pokemon.stat_spatk + "\n" +
                    "Sp. Defense: " + pokemon.stat_spdef + "\n" +
                    "Speed: " + pokemon.stat_spd,
            "inline": true
        }
    
    var spriteLink = generateSpriteLink(pokemon.name, pokemon.gender, pokemon.form);
    if (spriteLink === null) {
        return new Promise(function(resolve) {
            resolve(null);
        });
    }

    var modelLink = generateModelLink(pokemon.name, pokemon.shiny, pokemon.gender, pokemon.form);
    if (modelLink === null) {
        return new Promise(function(resolve) {
            resolve(null);
        });
    }

    var name = pokemon.name;
    if (pokemon.nickname != null) {
        name = pokemon.nickname;
    }
    const embed = {
       "author": {
            "name": name,
            "icon_url": spriteLink,
        },
        "title": "Teach a new move",
        "description": "<@" + message.author.id + "> your " + name + " wants to learn " + moveName + ", but already knows four moves. Please select a move to replace by typing its name or number as shown in this message, or type \"Cancel\" to keep the current moves.",
        "color": getTypeColor(pokemon.type_1),
        "thumbnail": {
             "url": "attachment://" + pokemon.name + ".gif"
        },
        "fields": fields
    };
    
    var mssg = await message.channel.send({ embed, files: [{ attachment: modelLink, name: (pokemon.name + '.gif') }] });
    
    var cancel = false;
    var input = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 300000, errors: ['time'] })
        .then(collected => {
            input = collected.first().content.toString().toLowerCase();
        })
        .catch(collected => {
            input = "cancel";
            cancel = true;
        });

        if (input === "cancel") {
            cancel = true;
            input = 0;
        } else if (input === "1" || input === moves[0].name.toLowerCase()) {
            cancel = true;
            input = 1;
        } else if (input === "2" || input === moves[1].name.toLowerCase()) {
            cancel = true;
            input = 2;
        } else if (input === "3" || input === moves[2].name.toLowerCase()) {
            cancel = true;
            input = 3;
        } else if (input === "4" || input === moves[3].name.toLowerCase()) {
            cancel = true;
            input = 4;
        } else if (input != null) {
            message.channel.send("Command not recognized.");
            message.channel.send({ embed, files: [{ attachment: modelLink, name: (pokemon.name + '.gif') }] });
            input = 0;
        } else {
            input = 0;
        }
    }

    if (input === 0) {
        message.channel.send(message.author.username + " cancelled teaching " + name + " the move " + moveName + ".");
    } else if (input === 1) {
        message.channel.send(message.author.username + "'s " + name + " forgot " + moves[0].name + " and learned " + moveName + ".");
        moves[0].name = moveName;
        moves[0].pp = getMovePP(moveName);
    } else if (input === 2) {
        message.channel.send(message.author.username + "'s " + name + " forgot " + moves[1].name + " and learned " + moveName + ".");
        moves[1].name = moveName;
        moves[1].pp = getMovePP(moveName);
    } else if (input === 3) {
        message.channel.send(message.author.username + "'s " + name + " forgot " + moves[2].name + " and learned " + moveName + ".");
        moves[2].name = moveName;
        moves[2].pp = getMovePP(moveName);
    } else if (input === 4) {
        message.channel.send(message.author.username + "'s " + name + " forgot " + moves[3].name + " and learned " + moveName + ".");
        moves[3].name = moveName;
        moves[3].pp = getMovePP(moveName);
    }

    return moves;
}

/**
 * An experimental algorithm that automatically decides which move to
 * replace, if any, when a Pokemon with four moves wants to learn a
 * new move, and replaces that move. This is used by the day care.
 * 
 * @param {Pokemon} pokemon The Pokemon that wants to learn a new move.
 * @param {string} move The name of the new move the Pokemon wants to learn.
 * 
 * @returns {move[]} The Pokemon's moveset after a decision has been made.
 */
async function teachNewMoveAI(pokemon, move) {
    var highestStat;
    if (((pokemon.stat_atk / pokemon.stat_spatk) > 1.25)) {
        highestStat = "atk";
    } else if (((pokemon.stat_atk / pokemon.stat_spatk) < 0.75)) {
        highestStat = "spatk";
    } else {
        highestStat = "both";
    }

    var moves = [
        {
            name: pokemon.move_1,
            pp: pokemon.move_1_pp
        },
        {
            name: pokemon.move_2,
            pp: pokemon.move_2_pp
        },
        {
            name: pokemon.move_3,
            pp: pokemon.move_3_pp
        },
        {
            name: pokemon.move_4,
            pp: pokemon.move_4_pp
        }
    ]

    var name = move.toLowerCase();
    
    if (name === "10000000 volt thunderbolt" || name === "10,000,000 volt thunderbolt") {
        name = "10 000 000 volt thunderbolt";
    }

    name = name.replace(/-/g,"_");
    name = name.replace(/'/g,"_");
    name = name.replace(/ /g,"_");

    var path = "../data/move/" + name + ".json";
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        return null;
    }

    var newMove = JSON.parse(data);

    var weights = [0,0,0,0];

    var i;
    for (i = 0; i < moves.length; i++) {
        var currentMove = moves[i].name.toLowerCase();
        
        if (currentMove === "10000000 volt thunderbolt" || currentMove === "10,000,000 volt thunderbolt") {
            currentMove = "10 000 000 volt thunderbolt";
        }

        currentMove = currentMove.replace(/-/g,"_");
        currentMove = currentMove.replace(/'/g,"_");
        currentMove = currentMove.replace(/ /g,"_");

        var mpath = "../data/move/" + currentMove + ".json";
        var mdata;
        try {
            mdata = fs.readFileSync(mpath, "utf8");
        } catch (err) {
            return null;
        }

        var knownMove = JSON.parse(mdata);

        weights[i] += (3 * newMove.priority);
        weights[i] += (2 * newMove.critical_hit);

        if (knownMove.category === "status" && newMove.category === "status") {
            weights[i] = 100;
            weights[i] += (newMove.pp - knownMove.pp);
            weights[i] += (2 * (newMove.accuracy - knownMove.accuracy));
        } else {
            if (newMove.category === "physical" && highestStat === "atk") {
                weights[i] += 20;
            } else if (newMove.category === "special" && highestStat === "spatk") {
                weights[i] += 20;
            } else if (newMove.category != "status" && knownMove.category === "status") {
                weights[i] += 50;
            } else if (newMove.category === "status" && knownMove.category != "status") {
                weights[i] -= 50;
            }
    
            if (knownMove.category === "physical" && highestStat === "atk") {
                weights[i] -= 20;
            } else if (knownMove.category === "special" && highestStat === "spatk") {
                weights[i] -= 20;
            }
    
            if ((knownMove.type === newMove.type) && (knownMove.power <= newMove.power) && (knownMove.accuracy <= (newMove.accuracy - 15))) {
                weights[i] = 200;
            } else {
                if (knownMove.type === newMove.type) {
                    weights[i] += 10;
                }
        
                weights[i] += (newMove.pp - knownMove.pp);
                weights[i] += (newMove.power - knownMove.power);
                weights[i] += (2 * (newMove.accuracy - knownMove.accuracy));
            }
    
            if (knownMove.type === newMove.type) {
                weights[i] += 10;
            }
    
            weights[i] += (newMove.pp - knownMove.pp);
            weights[i] += (newMove.power - knownMove.power);
            weights[i] += (2 * (newMove.accuracy - knownMove.accuracy));
        }
    }

    var max = Math.max(...weights);
    var index = weights.indexOf(max);
    moves[index] = {
        name: move,
        pp: newMove.pp
    }

    return new Promise(function(resolve) {
        resolve(moves);
    });
}

/**
 * Gives experience to a Pokemon.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {number} amount The amount of exp. to give to the Pokemon.
 * 
 * @returns {boolean} True if no errors were encountered.
 */
async function giveXP(message, amount) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    var pokemon = await getLeadPokemon(message.author.id);
    if (pokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    var item = "None";
    if (pokemon.item != "None" && pokemon.item != null) {
        item = await getItem(pokemon.item);
        if (item === null) {
            item = pokemon.item;
        } else {
            item = item.name;
        }
    }

    if (pokemon.level_current === 100) {
        return false;
    }
    
    var friend = 0.2;
    if (pokemon.friendship >= 200) {
        friend = 0.1;
    }
    
    if (pokemon.ball === "Luxury Ball") {
        friend = friend * 2;
    }
    
    if (item.name === "Soothe Bell") {
        friend = friend * 1.5;
    }
    
    if ((pokemon.friendship + friend) > 255) {
        pokemon.friendship = 255;
    } else {
        pokemon.friendship += friend;
    }
    
    var givenXP = Math.floor(((pokemon.level_current / 10) + 1).toFixed(1) * amount);
    
    if (pokemon.original_trainer != pokemon.current_trainer) {
        givenXP += Math.floor(givenXP * 1.5);
    }
    
    if (item.name === "Lucky Egg") {
        givenXP += Math.floor(givenXP * 1.5);
    }
    
    pokemon.xp += givenXP;
    var done = false;
    var evolveTo = null;
    let moves = [
        {
            name: null,
            pp: null
        },
        {
            name: null,
            pp: null
        },
        {
            name: null,
            pp: null
        },
        {
            name: null,
            pp: null
        }
    ]
    let knownMoves;
    while (done === false) {
        var next = getXpToNextLevel(pokemon.name, pokemon.xp, pokemon.level_current);
        if (next != null && next <= 0) {
            message.react(pew.id);
            var statsBefore = [pokemon.stat_hp, pokemon.stat_atk, pokemon.stat_def, pokemon.stat_spatk, pokemon.stat_spdef, pokemon.stat_spd];
            var statsAfter = levelUp(pokemon);
            
            friend = 5;
            if (pokemon.friendship >= 100 && pokemon.friendship < 200) {
                friend = 4;
            } else if (pokemon.friendship >= 200) {
                friend = 3;
            }
            if (pokemon.ball === "Luxury Ball") {
                friend = friend * 2;
            }
            
            if (item.name === "Soothe Bell") {
                friend = friend * 1.5;
            }
            
            if ((pokemon.friendship + friend) > 255) {
                pokemon.friendship = 255;
            } else {
                pokemon.friendship += friend;
            }
            
            if (pokemon.level_current >= user.level) {
                var query = "UPDATE user SET user.level = ? WHERE user.user_id = ?";
                con.query(query, [pokemon.level_current, message.author.id], function (err) {
                    if (err) {
                        return reject(err);
                    }
                });
            }
            
            message.channel.send(message.author.username + " your " + pokemon.name + " reached level " + pokemon.level_current + "!\nHP +" + (statsAfter[0] - statsBefore[0]) + "\nAttack +" + (statsAfter[1] - statsBefore[1]) + "\nDefense +" + (statsAfter[2] - statsBefore[2]) + "\nSp. Attack +" + (statsAfter[3] - statsBefore[3]) + "\nSp. Defense +" + (statsAfter[4] - statsBefore[4]) + "\nSpeed +" + (statsAfter[5] - statsBefore[5]));
            knownMoves = await getPokemonKnownMoves(pokemon.pokemon_id);
            let i = 0;
            for (i; i < knownMoves.length; i++) {
                moves[i].name = knownMoves[i].name;
                moves[i].pp = knownMoves[i].current_pp;
            }
            moves = await checkForNewMove(message, pokemon, true);
            next = getXpToNextLevel(pokemon.name, pokemon.xp, pokemon.level_current);
            evolveTo = null;
            if (pokemon.item != "Everstone") {
                evolveTo = await checkEvolve(user, pokemon, "level", null);
            }
        } else {
            if (isInEvolution(message.author.id) === null && evolveTo != null) {
                if (evolveTo === "Malamar") {
                    message.channel.send("˙ʇdǝɔɔɐ oʇ ,,∀,,  ɹo lǝɔuɐɔ oʇ ,,q,, ǝdʎ┴ ¡ɹɐɯɐlɐW oʇuᴉ ƃuᴉʌloʌǝ sᴉ ʎɐʞuI ɹnoʎ <@" + message.author.id + ">");
                } else {
                    message.channel.send("<@" + message.author.id + "> your " + pokemon.name + " is evolving into " + evolveTo + "! Type \"B\" to cancel or  \"A\" to accept.");
                }
                pokemon.evolving = 1;
                evolving[evolving.length] = new Evolution(message.author.id, pokemon.name, evolveTo);
            }
            done = true;
        }
    }

    await doQuery("UPDATE pokemon SET ? WHERE pokemon.pokemon_id = ?", [pokemon, pokemon.pokemon_id]);

    return true;
}

/**
 * Gives experience to all Pokemon owned by a user that are in the Day Care.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors were encountered.
 */
async function giveDayCareXP(message) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    var pokemon = await getDaycare(message.author.id);
    if (pokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var item = "None";
    var i;
    for (i = 0; i < pokemon.length; i++) {
        if (pokemon[i].item != "None" && pokemon[i].item != null) {
            item = await getItem(pokemon[i].item);
            if (item === null) {
                item = pokemon[i].item;
            } else {
                item = item.name;
            }
        }

        if (pokemon[i].level_current === 100) {
            return false;
        }
        
        var amount = Math.floor(Math.random() * 30);
        amount += Math.floor(Math.random() * 30);
        amount += Math.floor(Math.random() * 30);
        var givenXP = Math.floor(((pokemon[i].level_current / 10) + 1).toFixed(1) * amount);
        
        if (item.name === "Lucky Egg") {
            givenXP += Math.floor(givenXP * 1.5);
        }
        
        pokemon[i].xp += givenXP;
        var done = false;
        var evolveTo = null;
        while (done === false) {
            var next = getXpToNextLevel(pokemon[i].name, pokemon[i].xp, pokemon[i].level_current);
            if (next != null && next <= 0) {
                var statsBefore = [pokemon[i].stat_hp, pokemon[i].stat_atk, pokemon[i].stat_def, pokemon[i].stat_spatk, pokemon[i].stat_spdef, pokemon[i].stat_spd];
                var statsAfter = levelUp(pokemon[i]);
                
                if(pokemon[i].level_current >= user.level) {
                    var query = "UPDATE user SET user.level = ? WHERE user.user_id = ?";
                    con.query(query, [pokemon[i].level_current, message.author.id], function (err) {
                        if (err) {
                            return reject(err);
                        }
                    });
                }
                
                var moves = [
                    {
                        name: pokemon[i].move_1,
                        pp: pokemon[i].move_1_pp
                    },
                    {
                        name: pokemon[i].move_2,
                        pp: pokemon[i].move_2_pp
                    },
                    {
                        name: pokemon[i].move_3,
                        pp: pokemon[i].move_3_pp
                    },
                    {
                        name: pokemon[i].move_4,
                        pp: pokemon[i].move_4_pp
                    }
                ]
                moves = await checkForNewMove(message, pokemon[i], false);
                next = getXpToNextLevel(pokemon[i].name, pokemon[i].xp, pokemon[i].level_current);
                pokemon[i].move_1 = moves[0].name;
                pokemon[i].move_1_pp = moves[0].pp;
                pokemon[i].move_2 = moves[1].name;
                pokemon[i].move_2_pp = moves[1].pp;
                pokemon[i].move_3 = moves[2].name;
                pokemon[i].move_3_pp = moves[2].pp;
                pokemon[i].move_4 = moves[3].name;
                pokemon[i].move_4_pp = moves[3].pp;
            } else {
                done = true;
            }
        }

        var query = "UPDATE pokemon SET ? WHERE pokemon.pokemon_id = ?";
        con.query(query, [pokemon[i], pokemon[i].pokemon_id], function (err) {
            if (err) {
                console.log(err);
                return false;
            }
        });
    }
    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Calculates how much experience a Pokemon must have earned to reach its current level.
 * 
 * @param {string} rate The leveling rate of the Pokemon.
 * @param {number} currentLevel The current level of the Pokemon.
 * 
 * @returns {number} The minium amount of experience a Pokemon must have earned to reach its current level.
 */
function getTotalXpAtLevel(rate, currentLevel) {
    var xpData;
    try {
        xpData = fs.readFileSync("../data/xp.json", "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    var xpTable = JSON.parse(xpData);
    
    if (rate === "Erratic") {
       return xpTable.erratic[currentLevel - 1];
    } else if (rate === "Fast") {
        return xpTable.fast[currentLevel - 1];
    } else if (rate === "Medium Fast") {
        return xpTable.medium_fast[currentLevel - 1];
    } else if (rate === "Medium Slow") {
        return xpTable.medium_slow[currentLevel - 1];
    } else {
        return xpTable.slow[currentLevel - 1];
    }
}

/**
 * Calculates how much more experience a Pokemon needs to earn until it reaches its next level.
 * 
 * @todo The three parameters could be replaced by just one if a Pokemon object is passed instead.
 * @todo Perhaps return -1 if Pokemon is level 100 to differentiate between an error or not.
 * 
 * @param {string} name The name of the Pokemon.
 * @param {number} currentTotalXp The total experience the Pokemon has earned.
 * @param {number} currentLevel The current level of the Pokemon.
 * 
 * @returns {number} The amount of experience the Pokemon needs to reach its next level, or null
 * if either Pokemon is level 100 or an error was encountered.
 */
function getXpToNextLevel(name, currentTotalXp, currentLevel) {
    if(currentLevel === 100) {
        return null;
    }
    var path = generatePokemonJSONPath(name);
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    var pkmn = JSON.parse(data);
    
    var xpData;
    try {
        xpData = fs.readFileSync('../data/xp.json', "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    var xpTable = JSON.parse(xpData);
    
    var rate = pkmn.leveling_rate;
    if (rate === "Erratic") {
       return (xpTable.erratic[currentLevel] - currentTotalXp);
    } else if (rate === "Fast") {
        return (xpTable.fast[currentLevel] - currentTotalXp);
    } else if (rate === "Medium Fast") {
        return (xpTable.medium_fast[currentLevel] - currentTotalXp);
    } else if (rate === "Medium Slow") {
        return (xpTable.medium_slow[currentLevel] - currentTotalXp);
    } else {
        return (xpTable.slow[currentLevel] - currentTotalXp);
    }
}

/**
 * Gets the nature's multiplier for a given stat.
 * 
 * @param {string} nature The name of the nature.
 * @param {string} statName The name of the stat.
 * 
 * @returns {number} The nature's multiplier for the given stat,
 * or null if an error is encountered.
 */
function getNatureStatMultiplier(nature, statName) {
    var path = generateNatureJSONPath(nature);
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    var effect = JSON.parse(data);
    
    if(effect.increased_stat === statName) {
        return 1.1;
    } else if (effect.decreased_stat === statName) {
        return 0.9;
    }
    return 1;
}

/**
 * Calculates a Pokemon's single stat for its current level.
 * 
 * @todo All parameters besides `baseValue` could be replaced by one Pokemon object.
 * 
 * @param {number} level The level of the Pokemon.
 * @param {number} baseValue The Pokemon's base stat value for the given stat.
 * @param {number} iv The Pokemon's IV for the given stat.
 * @param {number} ev The Pokemon's EV for the given stat.
 * @param {string} nature The name of the Pokemon's nature.
 * @param {string} statName The name of the given stat.
 * 
 * @returns {number} The Pokemon's stat for its current level.
 */
function calculateStatAtLevel(level, baseValue, iv, ev, nature, statName) {
    var stat;
    if (statName === "hp") {
        stat = Math.floor(((2 * baseValue + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
        return stat;
    } else {
        stat = Math.floor(((Math.floor(((2 * baseValue + iv + Math.floor(ev / 4)) * level) / 100)) + 5) * getNatureStatMultiplier(nature, statName));
        return stat;
    }
}

/**
 * Generates a Pokemon object based on its name.
 * 
 * @todo The `region` and `location` parameters are not necessary and can be easily determined from the `message` parameter.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} name The name of the Pokemon to generate.
 * @param {number} level The level the generated Pokemon will be.
 * @param {string} region The region where the Pokemon will be generated in.
 * @param {string} location The location within the region where the Pokemon will be generated in.
 * @param {boolean} hidden If the Pokemon should be generated with its hidden ability if it has one.
 * 
 * @returns {Pokemon} The Pokemon that was generated, or null if the Pokemon failed to generate.
 */
async function generatePokemonByName(message, name, level, region, location, hidden) {
    var path = generatePokemonJSONPath(name);
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    var pkmn = JSON.parse(data);
    
    //it is ok for user to be null in this function
    var user = await getUser(message.author.id);
    var form = getForm(user, name, region, location);
    
    var no = pkmn.national_id;
    
    var hidden_ability = [];
    var ability = [];
    
    if (form === "Alolan") {
        if (hidden === true) {
            for (i = 0; i < pkmn.variations[0].abilities.length; i++) {
                if(pkmn.variations[0].abilities[i].hasOwnProperty('hidden')) {
                    hidden_ability[hidden_ability.length] = pkmn.variations[0].abilities[i].name;
                }
            }   
        } else {
            for (i = 0; i < pkmn.variations[0].abilities.length; i++) {
                if(!pkmn.variations[0].abilities[i].hasOwnProperty('hidden')) {
                    ability[ability.length] = pkmn.variations[0].abilities[i].name;
                }
            }   
        }
    } else {
        if (hidden === true) {
            for (i = 0; i < pkmn.abilities.length; i++) {
                if(pkmn.abilities[i].hasOwnProperty('hidden')) {
                    hidden_ability[hidden_ability.length] = pkmn.abilities[i].name;
                }
            }   
        } else {
            for (i = 0; i < pkmn.abilities.length; i++) {
                if(!pkmn.abilities[i].hasOwnProperty('hidden')) {
                    ability[ability.length] = pkmn.abilities[i].name;
                }
            }   
        }
    }
    
    var abilitySlot = 0;
    var random = Math.floor(Math.random() * 100);
    if ((random % 2) === 1) {
        abilitySlot = 1;
    }
        
    
    var final_ability;
    
    
    if (hidden_ability.length === 0) {
        if (abilitySlot > (ability.length - 1) || abilitySlot === 0) {
            final_ability = ability[0];
        } else {
            final_ability = ability[1];
        } 
    } else {
        final_ability = hidden_ability[0];
        abilitySlot = 2;
    }
    
    if (name === "Basculin") {
        if (form === "Blue-Striped" && !hidden) {
            if (abilitySlot === 0) {
                final_ability = "Rock Head";
            } else {
                final_ability = "Adaptibility";
            }
        } else if (form === "Red-Striped" && !hidden) {
            if (abilitySlot === 0) {
                final_ability = "Reckless";
            } else {
                final_ability = "Adaptibility";
            }
        } else {
            final_ability = "Mold Breaker";
        }
    } else if (name === "Lycanroc") {
        if (form === "Midday") {
            final_ability = pkmn.abilities[abilitySlot];
        } else if (form === "Midnight") {
            final_ability = pkmn.variations[0].abilities[abilitySlot];
        } else {
            final_ability = "Tough Claws";
        }
    }
    
    var lastMoveSlotOverwritten = 0;
    var moves = [null, null, null, null];
    if (form === "Alolan" && name != "Rattata" && name != "Raticate") {
        for (i = 0; i < pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset.length; i++) {
            if(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].hasOwnProperty("variations") && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].level <= level && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].variations[0] === (form + " " + name)) {
                if(moves[0] === null) {
                    moves[0] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[0] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else if(moves[1] === null) {
                    moves[1] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[1] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else if(moves[2] === null) {
                    moves[2] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[2] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else if(moves[3] === null) {
                    moves[3] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[3] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else {
                    random = Math.floor(Math.random() * 100);
                    if(random >= 30) {
                        moves[lastMoveSlotOverwritten] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                        if (lastMoveSlotOverwritten === 3) {
                            lastMoveSlotOverwritten = 0
                        } else {
                            lastMoveSlotOverwritten++;
                        }
                    }
                }
            }
        }
    } else if (name === "Wormadam" || name === "Shaymin" || name === "Deoxys" || name === "Hoopa" || name === "Lycanroc") {
        for (i = 0; i < pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset.length; i++) {
            if (pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].hasOwnProperty("variations") && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].level === level && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].variations[0] === form) {
                if(moves[0] === null) {
                    moves[0] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[0] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else if(moves[1] === null) {
                    moves[1] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[1] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else if(moves[2] === null) {
                    moves[2] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[2] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else if(moves[3] === null) {
                    moves[3] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[3] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else {
                    random = Math.floor(Math.random() * 100);
                    if(random >= 30) {
                        moves[lastMoveSlotOverwritten] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                        if (lastMoveSlotOverwritten === 3) {
                            lastMoveSlotOverwritten = 0
                        } else {
                            lastMoveSlotOverwritten++;
                        }
                    }
                }
            }
        }
    } else if (pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[0].hasOwnProperty("variations")) {
        for (i = 0; i < pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset.length; i++) {
            if(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].level <= level && pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].variations[0] === name) {
                if(moves[0] === null) {
                    moves[0] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[0] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else if(moves[1] === null) {
                    moves[1] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[1] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else if(moves[2] === null) {
                    moves[2] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[2] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else if(moves[3] === null) {
                    moves[3] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[3] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else {
                    random = Math.floor(Math.random() * 100);
                    if(random >= 30) {
                        moves[lastMoveSlotOverwritten] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                        if (lastMoveSlotOverwritten === 3) {
                            lastMoveSlotOverwritten = 0
                        } else {
                            lastMoveSlotOverwritten++;
                        }
                    }
                }
            }
        }
    } else {
        for (i = 0; i < pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset.length; i++) {
            if(pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].level <= level) {
                if(moves[0] === null) {
                    moves[0] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[0] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else if(moves[1] === null) {
                    moves[1] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[1] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else if(moves[2] === null) {
                    moves[2] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[2] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else if(moves[3] === null) {
                    moves[3] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                } else if (moves[3] === pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move) {
                           //do nothing
                } else {
                    random = Math.floor(Math.random() * 100);
                    if(random >= 30) {
                        moves[lastMoveSlotOverwritten] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].move;
                        if (lastMoveSlotOverwritten === 3) {
                            lastMoveSlotOverwritten = 0
                        } else {
                            lastMoveSlotOverwritten++;
                        }
                    }
                }
            }
        }
    }
    
    var xp = getTotalXpAtLevel(pkmn.leveling_rate, level, region);
    
    var gender;
    if (pkmn.gender_ratios === null) {
        gender = "None";
    } else if (!pkmn.gender_ratios.hasOwnProperty('male')) {
               gender = "Female";
    } else if (!pkmn.gender_ratios.hasOwnProperty('female')) {
               gender = "Male";
    } else {
        var chance = pkmn.gender_ratios.male;
        random = Math.random() * 100;
        if (random < chance) {
            gender = "Male";
        } else {
            gender = "Female";
        }
    }
    
    if (name === "Meowstic") {
        if (gender === "Female") {
            abilitySlot = 3;
            final_ability = "Competitive";
        } else {
            abilitySlot = 2;
            final_ability = "Prankster";
        }
    }
    
    var natures = ["Hardy", "Lonely", "Brave", "Adamant", "Naughty", "Bold", "Docile", "Relaxed", "Impish", "Lax", "Timid", "Hasty", "Serious", "Jolly", "Naive", "Modest", "Mild", "Quiet", "Bashful", "Rash", "Calm", "Gentle", "Sassy", "Careful", "Quirky"];
    
    random = Math.floor(Math.random() * natures.length);
    var nature = natures[random];
    
    var EVs = [0,0,0,0,0,0];
    var IVs = [0,0,0,0,0,0];
    var a;
    for (a = 0; a < 6; a++) {
        IVs[a] = Math.floor(Math.random() * 32);
    }
    
    var baseStats;
    if ((name === "Pumpkaboo" || name === "Gourgeist") && form != "Small Size") {
        if (form === "Average Size") {
            baseStats = [pkmn.variations[0].base_stats.hp, pkmn.variations[0].base_stats.atk, pkmn.variations[0].base_stats.def, pkmn.variations[0].base_stats.sp_atk, pkmn.variations[0].base_stats.sp_def, pkmn.variations[0].base_stats.speed];
        } else if (form === "Large Size") {
            baseStats = [pkmn.variations[1].base_stats.hp, pkmn.variations[1].base_stats.atk, pkmn.variations[1].base_stats.def, pkmn.variations[1].base_stats.sp_atk, pkmn.variations[1].base_stats.sp_def, pkmn.variations[1].base_stats.speed];
        } else {
            baseStats = [pkmn.variations[2].base_stats.hp, pkmn.variations[2].base_stats.atk, pkmn.variations[2].base_stats.def, pkmn.variations[2].base_stats.sp_atk, pkmn.variations[2].base_stats.sp_def, pkmn.variations[2].base_stats.speed];
        }
    } else if (name === "Lycanroc" && form != "Midday") {
        if (form === "Midnight") {
            baseStats = [pkmn.variations[0].base_stats.hp, pkmn.variations[0].base_stats.atk, pkmn.variations[0].base_stats.def, pkmn.variations[0].base_stats.sp_atk, pkmn.variations[0].base_stats.sp_def, pkmn.variations[0].base_stats.speed];
        } else {
            baseStats = [pkmn.variations[1].base_stats.hp, pkmn.variations[1].base_stats.atk, pkmn.variations[1].base_stats.def, pkmn.variations[1].base_stats.sp_atk, pkmn.variations[1].base_stats.sp_def, pkmn.variations[1].base_stats.speed];
        }
    } else {
        baseStats = [pkmn.base_stats.hp, pkmn.base_stats.atk, pkmn.base_stats.def, pkmn.base_stats.sp_atk, pkmn.base_stats.sp_def, pkmn.base_stats.speed];
    }
    
    var stats = [];
    stats[0] = calculateStatAtLevel(level, baseStats[0], IVs[0], EVs[0], nature, "hp");
    stats[1] = calculateStatAtLevel(level, baseStats[1], IVs[1], EVs[1], nature, "atk");
    stats[2] = calculateStatAtLevel(level, baseStats[2], IVs[2], EVs[2], nature, "def");
    stats[3] = calculateStatAtLevel(level, baseStats[3], IVs[3], EVs[3], nature, "sp_atk");
    stats[4] = calculateStatAtLevel(level, baseStats[4], IVs[4], EVs[4], nature, "sp_def");
    stats[5] = calculateStatAtLevel(level, baseStats[5], IVs[5], EVs[5], nature, "speed");
    
    if (name === "Shedinja") {
        stats[0] = 1;
    }
    
    var shiny = 0;
    random = Math.floor(Math.random() * 4096);
    if (random === 1234) {
        shiny = 1;
    }
    
    var type = [null, null];
    if (form === "Alolan") {
        type[0] = pkmn.variations[0].types[0];
        if(pkmn.variations[0].types.length === 2) {
            type[1] = pkmn.variations[0].types[1];
        }
    } else if (name === "Oricorio") {
        if (form === "Baile Style") {
            type = ["Fire", "Flying"];
        } else if (form === "Pom-Pom Style") {
            type = ["Electric", "Flying"];
        } else if (form === "Pa'u Style") {
            type = ["Psychic", "Flying"];
        } else {
            type = ["Ghost", "Flying"];
        }
    } else {
        type[0] = pkmn.types[0];
        if(pkmn.types.length === 2) {
            type[1] = pkmn.types[1];
        }
    }
    
    var item = null;
    if (pkmn.hasOwnProperty("items")) {
        var itemCount;
        for (itemCount = 0; itemCount < pkmn.items.length; itemCount++) {
            var itemChance = Math.ceil(Math.random() * 100);
            if (itemChance <= pkmn.items[itemCount].chance) {
                if (pkmn.items[itemCount].hasOwnProperty("form") && (form === pkmn.items[itemCount].form)) {
                    item = pkmn.items[itemCount].name;
                } else if (!pkmn.items[itemCount].hasOwnProperty("form")) {
                    item = pkmn.items[itemCount].name;
                }
            }
        }
    }
    
    var nick = null;
    
    var newPokemon = new Pokemon(name, nick, no, form, type, item, level, xp, moves, final_ability, abilitySlot, nature, stats, IVs, EVs, gender, region, location, level, shiny);
    
    newPokemon.friendship = pkmn.base_friendship;
    
    return newPokemon;
}

/**
 * Changes the lead Pokemon of a user. If the user has multiple Pokemon with the same name,
 * the user will be prompted on which Pokemon to make the lead.
 * 
 * @todo The Pokemon selection should be done in its own function and then that Pokemon id
 * should be passed to this function, rather than a name.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} name The name or nickname of the Pokemon that the user wants to set as their lead.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function setActivePokemon(message, name) {
    name = name.toLowerCase();
    
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    var pokemon = await getPokemon(message.author.id);
    if (pokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var lead = await getLeadPokemon(message.author.id);
    if (lead === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    var matchedIndexes = [];
    var onlyOptionIsLead = false;
    
    function pkmnObj(pkmn, index) {
        this.pkmn = pkmn;
        this.index = index;
    }

    var i;
    var ind = 0;
    for (i = 0; i < pokemon.length; i++) {
        if (name === pokemon[i].name.toLowerCase() || (pokemon[i].nickname != null && name === pokemon[i].nickname.toLowerCase())) {
            name = pokemon[i].name.toLowerCase();
            if (pokemon[i].lead === 1) {
                onlyOptionIsLead = true;
                ind = i;
            } else {
                matchedIndexes[matchedIndexes.length] = new pkmnObj(pokemon[i], i);
            }
        }
    }
    
    if (matchedIndexes.length < 1 && !onlyOptionIsLead) {
        return false;
    } else if (matchedIndexes.length < 1 && onlyOptionIsLead) {
        message.channel.send(message.author.username + " your " + pokemon[ind].name + " is already your lead Pokémon.");
        return "lead";
    } else if (matchedIndexes.length === 1) {
        if (user.field === "Surfing") {
            var moves = [pokemon[matchedIndexes[0].index].move_1, pokemon[matchedIndexes[0].index].move_2, pokemon[matchedIndexes[0].index].move_3, pokemon[matchedIndexes[0].index].move_4];
            if (moves.indexOf("Surf") < 0) {
                var query = "UPDATE user SET user.field = ? WHERE user.user_id = ?";
                con.query(query, ["Walking", message.author.id], function (err) {
                    if (err) {
                        console.log(err);
                        return false;
                    }
                    message.channel.send(message.author.username + " stopped surfing on their " + lead.name + " and is now walking.");
                });
            }
        }
        var query = "UPDATE pokemon SET pokemon.lead = 0 WHERE pokemon.pokemon_id = ?";
        con.query(query, [lead.pokemon_id], function (err) {
            if (err) {
                console.log(err);
                return false;
            }
            var leadQuery = "UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?";
            con.query(leadQuery, [pokemon[matchedIndexes[0].index].pokemon_id], function (err) {
                if (err) {
                    console.log(err);
                    return false;
                }
                var userQuery = "UPDATE user SET user.lead = ? WHERE user.user_id = ?";
                con.query(userQuery, [pokemon[matchedIndexes[0].index].pokemon_id, message.author.id], function (err) {
                    if (err) {
                        console.log(err);
                        return false;
                    }
                    message.channel.send(message.author.username + " set " + pokemon[matchedIndexes[0].index].name + " as their lead Pokémon.");
                    return true;
                });
            });
        });
    } else if (matchedIndexes.length > 1) {
        var string = message.author.username + " you have multiple " + matchedIndexes[0].pkmn.name + " . Please select which one you would like to set as your lead Pokémon by typing its number as shown in the list, or type \"Cancel\" to keep your current leader.\n```";
        for (i = 0; i < matchedIndexes.length; i++) {
            string += ((i + 1).toString() + ". " + matchedIndexes[i].pkmn.name);
            if (matchedIndexes[i].pkmn.shiny === 1) {
                string += " ⭐";
            }
            string += (" | " + matchedIndexes[i].pkmn.gender + " | Level: " + matchedIndexes[i].pkmn.level_current + " | " + matchedIndexes[i].pkmn.ability + "\n");
        }
        string += "```\n";
        
        message.channel.send(string);
        
        var cancel = false;
        var input = null;
        while(cancel == false) {
            await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
            .then(collected => {
                input = collected.first().content.toString().toLowerCase();
            })
            .catch(collected => {
                input = "cancel";
                cancel = true;
            });
            
            if (input === "cancel") {
                cancel = true;
                input = 0;
            } else if (/^\d+$/.test(input)) {
                var num = Number(input);
                if (num > 0 && num <= matchedIndexes.length) {
                    cancel = true;
                    input = (num - 1);
                } else {
                    message.channel.send("Number is out of range. " + string);
                    input = null;
                }
            } else if (input != null) {
                message.channel.send("Command not recognized. " + string);
                input = null;
            } else {
                input = null;
            }
        }

        if (input < 0 || input == null) {
            return false;
        } else {
            if (user.field === "Surfing") {
                var moves = [pokemon[matchedIndexes[input].index].move_1, pokemon[matchedIndexes[input].index].move_2, pokemon[matchedIndexes[input].index].move_3, pokemon[matchedIndexes[input].index].move_4];
                if (moves.indexOf("Surf") < 0) {
                    var query = "UPDATE user SET user.field = ? WHERE user.user_id = ?";
                    con.query(query, ["Walking", message.author.id], function (err) {
                        if (err) {
                            console.log(err);
                            return false;
                        }
                        message.channel.send(message.author.username + " stopped surfing on their " + lead.name + " and is now walking.");
                    });
                }
            }
            
            var query = "UPDATE pokemon SET pokemon.lead = 0 WHERE pokemon.pokemon_id = ?";
            con.query(query, [lead.pokemon_id], function (err) {
                if (err) {
                    console.log(err);
                    return false;
                }
                var leadQuery = "UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?";
                con.query(leadQuery, [pokemon[matchedIndexes[input].index].pokemon_id], function (err) {
                    if (err) {
                        console.log(err);
                        return false;
                    }
                    var userQuery = "UPDATE user SET user.lead = ? WHERE user_id = ?";
                    con.query(userQuery, [pokemon[matchedIndexes[input].index].pokemon_id, message.author.id], function (err) {
                        if (err) {
                            console.log(err);
                            return false;
                        }
                        message.channel.send(message.author.username + " set " + pokemon[matchedIndexes[input].index].name + " as their lead Pokémon.");
                        return true;
                    });
                });
            });
        }
    }
    return true;
}


/**
 * Allows a user to drop off and pick up Pokemon from the Day Care.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function dayCare(message) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    if (user.region === "Kanto") {
        if (user.location != "Route 5" && user.location != "Four Island") {
            message.channel.send(message.author.username + " there is no Day Care here. You may find one at Route 5 or Four Island in the Kanto region. " + duck);
            return true;
        }
    } else  if (user.region === "Johto") {
        if (user.location != "Route 34") {
            message.channel.send(message.author.username + " there is no Day Care here. You may find one at Route 34 in the Johto region. " + duck);
            return true;
        }
    } else  if (user.region === "Hoenn") {
        if (user.location != "Route 117" && user.location != "Battle Resort") {
            message.channel.send(message.author.username + " there is no Day Care here. You may find one at Route 117 or the Battle Resort in the Hoenn region. " + duck);
            return true;
        }
    } else  if (user.region === "Sinnoh") {
        if (user.location != "Solaceon Town") {
            message.channel.send(message.author.username + " there is no Day Care here. You may find one at Solaceon Town in the Sinnoh region. " + duck);
            return true;
        }
    } else  if (user.region === "Unova") {
        if (user.location != "Route 3") {
            message.channel.send(message.author.username + " there is no Day Care here. You may find one at Route 3 in the Unova region. " + duck);
            return true;
        }
    } else  if (user.region === "Kalos") {
        if (user.location != "Route 7 (Rivière Walk)") {
            message.channel.send(message.author.username + " there is no Day Care here. You may find one at Route 7 (Rivière Walk) in the Kalos region. " + duck);
            return true;
        }
    } else  if (user.region === "Alola") {
        if (user.location != "Paniola Ranch") {
            message.channel.send(message.author.username + " there is no Day Care here. You may find one at Paniola Ranch in the Alola region. " + duck);
            return true;
        }
    }

    var string = "What would you like to do?\n```1. View Pokémon\n2. Drop off a Pokémon\n3. Pick up a Pokémon\n4. Leave the Day Care``` Type the number of the option as shown in the list.";
    await message.channel.send("Hello " + message.author.username + ", welcome to the Pokémon Day Care! " + string);
    let visitingDaycare = true;
    while (visitingDaycare) {
        string = "\n```1. View Pokémon\n2. Drop off a Pokémon\n3. Pick up a Pokémon\n4. Leave the Day Care``` Type the number of the option as shown in the list.";
        var input = null;
        var cancel = false;
        while(cancel == false) {
            await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
            .then(collected => {
                input = collected.first().content.toString().toLowerCase();
            })
            .catch(collected => {
                input = 4;
                cancel = true;
            });
            if (input === "cancel") {
                cancel = true;
                input = null;
            } else if (/^\d+$/.test(input)) {
                var num = Number(input);
                if (num > 0 && num <= 4) {
                    cancel = true;
                    input = (num - 1);
                } else {
                    message.channel.send("Number is out of range. " + string);
                    input = null;
                }
            } else if (input != null) {
                message.channel.send("Command not recognized. " + string);
                input = null;
            } else {
                input = null;
            }
        }

        if (input == 0) {
            await viewDayCare(message);
            await message.channel.send(message.author.username + " is there anything else you would like to do? " + string);
        } else if (input == 1) {
            var daycarePokemon = await getDaycare(message.author.id);
            if (daycarePokemon === null) {
                return new Promise(function(resolve) {
                    resolve(false);
                });
            }
            if (daycarePokemon.length >= 2) {
                await message.channel.send(message.author.username + " you cannot have more than two Pokémon at the Day Care. You must pick up one of your Pokémon before you can drop off another. " + duck);
            } else {
                printPokemon(message);

                var prompt = "Please enter the name or nickname of the Pokémon you want to drop off, or type \"Cancel\" to exit the Day Care.";
                await message.channel.send(prompt);
                cancel = false;
                var name = null;
                while(cancel == false) {
                    await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 60000, errors: ['time'] })
                    .then(collected => {
                        name = collected.first().content.toString().toLowerCase();
                    })
                    .catch(collected => {
                        name = "cancel";
                        cancel = true;
                    });
                    
                    if (name === "cancel") {
                        cancel = true;
                    } else if (name != null) {
                        await placeInDaycare(message, name);
                        cancel = true;
                    } else {
                        name = null;
                    }
                }
            }
            await message.channel.send(message.author.username + " is there anything else you would like to do? " + string);
        } else if (input == 2) {
            await pickUpFromDayCare(message);
            await message.channel.send(message.author.username + " is there anything else you would like to do? " + string);
        } else if (input == 3 || input == null) {
            await message.channel.send(message.author.username + " left the Day Care.");
            visitingDaycare = false;
        }
    }

    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Removes a Pokemon from the Day Care. User is prompted
 * on which Pokemon to remove if they have multiple Pokemon
 * in the Day Care.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function pickUpFromDayCare(message) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    var daycarePokemon = await getDaycare(message.author.id);
    if (daycarePokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    if (daycarePokemon.length < 1) {
        await message.channel.send(message.author.username + " you have no Pokémon currently in the Day Care.");
        return new Promise(function(resolve) {
            resolve(true);
        });
    } else {
        var cancel = false;
        var input = null;
        while(cancel == false) {
            await viewDayCare(message);
            var string = message.author.username + " select the number of the Pokémon shown above that you want to retrieve from the Day Care, or type \"Cancel\" to go back.";
            await message.channel.send(string);
            await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
            .then(collected => {
                input = collected.first().content.toString().toLowerCase();
            })
            .catch(collected => {
                input = "cancel";
                cancel = true;
            });
            
            if (input === "cancel") {
                cancel = true;
                input = 0;
                await message.channel.send(message.author.username + " decided to leave their Pokémon in the Day Care.");
            } else if (/^\d+$/.test(input)) {
                var num = Number(input);
                if (num > 0 && num <= daycarePokemon.length) {
                    var cost = 100 + ((daycarePokemon[(num - 1)].level_current - daycarePokemon[(num - 1)].level_at_daycare) * 100);
                    if (user.money < cost) {
                        await message.channel.send("You cannot afford to retrieve that Pokémon.");
                    } else {
                        cancel = true;
                        input = (num - 1);
                    }
                } else {
                    message.channel.send("Number is out of range. " + string);
                    input = null;
                }
            } else if (input != null) {
                message.channel.send("Command not recognized. " + string);
                input = null;
            } else {
                input = null;
            }
        }

        if (input != null) {
            var cost = 100 + ((daycarePokemon[input].level_current - daycarePokemon[input].level_at_daycare) * 100);
            var query = "UPDATE pokemon SET pokemon.storage = ?, pokemon.storage_region = ?, pokemon.level_at_daycare = ? WHERE pokemon.pokemon_id = ?";
            con.query(query, [null, null, null, daycarePokemon[input].pokemon_id], function (err) {
                if (err) {
                    console.log(err);
                } else {
                    query = "UPDATE user SET user.money = ? WHERE user.user_id = ?";
                    con.query(query, [(user.money - cost), user.user_id], function (err) {
                        if (err) {
                            console.log(err);
                        }
                    });
                }
            });

            await message.channel.send(message.author.username + " picked up their " + daycarePokemon[input].name + " from the Day Care.");
            if (daycarePokemon.length > 1) {
                var otherIndex;
                if (input == 1) {
                    otherIndex = 0;
                } else {
                    otherIndex = 1;
                }
                cost = 100 + ((daycarePokemon[otherIndex].level_current - daycarePokemon[otherIndex].level_at_daycare) * 100);
                await message.channel.send("Would you like to pick up your other Pokémon as well? It will cost you " + dollar + cost + ". Type \"Yes\" or \"No\".");
                cancel = false;
                input = null;
                while(cancel == false) {
                    await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
                    .then(collected => {
                        input = collected.first().content.toString().toLowerCase();
                    })
                    .catch(collected => {
                        input = "no";
                        cancel = true;
                    });
                    
                    if (input === "no") {
                        cancel = true;
                        await message.channel.send(message.author.username + " decided to leave their other Pokémon in the Day Care.");
                    } else if (input === "yes") {
                        cancel = true;
                        if (user.money < cost) {
                            await message.channel.send("You cannot afford to retrieve that Pokémon.");
                        } else {
                            query = "UPDATE pokemon SET pokemon.storage = ?, pokemon.storage_region = ?, pokemon.level_at_daycare = ? WHERE pokemon.pokemon_id = ?";
                            con.query(query, [null, null, null, daycarePokemon[otherIndex].pokemon_id], function (err) {
                                if (err) {
                                    console.log(err);
                                } else {
                                    query = "UPDATE user SET user.money = ? WHERE user.user_id = ?";
                                    con.query(query, [(user.money - cost), user.user_id], function (err) {
                                        if (err) {
                                            console.log(err);
                                        }
                                    });
                                }
                            });
                            await message.channel.send(message.author.username + " picked up their " + daycarePokemon[otherIndex].name + " from the Day Care.");
                        }
                    } else if (input != null) {
                        message.channel.send("Command not recognized. " + string);
                        input = null;
                    } else {
                        input = null;
                    }
                }
            }
        }
    }

    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Sends a message containing detailed information about
 * a user's Pokemon that are in the Day Care.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function viewDayCare(message) {
    var userID = message.author.id;
    var username = message.author.username;

    var pokemon = await getDaycare(userID);
    if (pokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    if (pokemon.length < 1) {
        message.channel.send(username + " you have no Pokémon in the Day Care.");
    } else {
        var fields = [];
        var i;
        for (i = 0; i < pokemon.length; i++) {
            var cost = 100 + ((pokemon[i].level_current - pokemon[i].level_at_daycare) * 100);
            let shuffle_icon = await getShuffleEmoji(pokemon[i].number);
            var moves;
            if (pokemon[i].move_1 != null) {
                moves = pokemon[i].move_1;
            }
            if (pokemon[i].move_2 != null) {
                moves += "\n" + pokemon[i].move_2;
            }
            if (pokemon[i].move_3 != null) {
                moves += "\n" + pokemon[i].move_3;
            }
            if (pokemon[i].move_4 != null) {
                moves += "\n" + pokemon[i].move_4;
            }
            fields[i] = {
                "name": ((i + 1).toString()) + ". " + shuffle_icon + " " + pokemon[i].name,
                "value": "**Level:**\n" + pokemon[i].level_current + "\n**Ability:**\n" + pokemon[i].ability + "\n**Moves:**\n" + moves + "\n**Cost:**\n" + dollar + cost,
                "inline": true
            }
        }
        var embed = {
            "title": "Pokémon in Day Care",
            "fields": fields
        }
        await message.channel.send({embed});
    }

    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Places a Pokemon in the Day Care. If user has multiple Pokemon with the
 * same name, the user will be asked which Pokemon they want to place.
 * 
 * @todo Rather than `name`, a Pokemon's id should be passed.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} name The name or nickname of the Pokemon to be placed in the Day Care.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function placeInDaycare(message, name) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var pokemon = await getPokemon(message.author.id);
    if (pokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    var matchedIndexes = [];
    
    var onlyOptionIsLead = false;
    
    function pkmnObj(pkmn, index) {
        this.pkmn = pkmn;
        this.index = index;
    }
    
    if (pokemon.length === 1) {
        message.channel.send(message.author.username + " you cannot send your only Pokémon to the day care! " + duck);
        return new Promise(function(resolve) {
            resolve(true);
        });
    }
    
    var i;
    for (i = 0; i < pokemon.length; i++) {
        if (name.toLowerCase() === pokemon[i].name.toLowerCase() || (pokemon[i].nickname != null && name.toLowerCase() === pokemon[i].nickname.toLowerCase())) {
            name = pokemon[i].name.toLowerCase();
            if (pokemon[i].lead === 1) {
                onlyOptionIsLead = true;
            }
            matchedIndexes[matchedIndexes.length] = new pkmnObj(pokemon[i], i);
        }
    }
    
    var confirm = false;
    
    if (matchedIndexes.length < 1) {
        message.channel.send(message.author.username + " failed to send any Pokémon to the daycare. " + duck);
        return new Promise(function(resolve) {
            resolve(true);
        });
    } else if (matchedIndexes.length === 1 && onlyOptionIsLead) {
        if (matchedIndexes[0].index === 0) {
            confirm = await confirmDayCare(message, pokemon[matchedIndexes[0].index]);
            if (confirm === false) {
                message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                return new Promise(function(resolve) {
                    resolve(true);
                });
            }
            var query = "UPDATE pokemon SET pokemon.lead = 0 WHERE pokemon.pokemon_id = ?";
            con.query(query, [pokemon[0].pokemon_id], function (err) {
                if (err) {
                    console.log(err);
                    return new Promise(function(resolve) {
                        resolve(false);
                    });
                }
            });
            query = "UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?";
            con.query(query, [pokemon[1].pokemon_id], function (err) {
                if (err) {
                    console.log(err);
                    return new Promise(function(resolve) {
                        resolve(false);
                    });
                }
            });
            query = "UPDATE user SET user.lead = ? WHERE user.user_id = ?";
            con.query(query, [pokemon[1].pokemon_id, user.user_id], function (err) {
                if (err) {
                    console.log(err);
                    return new Promise(function(resolve) {
                        resolve(false);
                    });
                }
            });
            query = "UPDATE pokemon SET pokemon.storage = 'daycare', pokemon.storage_region = ?, pokemon.level_at_daycare = ? WHERE pokemon.pokemon_id = ?";
            con.query(query, [user.region, pokemon[0].level_current, pokemon[0].pokemon_id], function (err) {
                if (err) {
                    console.log(err);
                    return new Promise(function(resolve) {
                        resolve(false);
                    });
                }
            });
            message.channel.send(message.author.username + " set " + pokemon[1].name + " as their lead Pokémon.");
            message.channel.send(message.author.username + " sent their " + pokemon[0].name + " to the day care." + birb);
        } else {
            confirm = await confirmDayCare(message, pokemon[matchedIndexes[0].index]);
            if (confirm === false) {
                message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                return false;
            }
            var query = "UPDATE pokemon SET pokemon.lead = 0 WHERE pokemon.pokemon_id = ?";
            con.query(query, [pokemon[matchedIndexes[0].index].pokemon_id], function (err) {
                if (err) {
                    console.log(err);
                    return new Promise(function(resolve) {
                        resolve(false);
                    });
                }
            });
            query = "UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?";
            con.query(query, [pokemon[0].pokemon_id], function (err) {
                if (err) {
                    console.log(err);
                    return new Promise(function(resolve) {
                        resolve(false);
                    });
                }
            });
            query = "UPDATE user SET user.lead = ? WHERE user.user_id = ?";
            con.query(query, [pokemon[0].pokemon_id, user.user_id], function (err) {
                if (err) {
                    console.log(err);
                    return new Promise(function(resolve) {
                        resolve(false);
                    });
                }
            });
            query = "UPDATE pokemon SET pokemon.storage = 'daycare', pokemon.storage_region = ?, pokemon.level_at_daycare = ? WHERE pokemon.pokemon_id = ?";
            con.query(query, [user.region, pokemon[matchedIndexes[0].index].level_current, pokemon[matchedIndexes[0].index].pokemon_id], function (err) {
                if (err) {
                    console.log(err);
                    return new Promise(function(resolve) {
                        resolve(false);
                    });
                }
            });
            message.channel.send(message.author.username + " set " + pokemon[0].name + " as their lead Pokémon.");
            message.channel.send(message.author.username + " sent their " + pokemon[matchedIndexes[0].index].name + " to the day care." + birb);
        }
    } else if (matchedIndexes.length === 1 && !onlyOptionIsLead) {
        if (matchedIndexes[0].index === 0) {
            confirm = await confirmDayCare(message, pokemon[matchedIndexes[0].index]);
            if (confirm === false) {
                message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                return new Promise(function(resolve) {
                    resolve(true);
                });
            }
            var query = "UPDATE pokemon SET pokemon.storage = 'daycare', pokemon.storage_region = ?, pokemon.level_at_daycare = ? WHERE pokemon.pokemon_id = ?";
            con.query(query, [user.region, pokemon[0].level_current, pokemon[0].pokemon_id], function (err) {
                if (err) {
                    console.log(err);
                    return new Promise(function(resolve) {
                        resolve(false);
                    });
                }
            });
            message.channel.send(message.author.username + " sent their " + pokemon[0].name + " to the day care." + birb);
        } else {
            confirm = await confirmDayCare(message, pokemon[matchedIndexes[0].index]);
            if (confirm === false) {
                message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                return false;
            }
            var query = "UPDATE pokemon SET pokemon.storage = 'daycare', pokemon.storage_region = ?, pokemon.level_at_daycare = ? WHERE pokemon.pokemon_id = ?";
            con.query(query, [user.region, pokemon[matchedIndexes[0].index].level_current, pokemon[matchedIndexes[0].index].pokemon_id], function (err) {
                if (err) {
                    console.log(err);
                    return new Promise(function(resolve) {
                        resolve(false);
                    });
                }
            });
            message.channel.send(message.author.username + " sent their " + pokemon[matchedIndexes[0].index].name + " to the day care." + birb);
        }
    } else if (matchedIndexes.length > 1) {
        var string = message.author.username + " you have multiple " + matchedIndexes[0].pkmn.name + ". Please select which one you would like to release by typing its number as shown in the list, or type \"Cancel\" to keep your Pokémon.\n```";
        for (i = 0; i < matchedIndexes.length; i++) {
            string += ((i + 1).toString() + ". " + matchedIndexes[i].pkmn.name);
            if (matchedIndexes[i].pkmn.shiny === 1) {
                string += " ⭐";
            }
            string += (" | " + matchedIndexes[i].pkmn.gender + " | Level: " + matchedIndexes[i].pkmn.level_current + "\n");
        }
        string += "```\n";
        
        message.channel.send(string);
        
        var cancel = false;
        var input = null;
        while(cancel == false) {
            await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
            .then(collected => {
                input = collected.first().content.toString().toLowerCase();
            })
            .catch(collected => {
                input = "cancel";
                cancel = true;
            });
            
            if (input === "cancel") {
                cancel = true;
                input = 0;
            } else if (/^\d+$/.test(input)) {
                var num = Number(input);
                if (num > 0 && num <= matchedIndexes.length) {
                    cancel = true;
                    input = (num - 1);
                } else {
                    message.channel.send("Number is out of range. " + string);
                    input = null;
                }
            } else if (input != null) {
                message.channel.send("Command not recognized. " + string);
                input = null;
            } else {
                input = null;
            }
        }

        if (input < 0 || input == null) {
            message.channel.send(message.author.username + " failed to send a Pokémon to the day care. " + duck);
            return false;
        } else {
            if (pokemon[matchedIndexes[input].index].lead === 1) {
                if (matchedIndexes[input].index === 0) {
                    confirm = await confirmDayCare(message, pokemon[matchedIndexes[0].index]);
                    if (confirm === false) {
                        message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                        return new Promise(function(resolve) {
                            resolve(true);
                        });
                    }
                    var query = "UPDATE pokemon SET pokemon.lead = 0 WHERE pokemon.pokemon_id = ?";
                    con.query(query, [pokemon[0].pokemon_id], function (err) {
                        if (err) {
                            console.log(err);
                            return new Promise(function(resolve) {
                                resolve(false);
                            });
                        }
                    });
                    query = "UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?";
                    con.query(query, [pokemon[1].pokemon_id], function (err) {
                        if (err) {
                            console.log(err);
                            return new Promise(function(resolve) {
                                resolve(false);
                            });
                        }
                    });
                    query = "UPDATE user SET user.lead = ? WHERE user.user_id = ?";
                    con.query(query, [pokemon[1].pokemon_id, user.user_id], function (err) {
                        if (err) {
                            console.log(err);
                            return new Promise(function(resolve) {
                                resolve(false);
                            });
                        }
                    });
                    query = "UPDATE pokemon SET pokemon.storage = 'daycare', pokemon.storage_region = ?, pokemon.level_at_daycare = ? WHERE pokemon.pokemon_id = ?";
                    con.query(query, [user.region, pokemon[0].level_current, pokemon[0].pokemon_id], function (err) {
                        if (err) {
                            console.log(err);
                            return new Promise(function(resolve) {
                                resolve(false);
                            });
                        }
                    });
                    message.channel.send(message.author.username + " set " + pokemon[1].name + " as their lead Pokémon.");
                    message.channel.send(message.author.username + " sent their " + pokemon[0].name + " to the day care." + birb);
                } else {
                    confirm = await confirmDayCare(message, pokemon[matchedIndexes[input].index]);
                    if (confirm === false) {
                        message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                        return new Promise(function(resolve) {
                            resolve(true);
                        });
                    }
                    var query = "UPDATE pokemon SET pokemon.lead = 0 WHERE pokemon.pokemon_id = ?";
                    con.query(query, [pokemon[matchedIndexes[0].index].pokemon_id], function (err) {
                        if (err) {
                            console.log(err);
                            return new Promise(function(resolve) {
                                resolve(false);
                            });
                        }
                    });
                    query = "UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?";
                    con.query(query, [pokemon[0].pokemon_id], function (err) {
                        if (err) {
                            console.log(err);
                            return new Promise(function(resolve) {
                                resolve(false);
                            });
                        }
                    });
                    query = "UPDATE user SET user.lead = ? WHERE user.user_id = ?";
                    con.query(query, [pokemon[0].pokemon_id, user.user_id], function (err) {
                        if (err) {
                            console.log(err);
                            return new Promise(function(resolve) {
                                resolve(false);
                            });
                        }
                    });
                    query = "UPDATE pokemon SET pokemon.storage = 'daycare', pokemon.storage_region = ?, pokemon.level_at_daycare = ? WHERE pokemon.pokemon_id = ?";
                    con.query(query, [user.region, pokemon[matchedIndexes[input].index].level_current, pokemon[matchedIndexes[input].index].pokemon_id], function (err) {
                        if (err) {
                            console.log(err);
                            return new Promise(function(resolve) {
                                resolve(false);
                            });
                        }
                    });
                    message.channel.send(message.author.username + " set " + pokemon[0].name + " as their lead Pokémon.");
                    message.channel.send(message.author.username + " sent their " + pokemon[matchedIndexes[input].index].name + " to the day care." + birb);
                }
            } else {
                if (matchedIndexes[input].index === 0) {
                    confirm = await confirmDayCare(message, pokemon[matchedIndexes[0].index]);
                    if (confirm === false) {
                        message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                        return new Promise(function(resolve) {
                            resolve(true);
                        });
                    }
                    var query = "UPDATE pokemon SET pokemon.storage = 'daycare', pokemon.storage_region = ?, pokemon.level_at_daycare = ? WHERE pokemon.pokemon_id = ?";
                    con.query(query, [user.region, pokemon[0].level_current, pokemon[0].pokemon_id], function (err) {
                        if (err) {
                            console.log(err);
                            return new Promise(function(resolve) {
                                resolve(false);
                            });
                        }
                    });
                    message.channel.send(message.author.username + " sent their " + pokemon[0].name + " to the day care." + birb);
                } else {
                    confirm = await confirmDayCare(message, pokemon[matchedIndexes[input].index]);
                    if (confirm === false) {
                        message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                        return new Promise(function(resolve) {
                            resolve(true);
                        });
                    }
                    var query = "UPDATE pokemon SET pokemon.storage = 'daycare', pokemon.storage_region = ?, pokemon.level_at_daycare = ? WHERE pokemon.pokemon_id = ?";
                    con.query(query, [user.region, pokemon[matchedIndexes[input].index].level_current, pokemon[matchedIndexes[input].index].pokemon_id], function (err) {
                        if (err) {
                            console.log(err);
                            return new Promise(function(resolve) {
                                resolve(false);
                            });
                        }
                    });
                    message.channel.send(message.author.username + " sent their " + pokemon[matchedIndexes[input].index].name + " to the day care." + birb);
                }   
            }
        }
    }

    return new Promise(function(resolve) {
        resolve(true);
    });
}

/**
 * Releases a Pokemon owned by a user. User will be asked which
 * Pokemon to release if they own multiple Pokemon with the same
 * name.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} name The name or nickname of the Pokemon to be released.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function releasePokemon(message, name) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    var pokemon = await getPokemon(message.author.id);
    if (pokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    var matchedIndexes = [];
    
    var onlyOptionIsLead = false;
    
    function pkmnObj(pkmn, index) {
        this.pkmn = pkmn;
        this.index = index;
    }
    
    if (pokemon.length === 1) {
        message.channel.send(message.author.username + " you cannot release your only Pokémon! " + duck);
        return false;
    }
    
    var i;
    for (i = 0; i < pokemon.length; i++) {
        if (name.toLowerCase() === pokemon[i].name.toLowerCase() || (pokemon[i].nickname != null && name.toLowerCase() === pokemon[i].nickname.toLowerCase())) {
            name = pokemon[i].name.toLowerCase();
            if (pokemon[i].lead === 1) {
                onlyOptionIsLead = true;
            }
            matchedIndexes[matchedIndexes.length] = new pkmnObj(pokemon[i], i);
        }
    }
    
    var confirm = false;
    
    if (matchedIndexes.length < 1) {
        message.channel.send(message.author.username + " failed to release any Pokémon. " + duck);
        return false;
    } else if (matchedIndexes.length === 1 && onlyOptionIsLead) {
        if (matchedIndexes[0].index === 0) {
            confirm = await confirmRelease(message, pokemon[matchedIndexes[0].index]);
            if (confirm === false) {
                message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                return false;
            }
            var query = "UPDATE pokemon SET pokemon.lead = 0 WHERE pokemon.pokemon_id = ?";
            con.query(query, [pokemon[0].pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            query = "UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?";
            con.query(query, [pokemon[1].pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            query = "UPDATE user SET user.lead = ? WHERE user.user_id = ?";
            con.query(query, [pokemon[1].pokemon_id, user.user_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            query = "DELETE FROM pokemon WHERE pokemon.pokemon_id = ?";
            con.query(query, [pokemon[0].pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            message.channel.send(message.author.username + " set " + pokemon[1].name + " as their lead Pokémon.");
            message.channel.send(message.author.username + " released their " + pokemon[0].name + "." + tail);
        } else {
            confirm = await confirmRelease(message, pokemon[matchedIndexes[0].index]);
            if (confirm === false) {
                message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                return false;
            }
            var query = "UPDATE pokemon SET pokemon.lead = 0 WHERE pokemon.pokemon_id = ?";
            con.query(query, [pokemon[matchedIndexes[0].index].pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            query = "UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?";
            con.query(query, [pokemon[0].pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            query = "UPDATE user SET user.lead = ? WHERE user.user_id = ?";
            con.query(query, [pokemon[0].pokemon_id, user.user_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            query = "DELETE FROM pokemon WHERE pokemon.pokemon_id = ?";
            con.query(query, [pokemon[matchedIndexes[0].index].pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            message.channel.send(message.author.username + " set " + pokemon[0].name + " as their lead Pokémon.");
            message.channel.send(message.author.username + " released their " + pokemon[matchedIndexes[0].index].name + "." + tail);
        }
    } else if (matchedIndexes.length === 1 && !onlyOptionIsLead) {
        if (matchedIndexes[0].index === 0) {
            confirm = await confirmRelease(message, pokemon[matchedIndexes[0].index]);
            if (confirm === false) {
                message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                return false;
            }
            var query = "DELETE FROM pokemon WHERE pokemon.pokemon_id = ?";
            con.query(query, [pokemon[0].pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            message.channel.send(message.author.username + " released their " + pokemon[0].name + "." + tail);
        } else {
            confirm = await confirmRelease(message, pokemon[matchedIndexes[0].index]);
            if (confirm === false) {
                message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                return false;
            }
            var query = "DELETE FROM pokemon WHERE pokemon.pokemon_id = ?";
            con.query(query, [ pokemon[matchedIndexes[0].index].pokemon_id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            message.channel.send(message.author.username + " released their " + pokemon[matchedIndexes[0].index].name + "." + tail);
        }
    } else if (matchedIndexes.length > 1) {
        var string = message.author.username + " you have multiple " + matchedIndexes[0].pkmn.name + ". Please select which one you would like to release by typing its number as shown in the list, or type \"Cancel\" to keep your Pokémon.\n```";
        for (i = 0; i < matchedIndexes.length; i++) {
            string += ((i + 1).toString() + ". " + matchedIndexes[i].pkmn.name);
            if (matchedIndexes[i].pkmn.shiny === 1) {
                string += " ⭐";
            }
            string += (" | " + matchedIndexes[i].pkmn.gender + " | Level: " + matchedIndexes[i].pkmn.level_current + "\n");
        }
        string += "```\n";
        
        message.channel.send(string);
        
        var cancel = false;
        var input = null;
        while(cancel == false) {
            await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
            .then(collected => {
                input = collected.first().content.toString().toLowerCase();
            })
            .catch(collected => {
                input = "cancel";
                cancel = true;
            });
            
            if (input === "cancel") {
                cancel = true;
                input = 0;
            } else if (/^\d+$/.test(input)) {
                var num = Number(input);
                if (num > 0 && num <= matchedIndexes.length) {
                    cancel = true;
                    input = (num - 1);
                } else {
                    message.channel.send("Number is out of range. " + string);
                    input = null;
                }
            } else if (input != null) {
                message.channel.send("Command not recognized. " + string);
                input = null;
            } else {
                input = null;
            }
        }

        if (input < 0 || input == null) {
            message.channel.send(message.author.username + " failed to release any Pokémon. " + duck);
            return false;
        } else {
            if (pokemon[matchedIndexes[input].index].lead === 1) {
                if (matchedIndexes[input].index === 0) {
                    confirm = await confirmRelease(message, pokemon[matchedIndexes[0].index]);
                    if (confirm === false) {
                        message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                        return false;
                    }
                    var query = "UPDATE pokemon SET pokemon.lead = 0 WHERE pokemon.pokemon_id = ?";
                    con.query(query, [pokemon[0].pokemon_id], function (err) {
                        if (err) {
                            return reject(err);
                        }
                    });
                    query = "UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?";
                    con.query(query, [pokemon[1].pokemon_id], function (err) {
                        if (err) {
                            return reject(err);
                        }
                    });
                    query = "UPDATE user SET user.lead = ? WHERE user.user_id = ?";
                    con.query(query, [pokemon[1].pokemon_id, user.user_id], function (err) {
                        if (err) {
                            return reject(err);
                        }
                    });
                    query = "DELETE FROM pokemon WHERE pokemon.pokemon_id = ?";
                    con.query(query, [pokemon[0].pokemon_id], function (err) {
                        if (err) {
                            return reject(err);
                        }
                    });
                    message.channel.send(message.author.username + " set " + pokemon[1].name + " as their lead Pokémon.");
                    message.channel.send(message.author.username + " released their " + pokemon[0].name + "." + tail);
                } else {
                    confirm = await confirmRelease(message, pokemon[matchedIndexes[input].index]);
                    if (confirm === false) {
                        message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                        return false;
                    }
                    var query = "UPDATE pokemon SET pokemon.lead = 0 WHERE pokemon.pokemon_id = ?";
                    con.query(query, [pokemon[matchedIndexes[0].index].pokemon_id], function (err) {
                        if (err) {
                            return reject(err);
                        }
                    });
                    query = "UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?";
                    con.query(query, [pokemon[0].pokemon_id], function (err) {
                        if (err) {
                            return reject(err);
                        }
                    });
                    query = "UPDATE user SET user.lead = ? WHERE user.user_id = ?";
                    con.query(query, [pokemon[0].pokemon_id, user.user_id], function (err) {
                        if (err) {
                            return reject(err);
                        }
                    });
                    query = "DELETE FROM pokemon WHERE pokemon.pokemon_id = ?";
                    con.query(query, [pokemon[matchedIndexes[input].index].pokemon_id], function (err) {
                        if (err) {
                            return reject(err);
                        }
                    });
                    message.channel.send(message.author.username + " set " + pokemon[0].name + " as their lead Pokémon.");
                    message.channel.send(message.author.username + " released their " + pokemon[matchedIndexes[input].index].name + "." + tail);
                }
            } else {
                if (matchedIndexes[input].index === 0) {
                    confirm = await confirmRelease(message, pokemon[matchedIndexes[0].index]);
                    if (confirm === false) {
                        message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                        return false;
                    }
                    var query = "DELETE FROM pokemon WHERE pokemon.pokemon_id = ?";
                    con.query(query, [pokemon[0].pokemon_id], function (err) {
                        if (err) {
                            return reject(err);
                        }
                    });
                    message.channel.send(message.author.username + " released their " + pokemon[0].name + "." + tail);
                } else {
                    confirm = await confirmRelease(message, pokemon[matchedIndexes[input].index]);
                    if (confirm === false) {
                        message.channel.send(message.author.username + " decided to keep their " + pokemon[matchedIndexes[0].index].name + ".");
                        return false;
                    }
                    var query = "DELETE FROM pokemon WHERE pokemon.pokemon_id = ?";
                    con.query(query, [ pokemon[matchedIndexes[input].index].pokemon_id], function (err) {
                        if (err) {
                            return reject(err);
                        }
                    });
                    message.channel.send(message.author.username + " released their " + pokemon[matchedIndexes[input].index].name + "." + tail);
                }   
            }
        }
    }

    return true;
}

/**
 * Promps a user to confirm a Day Care drop off.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {Pokemon} pkmn The Pokemon the user is dropping off at the Day Care.
 * 
 * @returns {boolean} True if user confirmed the drop off.
 */
async function confirmDayCare(message, pkmn) {
    var string = message.author.username + " are you sure you want to send this " + pkmn.name + " to the Day Care? It will be unusable while at the day care and you will have no choice over what moves it may learn when leveling up nor will it be able to evolve. If you were looking to breed this Pokémon, use the \"nursery\" command instead. Type \"Yes\" to confirm or \"No\" to cancel the drop off.";
    
    message.channel.send(string);

    await displayAnOwnedPkmn(pkmn, message);
    
    var response;
    var cancel = false;
    var input = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
        .then(collected => {
            input = collected.first().content.toString().toLowerCase();
        })
        .catch(collected => {
            input = "cancel";
            cancel = true;
        });

        if (input === "cancel" || input === "no") {
            cancel = true;
            input = false;
        } else if (input === "yes" || input === "confirm") {
            cancel = true;
            input = true;
        } else if (input != null) {
            message.channel.send("Command not recognized. " + string);
            await displayAnOwnedPkmn(pkmn, message);
            input = null;
        } else {
            input = null;
        }
    }
    
    if (input === true) {
        respone = true;
    } else {
        response = false;
    }

    return new Promise(function(resolve) {
        resolve(response);
    });
}

/**
 * Prompts a user to confirm that the user wants to release their
 * specified Pokemon.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {Pokemon} pkmn The Pokemon that the user selected to release.
 * 
 * @returns {boolean} True if user responded with yes.
 */
async function confirmRelease(message, pkmn) {
    var string = message.author.username + " are you sure you want to release this " + pkmn.name + "? Type \"Yes\" to confirm or \"No\" to cancel the release.";
    
    message.channel.send(string);

    await displayAnOwnedPkmn(pkmn, message);
    
    var response;
    var cancel = false;
    var input = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
        .then(collected => {
            input = collected.first().content.toString().toLowerCase();
        })
        .catch(collected => {
            input = "cancel";
            cancel = true;
        });

        if (input === "cancel" || input === "no") {
            cancel = true;
            input = false;
        } else if (input === "yes" || input === "confirm") {
            cancel = true;
            input = true;
        } else if (input != null) {
            message.channel.send("Command not recognized. " + string);
            await displayAnOwnedPkmn(pkmn, message);
            input = null;
        } else {
            input = null;
        }
    }
    
    if (input === true) {
        respone = true;
    } else {
        response = false;
    }

    return new Promise(function(resolve) {
        resolve(response);
    });
}

/**
 * Generates a Pokemon that the user can catch based on the user's current region
 * and location.
 * 
 * @todo Perhaps `lead` can be calculated from this command rather than passing it as a param.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {User} user The Pokebot user to generate the Pokemon for.
 * @param {Pokemon} lead The user's lead Pokemon.
 * 
 * @returns {Pokemon} The Pokemon that was generated.
 */
async function generateWildPokemon(message, user, lead) {
    var region = user.region;
    var location = user.location;
    var leadLevel = lead.level_current;
    var field = user.field;

    var possiblePokemonRare = [];
    var possiblePokemonNotRare = [];

    var selectedPokemon = null;

    var locationData;
    var lpath = generateLocationJSONPath(user.region, user.location);
    var ldata;
    try {
        ldata = fs.readFileSync(lpath, "utf8");
        locationData = JSON.parse(ldata);
    } catch (err) {
        return null;
    }
    
    var rarityIndex = 0;
    var cur = convertToTimeZone(user);
    var hour = moment(cur).hour();
    if (region === "Kanto" || region === "Johto" || region === "Sinnoh") {
        if (hour >= 10 && hour < 20) {
            rarityIndex = 1;
        } else if (hour >= 20 || hour < 4) {
            rarityIndex = 2;
        }
    } else if (region === "Unova") {
        rarityIndex = moment().month() % 4;
    } else if (region === "Alola") {
        if (hour < 6 || hour >= 18) {
            rarityIndex = 1;
        }
    }

    var bag = await getBag(user.user_id);
    if (bag === null) {
        return new Promise(function(resolve) {
            resolve(null);
        });
    }
    var hasRadar = false;
    var doesUserHaveIt = bag.map(function(t) { return t.name.toLowerCase(); }).indexOf("Poké Radar");
    if (doesUserHaveIt >= 0) {
        hasRadar = true;
    }

    var isSwarming = false;

    var p;
    for (p = 0; p < locationData.pokemon.length; p++) {
        if ((locationData.pokemon[p].min_level <= leadLevel) && (locationData.pokemon[p].field === field) && locationData.pokemon[p].rarity[rarityIndex] > 0) {
            if (locationData.pokemon[p].hasOwnProperty("swarm")) {
                if (isSwarming === true) {
                    if (locationData.pokemon[p].rarity[rarityIndex] <= 15) {
                        possiblePokemonRare[possiblePokemonRare.length] = new WildPokemon(locationData.pokemon[p].name, level, locationData.pokemon[p].rarity[rarityIndex], locationData.pokemon[p].field);
                    } else {
                        possiblePokemonNotRare[possiblePokemonNotRare.length] = new WildPokemon(locationData.pokemon[p].name, level, locationData.pokemon[p].rarity[rarityIndex], locationData.pokemon[p].field);
                    }
                }
            } else if (locationData.pokemon[p].hasOwnProperty("dexnav")) {
                if (hasRadar === true) {
                    if (locationData.pokemon[p].rarity[rarityIndex] <= 15) {
                        possiblePokemonRare[possiblePokemonRare.length] = new WildPokemon(locationData.pokemon[p].name, level, locationData.pokemon[p].rarity[rarityIndex], locationData.pokemon[p].field);
                    } else {
                        possiblePokemonNotRare[possiblePokemonNotRare.length] = new WildPokemon(locationData.pokemon[p].name, level, locationData.pokemon[p].rarity[rarityIndex], locationData.pokemon[p].field);
                    }
                }
            } else {
                var highestLevel = locationData.pokemon[p].max_level;
                if (highestLevel > lead.level) {
                    highestLevel = lead.level;
                }
                var level = Math.floor(Math.random() * (highestLevel - locationData.pokemon[p].min_level + 1)) + locationData.pokemon[p].min_level;
                if (locationData.pokemon[p].rarity[rarityIndex] <= 15) {
                    possiblePokemonRare[possiblePokemonRare.length] = new WildPokemon(locationData.pokemon[p].name, level, locationData.pokemon[p].rarity[rarityIndex], locationData.pokemon[p].field);
                } else {
                    possiblePokemonNotRare[possiblePokemonNotRare.length] = new WildPokemon(locationData.pokemon[p].name, level, locationData.pokemon[p].rarity[rarityIndex], locationData.pokemon[p].field);
                }
            }
        }
    }

    if (possiblePokemonNotRare.length === 0 && possiblePokemonRare.length == 0) {
        return null;
    }

    if (possiblePokemonRare.length > 0) {
        function compare(a,b) {
            if (a.rarity < b.rarity) {
                return -1;
            }
            if (a.rarity > b.rarity) {
                return 1;
            }
            return 0;
        }
    
        possiblePokemonRare.sort(compare);

        var r;
        for (r = 0; r < possiblePokemonRare.length; r++) {
            if ((Math.random() * 100) <= possiblePokemonRare[r].rarity) {
                selectedPokemon = possiblePokemonRare[r];
            }
            r = possiblePokemonRare.length;
        }

        if (selectedPokemon == null && possiblePokemonNotRare.length === 0) {
            selectedPokemon = possiblePokemonRare[possiblePokemonRare.length - 1];
        }
    }

    if (selectedPokemon == null) {
        function shuffle(arr) {
            for (var i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }

        shuffle(possiblePokemonNotRare);

        var n;
        for (n = 0; n < possiblePokemonNotRare.length; n++) {
            if ((Math.random() * 100) <= possiblePokemonNotRare[n].rarity) {
                selectedPokemon = possiblePokemonNotRare[n];
            }
            n = possiblePokemonNotRare.length;
        }

        if (selectedPokemon == null) {
            selectedPokemon = possiblePokemonNotRare[possiblePokemonNotRare.length - 1];
        }
    }

    var hasHidden = false;
    if((Math.random() * 100) > 90) {
        hasHidden = false;
    }

    return await generatePokemonByName(message, selectedPokemon.name, selectedPokemon.level, region, location, hasHidden);
}

/*
async function convertDBToSimPokemon(pokemon) {
    var moves = [];
    moves[moves.length] = pokemon.move_1.replace(/\W/g, '').toLowerCase();
    moves[moves.length] = pokemon.move_2.replace(/\W/g, '').toLowerCase();
    moves[moves.length] = pokemon.move_3.replace(/\W/g, '').toLowerCase();
    moves[moves.length] = pokemon.move_4.replace(/\W/g, '').toLowerCase();
    var ident = "p1: " + pokemon.name;
    var details;
    if (pokemon.gender === "Male") {
        details = pokemon.name + ", L" + pokemon.level_current + ", M";
    } else {
        details = pokemon.name + ", L" + pokemon.level_current + ", F";
    }
    var condition = pokemon.stat_hp + "/" + pokemon.stat_hp;
    var stats = {
        "atk": pokemon.stat_atk,
        "def": pokemon.stat_def,
        "spa": pokemon.stat_spatk,
        "spd": pokemon.stat_spdef,
        "spe": pokemon.stat_spd
    };
    var ability = pokemon.ability.replace(/\W/g, '').toLowerCase();
    return new Promise(function(resolve) {
        resolve([{
            "ident": ident,
            "details": details,
            "condition": condition,
            "active": true,
            "stats": stats,
            "moves": moves,
            "baseAbility": ability,
            "item": "luckyegg",
            "pokeball": "pokeball",
            "ability": ability
        }]);
    });
}

async function convertWildToSimPokemon(pokemon) {
    var moves = [];
    moves[moves.length] = pokemon.moves[0].replace(/\W/g, '').toLowerCase();
    moves[moves.length] = pokemon.moves[1].replace(/\W/g, '').toLowerCase();
    moves[moves.length] = pokemon.moves[2].replace(/\W/g, '').toLowerCase();
    moves[moves.length] = pokemon.moves[3].replace(/\W/g, '').toLowerCase();
    var ident = "p2: " + pokemon.name;
    var details;
    if (pokemon.gender === "Male") {
        details = pokemon.name + ", L" + pokemon.level + ", M";
    } else {
        details = pokemon.name + ", L" + pokemon.level + ", F";
    }
    var condition = pokemon.stats[0] + "/" + pokemon.stats[0];
    var stats = {
        "atk": pokemon.stats[1],
        "def": pokemon.stats[2],
        "spa": pokemon.stats[3],
        "spd": pokemon.stats[4],
        "spe": pokemon.stats[5]
    };
    var ability = pokemon.ability.replace(/\W/g, '').toLowerCase();
    return new Promise(function(resolve) {
        resolve([{
            "ident": ident,
            "details": details,
            "condition": condition,
            "active": true,
            "stats": stats,
            "moves": moves,
            "baseAbility": ability,
            "item": "luckyegg",
            "pokeball": "pokeball",
            "ability": ability
        }]);
    });
}

async function battleWildPokemon(message, wild) {
    var stream = new Sim.BattleStream();
    var lead = await getLeadPokemon(message.author.id);
    var leadSim = await convertDBToSimPokemon(lead);
    var wildSim = await convertWildToSimPokemon(wild);

    (async () => {
        var output;
        while ((output = await stream.read())) {
            console.log(output);
        }
    })();

    var Config = require('./Pokemon-Showdown/config/config-example.js');
    
    stream.write(`>start {"format":"gen7randombattle"}`);
    stream.write(`>player p1 {"name":"${message.author.username}"}`);
    stream.write(`>player p2 {"name":"${wild.name}"}`);
    stream.write(`>p1 team 1`);
    stream.write(`>p2 team 1`);
    stream.write(`>p1 move 1`);
    stream.write(`>p2 move 4`);
    stream.write(`>p1 move 3`);
    stream.write(`>p2 move 2`);
}

*/

/**
 * Allows a user to catch a Pokemon. The user is continuously prompted
 * on which Poke Ball to use until either the Pokemon is caught or the user
 * runs away from the Pokemon. The user's lead Pokemon also gets its EVs
 * changed based on the encountered Pokemon.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {Pokemon} wild The Pokemon that was generated to be caught.
 * @param {User} user The Pokebot user who is catching the Pokemon.
 * @param {Pokemon} lead The user's lead Pokemon.
 * 
 * @returns {boolean} True if the user caught the Pokemon.
 */
async function throwPokeBall(message, wild, user, lead) {
    var path = generatePokemonJSONPath(wild.name);
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    
    var pkmn = JSON.parse(data);

    var leadLevel = lead.level_current;
    var leadGender = lead.gender;
    var leadName = lead.name;
    
    let heldItem = await getItem(lead.item);
    if (heldItem === null) {
        heldItem = lead.item;
    }

    var evBonus = 0;
    var evMult = 1;
    if (heldItem === "Macho Brace") {
        evMult = 2;
    }
    
    var EVs = [lead.ev_hp, lead.ev_atk, lead.ev_def, lead.ev_spatk, lead.ev_spdef, lead.ev_spd];
    var oldEV = 0;
    var evsum = EVs[0] + EVs[1] + EVs[2] + EVs[3] + EVs[4] + EVs[5];
    if (evsum < 510 && lead.level_current < 100) {
        if (EVs[0] < 252 && evsum < 510 && pkmn.ev_yield.hp > 0) {
            oldEV = EVs[0];
            if (heldItem === "Power Weight") {
                evBonus = 8;
            } else {
                evBonus = 0;
            }
            EVs[0] += ((pkmn.ev_yield.hp * evMult) + evBonus);
            if (EVs[0] > 252) {
                EVs[0] = 252;
            }
            oldEV = EVs[0] - oldEV;
            evsum += oldEV;
            if (evsum > 510) {
                evsum = 510;
            }
        }
        if (EVs[1] < 252 && evsum < 510 && pkmn.ev_yield.atk > 0) {
            oldEV = EVs[1];
            if (heldItem === "Power Bracer") {
                evBonus = 8;
            } else {
                evBonus = 0;
            }
            EVs[1] += ((pkmn.ev_yield.atk * evMult) + evBonus);
            if (EVs[1] > 252) {
                EVs[1] = 252;
            }
            oldEV = EVs[1] - oldEV;
            evsum += oldEV;
            if (evsum > 510) {
                evsum = 510;
            }
        }
        if (EVs[2] < 252 && evsum < 510 && pkmn.ev_yield.def > 0) {
            oldEV =EVs[2];
            if (heldItem === "Power Belt") {
                evBonus = 8;
            } else {
                evBonus = 0;
            }
            EVs[2] += ((pkmn.ev_yield.def * evMult) + evBonus);
            if (EVs[2] > 252) {
                EVs[2] = 252;
            }
            oldEV = EVs[2] - oldEV;
            evsum += oldEV;
            if (evsum > 510) {
                evsum = 510;
            }
        }
        if (EVs[3] < 252 && evsum < 510 && pkmn.ev_yield.sp_atk > 0) {
            oldEV = EVs[3];
            if (heldItem === "Power Lens") {
                evBonus = 8;
            } else {
                evBonus = 0;
            }
            EVs[3] += ((pkmn.ev_yield.sp_atk * evMult) + evBonus);
            if (EVs[3] > 252) {
                EVs[3] = 252;
            }
            oldEV = EVs[3] - oldEV;
            evsum += oldEV;
            if (evsum > 510) {
                evsum = 510;
            }
        }
        if (EVs[4] < 252 && evsum < 510 && pkmn.ev_yield.sp_def > 0) {
            oldEV = EVs[4];
            if (heldItem === "Power Band") {
                evBonus = 8;
            } else {
                evBonus = 0;
            }
            EVs[4] += ((pkmn.ev_yield.sp_def * evMult) + evBonus);
            if (EVs[4] > 252) {
                EVs[4] = 252;
            }
            oldEV = EVs[4] - oldEV;
            evsum += oldEV;
            if (evsum > 510) {
                evsum = 510;
            }
        }
        if (EVs[5] < 252 && evsum < 510 && pkmn.ev_yield.speed > 0) {
            oldEV = EVs[5];
            if (heldItem === "Power Anklet") {
                evBonus = 8;
            } else {
                evBonus = 0;
            }
            EVs[5] += ((pkmn.ev_yield.speed * evMult) + evBonus);
            if (EVs[5] > 252) {
                EVs[5] = 252;
            }
            oldEV = EVs[5] - oldEV;
            evsum += oldEV;
            if (evsum > 510) {
                evsum = 510;
            }
        }
    }

    var i;
    
    await message.channel.send("<@" + message.author.id + ">, a wild " + wild.name + " appeared!");
    
    var numTurns = 0;
    var encounter = true;
    while(encounter) {
        var Balls = await getBalls(message.author.id);
        if (Balls === null) {
            return new Promise(function(resolve) {
                resolve(false);
            });
        }
        var string = "```" + message.author.username + "'s Bag:\n";
        if (Balls.length < 1) {
            string += "You have no remaining balls!"
        } else {
            for (i = 0; i < Balls.length; i++) {
                string += ((i + 1).toString() + ". " + Balls[i].name + " x" + Balls[i].quantity.toString() + "\n");
            }
        }

        string += "```Type the name or number of the ball as shown in the list to throw it or \"Run\" to run away. Note that you do not need to include the word \"Ball\" when typing the name.";

        await message.channel.send(string);
        numTurns++;
        var mes;
        var cancel = false;
        var input = null;
        while(cancel == false) {
            await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 180000, errors: ['time'] })
            .then(collected => {
                input = collected.first().content.toString().toLowerCase();
                mes = collected.first();
            })
            .catch(collected => {
                cancel = true;
                input = null;
            });

            if (input == null) {
                input = -1;
            } else if (input === "run" || input === "fuck off") {
                cancel = true;
                input = -2;
                i = 1800;
            } else if (/^\d+$/.test(input)) {
                var num = Number(input) - 1;
                if (Balls.length < 1) {
                    message.channel.send(message.author.username + " you are out of balls!");
                    i = 0;
                    input = -1;
                } else if (num >= 0 && num < Balls.length) {
                    input = num;
                    cancel = true;
                    i = 1800;
                } else {
                    message.channel.send(message.author.username + ", your number was not in range. Type the name or number of the ball as shown in the list to throw it or \"Run\" to run away. Note that you do not need to include the word \"Ball\" when typing the name.");
                    i = 0;
                    input = -1;
                }
            } else if (input != null) {
                if (input === "poke" || input === "poke ball") {
                    input = "poké ball";
                }
                if (!input.includes("ball")) {
                    input += " ball";
                }
                if (Balls.length < 1) {
                    message.channel.send(message.author.username + " you are out of balls!");
                    i = 0;
                    input = -1;
                } else {
                    if (input === "poke" || input === "poke ball") {
                        input = "poké ball";
                    }
                    var doesUserHaveIt = Balls.map(function(t) { return t.name.toLowerCase(); }).indexOf(input);
                    if (doesUserHaveIt >= 0) {
                        cancel = true;
                        input = doesUserHaveIt;
                        i = 60;
                    } else {
                        message.channel.send(message.author.username + ", your response was not recognized. Type the name or number of the ball as shown in the list to throw it or \"Run\" to run away. Note that you do not need to include the word \"Ball\" when typing the name.");
                        i = 0;
                        input = -1;
                    }
                }
            } else {
                input = -1;
            }
        }
        
        var catchChance = 30;
        var catchRate = pkmn.catch_rate;
        
        if (input === -2) {
            await message.channel.send(message.author.username + " ran away from the wild " + wild.name + ".");
            encounter = false;
        } else if (input === -1) {
            await message.channel.send(message.author.username + " the wild " + wild.name + " fled!");
            encounter = false;
        } else { //threw ball
            ballUsed = Balls[input].name;
            if (Balls[input].name === "Great Ball") {
                catchChance = catchChance * 1.5;
            } else if (Balls[input].name === "Ultra Ball") {
                catchChance = catchChance * 2;
            } else if (Balls[input].name === "Master Ball") {
                catchChance = catchChance * 255;
            } else if (Balls[input].name === "Level Ball") {
                if (leadLevel >= (wild.level * 4)) {
                    catchChance = catchChance * 8;
                } else if (leadLevel >= (wild.level * 2)) {
                    catchChance = catchChance * 4;
                } else if (leadLevel >= (wild.level * 1)) {
                    catchChance = catchChance * 2;
                }
            } else if (Balls[input].name === "Lure Ball") {
                if (user.field.includes("Rod")) {
                    catchChance = catchChance * 5;
                }
            } else if (Balls[input].name === "Moon Ball") {
                if (wild.name === "Nidoran♂" || wild.name === "Nidorino" || wild.name === "Nidoking" || wild.name === "Nidoran♀" || wild.name === "Nidorina" || wild.name === "Nidoqueen" || wild.name === "Cleffa" || wild.name === "Clefairy" || wild.name === "Clefable" || wild.name === "Igglybuff" || wild.name === "Jigglypuff" || wild.name === "Wigglytuff" || wild.name === "Skitty" || wild.name === "Delcatty" || wild.name === "Munna" || wild.name === "Musharna") {
                    catchChance = catchChance * 4;
                }
            } else if (Balls[input].name === "Love Ball") {
                if (leadName === wild.name) {
                    if (leadGender === "Male" && wild.gender === "Female") {
                        catchChance = catchChance * 8;
                    } else if (leadGender === "Female" && wild.gender === "Male") {
                        catchChance = catchChance * 8;
                    }
                }
            } else if (Balls[input].name === "Heavy Ball") {
                var weight = pkmn.weight_us;
                if ((name === "Pumpkaboo" || name === "Gourgeist") && form != "Small Size") {
                    if (form === "Average Size") {
                        weight = pkmn.variations[0].weight_us;
                    } else if (form === "Average Size") {
                        weight = pkmn.variations[1].weight_us;
                    } else {
                        weight = pkmn.variations[2].weight_us;
                    }
                }
                weight = weight.substring(0, (weight.length - 5));
                weight = parseFloat(weight);
                if (weight >= 661.4) {
                    catchChance += 30;
                } else if (weight >= 451.5) {
                    catchChance += 20;
                } else if (weight <= 220.2) {
                    catchChance -= 20;
                }
            } else if (Balls[input].name === "Fast Ball") {
                if (pkmn.base_stats.speed >= 100) {
                    catchChance = catchChance * 4;
                }
            } else if (Balls[input].name === "Repeat Ball") {
                var haspokemon = user.pokemon.map(function(t) { return t.name; }).indexOf(wild.name);
                if (haspokemon >= 0) {
                    catchChance = catchChance * 3.5;
                }
            } else if (Balls[input].name === "Timer Ball") {
                var chance = (1 + (numTurns * (1229/4096)));
                if (chance > 4) {
                    chance = 4;
                }
                catchChance = catchChance * chance;
            } else if (Balls[input].name === "Nest Ball") {
                if (wild.level < 30) {
                    var chance = ((41 - wild.level) / 10);
                    catchChance = catchChance * chance;
                }
            } else if (Balls[input].name === "Net Ball") {
                if (pkmn.types[0] === "Water" || pkmn.types[0] === "Bug") {
                    catchChance = catchChance * 3.5;
                } else if (pkmn.types.length > 1) {
                    if (pkmn.types[1] === "Water" || pkmn.types[1] === "Bug") {
                        catchChance = catchChance * 3.5;
                    }
                }
            } else if (Balls[input].name === "Dive Ball") {
                if (user.field.includes("Rod")) {
                    catchChance = catchChance * 3.5;
                } else if (user.field === "Surfing") {
                    catchChance = catchChance * 3.5;
                }
            } else if (Balls[input].name === "Quick Ball") {
                if (numTurns === 1) {
                    catchChance = catchChance * 5;
                }
            } else if (Balls[input].name === "Dusk Ball") {
                var locs;
                var isDark = false;
                var time = new Date();
                var time = time.getHours();
                if ((time >= 0 && time < 6) || time >= 18) {
                    isDark = true;
                } else if (user.region === "Kanto") {
                    locs = ["Cerulean Cave", "Diglett's Cave", "Mt. Moon", "Rock Tunnel", "Seafoam Islands", "Victory Road", "Altering Cave", "Icefall Cave", "Lost Cave"];
                    if (locs.indexOf(user.location) >= 0) {
                        isDark = true;
                    }
                } else if (user.region === "Johto") {
                    locs = ["Cliff Cave", "Cliff Edge Gate", "Dark Cave", "Dragon's Den", "Ice Path", "Mt. Mortar", "Victory Road", "Mt. Silver", "Slowpoke Well", "Union Cave", "Whirl Islands"];
                    if (locs.indexOf(user.location) >= 0) {
                        isDark = true;
                    }
                } else if (user.region === "Hoenn") {
                    locs = ["Artisan Cave", "Altering Cave", "Cave of Origin", "Desert Underpass", "Fabled Cave", "Fiery Path", "Victory Road", "Granite Cave", "Marine Cave", "Meteor Falls", "Nameless Cavern", "Rusturf Tunnel", "Scorched Slab", "Seafloor Cavern", "Shoal Cave", "Terra Cave"];
                    if (locs.indexOf(user.location) >= 0) {
                        isDark = true;
                    }
                } else if (user.region === "Sinnoh") {
                    locs = ["Iron Island", "Maniac Tunnel", "Mt. Coronet", "Oreburgh Gate", "Oreburgh Mine", "Quiet Cave", "Victory Road", "Ravaged Path", "Stark Mountain", "Turnback Cave", "Wayward Cave"];
                    if (locs.indexOf(user.location) >= 0) {
                        isDark = true;
                    }
                } else if (user.region === "Unova") {
                    locs = ["Cave of Being", "Challenger's Cave", "Chargestone Cave", "Clay Tunnel", "Giant Chasm", "Mistralton Cave", "Relic Passage", "Reversal Mountain", "Seaside Cave", "Twist Mountain", "Victory Road", "Wellspring Cave"];
                    if (locs.indexOf(user.location) >= 0) {
                        isDark = true;
                    }
                } else if (user.region === "Kalos") {
                    locs = ["Connecting Cave", "Frost Cavern", "Glittering Cave", "Reflection Cave", "Sea Spirit's Den", "Victory Road", "Terminus Cave"];
                    if (locs.indexOf(user.location) >= 0) {
                        isDark = true;
                    }
                } else if (user.region === "Alola") {
                    locs = ["Diglett's Tunnel", "Mount Lanakila", "Resolution Cave", "Seaward Cave", "Ten Carat Hill", "Verdant Cavern"];
                    if (locs.indexOf(user.location) >= 0) {
                        isDark = true;
                    }
                }
                
                if (isDark) {
                    catchChance = catchChance * 3;
                }
            }
            
            var shakes = 0;
            var luck = ((Math.ceil(Math.random() * catchRate) + catchChance));
            if (luck >= 70) {
                shakes++;
                await mes.react("▫");
            }
            luck = ((Math.ceil(Math.random() * catchRate) + catchChance));
            if (luck >= 70) {
                shakes++;
                if (shakes === 1) {
                    await mes.react("▫");
                } else {
                    await mes.react("◻");
                }
            }
            luck = ((Math.ceil(Math.random() * catchRate) + catchChance));
            if (luck >= 70) {
                shakes++;
                if (shakes === 1) {
                    await mes.react("▫");
                } else if (shakes === 2) {
                    await mes.react("◻");
                } else {
                    await mes.react("⬜");
                }
            }
            luck = ((Math.ceil(Math.random() * catchRate) + catchChance));
            if (luck >= 70) {
                shakes++;
                if (shakes === 1) {
                    await mes.react("▫");
                } else if (shakes === 2) {
                    await mes.react("◻");
                } else if (shakes === 3) {
                    await mes.react("⬜");
                } else {
                    await mes.react("🌟");
                }
            }
            if (shakes === 0) {
                await message.channel.send("Oh no! The Pokémon broke free!");
                await removeItemFromBag(message.author.id, Balls[input].name, 1);
            } else if (shakes === 1) {
                await message.channel.send("	Aww! It appeared to be caught!");
                await removeItemFromBag(message.author.id, Balls[input].name, 1);
            } else if (shakes === 2) {
                await message.channel.send("Aargh! Almost had it!");
                await removeItemFromBag(message.author.id, Balls[input].name, 1);
            } else if (shakes === 3) {
                await message.channel.send("Gah! It was so close, too!");
                await removeItemFromBag(message.author.id, Balls[input].name, 1);
            } else if (shakes === 4) {
                await message.channel.send("Gotcha! " + wild.name + " was caught!");
                await removeItemFromBag(message.author.id, Balls[input].name, 1);
                wild.ot = message.author.username;
                wild.otid = message.author.id;
                wild.date = convertToTimeZone(user).format();

                if (ballUsed === "Friend Ball") {
                    wild.friendship = 200;
                } else {
                    wild.frienship = pkmn.base_friendship;
                }
                
                if (wild.level > user.level) {
                    user.level = wild.level;
                }

                wild.caughtIn = Balls[input].name;
                wild.nick = await nicknamePokemon(message, wild.name);
                await addPokemon(message.author.id, wild);
                await addToPokedex(user, wild.no);
                encounter = false;
            }
        }
    }
    return true;
}

/**
 * Sends a message containing detailed information about a Pokemon that is not
 * owned by any trainers.
 * 
 * @param {Pokemon} pkmn The Pokemon object to be represented in the message.
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function displayAWildPkmn(pkmn, message) {
    var footerLink = "https://cdn.bulbagarden.net/upload/9/93/Bag_Pok%C3%A9_Ball_Sprite.png";
    var footerText = "You already have this Pokémon.";
    var user = await getUser(message.author.id);
    if (user != null) {
        if (user.pokedex.charAt(pkmn.no) === '0') {
            footerLink = "https://cdn.bulbagarden.net/upload/7/74/Bag_Heavy_Ball_Sprite.png";
            footerText = "You do not have this Pokémon.";
        }
    } else {
        footerLink = "https://cdn.bulbagarden.net/upload/7/74/Bag_Heavy_Ball_Sprite.png";
        footerText = "You do not have this Pokémon.";
    }
    
    var modelLink = generateModelLink(pkmn.name, pkmn.shiny, pkmn.gender, pkmn.form);
    if (modelLink === null) {
        return new Promise(function(resolve) {
            resolve(null);
        });
    }

    var spriteLink = generateSpriteLink(pkmn.name, pkmn.gender, pkmn.form);
    if (spriteLink === null) {
        return new Promise(function(resolve) {
            resolve(null);
        });
    }

    var nextLevel = getXpToNextLevel(pkmn.name, pkmn.totalxp, pkmn.level);
    
    var type_icon = await client.emojis.find(type_icon => type_icon.name === pkmn.type[0]);
    var typeString = type_icon + " " + pkmn.type[0];
    if (pkmn.type[1] != "---" && pkmn.type[1] != null) {
        type_icon = await client.emojis.find(type_icon => type_icon.name === pkmn.type[1]);
        typeString += ("\n" + type_icon + " " + pkmn.type[1]);
    }

    var name = pkmn.name;
    if (pkmn.shiny === 1) {
        name += " ⭐";
    }
    
    if (pkmn.form != "None" && pkmn.form != null) {
        name = name + " (" + pkmn.form + ")";
    }
    
    var item = "None";
    if (pkmn.item != "None" && pkmn.item != null) {
        item = pkmn.item;
    }
    
    var imageName = await getGifName(pkmn.name);
    
    var movesString = pkmn.moves[0];
    if (pkmn.moves[1] != "---" && pkmn.moves[1] != null) {
        movesString += "\n" + pkmn.moves[1];
    }
    if (pkmn.moves[2] != "---" && pkmn.moves[2] != null) {
        movesString += "\n" + pkmn.moves[2];
    }
    if (pkmn.moves[3] != "---" && pkmn.moves[3] != null) {
        movesString += "\n" + pkmn.moves[3];
    }

    message.channel.send({
        "embed": {
            "author": {
                "name": name,
                "icon_url": spriteLink,
            },
            "color": getTypeColor(pkmn.type[0]),
            "thumbnail": {
                "url": "attachment://" + imageName + ".gif"
            },
            "footer": {
                "icon_url": footerLink,
                "text": footerText
            },
            "fields": [
                {
                    "name": "Level " + pkmn.level.toString(),
                    "value": "Total XP: " + pkmn.totalxp + "\n" + "To next level: " + nextLevel,
                    "inline": true
                },
                {
                    "name": "Type",
                    "value": typeString,
                    "inline": true
                },
                {
                    "name": "Gender",
                    "value": pkmn.gender,
                    "inline": true
                },
                {
                    "name": "Ability",
                    "value": pkmn.ability,
                    "inline": true
                },
                {
                    "name": "Nature",
                    "value": pkmn.nature,
                    "inline": true
                },
                {
                    "name": "Item",
                    "value": item,
                    "inline": true
                },
                {
                    "name": "Stats",
                    "value": "HP: " + pkmn.stats[0] + "\n" +
                    "Attack: " + pkmn.stats[1] + "\n" +
                    "Defense: " + pkmn.stats[2] + "\n" +
                    "Sp. Attack: " + pkmn.stats[3] + "\n" +
                    "Sp. Defense: " + pkmn.stats[4] + "\n" +
                    "Speed: " + pkmn.stats[5],
                    "inline": true
                },
                {
                    "name": "Moves",
                    "value": movesString,
                    "inline": true
                }
            ]
        }, files: [{ attachment: modelLink, name: (imageName + '.gif') }]
    });
}

/**
 * Converts a Pokemon's name into a string that will not be changed
 * when being uploaded to Discord's databases as a message attachment.
 * 
 * @param {string} name The name of the Pokemon to be converted.
 * 
 * @returns {string} A string compatible with Discord's attachment databases.
 */
function getGifName(name) {
    if (name.startsWith("Nidoran")) {
        return "Nidoran";
    } else if (name === "Mime Jr.") {
        return "MimeJr";
    } else if (name === "Mr. Mime") {
        return "MrMime";
    } else if (name === "Flabébé") {
        return "Flabebe";
    } else if (name === "Farfetch'd") {
        return "Farfetchd";
    } else if (name === "Kommo-o") {
        return "Kommoo";
    } else if (name === "Jangmo-o") {
        return "Jangmoo";
    } else if (name === "Hakamo-o") {
        return "Hakamoo";
    } else {
        return name;
    }
}

/**
 * Gets all moves currently known by an owned Pokemon.
 * 
 * @param {number} pokemonId The id of the owned Pokemon.
 * 
 * @returns {any[]} All moves currently known by the Pokemon.
 */
async function getPokemonKnownMoves(pokemonId) {
    let moves = await doQuery("SELECT * FROM move WHERE move.pokemon = ? AND move.known = 1", [pokemonId]);
    return new Promise(function(resolve) {
        resolve(moves);
    });
}

/**
 * Sends a message containing detailed information about a Pokemon that is
 * owned by a trainer.
 * 
 * @param {Pokemon} pkmn The Pokemon object to be represented in the message.
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function displayAnOwnedPkmn(pkmn, message) {
    var modelLink = generateModelLink(pkmn.name, pkmn.shiny, pkmn.gender, pkmn.form);
    if (modelLink === null) {
        return new Promise(function(resolve) {
            resolve(null);
        });
    }

    var spriteLink = generateSpriteLink(pkmn.name, pkmn.gender, pkmn.form);
    if (spriteLink === null) {
        return new Promise(function(resolve) {
            resolve(null);
        });
    }

    var nextLevel = getXpToNextLevel(pkmn.name, pkmn.xp, pkmn.level_current);
    
    var year = moment(pkmn.date).format('Y');
    var month = moment(pkmn.date).format('MMMM');
    var today = moment(pkmn.date).format('Do');
    
    var name = pkmn.name;
    var nick = pkmn.nickname;
    if (nick == null) {
        nick = pkmn.name;
    }

    if (pkmn.shiny === 1) {
        name += " ⭐";
    }
    
    if (pkmn.form != "None" && pkmn.form != null) {
        name = name + " (" + pkmn.form + ")";
    }
    
    var item = "None";
    if (pkmn.item != "None" && pkmn.item != null) {
        item = await getItem(pkmn.item);
        if (item === null) {
            item = pkmn.item;
        } else {
            item = item.name;
        }
    }
    
    var imageName = await getGifName(pkmn.name);
    
    var trainerName = await client.fetchUser(pkmn.original_trainer).then(myUser => {
        return myUser.username;
    });
    
    var type_icon = await client.emojis.find(type_icon => type_icon.name === pkmn.type_1);
    var typeString = type_icon + " " + pkmn.type_1;
    if (pkmn.type_2 != "---" && pkmn.type_2 != null) {
        type_icon = await client.emojis.find(type_icon => type_icon.name === pkmn.type_2);
        typeString += ("\n" + type_icon + " " + pkmn.type_2);
    }

    let moves = await getPokemonKnownMoves(pkmn.pokemon_id);
    if (moves === null) {
        console.warn(chalk`{yellow [WARNING]} Pokemon ` + pkmn.pokemon_id + ` has null moves!`);
    }
    let i = 0;
    let movesString = "";
    for (i; i < moves.length; i++) {
        movesString += moves[i].name;
        movesString += "\n";
    }
    
    await message.channel.send({
        "embed": {
            "author": {
                "name": nick,
                "icon_url": spriteLink,
            },
            "title": name,
            "description": getCharacteristic(pkmn),
            "color": getTypeColor(pkmn.type_1),
            "thumbnail": {
                "url": "attachment://" + imageName + ".gif"
            },
            "footer": {
                "icon_url": "attachment://ball.png",
                "text": pkmn.location + ", " + pkmn.region + " on " + month + " " + today + ", " + year + " at level " + pkmn.level_caught
            },
            "fields": [
                
                {
                    "name": "Original Trainer",
                    "value": trainerName,
                    "inline": false
                },
                {
                    "name": "Level " + pkmn.level_current.toString(),
                    "value": "Total XP: " + pkmn.xp + "\n" + "To next level: " + nextLevel,
                    "inline": true
                },
                {
                    "name": "Type",
                    "value": typeString,
                    "inline": true
                },
                {
                    "name": "Gender",
                    "value": pkmn.gender,
                    "inline": true
                },
                {
                    "name": "Ability",
                    "value": pkmn.ability,
                    "inline": true
                },
                {
                    "name": "Nature",
                    "value": pkmn.nature,
                    "inline": true
                },
                {
                    "name": "Item",
                    "value": item,
                    "inline": true
                },
                {
                    "name": "Stats",
                    "value": "HP: " + pkmn.stat_hp + "\n" +
                    "Attack: " + pkmn.stat_atk + "\n" +
                    "Defense: " + pkmn.stat_def + "\n" +
                    "Sp. Attack: " + pkmn.stat_spatk + "\n" +
                    "Sp. Defense: " + pkmn.stat_spdef + "\n" +
                    "Speed: " + pkmn.stat_spd,
                    "inline": true
                },
                {
                    "name": "Moves",
                    "value": movesString,
                    "inline": true
                }
            ]
        }, files: [{ attachment: modelLink, name: (imageName + '.gif') }, { attachment: ("../gfx/balls/" + pkmn.ball + ".png"), name: 'ball.png' }]
    });
}

/**
 * Sends a message containing detailed information about an owned
 * Pokemon's hidden stats, including its friendship, personality
 * value, effort values, individual values, and hidden power type.
 * 
 * @param {Pokemon} pkmn The Pokemon object to be represented in the message.
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
function displayHiddenStats(pkmn, message) {
    var modelLink = generateModelLink(pkmn.name, pkmn.shiny, pkmn.gender, pkmn.form);
    if (modelLink === null) {
        return new Promise(function(resolve) {
            resolve(null);
        });
    }

    var spriteLink = generateSpriteLink(pkmn.name, pkmn.gender, pkmn.form);
    if (spriteLink === null) {
        return new Promise(function(resolve) {
            resolve(null);
        });
    }

    var EVs = [pkmn.ev_hp, pkmn.ev_atk, pkmn.ev_def, pkmn.ev_spatk, pkmn.ev_spdef, pkmn.ev_spd];
    var IVs = [pkmn.iv_hp, pkmn.iv_atk, pkmn.iv_def, pkmn.iv_spatk, pkmn.iv_spdef, pkmn.iv_spd];

    var name = pkmn.name;
    var name = pkmn.name;
    var nick = name;
    if (pkmn.nickname != null) {
        nick = pkmn.nickname;
    }
    
    if (pkmn.shiny === 1) {
        name += " ⭐";
    }
    


    if (pkmn.form != "None" && pkmn.form != null) {
        name = name + " (" + pkmn.form + ")";
    }
    
    var hiddenPow = Math.floor((((IVs[0] % 2) + (2 * (IVs[1] % 2)) + (4 * (IVs[2] % 2)) + (8 * (IVs[5] % 2)) + (16 * (IVs[3] % 2)) + (16 * (IVs[4] % 5))) * 15) / 63);
    if (hiddenPow === 0) {
        hiddenPow = "Fighting";
    } else if (hiddenPow === 1) {
        hiddenPow = "Flying";
    } else if (hiddenPow === 2) {
        hiddenPow = "Poison";
    } else if (hiddenPow === 3) {
        hiddenPow = "Ground";
    } else if (hiddenPow === 4) {
        hiddenPow = "Rock";
    } else if (hiddenPow === 5) {
        hiddenPow = "Bug";
    } else if (hiddenPow === 6) {
        hiddenPow = "Ghost";
    } else if (hiddenPow === 7) {
        hiddenPow = "Steel";
    } else if (hiddenPow === 8) {
        hiddenPow = "Fire";
    } else if (hiddenPow === 9) {
        hiddenPow = "Water";
    } else if (hiddenPow === 10) {
        hiddenPow = "Grass";
    } else if (hiddenPow === 11) {
        hiddenPow = "Electric";
    } else if (hiddenPow === 12) {
        hiddenPow = "Psychic";
    } else if (hiddenPow === 13) {
        hiddenPow = "Ice";
    } else if (hiddenPow === 14) {
        hiddenPow = "Dragon";
    } else if (hiddenPow === 15) {
        hiddenPow = "Dark";
    }

    var type_icon = client.emojis.find(type_icon => type_icon.name === hiddenPow);
    
    message.channel.send({
        "embed": {
            "author": {
                "name": nick,
                "icon_url": spriteLink,
            },
            "title": name,
            "color": getTypeColor(pkmn.type_1),
            "thumbnail": {
                "url": "attachment://" + pkmn.name + ".gif"
            },
            "fields": [
                
                {
                    "name": "Friendship",
                    "value": Math.trunc(pkmn.friendship),
                    "inline": true
                },
                {
                    "name": "Personality Value",
                    "value": pkmn.personality,
                    "inline": true
                },
                {
                    "name": "Effort Values",
                    "value": EVs[0] + ", " + EVs[1] + ", " + EVs[2] + ", " + EVs[3] + ", " + EVs[4] + ", " + EVs[5],
                    "inline": true
                },
                {
                    "name": "Individual Values",
                    "value": IVs[0] + ", " + IVs[1] + ", " + IVs[2] + ", " + IVs[3] + ", " + IVs[4] + ", " + IVs[5],
                    "inline": true
                },
                {
                    "name": "Hidden Power Type",
                    "value": type_icon + " " + hiddenPow,
                    "inline": true
                }
            ]
        }, files: [{ attachment: modelLink, name: (pkmn.name + '.gif') }]
    });
}

/**
 * Sends a message showing all Pokemon that a user can encounter in their
 * current location based on certain factors, such as time of day.
 * Each field is separated by tabs that are navigated by using reactions.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function printPossibleEncounters(message) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    var pokemon = await getPokemon(message.author.id);
    if (pokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var userID = user.user_id;

    var region = user.region;
    var loc = user.location;

    var pp = function(name, no, min, max, rarity, method, hasIt) {
        this.name = name;
        this.no = no;
        this.min = min;
        this.max = max;
        this.rarity = rarity;
        this.method = method;
        this.hasIt = hasIt;
    }
    
    path = generateLocationJSONPath(region, loc);
    var location;

    try {
        data = fs.readFileSync(path, "utf8");
        location = JSON.parse(data);
    } catch (err) {
        message.channel.send(message.author.username + " there are no wild Pokémon to be found at " + loc + ".");
        return true;
    }
    
    var possiblePokemon = [[],[],[],[],[],[]];

    var rarityIndex = 0;
    var cur = convertToTimeZone(user);
    var hour = moment(cur).hour();
    if (region === "Kanto" || region === "Johto" || region === "Sinnoh") {
        if (hour >= 10 && hour < 20) {
            rarityIndex = 1;
        } else if (hour >= 20 || hour < 4) {
            rarityIndex = 2;
        }
    } else if (region === "Unova") {
        rarityIndex = moment().month() % 4;
    } else if (region === "Alola") {
        if (hour < 6 || hour >= 18) {
            rarityIndex = 1;
        }
    }

    var i;
    for (i = 0; i < location.pokemon.length; i++) {
        var pth = generatePokemonJSONPath(location.pokemon[i].name);
        var dat;
        try {
            dat = fs.readFileSync(pth, "utf8");
        } catch (err) {
            console.log(err);
            return null;
        }

        let pkm = JSON.parse(dat);
        let dexNum = pkm.national_id.toString();
        while (dexNum.length < 3) {
            dexNum = '0' + dexNum;
        }
        var hasIt = user.pokedex.charAt(pkm.national_id);
        if (hasIt === '1') {
            hasIt = true;
        } else {
            hasIt = false;
        }
        if (location.pokemon[i].hasOwnProperty("dexnav")) {
            if (location.pokemon[i].field === "Walking") {
                possiblePokemon[0][possiblePokemon[0].length] = new pp(location.pokemon[i].name, dexNum, location.pokemon[i].min_level, location.pokemon[i].max_level, location.pokemon[i].rarity[rarityIndex], "(Poké Radar)", hasIt);
            } else if (location.pokemon[i].field === "Surfing") {
                possiblePokemon[1][possiblePokemon[1].length] = new pp(location.pokemon[i].name, dexNum, location.pokemon[i].min_level, location.pokemon[i].max_level, location.pokemon[i].rarity[rarityIndex], "(Poké Radar)", hasIt);
            } else if (location.pokemon[i].field.includes("Rod")) {
                possiblePokemon[2][possiblePokemon[2].length] = new pp(location.pokemon[i].name, dexNum, location.pokemon[i].min_level, location.pokemon[i].max_level, location.pokemon[i].rarity[rarityIndex], (location.pokemon[i].field + " (Poké Radar)"), hasIt);
            }
        } else if (location.pokemon[i].hasOwnProperty("swarm")) {
            if (location.pokemon[i].field === "Walking") {
                possiblePokemon[0][possiblePokemon[0].length] = new pp(location.pokemon[i].name, dexNum, location.pokemon[i].min_level, location.pokemon[i].max_level, location.pokemon[i].rarity[rarityIndex], "(Swarm)", hasIt);
            } else if (location.pokemon[i].field === "Surfing") {
                possiblePokemon[1][possiblePokemon[1].length] = new pp(location.pokemon[i].name, dexNum, location.pokemon[i].min_level, location.pokemon[i].max_level, location.pokemon[i].rarity[rarityIndex], "(Swarm)", hasIt);
            } else if (location.pokemon[i].field.includes("Rod")) {
                possiblePokemon[2][possiblePokemon[2].length] = new pp(location.pokemon[i].name, dexNum, location.pokemon[i].min_level, location.pokemon[i].max_level, location.pokemon[i].rarity[rarityIndex], (location.pokemon[i].field + " (Swarm)"), hasIt);
            }
        } else {
            if (location.pokemon[i].field === "Walking") {
                possiblePokemon[0][possiblePokemon[0].length] = new pp(location.pokemon[i].name, dexNum, location.pokemon[i].min_level, location.pokemon[i].max_level, location.pokemon[i].rarity[rarityIndex], null, hasIt);
            } else if (location.pokemon[i].field === "Surfing") {
                possiblePokemon[1][possiblePokemon[1].length] = new pp(location.pokemon[i].name, dexNum, location.pokemon[i].min_level, location.pokemon[i].max_level, location.pokemon[i].rarity[rarityIndex], null, hasIt);
            } else if (location.pokemon[i].field.includes("Rod")) {
                possiblePokemon[2][possiblePokemon[2].length] = new pp(location.pokemon[i].name, dexNum, location.pokemon[i].min_level, location.pokemon[i].max_level, location.pokemon[i].rarity[rarityIndex], location.pokemon[i].field, hasIt);
            } else if (location.pokemon[i].field === "Rock Smash") {
                possiblePokemon[3][possiblePokemon[3].length] = new pp(location.pokemon[i].name, dexNum, location.pokemon[i].min_level, location.pokemon[i].max_level, location.pokemon[i].rarity[rarityIndex], null, hasIt);
            } else if (location.pokemon[i].field === "Headbutt") {
                possiblePokemon[4][possiblePokemon[4].length] = new pp(location.pokemon[i].name, dexNum, location.pokemon[i].min_level, location.pokemon[i].max_level, location.pokemon[i].rarity[rarityIndex], null, hasIt);
            } else if (location.pokemon[i].field === "Dive") {
                possiblePokemon[5][possiblePokemon[5].length] = new pp(location.pokemon[i].name, dexNum, location.pokemon[i].min_level, location.pokemon[i].max_level, location.pokemon[i].rarity[rarityIndex], null, hasIt);
            }
        }
    }
    
    function compare(a,b) {
        if (a.name < b.name) {
            return -1;
        }
        if (a.name > b.name) {
            return 1;
        }
        return 0;
    }

    var walkEmbed = null;
    var surfEmbed = null;
    var fishEmbed = null;
    var headbuttEmbed = null;
    var rockSmashEmbed = null;
    var diveEmbed = null;
    var emojis = [];
    var shuffle_icon;
    var poke_ball = client.emojis.find(poke_ball => poke_ball.name === "Poke_Ball");
    var x;


    for (x = 0; x < possiblePokemon.length; x++) {
        if (possiblePokemon[x].length > 0) {
            possiblePokemon[x].sort(compare);
            if (x === 0) {
                var f = 0;
                var walkFields = [];
                emojis[emojis.length] = "TallGrass";
                walkEmbed = {
                    "author": {
                        "name": loc + " in the " + region + " Region",
                    },
                    "title": "Tall Grass",
                    "color": getTypeColor("Grass"),
                    "footer": {
                        "icon_url": "https://cdn.bulbagarden.net/upload/9/93/Bag_Pok%C3%A9_Ball_Sprite.png",
                        "text": "indicates a Pokémon you already own."
                    }
                };
                var w;
                var walkString = "";
                for (w = 0; w < possiblePokemon[x].length; w++) {
                    shuffle_icon = await getShuffleEmoji(possiblePokemon[x][w].no);
                    walkString += shuffle_icon;
                    if (possiblePokemon[x][w].hasIt) {
                        walkString += " " + poke_ball;
                    }
                    if (possiblePokemon[x][w].min === possiblePokemon[x][w].max) {
                        walkString += " **"  + possiblePokemon[x][w].name + "** Level " + possiblePokemon[x][w].min + " | Likelihood: " + possiblePokemon[x][w].rarity;
                    } else {
                        walkString += " **"  + possiblePokemon[x][w].name + "** Levels " + possiblePokemon[x][w].min + " - " + possiblePokemon[x][w].max + " | Likelihood: " + possiblePokemon[x][w].rarity;
                    }
                    if (possiblePokemon[x][w].method != null) {
                        walkString += " *" + possiblePokemon[x][w].method + "*";
                    }
                    walkString += "\n";
                    if (walkString.length >= 900) {
                        walkFields[f] = {
                            "name": 'Possible Pokémon',
                            "value": walkString
                        }
                        walkString = "";
                        f++;
                    }
                }
                if (f === 0) {
                    walkFields[f] = {
                        "name": 'Possible Pokémon',
                        "value": walkString
                    }
                } else if (walkString != "") {
                    walkFields[f] = {
                        "name": 'Possible Pokémon (cont.)',
                        "value": walkString
                    }
                }
                walkEmbed.fields = walkFields;
            } else if (x === 1) {
                var f = 0;
                var surfFields = [];
                emojis[emojis.length] = "Surfing";
                surfEmbed = {
                    "author": {
                        "name": loc + " in the " + region + " Region",
                    },
                    "title": "Surfing",
                    "color": getTypeColor("Water"),
                    "footer": {
                        "icon_url": "https://cdn.bulbagarden.net/upload/9/93/Bag_Pok%C3%A9_Ball_Sprite.png",
                        "text": "indicates a Pokémon you already own."
                    }
                };
                var w;
                var surfString = "";
                for (w = 0; w < possiblePokemon[x].length; w++) {
                    shuffle_icon = await getShuffleEmoji(possiblePokemon[x][w].no);
                    surfString += shuffle_icon;
                    if (possiblePokemon[x][w].hasIt) {
                        surfString += " " + poke_ball;
                    }
                    if (possiblePokemon[x][w].min === possiblePokemon[x][w].max) {
                        surfString += " **"  + possiblePokemon[x][w].name + "** Level " + possiblePokemon[x][w].min + " | Likelihood: " + possiblePokemon[x][w].rarity;
                    } else {
                        surfString += " **"  + possiblePokemon[x][w].name + "** Levels " + possiblePokemon[x][w].min + " - " + possiblePokemon[x][w].max + " | Likelihood: " + possiblePokemon[x][w].rarity;
                    }
                    if (possiblePokemon[x][w].method != null) {
                        surfString += " *" + possiblePokemon[x][w].method + "*";
                    }
                    surfString += "\n";
                    if (surfString.length >= 900) {
                        surfFields[f] = {
                            "name": 'Possible Pokémon',
                            "value": surfString
                        }
                        surfString = "";
                        f++;
                    }
                }
                if (f === 0) {
                    surfFields[f] = {
                        "name": 'Possible Pokémon',
                        "value": surfString
                    }
                } else if (surfString != "") {
                    surfFields[f] = {
                        "name": 'Possible Pokémon (cont.)',
                        "value": surfString
                    }
                }
                surfEmbed.fields = surfFields;
            } else if (x === 2) {
                var f = 0;
                var fishFields = [];
                emojis[emojis.length] = 'FishRod';
                fishEmbed = {
                    "author": {
                        "name": loc + " in the " + region + " Region",
                    },
                    "title": "Fishing",
                    "color": getTypeColor("Ice"),
                    "footer": {
                        "icon_url": "https://cdn.bulbagarden.net/upload/9/93/Bag_Pok%C3%A9_Ball_Sprite.png",
                        "text": "indicates a Pokémon you already own."
                    }
                };
                var w;
                var fishString = "";
                for (w = 0; w < possiblePokemon[x].length; w++) {
                    shuffle_icon = await getShuffleEmoji(possiblePokemon[x][w].no);
                    fishString += shuffle_icon;
                    if (possiblePokemon[x][w].hasIt) {
                        fishString += " " + poke_ball;
                    }
                    if (possiblePokemon[x][w].min === possiblePokemon[x][w].max) {
                        fishString += " **"  + possiblePokemon[x][w].name + "** Level " + possiblePokemon[x][w].min + " | Likelihood: " + possiblePokemon[x][w].rarity;
                    } else {
                        fishString += " **"  + possiblePokemon[x][w].name + "** Levels " + possiblePokemon[x][w].min + " - " + possiblePokemon[x][w].max + " | Likelihood: " + possiblePokemon[x][w].rarity;
                    }
                    if (possiblePokemon[x][w].method != null) {
                        fishString += " *" + possiblePokemon[x][w].method + "*";
                    }
                    fishString += "\n";
                    if (fishString.length >= 900) {
                        fishFields[f] = {
                            "name": 'Possible Pokémon',
                            "value": fishString
                        }
                        fishString = "";
                        f++;
                    }
                }
                if (f === 0) {
                    fishFields[f] = {
                        "name": 'Possible Pokémon',
                        "value": fishString
                    }
                } else if (fishString != "") {
                    fishFields[f] = {
                        "name": 'Possible Pokémon (cont.)',
                        "value": fishString
                    }
                }
                fishEmbed.fields = fishFields;
            } else if (x === 3) {
                var f = 0;
                var rockSmashFields = [];
                emojis[emojis.length] = 'RockSmash';
                rockSmashEmbed = {
                    "author": {
                        "name": loc + " in the " + region + " Region",
                    },
                    "title": "Rock Smash",
                    "color": getTypeColor("Fighting"),
                    "footer": {
                        "icon_url": "https://cdn.bulbagarden.net/upload/9/93/Bag_Pok%C3%A9_Ball_Sprite.png",
                        "text": "indicates a Pokémon you already own."
                    }
                };
                var w;
                var rockSmashString = "";
                for (w = 0; w < possiblePokemon[x].length; w++) {
                    shuffle_icon = await getShuffleEmoji(possiblePokemon[x][w].no);
                    rockSmashString += shuffle_icon;
                    if (possiblePokemon[x][w].hasIt) {
                        rockSmashString += " " + poke_ball;
                    }
                    if (possiblePokemon[x][w].min === possiblePokemon[x][w].max) {
                        rockSmashString += " **"  + possiblePokemon[x][w].name + "** Level " + possiblePokemon[x][w].min + " | Likelihood: " + possiblePokemon[x][w].rarity;
                    } else {
                        rockSmashString += " **"  + possiblePokemon[x][w].name + "** Levels " + possiblePokemon[x][w].min + " - " + possiblePokemon[x][w].max + " | Likelihood: " + possiblePokemon[x][w].rarity;
                    }
                    if (possiblePokemon[x][w].method != null) {
                        rockSmashString += " *" + possiblePokemon[x][w].method + "*";
                    }
                    rockSmashString += "\n";
                    if (rockSmashString.length >= 900) {
                        rockSmashFields[f] = {
                            "name": 'Possible Pokémon',
                            "value": rockSmashString
                        }
                        rockSmashString = "";
                        f++;
                    }
                }
                if (f === 0) {
                    rockSmashFields[f] = {
                        "name": 'Possible Pokémon',
                        "value": rockSmashString
                    }
                } else if (rockSmashString != "") {
                    rockSmashFields[f] = {
                        "name": 'Possible Pokémon (cont.)',
                        "value": rockSmashString
                    }
                }
                rockSmashEmbed.fields = rockSmashFields;
            } else if (x === 4) {
                var f = 0;
                var headbuttFields = [];
                emojis[emojis.length] = 'HeadbuttTree';
                headbuttEmbed = {
                    "author": {
                        "name": loc + " in the " + region + " Region",
                    },
                    "title": "Headbutt",
                    "color": getTypeColor("Bug"),
                    "footer": {
                        "icon_url": "https://cdn.bulbagarden.net/upload/9/93/Bag_Pok%C3%A9_Ball_Sprite.png",
                        "text": "indicates a Pokémon you already own."
                    }
                };
                var w;
                var headbuttString = "";
                for (w = 0; w < possiblePokemon[x].length; w++) {
                    shuffle_icon = await getShuffleEmoji(possiblePokemon[x][w].no);
                    headbuttString += shuffle_icon;
                    if (possiblePokemon[x][w].hasIt) {
                        headbuttString += " " + poke_ball;
                    }
                    if (possiblePokemon[x][w].min === possiblePokemon[x][w].max) {
                        headbuttString += " **"  + possiblePokemon[x][w].name + "** Level " + possiblePokemon[x][w].min + " | Likelihood: " + possiblePokemon[x][w].rarity;
                    } else {
                        headbuttString += " **"  + possiblePokemon[x][w].name + "** Levels " + possiblePokemon[x][w].min + " - " + possiblePokemon[x][w].max + " | Likelihood: " + possiblePokemon[x][w].rarity;
                    }
                    if (possiblePokemon[x][w].method != null) {
                        headbuttString += " *" + possiblePokemon[x][w].method + "*";
                    }
                    headbuttString += "\n";
                    if (headbuttString.length >= 900) {
                        headbuttFields[f] = {
                            "name": 'Possible Pokémon',
                            "value": headbuttString
                        }
                        headbuttString = "";
                        f++;
                    }
                }
                if (f === 0) {
                    headbuttFields[f] = {
                        "name": 'Possible Pokémon',
                        "value": headbuttString
                    }
                } else if (headbuttString != "") {
                    headbuttFields[f] = {
                        "name": 'Possible Pokémon (cont.)',
                        "value": headbuttString
                    }
                }
                headbuttEmbed.fields = headbuttFields;
            } else if (x === 5) {
                var f = 0;
                var diveFields = [];
                emojis[emojis.length] = 'Dive';
                diveEmbed = {
                    "author": {
                        "name": loc + " in the " + region + " Region",
                    },
                    "title": "Diving",
                    "color": getTypeColor("Ghost"),
                    "footer": {
                        "icon_url": "https://cdn.bulbagarden.net/upload/9/93/Bag_Pok%C3%A9_Ball_Sprite.png",
                        "text": "indicates a Pokémon you already own."
                    }
                };
                var w;
                var diveString = "";
                for (w = 0; w < possiblePokemon[x].length; w++) {
                    shuffle_icon = await getShuffleEmoji(possiblePokemon[x][w].no);
                    diveString += shuffle_icon;
                    if (possiblePokemon[x][w].hasIt) {
                        diveString += " " + poke_ball;
                    }
                    if (possiblePokemon[x][w].min === possiblePokemon[x][w].max) {
                        diveString += " **"  + possiblePokemon[x][w].name + "** Level " + possiblePokemon[x][w].min + " | Likelihood: " + possiblePokemon[x][w].rarity;
                    } else {
                        diveString += " **"  + possiblePokemon[x][w].name + "** Levels " + possiblePokemon[x][w].min + " - " + possiblePokemon[x][w].max + " | Likelihood: " + possiblePokemon[x][w].rarity;
                    }
                    if (possiblePokemon[x][w].method != null) {
                        diveString += " *" + possiblePokemon[x][w].method + "*";
                    }
                    diveString += "\n";
                    if (diveString.length >= 900) {
                        diveFields[f] = {
                            "name": 'Possible Pokémon',
                            "value": diveString
                        }
                        diveString = "";
                        f++;
                    }
                }
                if (f === 0) {
                    diveFields[f] = {
                        "name": 'Possible Pokémon',
                        "value": diveString
                    }
                } else if (diveString != "") {
                    diveFields[f] = {
                        "name": 'Possible Pokémon (cont.)',
                        "value": diveString
                    }
                }
                diveEmbed.fields = diveFields;
            }
        }
    }

    var embed;
    if (user.field === "Walking" && walkEmbed != null) {
        embed = walkEmbed;
    } else if (user.field === "Surfing" && surfEmbed != null) {
        embed = surfEmbed;
    } else if (user.field.includes("Rod") && fishEmbed != null) {
        embed = fishEmbed;
    } else if (user.field === "Rock Smash" && rockSmashEmbed != null) {
        embed = rockSmashEmbed;
    } else if (user.field === "Headbutt" && headbuttEmbed != null) {
        embed = headbuttEmbed;
    } else if (user.field === "Dive" && diveEmbed != null) {
        embed = diveEmbed;
    } else if (walkEmbed != null) {
        embed = walkEmbed;
    } else if (surfEmbed != null) {
        embed = surfEmbed;
    } else if (fishEmbed != null) {
        embed = fishEmbed;
    } else if (rockSmashEmbed != null) {
        embed = rockSmashEmbed;
    } else if (headbuttEmbed != null) {
        embed = headbuttEmbed;
    } else if (diveEmbed != null) {
        embed = diveEmbed;
    } else {
        embed = ":caa:";
    }
    
    var msg = await message.channel.send({ embed });
    
    var reacting = true;
    var didReact = false;
    while (reacting) {
        var r;
        for (r = 0; r < emojis.length; r++) {
            await msg.react(client.emojis.find(reactEmoji => reactEmoji.name === emojis[r]));
        }
        
        const filter = (reaction, user) => {
            return emojis.includes(reaction.emoji.name) && user.id === userID;
        };

        await msg.awaitReactions(filter, { max: 1, time: 20000, errors: ['time'] })
            .then(collected => {
                const reaction = collected.first();
                
                if (reaction.emoji.name === "TallGrass") {
                    embed = walkEmbed;
                    msg.edit({ embed });
                    didReact = true;
                    reaction.remove(userID);
                } else if (reaction.emoji.name === 'Surfing') {
                    embed = surfEmbed;
                    msg.edit({ embed });
                    didReact = true;
                    reaction.remove(userID);
                } else if (reaction.emoji.name === 'FishRod') {
                    embed = fishEmbed;
                    msg.edit({ embed });
                    didReact = true;
                    reaction.remove(userID);
                } else if (reaction.emoji.name === 'RockSmash') {
                    embed = rockSmashEmbed;
                    msg.edit({ embed });
                    didReact = true;
                    reaction.remove(userID);
                } else if (reaction.emoji.name === 'HeadbuttTree') {
                    embed = headbuttEmbed;
                    msg.edit({ embed });
                    didReact = true;
                    reaction.remove(userID);
                } else if (reaction.emoji.name === 'Dive') {
                    embed = diveEmbed;
                    msg.edit({ embed });
                    didReact = true;
                    reaction.remove(userID);
                }
            })
            .catch(() => {
                if (!didReact) {
                    reacting = false;
                    msg.clearReactions();
                } else {
                    didReact = false;
                }
            });
    }
    return true;
}

/**
 * Sends a message containing information about a Pokemon species.
 * This includes its Pokedex data, move learnsets, evolutions, and
 * where it can be encountered.
 * 
 * @bug Pokemon that are found in many different locations, such as Magikarp,
 * will break Discord's character limit for embedded messages.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} name The name of the Pokemon species.
 * @param {string} form The form of the Pokemon species.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function getDexInfo(message, name, form) {
    if(name.match(/^-{0,1}\d+$/)){
        name = parseInt(name, 10);
        name = getNameByNumber(name);
        if (name == null) {
            return null;
        }
    }
    var path = "../data/pokedex.json";
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    
    var pkmn = JSON.parse(data);
    var i;
    for (i = 0; i < pkmn.pokemon.length; i++) {
        if (name === pkmn.pokemon[i].toLowerCase()) {
            name = pkmn.pokemon[i];
            break;
        }
    }
    
    path = generatePokemonJSONPath(name);
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        return null;
    }
    
    pkmn = JSON.parse(data);
    
    var imageName = await getGifName(pkmn.names.en);
    
    var userID = message.author.id;
    
    var modelLink = generateModelLink(pkmn.names.en, false, "Male", "None");
    if (modelLink === null) {
        return new Promise(function(resolve) {
            resolve(null);
        });
    }

    var spriteLink = generateSpriteLink(pkmn.names.en, "Male", "None");
    if (spriteLink === null) {
        return new Promise(function(resolve) {
            resolve(null);
        });
    }

    var type_icon = await client.emojis.find(type_icon => type_icon.name === pkmn.types[0]);
    var types = type_icon + " " + pkmn.types[0];
    if (pkmn.types.length > 1) {
        type_icon = await client.emojis.find(type_icon => type_icon.name === pkmn.types[1]);
        types += ("\n" + type_icon + " " + pkmn.types[1]);
    }
    
    var desc;
    if (pkmn.national_id === 808 || pkmn.national_id === 809) {
        desc = pkmn.pokedex_entries[ 'Let\'s Go Pikachu' ].en;
    } else if (pkmn.national_id <= 721) {
        desc = pkmn.pokedex_entries[ 'Alpha Sapphire' ].en;
    } else {
        desc = pkmn.pokedex_entries[ 'Ultra Sun' ].en;
    }
    
    
    
    const infoEmbed = {
       "author": {
            "name": pkmn.names.en,
            "icon_url": spriteLink,
        },
        "title": pkmn.categories.en,
        "description": desc,
        "color": getTypeColor(pkmn.types[0]),
        "thumbnail": {
             "url": "attachment://" + imageName + ".gif"
        },
        "fields": [
            {
                "name": "National Dex",
                "value": pkmn.national_id,
                "inline": true
            },
            {
                "name": "Type",
                "value": types,
                "inline": true
            },
            {
                "name": "Height",
                "value": pkmn.height_us +  "\n" + pkmn.height_eu,
                "inline": true
            },
            {
                "name": "Weight",
                "value": pkmn.weight_us +  "\n" + pkmn.weight_eu,
                "inline": true
            }
        ]
    };
    
    var movesByLevelString = pkmn.names.en + " does not learn any moves by leveling up.";
    var movesByLevelStringCont = null;
    var movesByLevel = getPokemonMoves(pkmn, form, "level");
    if (movesByLevel.length > 0) {
        if (movesByLevel[0].hasOwnProperty("variations")) {
            movesByLevelString = "[" + movesByLevel[0].level + "] " + movesByLevel[0].move + " (" + movesByLevel[0].variations[0] + ")\n";
        } else {
            movesByLevelString = "[" + movesByLevel[0].level + "] " + movesByLevel[0].move + "\n";
        }
        var l;
        for (l = 1; l < movesByLevel.length; l++) {
            if (movesByLevelString.length > 1000) {
                if (movesByLevel[l].hasOwnProperty("variations")) {
                    if (movesByLevelStringCont == null) {
                        movesByLevelStringCont = "[" + movesByLevel[l].level + "] " + movesByLevel[l].move + " (" + movesByLevel[l].variations[0] + ")\n";
                    } else {
                        movesByLevelStringCont += "[" + movesByLevel[l].level + "] " + movesByLevel[l].move + " (" + movesByLevel[l].variations[0] + ")\n";
                    }
                } else {
                    if (movesByLevelStringCont == null) {
                        movesByLevelStringCont = "[" + movesByLevel[l].level + "] " + movesByLevel[l].move + "\n";
                    } else {
                        movesByLevelStringCont += "[" + movesByLevel[l].level + "] " + movesByLevel[l].move + "\n";
                    }
                }
            } else if (movesByLevel[l].hasOwnProperty("variations")) {
                movesByLevelString += "[" + movesByLevel[l].level + "] " + movesByLevel[l].move + " (" + movesByLevel[l].variations[0] + ")\n";
            } else {
                movesByLevelString += "[" + movesByLevel[l].level + "] " + movesByLevel[l].move + "\n";
            }
        }
    }
    
    var attackEmbedFields = [
            {
                "name": "Level Up",
                "value": movesByLevelString,
                "inline": false
            }
        ];
    
    if (movesByLevelStringCont != null) {
        attackEmbedFields[attackEmbedFields.length] = {
            "name": "Level Up (cont.)",
            "value": movesByLevelStringCont,
            "inline": false
        }
    }
    
    const attackEmbed = {
       "author": {
            "name": pkmn.names.en,
            "icon_url": spriteLink,
        },
        "title": "Moveset (Leveling Up)",
        "color": getTypeColor(pkmn.types[0]),
        "thumbnail": {
             "url": "attachment://" + imageName + ".gif"
        },
        "fields": attackEmbedFields
    };
    
    var movesByTMString = [pkmn.names.en + " does not learn any moves by TM."];
    var movesByTM = getPokemonMoves(pkmn, form, "tm");
    var k = 0;
    if (movesByTM.length > 0) {
        if (movesByTM[0].hasOwnProperty("variations")) {
            movesByTMString[k] = "[" + movesByTM[0].tm + "] " + movesByTM[0].move + " (" + movesByTM[0].variations[0] + ")\n";
        } else {
            movesByTMString[k] = "[" + movesByTM[0].tm + "] " + movesByTM[0].move + "\n";
        }
        var l;
        for (l = 1; l < movesByTM.length; l++) {
            if (movesByTMString[k].length > 1000) {
                k++;
                movesByTMString[k] = null;
                if (movesByTM[l].hasOwnProperty("variations")) {
                    if (movesByTMString[k] == null) {
                        movesByTMString[k] = "[" + movesByTM[l].tm + "] " + movesByTM[l].move + " (" + movesByTM[l].variations[0] + ")\n";
                    } else {
                        movesByTMString[k] += "[" + movesByTM[l].tm + "] " + movesByTM[l].move + " (" + movesByTM[l].variations[0] + ")\n";
                    }
                } else {
                    if (movesByTMString[k] == null) {
                        movesByTMString[k] = "[" + movesByTM[l].level + "] " + movesByTM[l].move + "\n";
                    } else {
                        movesByTMString[k] += "[" + movesByTM[l].level + "] " + movesByTM[l].move + "\n";
                    }
                }
            } else if (movesByTM[l].hasOwnProperty("variations")) {
                movesByTMString[k] += "[" + movesByTM[l].tm + "] " + movesByTM[l].move + " (" + movesByTM[l].variations[0] + ")\n";
            } else {
                movesByTMString[k] += "[" + movesByTM[l].tm + "] " + movesByTM[l].move + "\n";
            }
        }
    }
    
    var attackTMEmbedFields = [];
    var j;
    for (j = 0; j < movesByTMString.length; j++) {
        let tmName = "TM Moves";
        if (j > 0) {
            tmName = "TM Moves (cont.)";
        }
        attackTMEmbedFields[attackTMEmbedFields.length] = {
            "name": tmName,
            "value": movesByTMString[j],
            "inline": false
        }
    }
    
    const attackTMEmbed = {
       "author": {
            "name": pkmn.names.en,
            "icon_url": spriteLink,
        },
        "title": "Moveset (TM)",
        "color": getTypeColor(pkmn.types[0]),
        "thumbnail": {
             "url": "attachment://" + imageName + ".gif"
        },
        "fields": attackTMEmbedFields
    };
    
    var movesByEggString = [pkmn.names.en + " does not learn any moves by breeding."];
    var movesByEgg = getPokemonMoves(pkmn, form, "egg_move");
    var k = 0;
    if (movesByEgg.length > 0) {
        if (movesByEgg[0].hasOwnProperty("variations")) {
            movesByEggString[k] = movesByEgg[0].move + " (" + movesByEgg[0].variations[0] + ")\n";
        } else {
            movesByEggString[k] = movesByEgg[0].move + "\n";
        }
        var l;
        for (l = 1; l < movesByEgg.length; l++) {
            if (movesByEggString[k].length > 1000) {
                k++;
                movesByEggString[k] = null;
                if (movesByEgg[l].hasOwnProperty("variations")) {
                    if (movesByEggString[k] == null) {
                        movesByEggString[k] = movesByEgg[l].move + " (" + movesByEgg[l].variations[0] + ")\n";
                    } else {
                        movesByEggString[k] += movesByEgg[l].move + " (" + movesByEgg[l].variations[0] + ")\n";
                    }
                } else {
                    if (movesByEggString[k] == null) {
                        movesByEggString[k] = movesByEgg[l].move + "\n";
                    } else {
                        movesByEggString[k] += movesByEgg[l].move + "\n";
                    }
                }
            } else if (movesByEgg[l].hasOwnProperty("variations")) {
                movesByEggString[k] += movesByEgg[l].move + " (" + movesByEgg[l].variations[0] + ")\n";
            } else {
                movesByEggString[k] += movesByEgg[l].move + "\n";
            }
        }
    }
    
    var attackEggEmbedFields = [];
    var j;
    for (j = 0; j < movesByEggString.length; j++) {
        let eggName = "Egg Moves";
        if (j > 0) {
            eggName = "Egg Moves (cont.)";
        }
        attackEggEmbedFields[attackEggEmbedFields.length] = {
            "name": eggName,
            "value": movesByEggString[j],
            "inline": false
        }
    }
    
    const attackEggEmbed = {
       "author": {
            "name": pkmn.names.en,
            "icon_url": spriteLink,
        },
        "title": "Moveset (Breeding)",
        "color": getTypeColor(pkmn.types[0]),
        "thumbnail": {
             "url": "attachment://" + imageName + ".gif"
        },
        "fields": attackEggEmbedFields
    };
    
    var evolvesFrom = getEvolvesFrom(pkmn);
    var evolvesTo = getEvolvesTo(pkmn, null);
    var evoFromString;
    var evoToString;
    var dexNum;
    var shuffle_icon;
    if (evolvesFrom == null) {
        evoFromString = pkmn.names.en + " does not evolve from any Pokémon.";
    } else {
        var pth = generatePokemonJSONPath(evolvesFrom[0].name);
        var dat;
        try {
            dat = fs.readFileSync(pth, "utf8");
        } catch (err) {
            return null;
        }

        pkm = JSON.parse(dat);
        shuffle_icon = await getShuffleEmoji(pkm.national_id);
        evoFromString = shuffle_icon + " Evolves from " + evolvesFrom[0].name + " " + evolvesFrom[0].method;
        if (evolvesFrom.length > 1) {
            var f;
            for (f = 1; f < evolvesFrom.length; f++) {
                var pth = generatePokemonJSONPath(evolvesFrom[f].name);
                var dat;
                try {
                    dat = fs.readFileSync(pth, "utf8");
                } catch (err) {
                    return null;
                }

                pkm = JSON.parse(dat);
                shuffle_icon = await getShuffleEmoji(pkm.national_id);
                evoFromString += "\n" + shuffle_icon + " Evolves from " + evolvesFrom[f].name + " " + evolvesFrom[f].method;
            }
        }
    }
    if (evolvesTo == null) {
        evoToString = pkmn.names.en + " does not evolve into any Pokémon.";
    } else {
        var pth = generatePokemonJSONPath(evolvesTo[0].name);
        var dat;
        try {
            dat = fs.readFileSync(pth, "utf8");
        } catch (err) {
            return null;
        }

        pkm = JSON.parse(dat);
        shuffle_icon = await getShuffleEmoji(pkm.national_id);
        evoToString = shuffle_icon + "Evolves into " + evolvesTo[0].name + " " + evolvesTo[0].method;
        if (evolvesTo.length > 1) {
            var f;
            for (f = 1; f < evolvesTo.length; f++) {
                var pth = generatePokemonJSONPath(evolvesTo[f].name);
                var dat;
                try {
                    dat = fs.readFileSync(pth, "utf8");
                } catch (err) {
                    return null;
                }

                pkm = JSON.parse(dat);
                dexNum = pkm.national_id.toString();
                while (dexNum.length < 3) {
                    dexNum = '0' + dexNum;
                }
                shuffle_icon = await getShuffleEmoji(pkm.national_id);
                evoToString += "\n" + shuffle_icon + "Evolves into " + evolvesTo[f].name + " " + evolvesTo[f].method;
            }
        }
    }
    
    const evoEmbed = {
       "author": {
            "name": pkmn.names.en,
            "icon_url": spriteLink,
        },
        "title": "Evolution",
        "color": getTypeColor(pkmn.types[0]),
        "thumbnail": {
             "url": "attachment://" + imageName + ".gif"
        },
        "fields": [
            {
                "name": "Evolves From",
                "value": evoFromString,
                "inline": false
            },
            {
                "name": "Evolves To",
                "value": evoToString,
                "inline": false
            }
        ]
    };
    
    let user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    var rarityIndex;
    var cur = convertToTimeZone(user);
    var hour = moment(cur).hour();

    let regions = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola"];
    let locations = await findPokemon(name);
    let findFields = [];
    let fieldCount = -1;
    for (k = 0; k < locations.length; k++) {
        fieldCount++;
        findFields[fieldCount] = {
            "name": regions[k],
            "value": "",
            "inline": false
        }
        rarityIndex = 0;
        if (regions[k] === "Kanto" || regions[k] === "Johto" || regions[k] === "Sinnoh") {
            if (hour >= 10 && hour < 20) {
                rarityIndex = 1;
            } else if (hour >= 20 || hour < 4) {
                rarityIndex = 2;
            }
        } else if (regions[k] === "Unova") {
            rarityIndex = moment().month() % 4;
        } else if (regions[k] === "Alola") {
            if (hour < 6 || hour >= 18) {
                rarityIndex = 1;
            }
        }
        if (locations[k].length > 0) {
            for (j = 0; j < locations[k].length; j++) {
                if (findFields[fieldCount].value.length >= 900) {
                    fieldCount++;
                    findFields[fieldCount] = {
                        "name": regions[k] + " (cont.)",
                        "value": "",
                        "inline": false
                    }
                }
                findFields[fieldCount].value += locations[k][j].loc + ", Levels " + locations[k][j].min_level + " - " + locations[k][j].max_level + ", Likelihood " + locations[k][j].rarity[rarityIndex] + " (" + locations[k][j].field + ")";
                if (locations[k][j].hasOwnProperty("swarm")) {
                    findFields[fieldCount].value += " [Swarm]";
                }
                if (locations[k][j].hasOwnProperty("dexNav")) {
                    findFields[fieldCount].value += " [Poké Radar]";
                }
                findFields[fieldCount].value += "\n";
            }
        } else {
            findFields[fieldCount].value = "This Pokémon cannot be found in this region."
        }
    }

    const findEmbed = {
        "author": {
             "name": pkmn.names.en,
             "icon_url": spriteLink,
         },
         "title": "Where to Find",
         "color": getTypeColor(pkmn.types[0]),
         "thumbnail": {
              "url": "attachment://" + imageName + ".gif"
         },
         "fields": findFields
     };

    var embed = infoEmbed;
    
    var msg = await message.channel.send({ embed, files: [{ attachment: modelLink, name: (imageName + '.gif') }] });
    
    var reacting = true;
    var didReact = false;
    while (reacting) {
        await msg.react('ℹ').then(() => msg.react('⚔'));
        await msg.react('💽').then(() => msg.react('🥚'));
        await msg.react('☣').then(() => msg.react('🔍'));
        
        const filter = (reaction, user) => {
            return ['ℹ', '⚔', '💽', '🥚', '☣', '🔍'].includes(reaction.emoji.name) && user.id === userID;
        };
        
        await msg.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
            .then(collected => {
                const reaction = collected.first();

                if (reaction.emoji.name === 'ℹ') {
                    reaction.remove(userID);
                    embed = infoEmbed;
                    msg.edit({ embed, files: [{ attachment: modelLink, name: (imageName + '.gif') }] });
                    didReact = true;
                } else if (reaction.emoji.name === '⚔') {
                    reaction.remove(userID);
                    embed = attackEmbed;
                    msg.edit({ embed, files: [{ attachment: modelLink, name: (imageName + '.gif') }] });
                    didReact = true;
                } else if (reaction.emoji.name === '💽') {
                    reaction.remove(userID);
                    embed = attackTMEmbed;
                    msg.edit({ embed, files: [{ attachment: modelLink, name: (imageName + '.gif') }] });
                    didReact = true;
                } else if (reaction.emoji.name === '🥚') {
                    reaction.remove(userID);
                    embed = attackEggEmbed;
                    msg.edit({ embed, files: [{ attachment: modelLink, name: (imageName + '.gif') }] });
                    didReact = true;
                } else if (reaction.emoji.name === '☣') {
                    reaction.remove(userID);
                    embed = evoEmbed;
                    msg.edit({ embed, files: [{ attachment: modelLink, name: (imageName + '.gif') }] });
                    didReact = true;
                } else if (reaction.emoji.name === '🔍') {
                    reaction.remove(userID);
                    embed = findEmbed;
                    msg.edit({ embed, files: [{ attachment: modelLink, name: (imageName + '.gif') }] });
                    didReact = true;
                }

            })
            .catch(collected => {
                if (!didReact) {
                    reacting = false;
                    msg.clearReactions();
                } else {
                    didReact = false;
                }
            });
    }

    return true;
}

/**
 * Sends a message containing detailed information about a Pokemon move.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} moveName The name of the move.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function printMoveInfo(message, moveName) {
    moveName = moveName.toLowerCase();
    if (moveName === "10000000 volt thunderbolt" || moveName === "10,000,000 volt thunderbolt") {
        moveName = "10 000 000 volt thunderbolt";
    }
    
    moveName = moveName.replace(/-/g,"_");
    moveName = moveName.replace(/'/g,"_");
    moveName = moveName.replace(/ /g,"_");
    
    var moveImageLink = "../gfx/moves/" + moveName + ".png";
    
    var path = "../data/move/" + moveName + ".json";
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        return false;
    }
    
    var move = JSON.parse(data);
    
    var cat = "https://cdn.bulbagarden.net/upload/e/e4/PhysicalIC.gif";
    if (move.category === "special") {
        cat = "https://cdn.bulbagarden.net/upload/8/86/SpecialIC.gif";
    } else if (move.category === "status") {
        cat = "https://cdn.bulbagarden.net/upload/d/d3/StatusIC.gif";
    }
    
    var acc = move.accuracy;
    if (acc === 0) {
        acc = "---"
    }
    
    var pow = move.power;
    if (pow === 0) {
        pow = "---"
    }
    
    var pp = move.pp;
    if (pp === 0) {
        pp = "---"
    }
    
    await message.channel.send({
        "embed": {
            "author": {
                "name": move.names.en,
                "icon_url": cat,
            },
            "image": {
                "url": ("attachment://" + moveName + ".png")
            },
            "color": getTypeColor(move.type),
            "fields": [
                {
                    "name": "Type",
                    "value": move.type,
                    "inline": false
                },
                {
                    "name": "PP",
                    "value": pp,
                    "inline": true
                },
                {
                    "name": "Power",
                    "value": pow,
                    "inline": true
                },
                {
                    "name": "Accuracy",
                    "value": acc,
                    "inline": true
                },
                {
                    "name": "Description",
                    "value": move.pokedex_entries[ 'Ultra Sun' ].en,
                    "inline": false
                }
            ]
        }, files: [{ attachment: moveImageLink, name: (moveName + ".png") }]
    });
    
    return true;
}

/**
 * Gets data from a JSON file in JSON format.
 * 
 * @param {string} path Path of the JSON file.
 * 
 * @returns {JSON} The data from the file in JSON format,
 * or null if data could not be parsed.
 */
function parseJSON(path) {
    let stringData, parsedData = null;
    
    try {
        stringData = fs.readFileSync(path, "utf8");
        parsedData = JSON.parse(stringData);
    } catch (err) {
        console.log(chalk`{yellow [WARNING]} Could not parse JSON file: ` + path);
    }

    return parsedData;
}

/**
 * Gets an ability's name and description.
 * 
 * @param {string} abilityName The name of the ability.
 * 
 * @returns {string[]} The name and description of the ability,
 * or null list if ability doesn't exist.
 */
function getAbilityInfo(abilityName) {
    let abilityData = [null, null];
    if (abilityName != undefined) {
        abilityName = abilityName.toLowerCase();
        let path = "../data/ability/" + abilityName.replace(/ /g,"_") + ".json";
        let ability = parseJSON(path);
        if (ability != null) {
            abilityData = [ability.names.en, ability.descriptions.en]
        }
    }
    
    return abilityData;
}

/**
 * Sends a message containing detailed information about a Pokemon ability.
 * Will alert user if 
 * 
 * @param {TextChannel} channel The Discord channel to send the message to.
 * @param {string} name The name of the ability.
 * @param {string} description
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function printAbilityInfo(channel, name, description) {
    let didMessageGetSent = false;
    if (name === null || description === null) {
        didMessageGetSent = await sendMessage(channel, "Ability not found!");
    } else {
        let embed = {
            "embed": {
                "author": {
                    "name": name
                },
                "description": description
            }
        }
        didMessageGetSent = await sendMessage(channel, embed);
    }
    
    return new Promise(function(resolve) {
        resolve(didMessageGetSent);
    });
}

/**
 * Sends a message listing all Pokemon owned by a user.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} otherUser An optional overwrite to print Pokemon for a different user.
 * This is used when trading Pokemon.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function printPokemon(message, otherUser) {
    var userID = message.author.id;
    
    if (otherUser != null) {
        userID = otherUser.id;
        username = otherUser.username;
    }

    var pokemon = await getPokemon(userID);
    if (pokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var i;

    function compare(a,b) {
        if (a.name < b.name) {
            return -1;
        }
        if (a.name > b.name) {
            return 1;
        }
        return 0;
    }

    pokemon.sort(compare);
    
    let fields = [];
    let fieldCount = 0;
    let fieldString = null;

    for (i = 0; i < pokemon.length; i++) {
        let shuffle_icon = await getShuffleEmoji(pokemon[i].number);
        let form = pokemon[i].form;
        if (form == null) {
            form = "";
        } else {
            form = " [" + form + " Form]";
        }
        if (fieldString == null) {
            if (pokemon[i].nickname == null) {
                fieldString = shuffle_icon + " **" + pokemon[i].name + form + "** Level " + pokemon[i].level_current + ", " + pokemon[i].ability + "\n";
            } else {
                fieldString = shuffle_icon + " **" + pokemon[i].nickname + form + "** Level " + pokemon[i].level_current + ", " + pokemon[i].ability + "\n";
            }
        } else if (i % 15 === 0) {
            fields[fieldCount] = {
                "name": '\u200b',
                "value": fieldString,
                "inline": false
            }
            fieldCount++;
            if (pokemon[i].nickname == null) {
                fieldString = shuffle_icon + " **" + pokemon[i].name + form + "** Level " + pokemon[i].level_current + ", " + pokemon[i].ability + "\n";
            } else {
                fieldString = shuffle_icon + " **" + pokemon[i].nickname + form + "** Level " + pokemon[i].level_current + ", " + pokemon[i].ability + "\n";
            }
        } else {
            if (pokemon[i].nickname == null) {
                fieldString += shuffle_icon + " **" + pokemon[i].name + form + "** Level " + pokemon[i].level_current + ", " + pokemon[i].ability + "\n";
            } else {
                fieldString += shuffle_icon + " **" + pokemon[i].nickname + form + "** Level " + pokemon[i].level_current + ", " + pokemon[i].ability + "\n";
            }
        }
    }

    if (fieldString != null) {
        fields[fieldCount] = {
            "name": '\u200b',
            "value": fieldString,
            "inline": false
        }
    }

    fieldCount = 0;
    let embed = {
        "author": {
            "name": message.author.username + "'s Pokémon"
        },
        "fields": [fields[fieldCount]]
    };

    var msg = await message.channel.send({embed});
    if (pokemon.length > 15) {
        var reacting = true;
        var didReact = false;
        while (reacting) {
            await msg.react('◀').then(() => msg.react('▶'));

            const filter = (reaction, user) => {
                return ['◀', '▶'].includes(reaction.emoji.name) && user.id === userID;
            };

            await msg.awaitReactions(filter, { max: 1, time: 20000, errors: ['time'] })
                .then(collected => {
                    const reaction = collected.first();

                    if (reaction.emoji.name === '◀') {
                        reaction.remove(userID);
                        if (fieldCount === 0) {
                            fieldCount = 0;
                        } else {
                            fieldCount--;
                        }
                        embed = {
                            "author": {
                                "name": message.author.username + "'s Pokémon"
                            },
                            "fields": [fields[fieldCount]]
                        };
                        msg.edit({embed});
                        didReact = true;
                    } else if (reaction.emoji.name === '▶') {
                        reaction.remove(userID);
                        if (fieldCount >= (fields.length - 1)) {
                            fieldCount = fields.length - 1;
                        } else {
                            fieldCount++;
                        }
                        embed = {
                            "author": {
                                "name": message.author.username + "'s Pokémon"
                            },
                            "fields": [fields[fieldCount]]
                        };
                        msg.edit({embed});
                        didReact = true;
                    }
                
                })
                .catch(collected => {
                    if (!didReact) {
                        reacting = false;
                        msg.clearReactions();
                    } else {
                        didReact = false;
                    }
                });
        }
    }
    return true;
}

/**
 * Sends a message containing a user's Pokedex progress.
 * 
 * @todo Unlike the games, Pokedex progress is only added when the user owns the species,
 * not by just seeing it. Might want to add seen Pokemon as well but keep them
 * differentiated from owned.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function printDex(message) {
    let userID = message.author.id;
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    let pokedex = user.pokedex;
    var i;
    
    let fields = [];
    let fieldCount = 0;
    let fieldString = null;

    for (i = 1; i < 802; i++) {
        let shuffle_icon;
        let name = "----------";
        let num = i.toString();
        while (num.length < 3) {
            num = '0' + num;
        }
        if (pokedex.charAt(i) === '1') {
            shuffle_icon = await getShuffleEmoji(i);
            name = getNameByNumber(i);
        } else {
            shuffle_icon = await getShuffleEmoji("missing");
        }
        if (fieldString == null) {
            fieldString = shuffle_icon + " **#" + num + "** " + name + "\n";
        } else if ((i - 1) % 20 === 0) {
            fields[fieldCount] = {
                "name": '\u200b',
                "value": fieldString,
                "inline": true
            }
            fieldCount++;
            fieldString = shuffle_icon + " **#" + num + "** " + name + "\n";
        } else {
            fieldString += shuffle_icon + " **#" + num + "** " + name + "\n";
        }
    }

    if (fieldString != null) {
        fields[fieldCount] = {
            "name": '\u200b',
            "value": fieldString,
            "inline": true
        }
    }

    fieldCount = 0;
    let embed = {
        "author": {
            "name": message.author.username + "'s Pokédex"
        },
        "fields": [fields[fieldCount * 2], fields[(fieldCount * 2) + 1]]
    };

    var msg = await message.channel.send({embed});
    var reacting = true;
    var didReact = false;
    while (reacting) {
        await msg.react('◀').then(() => msg.react('▶'));

        const filter = (reaction, user) => {
            return ['◀', '▶'].includes(reaction.emoji.name) && user.id === userID;
        };

        await msg.awaitReactions(filter, { max: 1, time: 20000, errors: ['time'] })
            .then(collected => {
                const reaction = collected.first();

                if (reaction.emoji.name === '◀') {
                    reaction.remove(userID);
                    if (fieldCount === 0) {
                        fieldCount = 0;
                    } else {
                        fieldCount--;
                    }
                    embed = {
                        "author": {
                            "name": message.author.username + "'s Pokédex"
                        },
                        "fields": [fields[fieldCount * 2], fields[(fieldCount * 2) + 1]]
                    };
                    msg.edit({embed});
                    didReact = true;
                } else if (reaction.emoji.name === '▶') {
                    reaction.remove(userID);
                    if ((fieldCount * 2) >= (fields.length - 1)) {
                        fieldCount = Math.floor(fields.length / 2);
                    } else {
                        fieldCount++;
                    }
                    embed = {
                        "author": {
                            "name": message.author.username + "'s Pokédex"
                        },
                        "fields": [fields[fieldCount * 2], fields[(fieldCount * 2) + 1]]
                    };
                    msg.edit({embed});
                    didReact = true;
                }
            
            })
            .catch(collected => {
                if (!didReact) {
                    reacting = false;
                    msg.clearReactions();
                } else {
                    didReact = false;
                }
            });
    }
    return true;
}

/**
 * Gets a Pokemon species's name from its national Pokedex number.
 * 
 * @param {number} number The Pokemon's national Pokedex number.
 * 
 * @returns {string} The name of the Pokemon species.
 */
function getNameByNumber(number) {
    let pkmn = oak.findPokemon(number);
    if (pkmn != null) {
        return pkmn.names.en;
    } else {
        return null;
    }
}

/**
 * Sends a message listing all items owned by a user.
 * 
 * @todo Convert this into an embedded message and separate by reaction tabs for each item category.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function printBag(message) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var bag = await getBag(message.author.id);
    if (bag === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    if (bag.length < 1) {
        message.channel.send("```" + message.author.username + "'s Bag:\nMoney: ₽" + user.money.toString() + "\n\nNo items.```");
        return true;
    }

    var items = [];
    var balls = [];
    var tms = [];
    var keys = [];

    var i;
    for (i = 0; i < bag.length; i++) {
        if (bag[i].category === "Item") {
            items[items.length] = bag[i];
        } else if (bag[i].category === "Ball") {
            balls[balls.length] = bag[i];
        } else if (bag[i].category === "TM") {
            tms[tms.length] = bag[i];
        } else if (bag[i].category === "Key") {
            keys[keys.length] = bag[i];
        }
    }
    
    function compare(a,b) {
        if (a.name < b.name) {
            return -1;
        }
        if (a.name > b.name) {
            return 1;
        }
        return 0;
    }

    if (items.length > 1) {
        items.sort(compare);
    }
    if (balls.length > 1) {
        balls.sort(compare);
    }
    if (tms.length > 1) {
        tms.sort(compare);
    }
    if (keys.length > 1) {
        keys.sort(compare);
    }

    var groupSorted = items.concat(balls, tms, keys);

    var string = "```" + message.author.username + "'s Bag:\nMoney: ₽" + user.money.toString() + "\n\n";
    for (i = 0; i < groupSorted.length; i++) {
        string += groupSorted[i].name + " x" + groupSorted[i].quantity + "\n";
    }
    string += "```";
    
    message.channel.send(string);
    return true;
}

/**
 * Prompts a user to buy items from the Poke Mart.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function buyItems(message) {
    var user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    var bag = await getBag(message.author.id);
    if (bag === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    if (user.money <= 0) {
        message.channel.send(message.author.username + " has no money!");
        return true;
    }
    
    var locs;
    
    if (user.region === "Kanto") {
        locs = ["Viridian City", "Pewter City", "Cerulean City", "Celadon City", "Vermilion City", "Lavendar Town", "Saffron City", "Fuchsia City", "Cinnabar Island", "Indigo Plateau", "Three Island", "Four Island", "Seven Island", "Trainer Tower"];
        if (locs.indexOf(user.location) < 0) {
            message.channel.send(message.author.username + " there is no Poké Mart at " + user.location + ". Try moving to a town or city to find a Poké Mart.");
            return false;
        }
    } else if (user.region === "Johto") {
        locs = ["Cherrygrove City", "Violet City", "Azalea Town", "Goldenrod City", "Ecruteak City", "Olivine City", "Blackthorn City", "Frontier Access"];
        if (locs.indexOf(user.location) < 0) {
            message.channel.send(message.author.username + " there is no Poké Mart at " + user.location + ". Try moving to a town or city to find a Poké Mart.");
            return false;
        }
    } else if (user.region === "Hoenn") {
        locs = ["Oldale Town", "Petalburg City", "Rustboro City", "Slateport City", "Mauville City", "Verdanturf Town", "Fallarbor Town", "Lavaridge", "Fortree City", "Lilycove City", "Mossdeep City", "Sootopolis City", "Pokémon League"];
        if (locs.indexOf(user.location) < 0) {
            message.channel.send(message.author.username + " there is no Poké Mart at " + user.location + ". Try moving to a town or city to find a Poké Mart.");
            return false;
        }
    } else if (user.region === "Sinnoh") {
        locs = ["Sandgem Town", "Jubilife City", "Oreburgh City", "Floaroma Town", "Eterna City", "Hearthome City", "Veilstone City", "Solaceon Town", "Pastoria City", "Canalave City", "Snowpoint City", "Sunyshore City", "Pokémon League", "Fight Area", "Survival Area"];
        if (locs.indexOf(user.location) < 0) {
            message.channel.send(message.author.username + " there is no Poké Mart at " + user.location + ". Try moving to a town or city to find a Poké Mart.");
            return false;
        }
    } else if (user.region === "Unova") {
        locs = ["Accumula Town", "Striaton City", "Nacrene City", "Castelia City", "Nimbasa City", "Driftveil City", "Mistralton City", "Icirrus City", "Route 9", "Opelucid City", "Pokémon League", "Lacunosa Town", "Undella Town", "Black City", "White Forest", "Aspertia City", "Floccesy Town", "Virbank City", "Lentimas Town", "Humilau City", "Victory Road"];
        if (locs.indexOf(user.location) < 0) {
            message.channel.send(message.author.username + " there is no Poké Mart at " + user.location + ". Try moving to a town or city to find a Poké Mart.");
            return false;
        }
    } else if (user.region === "Kalos") {
        locs = ["Santalune City", "Lumiose City", "Camphrier Town", "Ambrette Town", "Cyllage City", "Geosenge Town", "Shalour City", "Coumarine City", "Laverre City", "Dendemille Town", "Anistar City", "Couriway Town", "Snowbelle City", "Pokémon League", "Kiloude City"];
        if (locs.indexOf(user.location) < 0) {
            message.channel.send(message.author.username + " there is no Poké Mart at " + user.location + ". Try moving to a town or city to find a Poké Mart.");
            return false;
        }
    } else if (user.region === "Alola") {
        locs = ["Route 1", "Hau'oli City", "Route 2", "Heahea City", "Paniola Town", "Route 5", "Royal Avenue", "Route 8", "Konikoni City", "Malie City", "Mount Hokulani", "Tapu Village", "Route 16", "Seafolk Village", "Mount Lanakila"];
        if (locs.indexOf(user.location) < 0) {
            message.channel.send(message.author.username + " there is no Poké Mart at " + user.location + ". Try moving to a town or city to find a Poké Mart.");
            return false;
        }
    } else {
        return false;
    }
    
    message.channel.send(message.author.username + " which type of item would you like to buy?\n```1. Hold Items\n2. Evolutionary Items\n3. Balls\n4. Medicine\n5. TMs 1-50\n6. TMs 51-100\n7. Key Items``` Type the item type or number as shown in the list to view the items of that type, or \"Cancel\" to exit the Poké Mart.");
    
    var cat;
    var cancel = false;
    var input = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
        .then(collected => {
            input = collected.first().content.toString().toLowerCase();
        })
        .catch(collected => {
            input = "cancel";
            cancel = true;
        });

        if (input === "cancel") {
            cancel = true;
            input = -1;
        } else if (input === "1" || input === "hold items") {
            cancel = true;
            cat = "hold";
            input = 1;
        } else if (input === "2" || input === "evolutionary items") {
            cancel = true;
            cat = "evo";
            input = 2;
        } else if (input === "3" || input === "balls") {
            cancel = true;
            cat = "ball";
            input = 3;
        } else if (input === "4" || input === "medicine") {
            cancel = true;
            cat = "med";
            input = 4;
        } else if (input === "5" || input === "tms 1-50") {
            cancel = true;
            cat = "tm";
            input = 5;
        } else if (input === "6" || input === "tms 51-100") {
            cancel = true;
            cat = "tm";
            input = 6;
        } else if (input === "7" || input === "key items") {
            cancel = true;
            cat = "key";
            input = 7;
        } else if (input != null) {
            message.channel.send(message.author.username + ", your response was not recognized. Which type of item would you like to buy?\n```1. Hold Items\n2. Evolutionary Items\n3. Balls\n4. Medicine\n5. TMs 1-50\n6. TMs 51-100\n7. Key Items``` Type the item type or number as shown in the list to view the items of that type, or \"Cancel\" to exit the Poké Mart.");
            input = -1;
        } else {
            input = -1;
        }
    }
    
    if (input === -1) {
        message.channel.send(message.author.username + " left the Poké Mart.");
        return false;
    } else if (input === 1) {
        path = '../data/items/items.json';
    } else if (input === 2) {
        path = '../data/items/evolution.json';
    } else if (input === 3) {
        path = '../data/items/balls.json';
    } else if (input === 4) {
        path = '../data/items/medicine.json';
    } else if (input === 5) {
        path = '../data/items/TMs1.json';
    } else if (input === 6) {
        path = '../data/items/TMs2.json';
    } else if (input === 7) {
        path = '../data/items/keys.json';
    } else {
        return false;
    }
    
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.log(err);
        return false;
    }
    
    var items = JSON.parse(data);
    items = items.items;
    
    var string = message.author.username + " which item would you like to buy?```";
    var x;
    for (x = 0; x < items.length; x++) {
        string += ((x + 1).toString() + ". " + items[x].name + " ₽" + items[x].price + "\n");
    }
    string += "``` Enter the name of the item or its number as shown in the list to select an item to buy, or type \"Cancel\" to exit the Poké Mart.";
    
    message.channel.send(string);
    cancel = false;
    input = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
        .then(collected => {
            input = collected.first().content.toString().toLowerCase();
        })
        .catch(collected => {
            input = "cancel";
            cancel = true;
        });
        
        if (input === "cancel") {
            cancel = true;
            input = -1;
        } else if (/^\d+$/.test(input)) {
            var num = Number(input);
            if (num > 0 && num <= items.length) {
                if (cat === "key" || cat === "tm") {
                    var doesUserHaveIt = bag.map(function(t) { return t.name; }).indexOf(items[num - 1].name);
                    if (doesUserHaveIt < 0) {
                        if (user.money >= (items[num - 1].price)) {
                            cancel = true;
                            input = (num - 1);
                        } else {
                            message.channel.send(message.author.username + " you cannot afford that! Please enter the name of the item or its number as shown in the list to select an item to buy, or type \"Cancel\" to exit the Poké Mart.");
                            input = null;
                        }
                    } else {
                       message.channel.send(message.author.username + " you cannot have more than one of that item. Enter the name of the item or its number as shown in the list to select an item to buy, or type \"Cancel\" to exit the Poké Mart."); 
                    }
                } else {
                    cancel = true;
                    input = (num - 1);
                }
            } else {
                message.channel.send("Number is out of range. Enter the name of the item or its number as shown in the list to select an item to buy, or type \"Cancel\" to exit the Poké Mart.");
                input = null;
            }
        } else if (input != null) {
            var itemMatch = false;
            var matchIndex;
            for (x = 0; x < items.length; x++) {
                if (input.toLowerCase() === items[x].name.toLowerCase()) {
                    itemMatch = true;
                    matchIndex = x;
                    x = items.length;
                    if (cat === "key" || cat === "tm") {
                        var doesUserHaveIt = bag.map(function(t) { return t.name; }).indexOf(items[matchIndex].name);
                        if (doesUserHaveIt < 0) {
                            if (user.money >= (items[matchIndex].price)) {
                                cancel = true;
                                input = matchIndex;
                            } else {
                                message.channel.send(message.author.username + " you cannot afford that! Please enter the name of the item or its number as shown in the list to select an item to buy, or type \"Cancel\" to exit the Poké Mart.");
                                input = null;
                            }
                        } else {
                           message.channel.send(message.author.username + " you cannot have more than one of that item. Enter the name of the item or its number as shown in the list to select an item to buy, or type \"Cancel\" to exit the Poké Mart."); 
                        }
                    } else {
                        cancel = true;
                        input = matchIndex;
                    }
                }
            }
            if (!itemMatch) {
                message.channel.send("Item not found. Enter the name of the item or its number as shown in the list to select an item to buy, or type \"Cancel\" to exit the Poké Mart.");
                input = -1;
            }
        } else {
            input = -1;
        }
    }
    
    if (input < 0) {
        message.channel.send(message.author.username + " left the Poké Mart.");
        return false;
    }
    
    if (cat === "tm" || cat === "key") {
        if (cat === "key") {
            cat = "Key";
            user.money -= items[input].price;
            var query = "UPDATE user SET user.money = ? WHERE user.user_id = ?";
            con.query(query, [user.money, message.author.id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            await addItemToBag(user.user_id, items[input].name, 1, false, cat);
        } else if (cat === "tm") {
            cat = "TM";
            user.money -= (items[input].price * num);
            var query = "UPDATE user SET user.money = ? WHERE user.user_id = ?";
            con.query(query, [user.money, message.author.id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            await addItemToBag(user.user_id, items[input].name, 1, false, cat);
        }
        message.channel.send(message.author.username + " bought one " + items[input].name + "!");
        return true;
    }
    
    message.channel.send(message.author.username + " please enter the amount that you want to buy, or type \"Cancel\" to exit the Poké Mart.");
    
    var itemIndex = input;
    
    cancel = false;
    input = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
        .then(collected => {
            input = collected.first().content.toString().toLowerCase();
        })
        .catch(collected => {
            input = "cancel";
            cancel = true;
        });
        
        if (input == null) {
            input = -1;
        } else if (input === "cancel") {
            cancel = true;
            input = -1;
        } else if (/^\d+$/.test(input)) {
            var num = Number(input);
            if (num > 0 && num <= 99) {
                if (user.money >= (items[itemIndex].price * num)) {
                    if (num === 1) {
                        message.channel.send(message.author.username + " bought one " + items[itemIndex].name + "!");
                    } else {
                        message.channel.send(message.author.username + " bought " + num.toString() + " " + items[itemIndex].name + "s!");
                    }
                    if (cat === "ball") {
                        cat = "Ball";
                        user.money -= (items[itemIndex].price * num);
                        var query = "UPDATE user SET user.money = ? WHERE user.user_id = ?";
                        con.query(query, [user.money, message.author.id], function (err) {
                            if (err) {
                                return reject(err);
                            }
                        });
                        await addItemToBag(user.user_id, items[itemIndex].name, num, true, cat);
                        
                        if (num >= 10) {
                            await addItemToBag(user.user_id, "Premier Ball", 1, true, cat);
                            message.channel.send(message.author.username + " received a Premier Ball as a bonus!");
                        }
                    } else {
                        cat = "Item";
                        user.money -= (items[itemIndex].price * num);
                        var query = "UPDATE user SET user.money = ? WHERE user.user_id = ?";
                        con.query(query, [user.money, message.author.id], function (err) {
                            if (err) {
                                return reject(err);
                            }
                        });
                        await addItemToBag(user.user_id, items[itemIndex].name, num, true, cat);
                    }
                    cancel = true;
                    input = 1;
                } else {
                    message.channel.send(message.author.username + " you cannot afford that! Please enter the amount that you want to buy, or type \"Cancel\" to exit the Poké Mart.");
                }
            } else {
                message.channel.send("Input was out of range. Please enter a number less than 100 and greater than 0, or type \"Cancel\" to exit the Poké Mart.");
                input = null;
            }
        } else if ((/^\d+$/.test(input)) === false) {
            message.channel.send("Input was not a number. Please enter a number less than 100 and greater than 0, or type \"Cancel\" to exit the Poké Mart.");
            input = null;
        }
    }
    
    if (input === 1) {
        return true;
    } else {
        message.channel.send(message.author.username + " left the Poké Mart.");
        return false;
    }
}

/**
 * Gets all locations from all regions where a Pokemon can be found.
 * 
 * @param {string} name The name of the Pokemon species.
 * 
 * @returns {string[][]} A list of all locations where the Pokemon can be found, for each region.
 */
async function findPokemon(name) {
    let regions = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola"];
    let foundInfo = [[],[],[],[],[],[],[]];
    let i;
    for (i = 0; i < regions.length; i++) {
        foundInfo[i] = await findPokmonFromRegion(name, regions[i]);
    }
    return new Promise(function(resolve) {
        resolve(foundInfo);
    });
}

/**
 * Gets all locations for a specific region where a Pokemon can be found.
 * 
 * @param {string} name The name of the Pokemon species.
 * @param {string} moveName The name of the region.
 * 
 * @returns {string[]} A list of all locations for the specific region where the Pokemon can be found.
 */
async function findPokmonFromRegion(name, region) {
    let returnArray = [];
    let dirname = "../data/region/" + region + "/";
    let filenames = await getLocationFiles(dirname);
    let i;
    for (i = 0; i < filenames.length; i++) {
        let content = await readFromLocationFile(dirname + filenames[i]);
        content.pokemon.forEach(function(pkmn) {
            if (pkmn.name.toLowerCase() === name.toLowerCase()) {
                returnArray[returnArray.length] = pkmn;
                returnArray[returnArray.length - 1].loc = filenames[i].substring(0, filenames[i].length - 5);
            }
        })
    }
    return new Promise(function(resolve) {
        resolve(returnArray);
    });
}

/**
 * Gets all data from a location's JSON file.
 * 
 * @param {string} path Path to the JSON file.
 * 
 * @returns {JSON} The JSON data for the location.
 */
async function readFromLocationFile(path) {
    var data;
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }

    var loc = JSON.parse(data);
    return new Promise(function(resolve) {
        resolve(loc);
    });
}

/**
 * Gets all location JSON files from a directory.
 * 
 * @param {string} dirname File path to the directory containing the JSON files.
 * 
 * @returns {string[]} List of all file names found within the directory.
 */
async function getLocationFiles(dirname) {
    var files;
    try {
        files = fs.readdirSync(dirname, "utf8");
    } catch (err) {
        console.log(err);
        return null;
    }
    return new Promise(function(resolve) {
        resolve(files);
    });
}

/**
 * Gets a Pokemon's characteristic.
 * 
 * @param {Pokemon} pokemon The Pokemon to get the characteristic for.
 * 
 * @returns {string} The Pokemon's characteristic.
 */
function getCharacteristic(pokemon) {
    var one = [0, 5, 10, 15, 20, 25, 30];
    var two = [1, 6, 11, 16, 21, 26, 31];
    var three = [2, 7, 12, 17, 22, 27];
    var four = [3, 8, 13, 18, 23, 28];
    var IVs = [pokemon.iv_hp, pokemon.iv_atk, pokemon.iv_def, pokemon.iv_spatk, pokemon.iv_spdef, pokemon.iv_spd];
    var highest = IVs[0];
    var highestIVs = [0];
    var i;
    for (i = 1; i < IVs.length; i++) {
        if (IVs[i] > highest) {
            highest = IVs[i];
            highestIVs = [i];
        } else if (IVs[i] === highest) {
            highestIVs[highestIVs.length] = [i];
        }
    }
    var ind = highestIVs[0];
    if (highestIVs.length > 1) {
        ind = pokemon.personality % 6;
        while (highestIVs.indexOf(ind) < 0) {
            ind++;
            if (ind === 6) {
                ind = 0;
            }
        }
    }
    
    if (ind === 0) {
        if (one.indexOf(IVs[ind]) >= 0) {
            return "Loves to eat";
        } else if (two.indexOf(IVs[ind]) >= 0) {
            return "Takes plenty of siestas";
        } else if (three.indexOf(IVs[ind]) >= 0) {
            return "Nods off a lot";
        } else if (four.indexOf(IVs[ind]) >= 0) {
            return "Scatters things often";
        } else {
            return "Likes to relax";
        }
    } else if (ind === 1) {
        if (one.indexOf(IVs[i]) >= 0) {
            return "Proud of its power";
        } else if (two.indexOf(IVs[ind]) >= 0) {
            return "Likes to thrash about";
        } else if (three.indexOf(IVs[ind]) >= 0) {
            return "A little quick tempered";
        } else if (four.indexOf(IVs[ind]) >= 0) {
            return "Likes to fight";
        } else {
            return "Quick tempered";
        }
    } else if (ind === 2) {
        if (one.indexOf(IVs[ind]) >= 0) {
            return "Sturdy body";
        } else if (two.indexOf(IVs[ind]) >= 0) {
            return "Capable of taking hits";
        } else if (three.indexOf(IVs[ind]) >= 0) {
            return "Highly persistent";
        } else if (four.indexOf(IVs[ind]) >= 0) {
            return "Good endurance";
        } else {
            return "Good perseverance";
        }
    } else if (ind === 3) {
        if (one.indexOf(IVs[ind]) >= 0) {
            return "Highly curious";
        } else if (two.indexOf(IVs[ind]) >= 0) {
            return "Mischievous";
        } else if (three.indexOf(IVs[ind]) >= 0) {
            return "Thoroughly cunning";
        } else if (four.indexOf(IVs[ind]) >= 0) {
            return "Often lost in thought";
        } else {
            return "Very finicky";
        }
    } else if (ind === 4) {
        if (one.indexOf(IVs[ind]) >= 0) {
            return "Strong willed";
        } else if (two.indexOf(IVs[ind]) >= 0) {
            return "Somewhat vain";
        } else if (three.indexOf(IVs[ind]) >= 0) {
            return "Strongly defiant";
        } else if (four.indexOf(IVs[ind]) >= 0) {
            return "Hates to lose";
        } else {
            return "Somewhat stubborn";
        }
    } else {
        if (one.indexOf(IVs[ind]) >= 0) {
            return "Likes to run";
        } else if (two.indexOf(IVs[ind]) >= 0) {
            return "Alert to sounds";
        } else if (three.indexOf(IVs[ind]) >= 0) {
            return "Impetuous and silly";
        } else if (four.indexOf(IVs[ind]) >= 0) {
            return "Somewhat of a clown";
        } else {
            return "Quick to flee";
        }
    }
}

/**
 * Determines which a form a wild Pokemon should be in based
 * on where the Pokemon is being encountered.
 * 
 * @param {User} user The Pokebot user who is encountering the Pokemon.
 * @param {string} name The name of the Pokemon species.
 * @param {string} region The region where the Pokemon is being encountered.
 * @param {string} location The location where the Pokemon is being encountered.
 * 
 * @returns {string} The form the Pokemon should be in when encountered.
 */
function getForm(user, name, region, location) {
    if (name === "Shaymin") {
        return "Land";
    } else if (name === "Burmy" || name === "Wormadam") {
        return "Plant Cloak";
    } else if (name === "Flabébé" || name === "Floette" || name === "Florges") {
        var random = Math.floor(Math.random() * 100);
        if (random <= 20) {
            return "Red";
        } else if (random <= 40) {
            return "Orange";
        } else if (random <= 60) {
            return "Yellow";
        } else if (random <= 80) {
            return "Blue";
        } else {
            return "White";
        }
    } else if (name === "Shellos" || name === "Gastrodon") {
        if (region === "Sinnoh") {
            if (location === "Route 205" || location === "Route 218" || location === "Route 221" || location === "Fuego Ironworks" || location === "Valley Windworks" || location === "Canalave City") {
                return "West Sea";
            } else {
                return "East Sea";
            }
        } else if (region === "Kalos") {
            return "West Sea";
        } else if (region === "Hoenn") {
            if (location === "Route 103") {
                return "West Sea";
            } else {
                return "East Sea";
            }
        } else if (region === "Alola") {
            return "East Sea";
        } else {
            return "West Sea";
        }    
    } else if (name === "Oricorio") {
        if (location === "Melemele Meadow") {
            return "Pom-Pom Style";
        } else if (location === "Route 6") {
            return "Pa'u Style";
        } else if (location === "Ula'ula Meadow") {
            return "Baile Style";
        } else {
            return "Sensu Style";
        }    
    } else if (name === "Unown") {
        var forms = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!?";
        return forms.charAt(Math.floor(Math.random() * forms.length));
    } else if (name === "Basculin") {
        if (Math.floor(Math.random() * 100) % 2 === 0) {
            return "Red-Striped";
        } else {
            return "Blue-Striped";
        }
    } else if (name === "Pumpkaboo" || name === "Gourgeist") {
        var num = Math.floor(Math.random() * 100);
        if (num < 10) {
            return "Super Size";
        } else if (num < 30) {
            return "Large Size";
        } else if (num < 60) {
            return "Average Size";
        } else {
            return "Small Size";
        }
    } else if (name === "Lycanroc") {
        var cur = convertToTimeZone(user);
        var n = moment(cur).format('H');
        if (n === 17) {
            return "Dusk";
        } else if (n > 17 || n < 6) {
            return "Midnight";
        } else {
            return "Midday";
        }
    } else if (name === "Rattata" && region === "Alola") {
        return "Alolan";
    } else if (name === "Raticate" && region === "Alola") {
        return "Alolan";
    } else if (name === "Raichu" && region === "Alola") {
        return "Alolan";
    } else if (name === "Sandshrew" && region === "Alola") {
        return "Alolan";
    } else if (name === "Sandslash" && region === "Alola") {
        return "Alolan";
    } else if (name === "Vulpix" && region === "Alola") {
        return "Alolan";
    } else if (name === "Ninetales" && region === "Alola") {
        return "Alolan";
    } else if (name === "Diglett" && region === "Alola") {
        return "Alolan";
    } else if (name === "Dugtrio" && region === "Alola") {
        return "Alolan";
    } else if (name === "Meowth" && region === "Alola") {
        return "Alolan";
    } else if (name === "Persian" && region === "Alola") {
        return "Alolan";
    } else if (name === "Geodude" && region === "Alola") {
        return "Alolan";
    } else if (name === "Graveler" && region === "Alola") {
        return "Alolan";
    } else if (name === "Golem" && region === "Alola") {
        return "Alolan";
    } else if (name === "Grimer" && region === "Alola") {
        return "Alolan";
    } else if (name === "Muk" && region === "Alola") {
        return "Alolan";
    } else if (name === "Exeggutor" && region === "Alola") {
        return "Alolan";
    } else if (name === "Marowak" && region === "Alola") {
        return "Alolan";
    } else {
        return null;
    }
}

/**
 * Checks if a Pokemon learns a move upon evolving.
 * 
 * @todo This returns a string `"None"` if the Pokemon doesn't
 * have an evolution move but should probably return `null`.
 * 
 * @param {string} to The name of the evolved Pokemon species.
 * @param {string} form The form of the evolved Pokemon.
 * 
 * @returns {string} The name of the move that is learned when evolving.
 */
function checkForNewMoveUponEvo(to, form) {
    if (to === "Venusaur") {
        return ["Petal Dance"];
    }
    if (to === "Charizard") {
        return ["Wing Attack"];
    }
    if (to === "Metapod") {
        return ["Harden"];
    }
    if (to === "Butterfree") {
        return ["Gust"];
    }
    if (to === "Kakuna") {
        return ["Harden"];
    }
    if (to === "Beedrill") {
        return ["Twineedle"];
    }
    if (to === "Raticate") {
        return ["Scary Face"];
    }
    if (to === "Arbok") {
        return ["Crunch"];
    }
    if (to === "Raichu") {
        if (form === "Alolan") {
            return ["Psychic"];
        } else {
            return ["None"];
        }
    }
    if (to === "Sandslash") {
        if (form === "Alolan") {
            return ["Icicle Spear"];
        } else {
            return ["None"];
        }
    }
    if (to === "Ninetails") {
        if (form === "Alolan") {
            return ["Dazzling Gleam"];
        } else {
            return ["None"];
        }
    }
    if (to === "Venomoth") {
        return ["Gust"];
    }
    if (to === "Dugtrio") {
        return ["Sand Tomb"];
    }
    if (to === "Persian") {
        return ["Swift"];
    }
    if (to === "Primeape") {
        return ["Rage"];
    }
    if (to === "Poliwrath") {
        return ["Submission"];
    }
    if (to === "Kadabra") {
        return ["Kinesis"];
    }
    if (to === "Alakazam") {
        return ["Kinesis"];
    }
    if (to === "Machamp") {
        return ["Strength"];
    }
    if (to === "Victreebel") {
        return ["Leaf Tornado"];
    }
    if (to === "Rapidash") {
        return ["Fury Attack"];
    }
    if (to === "Slowbro") {
        return ["Withdraw"];
    }
    if (to === "Magneton") {
        return ["Tri Attack"];
    }
    if (to === "Dodrio") {
        return ["Tri Attack"];
    }
    if (to === "Dewgong") {
        return ["Sheer Cold"];
    }
    if (to === "Muk") {
        return ["Venom Drench"];
    }
    if (to === "Haunter") {
        return ["Shadow Punch"];
    }
    if (to === "Gengar") {
        return ["Shadow Punch"];
    }
    if (to === "Exeggutor") {
        if (form === "Alolan") {
            return ["Dragon Hammer"];
        } else {
            return ["Stomp"];
        }
    }
    if (to === "Hitmonlee") {
        return ["Double Kick"];
    }
    if (to === "Hitmonchan") {
        return ["Comet Punch"];
    }
    if (to === "Weezing") {
        return ["Double Hit"];
    }
    if (to === "Rhydon") {
        return ["Hammer Arm"];
    }
    if (to === "Gyarados") {
        return ["Bite"];
    }
    if (to === "Vaporeon") {
        return ["Water Gun"];
    }
    if (to === "Jolteon") {
        return ["Thunder Shock"];
    }
    if (to === "Flareon") {
        return ["Ember"];
    }
    if (to === "Omastar") {
        return ["Spike Cannon"];
    }
    if (to === "Kabutops") {
        return ["Slash"];
    }
    if (to === "Dragonite") {
        return ["Wing Attack"];
    }
    if (to === "Meganium") {
        return ["Petal Dance"];
    }
    if (to === "Furret") {
        return ["Agility"];
    }
    if (to === "Ariados") {
        return ["Swords Dance"];
    }
    if (to === "Crobat") {
        return ["Cross Poison"];
    }
    if (to === "Lanturn") {
        return ["Stockpile", "Swallow", "Spit Up"];
    }
    if (to === "Xatu") {
        return ["Air Slash"];
    }
    if (to === "Ampharos") {
        return ["Thunder Punch"];
    }
    if (to === "Bellossom") {
        return ["Magical Leaf"];
    }
    if (to === "Sudowoodo") {
        return ["Slam"];
    }
    if (to === "Espeon") {
        return ["Confusion"];
    }
    if (to === "Umbreon") {
        return ["Pursuit"];
    }
    if (to === "Forretress") {
        return ["Mirror Shot", "Autonomize"];
    }
    if (to === "Magcargo") {
        return ["Shell Smash"];
    }
    if (to === "Piloswine") {
        return ["Fury Attack"];
    }
    if (to === "Octillery") {
        return ["Octazooka"];
    }
    if (to === "Donphan") {
        return ["Fury Attack"];
    }
    if (to === "Hitmontop") {
        return ["Rolling Kick"];
    }
    if (to === "Grovyle") {
        return ["Fury Cutter"];
    }
    if (to === "Sceptile") {
        return ["Dual Chop"];
    }
    if (to === "Combusken") {
        return ["Double Kick"];
    }
    if (to === "Blaziken") {
        return ["Blaze Kick"];
    }
    if (to === "Marshtomp") {
        return ["Mud Shot"];
    }
    if (to === "Mightyena") {
        return ["Snarl"];
    }
    if (to === "Silcoon") {
        return ["Harden"];
    }
    if (to === "Beautifly") {
        return ["Gust"];
    }
    if (to === "Cascoon") {
        return ["Harden"];
    }
    if (to === "Dustox") {
        return ["Gust"];
    }
    if (to === "Lombre") {
        return ["Razor Leaf"];
    }
    if (to === "Pelipper") {
        return ["Protect"];
    }
    if (to === "Breloom") {
        return ["Mach Punch"];
    }
    if (to === "Slaking") {
        return ["Swagger"];
    }
    if (to === "Ninjask") {
        return ["Double Team", "Screech", "Fury Cutter"];
    }
    if (to === "Loudred") {
        return ["Bite"];
    }
    if (to === "Exploud") {
        return ["Crunch"];
    }
    if (to === "Swalot") {
        return ["Body Slam"];
    }
    if (to === "Sharpedo") {
        return ["Slash"];
    }
    if (to === "Camerupt") {
        return ["Rock Slide"];
    }
    if (to === "Grumpig") {
        return ["Teeter Dance"];
    }
    if (to === "Vibrava") {
        return ["Dragon Breath"];
    }
    if (to === "Flygon") {
        return ["Dragon Claw"];
    }
    if (to === "Cacturne") {
        return ["Spiky Shield"];
    }
    if (to === "Altaria") {
        return ["Dragon Breath"];
    }
    if (to === "Whiscash") {
        return ["Thrash"];
    }
    if (to === "Crawdaunt") {
        return ["Swift"];
    }
    if (to === "Claydol") {
        return ["Hyper Beam"];
    }
    if (to === "Milotic") {
        return ["Water Pulse"];
    }
    if (to === "Dusclops") {
        return ["Shadow Punch"];
    }
    if (to === "Glalie") {
        return ["Freeze-Dry"];
    }
    if (to === "Sealeo") {
        return ["Swagger"];
    }
    if (to === "Walrein") {
        return ["Ice Fang"];
    }
    if (to === "Shelgon") {
        return ["Protect"];
    }
    if (to === "Salamence") {
        return ["Fly"];
    }
    if (to === "Metang") {
        return ["Confusion", "Metal Claw"];
    }
    if (to === "Metagross") {
        return ["Hammer Arm"];
    }
    if (to === "Torterra") {
        return ["Earthquake"];
    }
    if (to === "Monferno") {
        return ["Mach Punch"];
    }
    if (to === "Infernape") {
        return ["Close Combat"];
    }
    if (to === "Prinplup") {
        return ["Metal Claw"];
    }
    if (to === "Empoleon") {
        return ["Aqua Jet"];
    }
    if (to === "Staraptor") {
        return ["Close Combat"];
    }
    if (to === "Bibarel") {
        return ["Water Gun"];
    }
    if (to === "Kricketune") {
        return ["Fury Cutter"];
    }
    if (to === "Rampardos") {
        return ["Endeavor"];
    }
    if (to === "Bastiodon") {
        return ["Block"];
    }
    if (to === "Wormadam") {
        return ["Quiver Dance"];
    }
    if (to === "Mothim") {
        return ["Quiver Dance"];
    }
    if (to === "Vespiquen") {
        return ["Slash"];
    }
    if (to === "Cherrim") {
        return ["Petal Dance"];
    }
    if (to === "Lopunny") {
        return ["Return"];
    }
    if (to === "Purugly") {
        return ["Swagger"];
    }
    if (to === "Skuntank") {
        return ["Flamethrower"];
    }
    if (to === "Bronzong") {
        return ["Block"];
    }
    if (to === "Gabite") {
        return ["Dual Chop"];
    }
    if (to === "Garchomp") {
        return ["Crunch"];
    }
    if (to === "Lucario") {
        return ["Aura Sphere"];
    }
    if (to === "Garchomp") {
        return ["Crunch"];
    }
    if (to === "Lucario") {
        return ["Aura Sphere"];
    }
    if (to === "Magnezone") {
        return ["Tri Attack"];
    }
    if (to === "Leafeon") {
        return ["Razor Leaf"];
    }
    if (to === "Glaceon") {
        return ["Icy Wind"];
    }
    if (to === "Gallade") {
        return ["Slash"];
    }
    if (to === "Froslass") {
        return ["Ominous Wind"];
    }
    if (to === "Pignite") {
        return ["Arm Thrust"];
    }
    if (to === "Samurott") {
        return ["Slash"];
    }
    if (to === "Watchog") {
        return ["Confuse Ray"];
    }
    if (to === "Gigalith") {
        return ["Power Gem"];
    }
    if (to === "Excadrill") {
        return ["Horn Drill"];
    }
    if (to === "Seismitoad") {
        return ["Acid"];
    }
    if (to === "Swadloon") {
        return ["Protect"];
    }
    if (to === "Leavanny") {
        return ["Slash"];
    }
    if (to === "Whirlipede") {
        return ["Iron Defense"];
    }
    if (to === "Scolipede") {
        return ["Baton Pass"];
    }
    if (to === "Darmanitan") {
        return ["Hammer Arm"];
    }
    if (to === "Cofagrigus") {
        return ["Scary Face"];
    }
    if (to === "Zoroark") {
        return ["Night Slash"];
    }
    if (to === "Reuniclus") {
        return ["Dizzy Punch"];
    }
    if (to === "Sawsbuck") {
        return ["Horn Leech"];
    }
    if (to === "Galvantula") {
        return ["Sticky Web"];
    }
    if (to === "Ferrothorn") {
        return ["Power Whip"];
    }
    if (to === "Klinklang") {
        return ["Magnetic Flux"];
    }
    if (to === "Eelektross") {
        return ["Crunch"];
    }
    if (to === "Beartic") {
        return ["Icicle Crash"];
    }
    if (to === "Golurk") {
        return ["Heavy Slam"];
    }
    if (to === "Braviary") {
        return ["Superpower"];
    }
    if (to === "Mandibuzz") {
        return ["Bone Rush"];
    }
    if (to === "Volcarona") {
        return ["Quiver Dance"];
    }
    if (to === "Quilladin") {
        return ["Needle Arm"];
    }
    if (to === "Chesnaught") {
        return ["Spiky Shield"];
    }
    if (to === "Delphox") {
        return ["Mystical Fire"];
    }
    if (to === "Greninja") {
        return ["Water Shuriken"];
    }
    if (to === "Fletchinder") {
        return ["Ember"];
    }
    if (to === "Spewpa") {
        return ["Protect"];
    }
    if (to === "Vivillon") {
        return ["Gust"];
    }
    if (to === "Gogoat") {
        return ["Aerial Ace"];
    }
    if (to === "Pangoro") {
        return ["Bullet Punch"];
    }
    if (to === "Dragalge") {
        return ["Twister"];
    }
    if (to === "Clawitzer") {
        return ["Aura Sphere"];
    }
    if (to === "Tyrantrum") {
        return ["Rock Slide"];
    }
    if (to === "Aurorus") {
        return ["Freeze-Dry"];
    }
    if (to === "Sylveon") {
        return ["Fairy Wind"];
    }
    if (to === "Goodra") {
        return ["Aqua Tail"];
    }
    if (to === "Trevenant") {
        return ["Shadow Claw"];
    }
    if (to === "Avalugg") {
        return ["Body Slam"];
    }
    if (to === "Decidueye") {
        return ["Spirit Shackle"];
    }
    if (to === "Incineroar") {
        return ["Darkest Lariat"];
    }
    if (to === "Primarina") {
        return ["Sparkling Aria"];
    }
    if (to === "Toucannon") {
        return ["Beak Blast"];
    }
    if (to === "Charjabug") {
        return ["Charge"];
    }
    if (to === "Vikavolt") {
        return ["Thunderbolt"];
    }
    if (to === "Crabominable") {
        return ["Ice Punch"];
    }
    if (to === "Ribombee") {
        return ["Pollen Puff"];
    }
    if (to === "Lycanroc") {
        if (form === "Midday") {
            return ["Accelerock"];
        } else if (form === "Midnight") {
            return ["Counter"];
        } else {
            return ["Thrash"];
        }
    }
    if (to === "Toxapex") {
        return ["Baneful Bunker"];
    }
    if (to === "Lurantis") {
        return ["Petal Blizzard"];
    }
    if (to === "Salazzle") {
        return ["Captivate"];
    }
    if (to === "Bewear") {
        return ["Bind"];
    }
    if (to === "Steenee") {
        return ["Double Slap"];
    }
    if (to === "Tsareena") {
        return ["Trop Kick"];
    }
    if (to === "Golisopod") {
        return ["First Impression"];
    }
    if (to === "Silvally") {
        return ["Multi-Attack"];
    }
    if (to === "Hakamo-o") {
        return ["Sky Uppercut"];
    }
    if (to === "Kommo-o") {
        return ["Clanging Scales"];
    }
    if (to === "Cosmoem") {
        return ["Cosmic Power"];
    }
    if (to === "Solgaleo") {
        return ["Sunsteel Strike"];
    }
    if (to === "Lunala") {
        return ["Moongeist Beam"];
    }
    return ["None"];
}

/**
 * Gets a list of all moves that a Pokemon can learn, based on certain methods.
 * 
 * @param {JSON} pkmn The Pokemon species to get the moves for.
 * @param {string} form The form of the species to get the moves for.
 * @param {string} method The method of how the move is learned. Should only be
 * `"level"`, `"egg"`, and `"tm"`.
 * 
 * @returns {string[]} All moves learned by the Pokemon for the method.
 */
function getPokemonMoves(pkmn, form, method) {
    var i;
    var moves = [];
    for (i = 0; i < pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset.length; i++) {
        if (pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i].hasOwnProperty(method)) {
            moves[moves.length] = pkmn.move_learnsets[pkmn.move_learnsets.length - 1].learnset[i];
        }
    }
    
    return moves;
}

/**
 * Gets information about the pre-evolution of a Pokemon species.
 * 
 * @param {JSON} pkmn The Pokemon species to get the moves for.
 * 
 * @returns {any} A list of objects which each contain the name
 * of the pre-evolution and how the Pokemon evolves.
 */
function getEvolvesFrom(pkmn) {
    if (pkmn.hasOwnProperty("evolution_from") && pkmn.evolution_from != null) {
        var path = generatePokemonJSONPath(pkmn.evolution_from);
        var data;
        try {
            data = fs.readFileSync(path, "utf8");
        } catch (err) {
            console.log(err);
            return null;
        }
        var from = JSON.parse(data);
        var evoFrom = getEvolvesTo(from, pkmn.names.en);
        return evoFrom;
    } else {
        return null;
    }
}

/**
 * Gets information about all evolutions of a Pokemon species.
 * 
 * @param {JSON} pkmn The Pokemon species to get the moves for.
 * @param {string} specific The name of the specific evolved species
 * to get information for if the Pokemon has multiple evolutions.
 * 
 * @returns {any} A list of objects which each contain the name
 * of the pre-evolution and how the Pokemon evolves.
 */
function getEvolvesTo(pkmn, specific) {
    var specIndex = 0;
    var evolutions = [];
    if (pkmn.evolutions.length < 1) {
        return null;
    } //cosmoem will evolve based on time
    else if (pkmn.names.en === "Cosmoem") {
        var k = evolutions.length;
        evolutions[k] = {
            "name": "Lunala",
            "method": "at level 53 during the night."
        }
        if (specific === evolutions[k].name) {
            specIndex = k;
        }
        k++;
        evolutions[k] = {
            "name": "Solgaleo",
            "method": "at level 53 during the day."
        }
    }
    //mantyke requires user to own a remoraid
    else if (pkmn.names.en === "Mantyke") {
        var k = evolutions.length;
        evolutions[k] = {
            "name": "Mantine",
            "method": "by leveling up while owning a Remoraid."
        }
    }
    //pangoro requires user to have a dark type
    else if (pkmn.names.en === "Pancham") {
        var k = evolutions.length;
        evolutions[k] = {
            "name": "Pangoro",
            "method": "at level 32 while owning another Dark-type Pokémon."
        }
    }
    //inkay normally requires user to hold device upside down, but in this case only has level requirement
    else if (pkmn.names.en === "Inkay") {
        var k = evolutions.length;
        evolutions[k] = {
            "name": "Malamar",
            "method": "at level 30."
        }
    }
    //sliggoo requires it to be raining
    else if (pkmn.names.en === "Sliggoo") {
        var k = evolutions.length;
        evolutions[k] = {
            "name": "Goodra",
            "method": "at level 50 while in rain."
        }
    }
    //tyrogue evolves based on its highest stat
    else if (pkmn.names.en === "Tyrogue") {
        var k = evolutions.length;
        evolutions[k] = {
            "name": "Hitmonlee",
            "method": "at level 20 with Attack higher than Defense."
        }
        if (specific === evolutions[k].name) {
            specIndex = k;
        }
        k++;
        evolutions[k] = {
            "name": "Hitmonchan",
            "method": "at level 20 with Defense higher than Attack."
        }
        if (specific === evolutions[k].name) {
            specIndex = k;
        }

        k++;
        evolutions[k] = {
            "name": "Hitmontop",
            "method": "at level 20 with Attack and Defense equal."
        }
    }
    //wurmple normally evolves based on its personality value, but in this case it evolves based on its IV total
    else if (pkmn.names.en === "Wurmple") {
        var k = evolutions.length;
        evolutions[k] = {
            "name": "Silcoon",
            "method": "at level 7 with a certain personality."
        }
        if (specific === evolutions[k].name) {
            specIndex = k;
        }
        k++;
        evolutions[k] = {
            "name": "Cascoon",
            "method": "at level 7 with a certain personality."
        }
    } else {
        var i;
        for (i = 0; i < pkmn.evolutions.length; i++) {
                var i;
                for (i = 0; i < pkmn.evolutions.length; i++) {
                    //holding an item
                    if (pkmn.evolutions[i].hasOwnProperty('hold_item')) {
                        if (pkmn.names.en === "Shelmet") {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": "Accelgor",
                                "method": "by trading for a Karrablast."
                            }
                        } else if (pkmn.names.en === "Karrablast") {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": "Escavalier",
                                "method": "by trading for a Shelmet."
                            }
                        } else if (!pkmn.evolutions[i].hasOwnProperty('conditions')) {
                            if (pkmn.evolutions[i].hasOwnProperty('trade')) { //trade holding an item
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "by trading while holding a " + pkmn.evolutions[i].hold_item + "."
                                }
                            }
                        } else if (pkmn.evolutions[i].conditions[0] === "Nighttime") { //night holding an item
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": pkmn.evolutions[i].to,
                                "method": "by leveling up while holding a " + pkmn.evolutions[i].hold_item + " at night."
                            }
                        } else if (pkmn.evolutions[i].conditions[0] === "Daytime") { //day holding an item
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": pkmn.evolutions[i].to,
                                "method": "by leveling up while holding a " + pkmn.evolutions[i].hold_item + " during the day."
                            }
                        }
                    }
                    //know a specific move
                    else if (pkmn.evolutions[i].hasOwnProperty('move_learned')) {
                        var k = evolutions.length;
                        evolutions[k] = {
                            "name": pkmn.evolutions[i].to,
                            "method": "by leveling up while knowing or learning the move " + pkmn.evolutions[i].move_learned + "."
                        }
                    }
                    else if (pkmn.evolutions[i].hasOwnProperty('conditions') && !pkmn.evolutions[i].hasOwnProperty('happiness')  && !pkmn.evolutions[i].hasOwnProperty('item')) {
                        //specific to meltan and its Pokemon (Let's) GO candies
                        if (pkmn.evolutions[i].conditions[0] === "400 Meltan Candy") {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": pkmn.evolutions[i].to,
                                "method": "by feeding it 400 Meltan candies."
                            }
                        }
                        //specific to sylveon, only checks for Fairy moves that eevee can learn
                        else if (pkmn.evolutions[i].conditions[0] === "Fairy Type Move") {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": pkmn.evolutions[i].to,
                                "method": "by leveling up while knowing a Fairy-type move."
                            }
                        }
                        //level up in a magnetic field area
                        else if (pkmn.evolutions[i].conditions[0] === "In a Magnetic Field area") {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": pkmn.evolutions[i].to,
                                "method": "by leveling up in a magnetic field area."
                            }
                        }
                        //level up near a mossy rock
                        else if (pkmn.evolutions[i].conditions[0] === "Near a Mossy Rock") {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": pkmn.evolutions[i].to,
                                "method": "by leveling up near a mossy rock."
                            }
                        }
                        //level up near an icy rock
                        else if (pkmn.evolutions[i].conditions[0] === "Near an Icy Rock") {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": pkmn.evolutions[i].to,
                                "method": "by leveling up near an icy rock."
                            }
                        }
                        //level up at mount lanakila (aka Crabrawler -> Crabominable)
                        else if (pkmn.evolutions[i].conditions[0] === "At Mount Lanakila") {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": pkmn.evolutions[i].to,
                                "method": "by leveling up at Mount Lanakila."
                            }
                        }
                    }
                    //friendship
                    else if (pkmn.evolutions[i].hasOwnProperty('happiness')) {
                        if(!pkmn.evolutions[i].hasOwnProperty('conditions')) {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": pkmn.evolutions[i].to,
                                "method": "by leveling up with high friendship."
                            }
                        } else if (pkmn.evolutions[i].hasOwnProperty('conditions')) {
                            if (pkmn.evolutions[i].conditions[0] === "Nighttime") { //night friendship
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "by leveling up with high friendship at night."
                                }
                            }
                            else if (pkmn.evolutions[i].conditions[0] === "Daytime") { //day friendship
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "by leveling up with high friendship during the day."
                                }
                            }
                            else if (pkmn.evolutions[i].conditions[0] === "Male") { //male only
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": "male " + pkmn.evolutions[i].to,
                                    "method": "by leveling up with high friendship (male)."
                                }
                            }
                            else if (pkmn.evolutions[i].conditions[0] === "Female") { //female only
                                var k = evolutions.length;
                                evolutions[k].name = "female " + pkmn.evolutions[i].to,
                                evolutions[k].method = "by leveling up with high friendship (female)."
                            }
                        }
                    }
                    //level
                    else if (pkmn.evolutions[i].hasOwnProperty('level') && !pkmn.evolutions[i].hasOwnProperty('item')) {
                        if (!pkmn.evolutions[i].hasOwnProperty('conditions')) {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": pkmn.evolutions[i].to,
                                "method": "at level " + pkmn.evolutions[i].level + "."
                            }
                            
                        } else if (pkmn.evolutions[i].hasOwnProperty('conditions')) {
                            if (pkmn.evolutions[i].conditions[0] === "Nighttime") { //night level up
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "at level " + pkmn.evolutions[i].level + " at night."
                                }
                            }
                            else if (pkmn.evolutions[i].conditions[0] === "Daytime") { //day level up
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "at level " + pkmn.evolutions[i].level + " during the day."
                                }
                            }
                            else if (pkmn.evolutions[i].conditions[0] === "Male") { //male only
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "at level " + pkmn.evolutions[i].level + " (male)."
                                }
                            }
                            else if (pkmn.evolutions[i].conditions[0] === "Female") { //female only
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "at level " + pkmn.evolutions[i].level + " (female)."
                                }
                            }
                        }
                    } else if (pkmn.evolutions[i].hasOwnProperty('item')) {
                        if (!pkmn.evolutions[i].hasOwnProperty('conditions')) {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": pkmn.evolutions[i].to,
                                "method": "by using a " + pkmn.evolutions[i].item + "."
                            }
                        } else if (pkmn.evolutions[i].hasOwnProperty('conditions')) {
                            if (pkmn.evolutions[i].conditions[0] === "Nighttime") { //night level up
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "by using a " + pkmn.evolutions[i].item + " at night."
                                }
                            }
                            else if (pkmn.evolutions[i].conditions[0] === "Daytime") { //day level up
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "by using a " + pkmn.evolutions[i].item + " during the day."
                                }
                            }
                            else if (pkmn.evolutions[i].conditions[0] === "Male") { //male only
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "by using a " + pkmn.evolutions[i].item + " (male)."
                                }
                            }
                            else if (pkmn.evolutions[i].conditions[0] === "Female") { //female only
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "by using a " + pkmn.evolutions[i].item + " (female)."
                                }
                            }
                        }
                    } else if (pkmn.evolutions[i].hasOwnProperty('trade')) {
                        if (!pkmn.evolutions[i].hasOwnProperty('conditions')) {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": pkmn.evolutions[i].to,
                                "method": "by trading."
                            }
                        } else if (pkmn.evolutions[i].hasOwnProperty('conditions')) {
                            if (pkmn.evolutions[i].conditions[0] === "Nighttime") { //night level up
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "by using a " + pkmn.evolutions[i].item + " at night."
                                }
                            }
                            else if (pkmn.evolutions[i].conditions[0] === "Daytime") { //day level up
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "by using a " + pkmn.evolutions[i].item + " during the day."
                                }
                            }
                            else if (pkmn.evolutions[i].conditions[0] === "Male") { //male only
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "by using a " + pkmn.evolutions[i].item + " (male)."
                                }
                            }
                            else if (pkmn.evolutions[i].conditions[0] === "Female") { //female only
                                var k = evolutions.length;
                                evolutions[k] = {
                                    "name": pkmn.evolutions[i].to,
                                    "method": "by using a " + pkmn.evolutions[i].item + "(female)."
                                }
                                
                            }
                        }
                    }
                }
            
            if (specific === evolutions[k].name) {
                specIndex = k;
            }
        }
    }
    if (specific != null) {
        evolutions[specIndex].name = pkmn.names.en;
        return [evolutions[specIndex]];
    } else {
        return evolutions;
    }
}

/**
 * Sends a message containing detailed information about
 * the weather for all regions.
 * 
 * @param {message} Message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors were encountered.
 */
async function getWeather(message) {
    var userID = message.author.id;
    var season = moment().month() % 4;
    if (season == 0) {
        season = "Spring";
    } else if (season == 1) {
        season = "Summer";
    } else if (season == 2) {
        season = "Autumn";
    } else {
        season = "Winter";
    }

    var seasonImgLink = "../gfx/icons/seasons/" + season + ".png";

    var authorString = "Weather Report for the " + moment().format('Do') + " of " + season;
    var rainEmbed = {
        "author": {
             "name": authorString,
         },
         "title": "Rain",
         "color": getTypeColor("Water"),
         "thumbnail": {
              "url": "attachment://" + season + ".png"
         }
     };
    var noWeatherString = "It is currently not raining anywhere in this region.";
    var fields = [
        {
            "name": "Kanto",
            "value": noWeatherString
        },
        {
            "name": "Johto",
            "value": noWeatherString
        },
        {
            "name": "Hoenn",
            "value": noWeatherString
        },
        {
            "name": "Sinnoh",
            "value": noWeatherString
        },
        {
            "name": "Unova",
            "value": noWeatherString
        },
        {
            "name": "Kalos",
            "value": noWeatherString
        },
        {
            "name": "Alola",
            "value": noWeatherString
        }
    ]
    var k;
    var regions = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola"];
    if (raining.length > 0) {
        for (k = 0; k < regions.length; k++) {
            var i;
            for (i = 0; i < raining.length; i++) {
                if (raining[i].region === regions[k]) {
                    if (fields[k].value === noWeatherString) {
                        fields[k].value = raining[i].location;
                    } else {
                        fields[k].value += "\n" + raining[i].location;
                    }
                }
            }
        }
    }
    rainEmbed.fields = fields;

    var snowEmbed = {
        "author": {
             "name": authorString,
         },
         "title": "Snow and Hail",
         "color": getTypeColor("Ice"),
         "thumbnail": {
              "url": "attachment://" + season + ".png"
         }
     };
    noWeatherString = "It is currently not snowing or hailing anywhere in this region.";
    fields = [
        {
            "name": "Kanto",
            "value": noWeatherString
        },
        {
            "name": "Johto",
            "value": noWeatherString
        },
        {
            "name": "Hoenn",
            "value": noWeatherString
        },
        {
            "name": "Sinnoh",
            "value": noWeatherString
        },
        {
            "name": "Unova",
            "value": noWeatherString
        },
        {
            "name": "Kalos",
            "value": noWeatherString
        },
        {
            "name": "Alola",
            "value": noWeatherString
        }
    ]

    for (k = 0; k < regions.length; k++) {
        var i;
        for (i = 0; i < snowing.length; i++) {
            if (snowing[i].region === regions[k]) {
                if (fields[k].value === noWeatherString) {
                    fields[k].value = snowing[i].location + " (Snow)";
                } else {
                    fields[k].value += "\n" + snowing[i].location  + " (Snow)";
                }
            }
        }

        for (i = 0; i < hailing.length; i++) {
            if (hailing[i].region === regions[k]) {
                if (fields[k].value === noWeatherString) {
                    fields[k].value = hailing[i].location + " (Hail)";
                } else {
                    fields[k].value += "\n" + hailing[i].location + " (Hail)";
                }
            }
        }
    }

    snowEmbed.fields = fields;

    var sandEmbed = {
        "author": {
             "name": authorString,
         },
         "title": "Sandstorms",
         "color": getTypeColor("Ground"),
         "thumbnail": {
              "url": "attachment://" + season + ".png"
         }
     };
    noWeatherString = "There are currently no sandstorms in this region.";
    fields = [
        {
            "name": "Kanto",
            "value": noWeatherString
        },
        {
            "name": "Johto",
            "value": noWeatherString
        },
        {
            "name": "Hoenn",
            "value": noWeatherString
        },
        {
            "name": "Sinnoh",
            "value": noWeatherString
        },
        {
            "name": "Unova",
            "value": noWeatherString
        },
        {
            "name": "Kalos",
            "value": noWeatherString
        },
        {
            "name": "Alola",
            "value": noWeatherString
        }
    ]

    for (k = 0; k < regions.length; k++) {
        var i;
        for (i = 0; i < sandstorm.length; i++) {
            if (sandstorm[i].region === regions[k]) {
                if (fields[k].value === noWeatherString) {
                    fields[k].value = sandstorm[i].location;
                } else {
                    fields[k].value += "\n" + sandstorm[i].location;
                }
            }
        }
    }

    sandEmbed.fields = fields;

    var embed = rainEmbed;
    
    var msg = await message.channel.send({ embed, files: [{ attachment: seasonImgLink, name: (season + '.png') }] });
    var reacting = true;
    var didReact = false;
    while (reacting) {
        await msg.react(client.emojis.find(weatherEmoji => weatherEmoji.name === "rain"));
        await msg.react(client.emojis.find(weatherEmoji => weatherEmoji.name === "hail"));
        await msg.react(client.emojis.find(weatherEmoji => weatherEmoji.name === "sandstorm"));
        
        const filter = (reaction, user) => {
            return ['rain', 'hail', 'sandstorm'].includes(reaction.emoji.name) && user.id === userID;
        };
        
        await msg.awaitReactions(filter, { max: 1, time: 20000, errors: ['time'] })
            .then(collected => {
                const reaction = collected.first();

                if (reaction.emoji.name === 'rain') {
                    reaction.remove(userID);
                    embed = rainEmbed;
                    msg.edit({ embed, files: [{ attachment: seasonImgLink, name: (season + '.png') }] });
                    didReact = true;
                } else if (reaction.emoji.name === 'hail') {
                    reaction.remove(userID);
                    embed = snowEmbed;
                    msg.edit({ embed, files: [{ attachment: seasonImgLink, name: (season + '.png') }] });
                    didReact = true;
                } else if (reaction.emoji.name === 'sandstorm') {
                    reaction.remove(userID);
                    embed = sandEmbed;
                    msg.edit({ embed, files: [{ attachment: seasonImgLink, name: (season + '.png') }] });
                    didReact = true;
                }

            })
            .catch(collected => {
                if (!didReact) {
                    reacting = false;
                    msg.clearReactions();
                } else {
                    didReact = false;
                }
            });
    }

    return true;
}

/**
 * Changes the weather for locations where weather
 * can occur, based on the day of the month.
 * 
 * @returns {any} True if no errors were encountered.
 */
function updateWeather() {
    var weekday = moment().weekday();
    var dayOfMonth = moment().date();
    var month = moment().month();
    var season = month % 4;
    var hour = moment().hour();

    //where it always rains
    raining = [
        {
            "region": "Hoenn",
            "location": "Route 120"
        },
        {
            "region": "Sinnoh",
            "location": "Route 212"
        },
        {
            "region": "Sinnoh",
            "location": "Route 215"
        },
        {
            "region": "Johto",
            "location": "Route 33"
        },
        {
            "region": "Alola",
            "location": "Route 17"
        },
        {
            "region": "Alola",
            "location": "Po Town"
        }
    ];

    //where it always hails
    hailing = [
        {
            "region": "Sinnoh",
            "location": "Route 216"
        },
        {
            "region": "Sinnoh",
            "location": "Route 217"
        },
        {
            "region": "Sinnoh",
            "location": "Acuity Lakefront"
        },
        {
            "region": "Sinnoh",
            "location": "Mt. Coronet"
        },
        {
            "region": "Johto",
            "location": "Mt. Silver"
        },
        {
            "region": "Kalos",
            "location": "Route 17 (Mamoswine Road)"
        }
    ];

    //where it always snows
    snowing = [
        {
            "region": "Sinnoh",
            "location": "Snowpoint City"
        }
    ];

    //where there is always a sandstorm
    sandstorm = [
        {
            "region": "Hoenn",
            "location": "Route 111"
        },
        {
            "region": "Sinnoh",
            "location": "Route 228"
        },
        {
            "region": "Unova",
            "location": "Route 4"
        },
        {
            "region": "Unova",
            "location": "Desert Resort"
        }
    ];
    
    //route 119 rains every three out of four days
    var route119rain = dayOfMonth % 4;
    if (route119rain != 0) {
        raining[raining.length] = {
            "region": "Hoenn",
            "location": "Route 119"
        }
    }

    //route 123 rains some days, in this case once every five days
    var route123rain = dayOfMonth % 5;
    if (route123rain == 0) {
        raining[raining.length] = {
            "region": "Hoenn",
            "location": "Route 123"
        }
    }

    //route 123 rains some days, in this case once every five days
    var route213rain = dayOfMonth % 5;
    if (route213rain == 3) {
        raining[raining.length] = {
            "region": "Sinnoh",
            "location": "Route 213"
        }
    }

    //lake of rage has rain every day except wednesday
    if(weekday != 3) {
        raining[raining.length] = {
            "region": "Johto",
            "location": "Lake of Rage"
        }
    } else {
        raining[raining.length] = {
            "region": "Kalos",
            "location": "Kiloude City"
        }
    }

    var days = [];

    //if it is spring or autumn
    if (season == 0 || season == 2) {
        days = [4,5,12,13,20,21,28,29];
        if (days.indexOf(dayOfMonth) >= 0) {
            raining[raining.length] = {
                "region": "Unova",
                "location": "Driftveil City"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Cold Storage"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Route 6"
            }
        }

        days = [3,4,5,6,11,12,13,14,19,20,21,22,27,28,29,30];
        if (days.indexOf(dayOfMonth) >= 0) {
            raining[raining.length] = {
                "region": "Unova",
                "location": "Mistralton City"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Route 7"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Twist Mountain"
            }
        }

        days = [3,4,5,6,7,11,12,13,14,15,19,20,21,22,23];
        if (days.indexOf(dayOfMonth) >= 0) {
            raining[raining.length] = {
                "region": "Unova",
                "location": "Icirrus City"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Dragonspiral Tower"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Route 8"
            }
        }

        days = [4,5,12,13,20,21,28,29];
        if (days.indexOf(dayOfMonth) >= 0) {
            raining[raining.length] = {
                "region": "Unova",
                "location": "Virbank City"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Virbank Complex"
            }
        }
        
        //spring only
        if (season == 0) {
            days = [3,5,11,13,20,27,29];
            if (days.indexOf(dayOfMonth) >= 0) {
                raining[raining.length] = {
                    "region": "Unova",
                    "location": "Floccesy Town"
                }
                raining[raining.length] = {
                    "region": "Unova",
                    "location": "Route 20"
                }
                raining[raining.length] = {
                    "region": "Unova",
                    "location": "Floccesy Ranch"
                }
            }
        }
    //if it is summer
    } else if (season == 1) {
        days = [9,10,20,21];
        if (days.indexOf(dayOfMonth) >= 0) {
            raining[raining.length] = {
                "region": "Unova",
                "location": "Mistralton City"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Route 7"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Twist Mountain"
            }
        }

        days = [8,9,10,11,19,20,21,22];
        if (days.indexOf(dayOfMonth) >= 0) {
            raining[raining.length] = {
                "region": "Unova",
                "location": "Icirrus City"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Dragonspiral Tower"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Route 12"
            }
        }

        days = [1,2,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24];
        if (days.indexOf(dayOfMonth) >= 0) {
            raining[raining.length] = {
                "region": "Unova",
                "location": "Route 8"
            }
        }

        days = [9,10,20,21];
        if (days.indexOf(dayOfMonth) >= 0) {
            raining[raining.length] = {
                "region": "Unova",
                "location": "Floccesy Town"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Route 20"
            }
            raining[raining.length] = {
                "region": "Unova",
                "location": "Floccesy Ranch"
            }
        }
    } else if (season == 3) {
        if(dayOfMonth % 10 == 2) {
            hailing[hailing.length] = {
                "region": "Unova",
                "location": "Route 6"
            }

            hailing[hailing.length] = {
                "region": "Unova",
                "location": "Route 7"
            }

            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Driftveil City"
            }

            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Cold Storage"
            }
        } else {
            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Route 6"
            }

            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Route 7"
            }

            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Driftveil City"
            }

            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Cold Storage"
            }
        }
        if(dayOfMonth % 7 == 4) {
            hailing[hailing.length] = {
                "region": "Unova",
                "location": "Twist Mountain"
            }

            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Mistralton City"
            }
        } else {
            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Twist Mountain"
            }

            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Mistralton City"
            }
        }

        if(dayOfMonth % 8 == 1) {
            hailing[hailing.length] = {
                "region": "Unova",
                "location": "Icirrus City"
            }
            hailing[hailing.length] = {
                "region": "Unova",
                "location": "Dragonspiral Tower"
            }
            hailing[hailing.length] = {
                "region": "Unova",
                "location": "Route 8"
            }
        } else {
            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Icirrus City"
            }
            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Dragonspiral Tower"
            }
            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Route 8"
            }
        }

        if(dayOfMonth % 15 != 4) {
            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Floccesy Town"
            }

            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Floccesy Ranch"
            }

            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Route 20"
            }
        }

        if(dayOfMonth % 10 != 7) {
            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Virbank City"
            }

            snowing[snowing.length] = {
                "region": "Unova",
                "location": "Virbank Complex"
            }
        }
    }
    //february
    days = [10,20];
    if (month == 1 && days.indexOf(dayOfMonth) >= 0) {
        raining[raining.length] = {
            "region": "Unova",
            "location": "Virbank City"
        }
        raining[raining.length] = {
            "region": "Unova",
            "location": "Virbank Complex"
        }
    }

    //october
    days = [17,28,29,30,31];
    if (month == 9 && days.indexOf(dayOfMonth) >= 0) {
        raining[raining.length] = {
            "region": "Unova",
            "location": "Route 8"
        }
    }

    //
    days = [17,29,30,31];
    if (month == 5 && days.indexOf(dayOfMonth) >= 0) {
        raining[raining.length] = {
            "region": "Unova",
            "location": "Route 8"
        }
    }

    if(dayOfMonth % 3 == 0) {
        raining[raining.length] = {
            "region": "Kalos",
            "location": "Route 8 (Muraille Coast)"
        }
    }

    if(dayOfMonth % 4 == 1) {
        raining[raining.length] = {
            "region": "Kalos",
            "location": "Ambrette Town"
        }
    }

    if(dayOfMonth % 5 == 2) {
        raining[raining.length] = {
            "region": "Kalos",
            "location": "Cyllage City"
        }
    }

    if(dayOfMonth % 5 == 3) {
        raining[raining.length] = {
            "region": "Kalos",
            "location": "Route 10 (Menhir Trail)"
        }
    }

    if(dayOfMonth % 6 == 4) {
        raining[raining.length] = {
            "region": "Kalos",
            "location": "Geosenge Town"
        }
    }

    if(dayOfMonth % 6 == 5) {
        raining[raining.length] = {
            "region": "Kalos",
            "location": "Route 9 (Spikes Passage)"
        }
    }

    if(weekday == 1 && hour < 13) {
        raining[raining.length] = {
            "region": "Kalos",
            "location": "Route 14 (Laverre Nature Trail)"
        }

        raining[raining.length] = {
            "region": "Kalos",
            "location": "Laverre City"
        }

        raining[raining.length] = {
            "region": "Kalos",
            "location": "Poké Ball Factory"
        }
    }

    if(dayOfMonth % 5 == 1) {
        raining[raining.length] = {
            "region": "Kalos",
            "location": "Route 15 (Brun Way)"
        }

        raining[raining.length] = {
            "region": "Kalos",
            "location": "Route 16 (Mélancolie Path)"
        }
    }

    if(dayOfMonth % 7 == 2 || dayOfMonth % 7 == 5) {
        raining[raining.length] = {
            "region": "Kalos",
            "location": "Route 18 (Vallée Étroite Way)"
        }

        raining[raining.length] = {
            "region": "Kalos",
            "location": "Couriway Town"
        }
    }

    if(dayOfMonth % 6 == 1 || dayOfMonth % 5 == 3) {
        raining[raining.length] = {
            "region": "Kalos",
            "location": "Route 19 (Grande Vallée Way)"
        }
    }

    if(dayOfMonth % 6 == 5 || dayOfMonth % 5 == 2) {
        raining[raining.length] = {
            "region": "Kalos",
            "location": "Route 21 (Dernière Way)"
        }
    }

    if(dayOfMonth % 4 == 2 || dayOfMonth % 6 == 2) {
        raining[raining.length] = {
            "region": "Alola",
            "location": "Tapu Village"
        }

        raining[raining.length] = {
            "region": "Alola",
            "location": "Route 14"
        }
    }

    var randomLow = Math.ceil(Math.random() * 100);
    var randomHigh = Math.ceil(Math.random() * 100);
    if (randomLow < randomHigh) {
        raining[raining.length] = {
            "region": "Alola",
            "location": "Lush Jungle"
        }

        raining[raining.length] = {
            "region": "Alola",
            "location": "Brooklet Hill"
        }
    }

    if ((hour >= 10 && hour <= 15) || (hour >= 16 && hour <= 23)) {
        raining[raining.length] = {
            "region": "Alola",
            "location": "Exeggutor Island"
        }
    }

    if (dayOfMonth % 5 == 3) {
        hailing[hailing.length] = {
            "region": "Kalos",
            "location": "Frost Cavern"
        }
    } else if (dayOfMonth % 5 == 1) {
        snowing[snowing.length] = {
            "region": "Kalos",
            "location": "Frost Cavern"
        }
    }

    if (dayOfMonth % 4 == 3) {
        snowing[snowing.length] = {
            "region": "Kalos",
            "location": "Dendemille Town"
        }
    }

    if (dayOfMonth % 5 == 3) {
        snowing[snowing.length] = {
            "region": "Kalos",
            "location": "Anistar City"
        }
    }

    randomLow = Math.ceil(Math.random() * 100);
    randomHigh = Math.ceil(Math.random() * 100);
    if (randomLow < randomHigh) {
        hailing[hailing.length] = {
            "region": "Alola",
            "location": "Mount Lanakila"
        }
    }

    randomLow = Math.ceil(Math.random() * 100);
    randomHigh = Math.ceil(Math.random() * 100);
    if (randomLow < randomHigh) {
        sandstorm[sandstorm.length] = {
            "region": "Alola",
            "location": "Haina Desert"
        }
    }

    randomLow = Math.ceil(Math.random() * 100);
    randomHigh = Math.ceil(Math.random() * 100);
    if (randomLow < randomHigh) {
        sandstorm[sandstorm.length] = {
            "region": "Kalos",
            "location": "Route 13 (Lumiose Badlands)"
        }
    }
}

/**
 * Gets a hexadecimal number that represents a Pokemon's type.
 * 
 * @param {string} type The name of the type.
 * 
 * @returns {number} A hexadecimal number that represent the
 * type's color.
 */
function getTypeColor(type) {
    if (type === "Normal") {
        return 0xa8a878;
    } else if (type === "Fire") {
        return 0xf08030;
    } else if (type === "Fighting") {
        return 0xc03028;
    } else if (type === "Water") {
        return 0x6890f0;
    } else if (type === "Flying") {
        return 0xa890f0;
    } else if (type === "Grass") {
        return 0x78c850;
    } else if (type === "Poison") {
        return 0xa040a0;
    } else if (type === "Electric") {
        return 0xf8d030;
    } else if (type === "Ground") {
        return 0xe0c068;
    } else if (type === "Psychic") {
        return 0xf85888;
    } else if (type === "Rock") {
        return 0xb8a038;
    } else if (type === "Ice") {
        return 0x98d8d8;
    } else if (type === "Bug") {
        return 0xa8b820;
    } else if (type === "Dragon") {
        return 0x7038f8;
    } else if (type === "Ghost") {
        return 0x705898;
    } else if (type === "Dark") {
        return 0x705848;
    } else if (type === "Steel") {
        return 0xb8b8d0;
    } else if (type === "Fairy") {
        return 0xee99ac;
    } else {
        return 0x68a090;
    }
}

/**
 * Determines if a Pokemon species has visual differences between its male 
 * and female genders.
 * 
 * @param {string} name The name of the Pokemon species.
 * 
 * @returns {boolean} True if Pokemon has gender differences.
 */
function hasGenderDifference(name) {
    var pkmn = [
        'Abomasnow',
        'Aipom',
        'Alakazam',
        'Ambipom',
        'Beautifly',
        'Bibarel',
        'Bidoof',
        'Blaziken',
        'Buizel',
        'Butterfree',
        'Cacturne',
        'Camerupt',
        'Combee',
        'Combusken',
        'Croagunk',
        'Dodrio',
        'Doduo',
        'Donphan',
        'Dustox',
        'Finneon',
        'Floatzel',
        'Frillish',
        'Gabite',
        'Garchomp',
        'Gible',
        'Girafarig',
        'Gligar',
        'Gloom',
        'Golbat',
        'Goldeen',
        'Gulpin',
        'Gyarados',
        'Heracross',
        'Hippopotas',
        'Hippowdon',
        'Houndoom',
        'Hypno',
        'Jellicent',
        'Kadabra',
        'Kricketot',
        'Kricketune',
        'Ledian',
        'Ledyba',
        'Ludicolo',
        'Lumineon',
        'Luxio',
        'Luxray',
        'Magikarp',
        'Mamoswine',
        'Medicham',
        'Meditite',
        'Meganium',
        'Meowstick',
        'Milotic',
        'Murkrow',
        'Numel',
        'Nuzleaf',
        'Octillery',
        'Pachirisu',
        'Pikachu',
        'Piloswine',
        'Politoed',
        'Pyroar',
        'Quagsire',
        'Raichu',
        'Raticate',
        'Rattata',
        'Relicanth',
        'Rhydon',
        'Rhyhorn',
        'Rhyperior',
        'Roselia',
        'Roserade',
        'Scizor',
        'Scyther',
        'Seaking',
        'Shiftry',
        'Shinx',
        'Sneasel',
        'Snover',
        'Staraptor',
        'Staravia',
        'Starly',
        'Steelix',
        'Sudowoodo',
        'Swalot',
        'Tangrowth',
        'Torchic',
        'Toxicroak',
        'Unfezant',
        'Ursaring',
        'Vileplume',
        'Weavile',
        'Wobbuffet',
        'Wooper',
        'Xatu',
        'Zubat',
        'Venusaur'
    ]
    var found = pkmn.indexOf(name);
    if (found > -1) {
        return true;
    }
    return false;
}

/**
 * Sends a message containing detailed information about all the Pokebot commands.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors were encountered.
 */
function printHelp(message) {
    message.author.send({
        "embed": {
            "author": {
                "name": "PokéBot Commands",
            },
            "title": "List of Commands",
            "color": getTypeColor("Grass"),
            "fields": [
                {
                    "name": "ability",
                    "value": "Arguments: <ability_name>\nReturns information relating to the ability.\nAlias: a"
                },
                {
                    "name": "bag",
                    "value": "Returns the contents of the sender's bag.\nAliases: b, items"
                },
                {
                    "name": "begin",
                    "value": "Allows the sender to pick a starter Pokémon and use other bot commands."
                },
                {
                    "name": "buy",
                    "value": "Brings up the Poké Mart interface that lets the sender buy items.\nAliases: m, mart, sell, shop"
                },
                {
                    "name": "dex",
                    "value": "Arguments: <pokémon_name>\nReturns various information of the requested Pokémon.\nAliases: d, pokedex, pokédex"
                },
                {
                    "name": "encounters",
                    "value": "Returns a list of Pokémon that the sender can currently encounter.\nAliases: e, encounters"
                },
                {
                    "name": "fish",
                    "value": "Sets the sender as fishing if the sender has at least one fishing rod.\nAlias: f"
                },
                {
                    "name": "give",
                    "value": "Arguments: <item_name>\nGives one <item_name> to the sender's lead Pokémon.\nAlias: g"
                },
                {
                    "name": "goto",
                    "value": "Arguments: <location_name>\nSets the sender's current location to <location_name> if it exists within their current region.\nAliases: go, go to"
                },
                {
                    "name": "help",
                    "value": "Directly messages a list of PokéBot commands to the sender.\nAlias: h"
                },
                {
                    "name": "lead",
                    "value": "Returns the current lead Pokémon of the sender.\nAliases: current, first, front, l, main"
                },
                {
                    "name": "lotto",
                    "value": "Enters the sender into the daily lottery for a chance at winning prizes. Resets at midnight eastern time.\nAliases: daily, lottery"
                },
                {
                    "name": "move",
                    "value": "Arguments: <move_name>\nReturns information relating to a move.\nAliases: attack, m"
                },
                {
                    "name": "pokémon",
                    "value": "Returns a list of all the Pokémon owned by the sender.\nAliases: p, pokemon"
                },
                {
                    "name": "release",
                    "value": "Arguments: <pokemon_name>\nReleases a <pokemon_name> owned by the sender so that they will not be able to use it anymore.\nAlias: r"
                },
                {
                    "name": "setlead",
                    "value": "Arguments: <pokemon_name>\nRemoves the lead status from the sender's current lead Pokémon and gives that status to a <pokemon_name>.\nAliases: s, select, swap, switch"
                },
                {
                    "name": "surf",
                    "value": "Sets the sender as surfing if the sender's lead Pokémon knows Surf."
                },
                {
                    "name": "take",
                    "value": "Takes the item from the sender's current lead Pokémon and puts it in the sender's bag.\nAlias: t"
                },
                {
                    "name": "travel",
                    "value": "Arguments: <region_name>\nAllows the sender to travel to another region if the user owns a visa for that region."
                },
                {
                    "name": "use",
                    "value": "Arguments: <item_name>\nUses an item from the sender's bag.\nAlias: u"
                },
                {
                    "name": "where",
                    "value": "Returns the location of the sender within their current region.\nAliases: locate, w"
                },
                {
                    "name": "walk",
                    "value": "Sets the sender as walking in grass."
                }
            ]
        }
    });
}

/**
 * Gets current time in a user's timezone. Defauls to UTC
 * if user does not have a timezone.
 * 
 * @param {User} user The Pokebot user to get the timezone of.
 * 
 * @returns {Moment} The current time for the user.
 */
function convertToTimeZone(user) {
    var CurrentDate = moment().format();
    var zone = momentTz.tz(CurrentDate, 'America/Detroit');
    if (user === null || user === false) {
        zone = moment.utc(zone).format();
    } else {
        zone = zone.clone().tz(user.timezone);
    }
    return zone;
}

/**
 * Copies a string and changes most ascii alphabet characters to
 * a Unicode character that looks like an upside-down version of
 * the ascii character. 
 * 
 * @param {string} aString The string to turn upside-down.
 * 
 * @returns {string} The flipped version of the string.
 */
function flipString(aString) {
	aString = aString.toLowerCase();
	var last = aString.length - 1;
	var result = "";
	for (var i = last; i >= 0; --i) {
		result += flipChar(aString.charAt(i))
	}
	return result;
}

/**
 * Changes an ascii alphabet character to
 * a Unicode character that looks like an upside-down version of
 * the ascii character. 
 * 
 * @param {string} c The ascii character to turn upside-down.
 * 
 * @returns {string} The flipped version of the character.
 */
function flipChar(c) {
	if (c == 'a') {
		return '\u0250'
	}
	else if (c == 'b') {
		return 'q'
	}
	else if (c == 'c') {
		return '\u0254'  
	}
	else if (c == 'd') {
		return 'p'
	}
	else if (c == 'e') {
		return '\u01DD'
	}
	else if (c == 'f') {
		return '\u025F' 
	}
	else if (c == 'g') {
		return 'b'
	}
	else if (c == 'h') {
		return '\u0265'
	}
	else if (c == 'i') {
		return '\u0131'//'\u0131\u0323' 
	}
	else if (c == 'j') {
		return '\u0638'
	}
	else if (c == 'k') {
		return '\u029E'
	}
	else if (c == 'l') {
		return '1'
	}
	else if (c == 'm') {
		return '\u026F'
	}
	else if (c == 'n') {
		return 'u'
	}
	else if (c == 'o') {
		return 'o'
	}
	else if (c == 'p') {
		return 'd'
	}
	else if (c == 'q') {
		return 'b'
	}
	else if (c == 'r') {
		return '\u0279'
	}
	else if (c == 's') {
		return 's'
	}
	else if (c == 't') {
		return '\u0287'
	}
	else if (c == 'u') {
		return 'n'
	}
	else if (c == 'v') {
		return '\u028C'
	}
	else if (c == 'w') {
		return '\u028D'
	}
	else if (c == 'x') {
		return 'x'
	}
	else if (c == 'y') {
		return '\u028E'
	}
	else if (c == 'z') {
		return 'z'
	}
	else if (c == '[') {
		return ']'
	}
	else if (c == ']') {
		return '['
	}
	else if (c == '(') {
		return ')'
	}
	else if (c == ')') {
		return '('
	}
	else if (c == '{') {
		return '}'
	}
	else if (c == '}') {
		return '{'
	}
	else if (c == '?') {
		return '\u00BF'  
	}
	else if (c == '\u00BF') {
		return '?'
	}
	else if (c == '!') {
		return '\u00A1'
	}
	else if (c == "\'") {
		return ','
	}
	else if (c == ',') {
		return "\'"
	}
	return c;
}

