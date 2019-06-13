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
const spamEncounterMult = 5;    //default = 1
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
    this.status = null;
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
    dollar = client.emojis.find(dollar => dollar.name === "pokedollar");
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
    /** Don't do anything if user is trading a Pokemon.  */
    } else if (isInTrade(message.author.id) != null) {
        return;
    /** @todo replace this with a function to check if message begins with the guild's prefix once prefix customization has been added. */
    } else if (message.content.trim() === `!pb activate`) {
        await setBotChannel(message);
        return;
    } else {
        con.beginTransaction(async function(err) {
            if (err) { console.error(err); }
    
            /** Only read commands sent in the bot channel. */
            if (await isBotChannel(message)) {
                /** Splits message into an array of words. */
                let input = message.content.trim().split(/ +/g);
                /** The command is the first word in the message, not including the prefix. */
                const command = input.shift().toLowerCase();
                
                /** Only allow some commands if a user is evolving one of their Pokemon. */
                if (await checkIfUserIsEvolving(message, command, input)) {
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
    }
});

/**
 * Performs various actions for the user if the user
 * sent a message that wasn't a command, includding giving
 * experience to the user's lead Pokemon (and Day Care Pokemon), possibly
 * having the user encounter a wild Pokemon, and possibly
 * giving money to the user.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors were encountered.
 */
async function doNonCommandMessage(message) {
    if (!enableSpam) {
        /* User did not post in the spam channel. */
        let lastUser = null;
        if (message.author.id === lastUser) {
            return; /* Dont do anything if sender posted a consecutive message. */
        }
        
        /* Bot wont do anything until at least after a second since the last message passed. */
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
        await giveMoney(message, moneyAmnt, user);
    /* User's Pokemon are given XP. */
    } else {
        /* Give a random amount of XP to the user lead Pokemon. */
        let xpAmount = Math.ceil(Math.random() * 5);
        xpAmount += Math.ceil(Math.random() * 10);
        xpAmount += Math.ceil(Math.random() * 20);
        xpAmount = xpAmount * spamXpMult;
        await giveXP(message, lead, xpAmount);
    }

    await giveDayCareXP(message);
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
    transactions[transactions.length] = new Transaction(message.author.id, "your encounter with " + encounter.name);
    
    let shuffle_icon = await getShuffleEmoji(encounter.no);
    await message.react(shuffle_icon.id);

    await battlePokemon(message, encounter, user, lead);

    removeTransaction(message.author.id);
}

/**
 * Shows a wild Pokemon to a user and allows the user to make
 * choices regarding the wild Pokemon.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {Pokemon} encounter The wild Pokemon being encountered.
 * @param {User} user The Pokebot user who is encountering the Pokemon.
 * @param {Pokemon} lead The user's lead Pokemon.
 * 
 * @returns {any} To be determined.
 */
async function battlePokemon(message, encounter, user, lead) {
    let pokeball = await client.emojis.find(emote => emote.name === "poke_ball");
    let reactions = ["🥊", "🎒", pokeball, "👟"];
    let description = message.author.username + " a wild **" + encounter.name + "** appeared! Please react to this message to make a selection.\n🥊 Fight\n🎒 View Bag\n" + pokeball + " Throw a Poké Ball\n👟 Run Away";
    let modelLink = generateModelLink(encounter.name, encounter.shiny, encounter.gender, encounter.form);
    let imageName = await getGifName(encounter.name);

    const FIGHT = 0;
    const BAG = 1;
    const RUN = 2;
    const BALL = 3;

    let encountering = true;
    let turns = 0;
    while (encountering) {
        turns++;
        reactions[2] = pokeball;
        let embed = await generateWildPokemonEmbed(encounter, message, description);
        let baseEncounterMsg = await sendMessageWithAttachments(message.channel, embed, [{ attachment: modelLink, name: (imageName + '.gif') }], true);
        
        for (let emote in reactions) {
            await baseEncounterMsg.react(reactions[emote]);
        }

        reactions[2] = "poke_ball";
        
        const filter = (reaction, user) => {
            return reactions.includes(reaction.emoji.name) && user.id === message.author.id;
        };
        
        let selectedOption = RUN;

        await baseEncounterMsg.awaitReactions(filter, { max: 1, time: 600000, errors: ['time'] })
        .then(collected => {
            const reaction = collected.first();

            if (reaction.emoji.name === reactions[0]) {
                selectedOption = FIGHT;
            } else if (reaction.emoji.name === reactions[1]) {
                selectedOption = BAG;
            } else if (reaction.emoji.name === reactions[3]) {
                selectedOption = RUN;
            } else if (reaction.emoji.name === "poke_ball") {
                selectedOption = BALL;
            }
        })
        .catch(() => {
            selectedOption = RUN;
        })

        baseEncounterMsg.delete(0);
        
        if (selectedOption === FIGHT) {
            /**
             * @todo add battling, might do something generic in the meantime.
             */
        } else if (selectedOption === BAG) {
            encountering = await useBagInBattle(message, encounter, user, lead);
        } else if (selectedOption === RUN) {
            /**
             * @todo check for ability/move that prevents escape after battling has been added.
             */
            encountering = false;
            await sendMessage(message.channel, (message.author.username + " ran away from the wild **" + encounter.name + "**."));
        } else if (selectedOption === BALL) {
            let selectedBall = await selectPokeBall(message);
            if (selectedBall != null) {
                let caught = await throwPokeBall(message, encounter, user, selectedBall, turns);
                if (caught) {
                    encountering = false;
                }
            }
        }
    }
}

/**
 * 
 */
async function useBagInBattle(message, encounter, user, lead) {
    let bag = await getBag(user.user_id);
    for (let item in bag) {
        /**
         * @todo Finish making this after items are overhauled.
         * Get items with battle = true.
         */
    }
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
        dexnum = dexnum.padStart(3, '0');

        shuffle_icon = await client.emojis.find(shuffle_icon => shuffle_icon.name === dexnum);
    } else {
        shuffle_icon = await client.emojis.find(shuffle_icon => shuffle_icon.name === number);
    }
    return new Promise(function(resolve) {
        resolve(shuffle_icon);
    });
}

/**
 * Shows a list of the user's Poke Balls (if they have any) to the user
 * and the user selects a Poke Ball by reacting with the Poke Ball.
 * 
 * @param {Message} message The message sent from the user that triggered the Pokemon encounter.
 * 
 * @returns {string} The name of the Poke Ball that the user selected.
 */
async function selectPokeBall(message) {
    let selectedBall = null;
    let balls = await getBalls(message.author.id);
    let embedData = await generatePokeBallEmbed(message, balls);
    let embed = embedData[0];
    let emotes = embedData[1];
    let reactions = [];
    let msg = await sendMessage(message.channel, {embed}, true);

    for (emote in emotes) {
        await msg.react(emotes[emote]);
        if (emotes[emote].hasOwnProperty("name")) {
            reactions[reactions.length] = emotes[emote].name;
        } else {
            reactions[reactions.length] = emotes[emote];
        }
    }

    const filter = (reaction, user) => {
        return reactions.includes(reaction.emoji.name) && user.id === message.author.id;
    };

    await msg.awaitReactions(filter, { max: 1, time: 300000, errors: ['time'] })
    .then(collected => {
        const reaction = collected.first();

        if (reaction.emoji.name === "repeat_ball") {
            selectedBall = "Repeat Ball";
        } else if (reaction.emoji.name === "safari_ball") {
            selectedBall = "Safari Ball";
        } else if (reaction.emoji.name === "premier_ball") {
            selectedBall = "Premier Ball";
        } else if (reaction.emoji.name === "timer_ball") {
            selectedBall = "Timer Ball";
        } else if (reaction.emoji.name === "moon_ball") {
            selectedBall = "Moon Ball";
        } else if (reaction.emoji.name === "nest_ball") {
            selectedBall = "Nest Ball";
        } else if (reaction.emoji.name === "love_ball") {
            selectedBall = "Love Ball";
        } else if (reaction.emoji.name === "poke_ball") {
            selectedBall = "Poké Ball";
        } else if (reaction.emoji.name === "ultra_ball") {
            selectedBall = "Ultra Ball";
        } else if (reaction.emoji.name === "quick_ball") {
            selectedBall = "Quick Ball";
        } else if (reaction.emoji.name === "lure_ball") {
            selectedBall = "Lure Ball";
        } else if (reaction.emoji.name === "luxury_ball") {
            selectedBall = "Luxury Ball";
        } else if (reaction.emoji.name === "heavy_ball") {
            selectedBall = "Heavy Ball";
        } else if (reaction.emoji.name === "great_ball") {
            selectedBall = "Great Ball";
        } else if (reaction.emoji.name === "friend_ball") {
            selectedBall = "Friend Ball";
        } else if (reaction.emoji.name === "dive_ball") {
            selectedBall = "Dive Ball";
        } else if (reaction.emoji.name === "heal_ball") {
            selectedBall = "Heal Ball";
        } else if (reaction.emoji.name === "net_ball") {
            selectedBall = "Net Ball";
        } else if (reaction.emoji.name === "master_ball") {
            selectedBall = "Master Ball";
        } else if (reaction.emoji.name === "fast_ball") {
            selectedBall = "Fast Ball";
        } else if (reaction.emoji.name === "dusk_ball") {
            selectedBall = "Dusk Ball";
        } else if (reaction.emoji.name === "level_ball") {
            selectedBall = "Level Ball";
        }else if (reaction.emoji.name === "❌") {
            selectedBall = null;
        }
    })
    .catch(() => {
        selectedBall = null;
    });

    msg.delete(0);

    return selectedBall;
}

/**
 * Creates a list of Poke Balls that shows each Poke Ball's icon, name,
 * and quantity and converts it into a Rich Embed.
 * 
 * @param {Message} message The message sent from the user that triggered the Pokemon encounter.
 * @param {Item[]} balls The Poke Balls owned by the user.
 * 
 * @returns {[RichEmbed, Emote[]]} The rich embed showing the list of Poke Balls and a list
 * of emotes that contain all Poke Balls owned by the user.
 */
async function generatePokeBallEmbed(message, balls) {
    let text = "";
    let emotes = [];

    if (balls.length > 0) {
        function compare(a,b) {
            if (a.name < b.name) {
                return -1;
            }
            if (a.name > b.name) {
                return 1;
            }
            return 0;
        }
        balls.sort(compare);

        for (ball in balls) {
            let emoteName = balls[ball].name;
            emoteName = emoteName.toLowerCase();
            emoteName = emoteName.replace(/ /gi, '_');
            emoteName = emoteName.replace(/\é/gi, 'e');
            let ballEmote = await client.emojis.find(emote => emote.name === emoteName);
    
            text += ballEmote + " **" + balls[ball].name + "** x" + balls[ball].quantity + "\n";
            emotes[emotes.length] = ballEmote;
        }
    } else {
        text = "You don't have any Poké Balls!"
    }

    emotes[emotes.length] = "❌";

    let embed = {
        "author": {
            "name": "Poké Ball Selection",
        },
        "description": message.author.username + " please choose which Poké Ball to throw. Select the Poké Ball by reacting to its image, or ❌ to return to the battle menu.",
        "fields": [
            {
                "name":  "\u200b",
                "value": text
            }
        ]
    };

    return [embed, emotes];
    
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
        await sendMessage(message.channel, message.author.username + " found " + dollar + amount.toString() + "! You now have " + dollar + user.money + ".");
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
            if (region === sandstorm[location].region && location === sandstorm[location].location) {
                encounterChance = encounterChance / 2;
                break;
            }
        }
    /** Halves encounter chance in snow and hail. */
    } else if (ability === "Snow Cloak") {
        for (location in hailing) {
            if (region === hailing[location].region && location === hailing[location].location) {
                encounterChance = encounterChance / 2;
                break;
            }
        }
        for (location in snowing) {
            if (region === snowing[location].region && location === snowing[location].loction) {
                encounterChance = encounterChance / 2;
                break;
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
    } else if ((command === "r" || command === "release")) {
        if  (input.length === 0) {
            input = undefined;
        }
        commandStatus = await runReleaseCommand(message, input);
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
async function checkIfUserIsEvolving(message, command, input) {
    let ev = isInEvolution(message.author.id);
    let isEvolving = false;
    /* If sender has a Pokemon evolving. */
    if(ev != null) {
        isEvolving = true;
        /* If sender accepts evolution. */
        if(command === "a") {
            await evolve(message);
        /* If sender cancels evolution. */
        } else if (command === "b") {
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
 * @param {boolean} returnMessage If the function should instead return the message object.
 * This is useful when adding reactions to the sent message.
 * 
 * @returns {Message} The message if it was sent, otherwise null.
 */
async function sendMessage(channel, content, returnMessage = false) {
    let message = false;
    await channel.send(content)
    .then(msg => {
        if (returnMessage) {
            message = msg;
        } else {
            message = true;
        }
    })
    .catch(err => {
        console.error(chalk`{red [ERROR]} Failed to send message: ` + err);
    });

    return new Promise(function(resolve) {
        resolve(message);
    });
}

/**
 * Sends a Discord message with attached files to a specific channel and catches any possible errors.
 * 
 * @param {TextChannel} channel The Discord channel to send the message to.
 * @param {embed} content The content of the message. Must be a Discord embed object.
 * @param {any[]} attachments The list of attachement objects.
 * @param {boolean} returnMessage If the function should instead return the message object.
 * This is useful when adding reactions to the sent message.
 * 
 * @returns {Message} The message if it was sent, otherwise null.
 */
async function sendMessageWithAttachments(channel, content, attachments, returnMessage = false) {
    let message = null;
    await channel.send({embed: content, files: attachments })
    .then(msg => {
        if (returnMessage) {
            message = msg;
        } else {
            message = true;
        }
    })
    .catch(err => {
        console.error(chalk`{red [ERROR]} Failed to send message: ` + err);
    });

    return new Promise(function(resolve) {
        resolve(message);
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
    return new Promise(async function(resolve, reject) {
        await con.query(query, variables, function (err, rows) {
            if (err) {
                con.rollback(function() {
                    console.error(err);
                  });
                reject(null);
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
 * 
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
            /* Lets the user pick their region and starter Pokemon, and populates the user's bag with starting items. */
            while (awaitingUserInput) {
                let region = await selectRegion(message);
                let starter = await selectStarter(message, region);
                if (starter != null) {
                    cancelled = false;
                }
                awaitingUserInput = await createNewUser(message.author.id, starter, message, region);
                if (awaitingUserInput) {
                    cancelled = false;
                    awaitingUserInput = false;
                    commandStatus = await sendMessage(message.channel, (message.author.username + " has started their Pokémon adventure with a " + starter + "! Since you chose to begin in the " + region + " region, you will find yourself in " + getDefaultLocationOfRegion(region) + ". Use the `goto <location_name>` command to move to another location within the region, provided you have a Pokémon strong enough to protect you."));
                } else if (!cancelled) {
                    commandStatus = await sendMessage(message.channel, "Sorry, something went wrong! I was unable to begin your adventure, please try again.");
                }
            }
            removeTransaction(message.author.id);
            /* If user decided to cancel (likely because they didn't like their starter Pokemon, or because they timed out). */
            if (cancelled) {
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
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runBagCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can have a bag to store items in."));
    } else {
        commandStatus = await printBag(message);
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `dex` command, which
 * sends a message containing detailed information about a 
 * Pokemon.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input Pokemon name as input by the user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runDexCommand(message, input) {
    let commandStatus = true;
    if (input.length === 0) {
        let exists = await userExists(message.author.id);
        if (!exists) {
            commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can check your Pokédex progress."));
        } else {
            /* Do not await, otherwise user will be stuck waiting for the message reactions to end. */
            printDex(message);
        }
    } else {
        input = input.join(' ');
        commandStatus = await getDexInfo(message, input, "None");
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    })
}

/**
 * Handles the process for running the `daycare` command, which
 * allows a user to drop off and pick up their Pokemon from the
 * day care.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runDaycareCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can send a Pokémon to the day care."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to send a Pokémon to the day care.") === false) {
            transactions[transactions.length] = new Transaction(message.author.id, "your current business at the day care");
            commandStatus = await dayCare(message);
            removeTransaction(message.author.id);
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `dive` command, which
 * sets a user to only encounter Pokemon found by diving.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runDiveCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can dive with a Pokémon."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to dive with your Pokémon.") === false) {
            commandStatus = await setField(message, "Dive");
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `encounter` command, which
 * sends a message containing all the different Pokemon that the
 * user can encounter in their current location.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runEncounterCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before being able to find wild Pokémon."));
    } else {
        commandStatus = await printPossibleEncounters(message);
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `fish` command, which
 * sets a user to only encounter Pokemon found by fishing.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runFishCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can fish for Pokémon."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to begin fishing.") === false) {
            commandStatus = await setField(message, "Fish");
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `give` command, which
 * gives an item to the user's lead Pokemon.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input Name of item as input by the user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runGiveCommand(message, input) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can give an item to your Pokémon."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to give a Pokémon an item.") === false) {
            transactions[transactions.length] = new Transaction(message.author.id, "your current item assignment");
            input = input.join(' ');
            commandStatus = await giveItem(message, input);
            removeTransaction(message.author.id);
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `goto` command, which
 * changes the location of the user to somewhere else within
 * the same region.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input Location name as input by the user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runGotoCommand(message, input) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before being able to travel the world."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to move to a new location.") === false) {
            if (input.length > 1 && input[0] === "to" && input[1] != "to") {
                input.splice(0, 1);
            }
            input = input.join(' ');
            commandStatus = await setLocation(message, input)
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `help` command, which
 * will send a DM to the user containing information about
 * all of the Pokebot commands.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runHelpCommand(message) {
    let commandStatus = await printHelp(message);
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `headbutt` command, which
 * sets a user to only encounter Pokemon found by headbutting trees.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runHeadbuttCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can headbutt trees with a Pokémon."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to headbutt trees with your Pokémon.") === false) {
            commandStatus = await setField(message, "Headbutt");
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `lead` command, which
 * changes the user's lead Pokemon to another Pokemon that they own.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input Optional user input that will show the lead Pokemon's hidden stats if this value is equal to `"hidden"`.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runLeadCommand(message, input) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure to obtain Pokémon."));
    } else {
        let pkmn = await getLeadPokemon(message.author.id);
        if (pkmn === null) {
            commandStatus = false
        }
        /* If user added 'hidden' to the command, then show hidden stats. */
        if (input.length > 0 && input[0].toLowerCase() === "hidden") {
            commandStatus = await displayHiddenStats(pkmn, message);
        } else { 
            commandStatus = await displayAnOwnedPkmn(pkmn, message);
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `locations` command, which
 * sends a message containing all locations within the user's current
 * region.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runLocationsCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before viewing the locations you can visit."));
    } else {
        commandStatus = await printAllLocations(message);
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `lotto` command, which
 * randomly generates a number and matches that number to the
 * user's id to determine what prizes the user will receive.
 * 
 * @todo Possibly make the lotto winning number global for all users
 * instead of randomly generated for each user.
 * 
 * @todo Change prize rewards to let user pick from a selection of items.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runLottoCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure to enter the lottery."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to enter the lottery.") === false) {
            commandStatus = await doLotto(message);
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `move` command, which
 * sends a message containing details about a Pokemon move.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input Name of the move as input by the user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runMoveCommand(message, input) {
    input = input.join(' ');
    let commandStatus = await printMoveInfo(message, input);
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `mart` command, which
 * lets a user to buy items.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runMartCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before being able to buy items."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to buy items.") === false) {
            transactions[transactions.length] = new Transaction(message.author.id, "your item shopping");
            commandStatus = await buyItems(message);
            removeTransaction(message.author.id);
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `pokemon` command, which
 * sends a message showing all Pokemon currently owned by the user.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runPokemonCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure to obtain Pokémon."));
    } else {
        /* Do not await, otherwise user will be stuck waiting for the message reactions to end. */
        printPokemon(message, null);
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `release` command, which
 * releases a Pokemon owned by the user.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string} input The name of the Pokemon to release.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runReleaseCommand(message, input) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before being able to release a Pokémon."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to release a Pokémon.") === false) {
            transactions[transactions.length] = new Transaction(message.author.id, "your current Pokémon release");
            if (input != undefined) {
                input = input.join(' ');
            }
            commandStatus = await releasePokemon(message, input);
            removeTransaction(message.author.id);  
        } 
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `rocksmash` command, which
 * sets a user to encounter only Pokemon that are found by smashing
 * rocks.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input Optional user input that allows a user to accidentally input `"rock smash"` as two words if `input` is equal to `"smash"`.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runRocksmashCommand(message, input) {
    let commandStatus = true;
    input = input.join(' ').toLowerCase();
    //allow user to input "rock smash" or "rocksmash"
    if (input === "smash" || command === "rocksmash") {
        let exists = await userExists(message.author.id);
        if (!exists) {
            commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can smash rocks with a Pokémon."));
        } else {
            if (await printTransactionIfTrue(message, " before trying to smash rocks with your Pokémon.") === false) {
                commandStatus = await setField(message, "Rock Smash");
            }
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `setlead` command, which
 * changes the user's lead Pokemon to another Pokemon that the
 * user owns.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input The name of the Pokemon that the user wants to set as their lead Pokemon.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runSetLeadCommand(message, input) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before being able to select a Pokémon."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to change your lead Pokémon.") === false) {
            transactions[transactions.length] = new Transaction(message.author.id, "your current leader assignment");
            input = input.join(' ');
            if (await setLeadPokemon(message, input) === false) {
                commandStatus = await sendMessage(message.channel, (message.author.username + " failed to change their lead Pokémon."));
            }
            removeTransaction(message.author.id);
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `surf` command, which
 * sets a user to encounter only Pokemon that are found by surfing.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runSurfCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can surf with a Pokémon."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to surf with your Pokémon.") === false) {
            commandStatus = await setField(message, "Surfing");
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `take` command, which
 * takes the item held by the user's lead Pokemon if it is holding
 * any item.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runTakeCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can take items from your Pokémon."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to take items from your Pokémon.") === false) {
            commandStatus = await takeItem(message);
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `travel` command, which
 * changes the region that the user is currently in.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input The name of the region as input by the user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runTravelCommand(message, input) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can travel to a new region."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to travel to a new region.") === false) {
            input = input.join(' ');
            if (await setRegion(message, input) === false) {
                commandStatus = await sendMessage(message.channel, (message.author.username + " failed to travel to " + input + "."));
            }
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `trade` command, which
 * establishes a Pokemon trade between two users.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runTradeCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can trade Pokémon."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to start a new trade.") === false) {
            if (message.mentions.users.first() === undefined) {
                commandStatus = await sendMessage(message.channel, (message.author.username + " please mention the user you want to trade with."));
            } else {
                commandStatus = await tradeOffer(message, message.mentions.users.first());
            }
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `use` command, which
 * uses an item on either a Pokemon or the user, depending
 * on the item.
 * 
 * @param {Message} message Discord message sent by a user.
 * @param {string[]} input The name of the item as input by the user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runUseCommand(message, input) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can use items."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to use an item.") === false) {
            transactions[transactions.length] = new Transaction(message.author.id, "your current item use");
            input = input.join(' ');
            let usedItem = await useItem(message, input);
            if (!usedItem) {
                commandStatus = await sendMessage(message.channel, (message.author.username + " was unable to use the " + input + "."));
            }
            removeTransaction(message.author.id);
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `where` command, which
 * sends a message that shows where the user is currently
 * located at.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runWhereCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before heading into the Pokémon world."));
    } else {
        commandStatus = await printLocation(message);
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `walk` command, which
 * sets a user to encounter only Pokemon that are found in
 * tall grass.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runWalkCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before you can walk around."));
    } else {
        if (await printTransactionIfTrue(message, " before trying to walk around.") === false) {
            commandStatus = await setField(message, "Walking");
        }
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Handles the process for running the `weather` command, which
 * sends a message showing all locations that currently experiencing
 * some type of weather, as well as the current season.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function runWeatherCommand(message) {
    let commandStatus = true;
    let exists = await userExists(message.author.id);
    if (!exists) {
        commandStatus = await sendMessage(message.channel, (message.author.username + " you will need to begin your adventure before checking the weather."));
    } else {
        commandStatus = await getWeather(message);
    }
    return new Promise(function(resolve) {
        resolve(commandStatus);
    });
}

/**
 * Generates a random number and matches that number to a user'd id
 * to award the user prizes.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function doLotto(message) {
    let userDidLotto = false;
    /* Gets the day when the user last ran the lotto command, in their timezone. */
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

    /* If lotto command has not been ran on the current day. */
    if (moment(cur).format('D') != zone.format('D')) {
        let winNum = "";
        let possible = "0123456789";
        let matches = 0;

        /* Randomly generate a winning number string. */
        for(let i = 0; i < 9; i++) {
            winNum += possible.charAt(Math.floor(Math.random() * possible.length));
        }

        /* Cut the user'd id string in half so only the first half is matched with the winning number string. */
        let uid = message.author.id;
        uid = uid.substring(0, (uid.length/2));

        /* Count how many of the same numbers are in the same position for the user's id and the winning number. */
        for(let i = 0; i < 9; i++) {
            if (winNum.charAt(i) === uid.charAt(i)) {
                matches++;
            }
        }

        /* Lotto prizes. */
        /**
         * @todo Change this so prizes are from a selection.
         * 
        if (matches === 0) {
            await sendMessage(message.channel, (message.author.username + " you had 0 matches. As a consolation prize, you won " + dollar + "1000 and a Poké Ball."));
            user.money += 1000;
            await addItemToBag(message.author.id, "Poké Ball", 1, true, "Ball", true);
        } else if (matches === 1) {
            await sendMessage(message.channel, (message.author.username + " you had 1 match! You won " + dollar + "2000 and an Ultra Ball!"));
            user.money += 2000;
            await addItemToBag(message.author.id, "Ultra Ball", 1, true, "Ball", true);
        } else if (matches === 2) {
            await sendMessage(message.channel, (message.author.username + " you had 2 matches! You won " + dollar + "4000 and three Ultra Balls!"));
            user.money += 4000;
            await addItemToBag(message.author.id, "Ultra Ball", 3, true, "Ball", true);
        } else if (matches === 3) {
            await sendMessage(message.channel, (message.author.username + " you had 3 matches! You won " + dollar + "7000 and five Ultra Balls!"));
            user.money += 7000;
            await addItemToBag(message.author.id, "Ultra Ball", 5, true, "Ball", true);
        } else if (matches === 4) {
            await sendMessage(message.channel, (message.author.username + " you had 4 matches! You won " + dollar + "10000 and a Leaf Stone!"));
            user.money += 10000;
            await addItemToBag(message.author.id, "Leaf Stone", 1, true, "Item", false);
        } else if (matches === 5) {
            await sendMessage(message.channel, (message.author.username + " you had 5 matches! You won " + dollar + "13000 and a Fire Stone!"));
            user.money += 13000;
            await addItemToBag(message.author.id, "Fire Stone", 1, true, "Item", false);
        } else if (matches === 6) {
            await sendMessage(message.channel, (message.author.username + " you had 6 matches! You won " + dollar + "18000 and a Water Stone!"));
            user.money += 18000;
            await addItemToBag(message.author.id, "Water Stone", 1, true, "Item", false);
        } else if (matches === 7) {
            await sendMessage(message.channel, (message.author.username + " you had 7 matches! You won " + dollar + "25000 and 10 Ultra Balls!"));
            user.money += 25000;
            await addItemToBag(message.author.id, "Ultra Ball", 10, true, "Ball", true);
        } else if (matches === 8) {
            await sendMessage(message.channel, (message.author.username + " you had 8 matches! You won " + dollar + "35000, 30 Ultra Balls, and 5 Rare Candies!"));
            user.money += 35000;
            await addItemToBag(message.author.id, "Ultra Ball", 30, true, "Ball", true);
            await addItemToBag(message.author.id, "Rare Candy", 5, true, "Item", false);
        } else if (matches === 9) {
            await sendMessage(message.channel, (message.author.username + " you had 9 matches! You won " + dollar + "50000, 50 Ultra Balls, 10 Rare Candies, and a Master Ball!"));
            user.money += 50000;
            await addItemToBag(message.author.id, "Ultra Ball", 50, true, "Ball", true);
            await addItemToBag(message.author.id, "Rare Candy", 10, true, "Item", false);
            await addItemToBag(message.author.id, "Master Ball", 1, true, "Ball", true);
        } 
        */

        /* Tell user what their id is and what the winning number is. */
        await sendMessage(message.channel, ("Your trainer id: " + uid + "\nYour lotto number: " + winNum));

        /* Update the user's lotto time to be the current day. */
        user.lotto = convertToTimeZone(user).format();
        if (await doQuery("UPDATE user SET money = ?, lotto = ? WHERE user.user_id = ?", [user.money, user.lotto, message.author.id]) != null) {
            userDidLotto = true;
        }
    } else {
        /* If user already ran the lotto command today, tell them how much time they have until they can run it again for the next day. */
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
        userDidLotto = await sendMessage(message.channel, (message.author.username + " you have already participated in the daily lottery.\nPlease try again in " + dur.hours() + " " + hr + ", " + dur.minutes() + " " + min + ", and " + dur.seconds() + " " + sec + "."));
    }

    return new Promise(function(resolve) {
        resolve(userDidLotto);
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
 * 
 * @returns {boolean} False if an error is encountered, otherwise true.
 */
async function setBotChannel(message) {
    let wasTheChannelSet = true;
    let rows = await doQuery("SELECT * FROM guilds WHERE guild_id = ?", [message.guild.id]);
    if (rows === null) {
        wasTheChannelSet = false;
    /* If guild doesn't exist in the database. */
    } else if (rows.length === 0) {
        let guild = {
            guild_id: message.guild.id,
            prefix: `!pb`,
            last_message_sent: moment().format(),
            last_user: message.author.id,
            channel: message.channel.id
        }
        /* Insert guild into the database. */
        if (await doQuery("INSERT INTO guilds SET ?", [guild] != null)) {
            wasTheChannelSet = await sendMessage(message.channel, `I will now be reading commands from this channel. Type \`!pb begin\` to start your adventure!`);
        } else {
            await sendMessage(message.channel, `Whoops, something went wrong! Please try again later.`);
            wasTheChannelSet = false;
        }
    /* If guild is in the database. */
    } else {
        /* Update the channel that the bot will read from for the current guild. */
        if (await doQuery("UPDATE guilds SET guilds.channel = ? WHERE guilds.guild_id = ?", [message.channel.id, message.guild.id]) != null) {
            wasTheChannelSet = await sendMessage(message.channel, `I will now be reading commands from this channel.`);
        } else {
            await sendMessage(message.channel, `Whoops, something went wrong! Please try again later.`);
            wasTheChannelSet = false;
        }
    }

    return new Promise(function(resolve) {
        resolve(wasTheChannelSet);
    });
}

/**
 * Checks if the channel contained in `message` is the
 * designated bot channel for the guild contained in
 * `message`.
 * 
 * @param {Message} message Discord message sent by a user.
 * 
 * @returns {boolean} True if the channel is the bot channel, otherwise false.
 */
async function isBotChannel(message) {
    let isChannel = true;
    let rows = await doQuery("SELECT * FROM guilds WHERE guilds.guild_id = ? AND guilds.channel = ?", [message.guild.id, message.channel.id]);
    if (rows === null || rows.length < 1) {
        isChannel = false;
    }
    return new Promise(function(resolve) {
        resolve(isChannel);
    });
}

/**
 * Checks if a user is currently in a transaction.
 * A user should only have one transaction at any given moment.
 * 
 * @param {UserID} userID ID of a Pokebot user.
 * 
 * @returns {string} String of the transaction type the user
 * is currently in, or null if the user is not in a transaction.
 */
function isInTransaction(userID) {
    let index = transactions.map(function(t) { return t.userID; }).indexOf(userID);
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
    let index = transactions.map(function(t) { return t.userID; }).indexOf(userID);
    if (index > -1) {
        transactions.splice(index, 1);
    }
}

/**
 * Checks if a user currently has a Pokemon that
 * is evolving.
 * 
 * @param {UserID} userID ID of a Pokebot user.
 * 
 * @returns {Evolution} Evolution object of the currently
 * evolving Pokemon, or null if the user does not have any
 * Pokemon that are evolving.
 */
function isInEvolution(userID) {
    let index = evolving.map(function(t) { return t.userID; }).indexOf(userID);
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
    let index = evolving.map(function(t) { return t.userID; }).indexOf(userID);
    if (index > -1) {
        evolving.splice(index, 1);
    }
}

/**
 * Checks if a user is currently trading Pokemon
 * with another user.
 * 
 * @param {UserID} userID ID of a Pokebot user.
 * 
 * @returns {Trade} Trade object of the users who are trading
 * with each other, or null if the user is not in the trading
 * process.
 */
function isInTrade(userID) {
    let index = trading.map(function(t) { return t.userAsk; }).indexOf(userID);
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
    let index = trading.map(function(t) { return t.userAsk; }).indexOf(userID);
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
    let pkmn = parseJSON(generatePokemonJSONPath(name, form));
    let url;

    let lower = pkmn.name.toLowerCase();
    
    /* Pokemon names are not always the same as the file names. */
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
    
    if (form != null) {
        form = form.toLowerCase();
        /**
         * Oricorio has a form name with an apostrophe in it.
         */
        form = form.replace(/'/g,"-");
        /**
         * Multiple Pokemon have form names with spaces in it.
         */
        form = form.replace(/ /g,"-");
        /**
         * Vivillon has a form name with an acute e in it.
         */
        form = form.replace(/é/g,"e");
        lower += "-" + form;
    } else {
        if (gender === "Female") {
            if (hasGenderDifference(name) === true) {
                lower += "-f";
            }
        }
    }
    
    /* If pokemon is shiny. */
    let dir = "../gfx/models";
    if (shiny === 1) {
        dir = "../gfx/models/shiny";
    }
    
    url = dir + "/" + lower + ".gif";
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
    /**
     * @todo Standardize sprite icon names for forms.
     */
    let pkmn = parseJSON(generatePokemonJSONPath(name));
    
    let dexnum = pkmn.national_id;
    let url;
    url = dexnum.toString();
    /* Prepends 0s to the string if less than three characters long. */
    url = url.padStart(3, '0');
    
    /* Gets proper image if the pokemon has a form. */
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
 * Generates a relative file path for an items's JSON file.
 * 
 * @param {string} name The name of the item.
 * 
 * @returns {string} Relative file path to the item's JSON file.
 */
function generateItemJSONPath(name) {
    name = name.toLowerCase();
    name = name.replace(/\./gi, '');
    name = name.replace(/\-/gi, '_');
    name = name.replace(/\'/gi, '_');
    name = name.replace(/ /gi, '_');
    name = name.replace(/\é/gi, 'e');
    let path = '../data/items/' + name + '.json';
    return path;
}

/**
 * Generates a file path to the JSON file for a specific Pokemon species.
 * 
 * @param {string} name The name of the Pokemon.
 * 
 * @returns {string} File path to the JSON file.
 */
function generatePokemonJSONPath(name, form) {
    let lower = name.toLowerCase();

    /* Pokemon names are not always the same as the file names. */
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

    if (form != null) {
        form = form.toLowerCase();
        /**
         * Oricorio has a form name with an apostrophe in it.
         */
        form = form.replace(/'/g,"-");
        /**
         * Multiple Pokemon have form names with spaces in it.
         */
        form = form.replace(/ /g,"-");
        /**
         * Vivillon has a form name with an acute e in it.
         */
        form = form.replace(/é/g,"e");
        lower = lower + "-" + form;
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
    let wasUserCreated = true;
    let location = getDefaultLocationOfRegion(region);
    if (location === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    if (name === null) {
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
    
    /**
     * @todo fix this.
     */
    let description = message.author.username + " here is your starter.";
    let embed = generateWildPokemonEmbed(starter, message, description);
    let modelLink = generateModelLink(starter.name, starter.shiny, starter.gender, starter.form);
    let imageName = await getGifName(starter.name);
    await sendMessageWithAttachments(message.channel, embed, [{ attachment: modelLink, name: (imageName + '.gif') }]);
    
    let accept = await confirmStarter(message, userID);
    /* If user rejects starter. */
    if (!accept) {
        wasUserCreated = false;
    } else {
        starter.nick = await nicknamePokemon(message, starter);

        let userSet = {
            user_id: userID,
            level: 5,
            region: starter.region,
            location: starter.location,
            field: "Walking",
            lead: null,
            money: 5000,
            lotto: "2018-06-21T00:12:45-04:00"
        }

        let prefsSet = {
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

        let ballSet = {
            owner: userID,
            name: "Poké Ball",
            quantity: 10,
            category: "Ball",
            subcategory: "Ball"
        }

        let visaSet = {
            owner: userID,
            name: (region + " Visa"),
            quantity: 1,
            category: "Key Item",
            subcategory: "Visa"
        }

        try {
            await doQuery("INSERT INTO user SET ?", [userSet]);
            await doQuery("INSERT INTO user_prefs SET ?", [prefsSet]);
            await doQuery("INSERT INTO item SET ?", [ballSet]);
            await doQuery("INSERT INTO item SET ?", [visaSet]);
            let newPokemon = await addPokemon(userID, starter);
            await doQuery("UPDATE user SET user.lead = ? WHERE user.user_id = ?", [newPokemon, userID]);
        } catch (err) {
            wasUserCreated = false;
        }
    }

    return new Promise(function(resolve) {
        resolve(wasUserCreated);
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
    await sendMessage(message.channel, (message.author.username + " are you ok with this Pokémon? Type \"Yes\" to accept or \"No\" to choose a new starter Pokémon. You can also type \"Cancel\" to begin your adventure later."));
    
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
            await sendMessage(message.channel, (message.author.username + ", your response was not recognized. Type \"Yes\" to accept or \"No\" to choose a new starter Pokémon. You can also type \"Cancel\" to begin your adventure later."));
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
        return new Promise(function(resolve) {
            resolve(null);
        });
    } else if (region === "Kanto") {
        await sendMessage(message.channel, (message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Bulbasaur\n2. Charmander\n3. Squirtle```"));
    } else if (region === "Johto") {
        await sendMessage(message.channel, (message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Chikorita\n2. Cyndaquil\n3. Totodile```"));
    } else if (region === "Hoenn") {
        await sendMessage(message.channel, (message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Treecko\n2. Torchic\n3. Mudkip```"));
    } else if (region === "Sinnoh") {
        await sendMessage(message.channel, (message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Turtwig\n2. Chimchar\n3. Piplup```"));
    } else if (region === "Unova") {
        await sendMessage(message.channel, (message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Snivy\n2. Tepig\n3. Oshawott```"));
    } else if (region === "Kalos") {
        await sendMessage(message.channel, (message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Chespin\n2. Fennekin\n3. Froakie```"));
    } else { /* Alola */
        await sendMessage(message.channel, (message.author.username + ", please select a starter by either typing its number in the list or its name:\n```1. Rowlet\n2. Litten\n3. Popplio```"));
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
                    await sendMessage(message.channel, (name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection."));
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
                    await sendMessage(message.channel, (name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection."));
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
                    await sendMessage(message.channel, (name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection."));
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
                    await sendMessage(message.channel, (name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection."));
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
                    await sendMessage(message.channel, (name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection."));
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
                    await sendMessage(message.channel, (name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection."));
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
                    await sendMessage(message.channel, (name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection."));
                    selectedStarter = null;
                }
            } else {
                await sendMessage(message.channel, (name + " selected an invalid Pokémon. Please select a starter by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection."));
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
    await sendMessage(message.channel, (message.author.username + ", please select a region to start in by either typing its number in the list or its name:\n```1. Kanto\n2. Johto\n3. Hoenn\n4. Sinnoh\n5. Unova\n6. Kalos\n7. Alola```\nBe aware that you will not immediately be able to change regions. Type \"cancel\" to cancel region selection."));
    
    let cancel = false;
    let selectedRegion = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
        .then(collected => {
            selectedRegion = collected.first().content.toString().toLowerCase();
        })
        .catch(collected => {
            console.error(collected);
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
            await sendMessage(message.channel, (message.author.username + " selected an invalid region. Please select a region by typing its name or its number as shown in the selection list, or type \"cancel\" to cancel your selection."));
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
    let wereNoErrorsEncountered = true;
    let region = regionName.toLowerCase();
    /* Get the proper name of the region. */
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

    /* Only change user's region is user exists, is in a region, and that region is not the same as the region the user wants to go to. */
    let user = await getUser(message.author.id);
    if (user != null) {
        let bag = await getBag(message.author.id);
        if (bag != null) {
            if (region === user.region) {
                wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you are already in the " + region + " region."));
            } else {
                let doesUserHaveVisa = bag.map(function(t) { return t.name; }).indexOf(region + " Visa");
                if (doesUserHaveVisa >= 0 ) {
                    let loc = getDefaultLocationOfRegion(region);
                    if (await doQuery("UPDATE user SET region = ?, location = ? WHERE user.user_id = ?", [region, loc, message.author.id]) != null) {
                        wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " traveled to the " + region + " region! You are now located at " + loc + "."));
                    } else {
                        wereNoErrorsEncountered = false;
                    }
                } else {
                    wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you must obtain a " + region + " Visa before you can travel to " + region + "."));
                }
            }
        }
    } else {
        wereNoErrorsEncountered = false;
    }

    return new Promise(function(resolve) {
        resolve(wereNoErrorsEncountered);
    });
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
    let wereNoErrorsEncountered = true;
    let user = await getUser(message.author.id);
    /* Only change user's location is user exists, the specified location exists within the user's region,
    and the user's current location is not the same as the location the user wants to go to. */
    if (user != null) {
        if (user.region != null) {
            let loc = getFullLocationName(user.region, locationName);
            if (loc != null) {
                if (loc === user.location) {
                    wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you are already located at " + loc + "."));
                } else {
                    if (await doQuery("UPDATE user SET location = ?, field = 'Walking' WHERE user.user_id = ?", [loc, message.author.id]) != null) {
                        wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " is now walking at " + loc + "."));
                    } else {
                        wereNoErrorsEncountered = false;
                    }
                }
            } else {
                await sendMessage(message.channel, (message.author.username + " failed to go to " + locationName + ". " + duck));
                wereNoErrorsEncountered = false;
            }
        }
    } else {
        wereNoErrorsEncountered = false;
    }

    return new Promise(function(resolve) {
        resolve(wereNoErrorsEncountered);
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
    let wasMessageSent = false;
    let user = await getUser(message.author.id);
    if (user != null && user.region != null) {
        let region = parseJSON(generateRegionJSONPath(user.region));
        let locationsIndex;
        let embedfields = [];
        let fieldsCount = 0;
        let locationName = null;
        for (locationsIndex = 0; locationsIndex < region.locations.length; locationsIndex++) {
            if (locationName == null) {
                locationName = region.locations[locationsIndex].names.en;
            } else if (locationsIndex % 20 === 0) {
                let name = "Locations";
                if (fieldsCount > 0) {
                    name = "Locations (cont.)";
                }
                embedfields[fieldsCount] = {
                    "name": name,
                    "value": locationName,
                    "inline": true
                }
                locationName = region.locations[locationsIndex].names.en;
                fieldsCount++;
            }else {
                locationName += "\n" + region.locations[locationsIndex].names.en;
            }
        }

        if (locationName != null) {
            let name = "Locations";
                if (fieldsCount > 0) {
                    name = "Locations (cont.)";
                }
                embedfields[fieldsCount] = {
                    "name": name,
                    "value": locationName,
                    "inline": true
                }
        }

        let embed = {
            "author": {
                "name": "The " + user.region + " Region"
            },
            "fields": embedfields
        };

        wasMessageSent = await sendMessage(message.channel, {embed});
    }

    return new Promise(function(resolve) {
        resolve(wasMessageSent);
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
    let wasMessageSent = false;
    let user = await getUser(message.author.id);
    if (user != null) {
        let imageOfLocation = generateLocationImagePath(user.region, user.location);
        let field = "Walking around.";
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
                    "name":  "Region",
                    "value": user.region,
                    "inline": false
                },
                {
                    "name":  "Location",
                    "value": user.location,
                    "inline": false
                },
                {
                    "name":  "\u200b",
                    "value": "*" + field + "*",
                    "inline": false
                }
            ]
        };
    
        wasMessageSent = await sendMessageWithAttachments(message.channel, embed, [{ attachment: imageOfLocation, name: "location.png" }]);
    }

    return new Promise(function(resolve) {
        resolve(wasMessageSent);
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
    let fullLocationName = null;
    let list = parseJSON(generateRegionJSONPath(region));
    let locationName = name.toLowerCase();
    let locationsIndex;
    for (locationsIndex = 0; locationsIndex < list.locations.length; locationsIndex++) {
        let loc = list.locations[locationsIndex].names.en.toLowerCase();
        if (~loc.indexOf(locationName)) {
            fullLocationName = list.locations[locationsIndex].names.en;
        }
    }
    return fullLocationName;
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
    let defaultLocation = null;
     if (region === "Kanto") {
        defaultLocation = "Pallet Town";
    } else if (region === "Johto") {
        defaultLocation = "New Bark Town";
    } else if (region === "Hoenn") {
        defaultLocation = "Littleroot Town";
    } else if (region === "Sinnoh") {
        defaultLocation = "Twinleaf Town";
    } else if (region === "Unova") {
        defaultLocation = "Aspertia City";
    } else if (region === "Kalos") {
        defaultLocation = "Vaniville Town";
    } else if (region === "Alola") {
        defaultLocation = "Route 1";
    }

    return defaultLocation;
}

/**
 * Gets the user's lead Pokemon.
 * 
 * @param {string} userId The Discord id of the user.
 * 
 * @returns {Pokemon} The user's lead Pokemon if they have one,
 * otherwise null.
 */
async function getLeadPokemon(userId) {
    let leadPokemon = null;
    let user = await getUser(userId);
    if (user != null) {
        let lead = await doQuery('SELECT * FROM pokemon WHERE pokemon_id = ?', [user.lead]);
        if (lead != null) {
            leadPokemon = lead[0];
        }
    }

    return new Promise(function(resolve) {
        resolve(leadPokemon);
    });
}

/**
 * Gets a user's evolving Pokemon. A user should only have
 * at most one evolving Pokemon at any given time.
 * 
 * @param {string} userId The Discord id of the user.
 * 
 * @returns {Pokemon} The user's evolving Pokemon,
 * or null if the user does not have an evolving Pokemon.
 */
async function getEvolvingPokemon(userId) {
    let evolvingPokemon = await doQuery('SELECT * FROM pokemon WHERE pokemon.evolving = 1 AND pokemon.current_trainer = ?', [userId]);
    if (evolvingPokemon != null && evolvingPokemon.length > 0) {
        evolvingPokemon = evolvingPokemon[0];
    } else {
        evolvingPokemon = null;
    }
    return new Promise(function(resolve) {
        resolve(evolvingPokemon);
    });
}

/**
 * Gets a Discord user who uses Pokebot.
 * 
 * @param {string} userId The Discord id of the user.
 * 
 * @returns {User} The User object of the requested user,
 * or null if the user doesn't exist in the database.
 */
async function getUser(userId) {
    let user = await doQuery('SELECT * FROM user, user_prefs WHERE user.user_id = ? AND user_prefs.user_id = ?', [userId, userId]);
    if (user != null) {
        user = user[0];
    }
    return new Promise(function(resolve) {
        resolve(user);
    });
}

/**
 * Gets all items owned by a user.
 * 
 * @param {string} userId The Discord id of the user.
 * 
 * @returns {Item[]} All items owned by a user, or null
 * if no items were found.
 */
async function getBag(userId) {
    let bag = await doQuery('SELECT * FROM item WHERE item.owner = ? AND item.quantity > 0', [userId]);
    /* Need to return the whole list of items, not just a single row. */
    return new Promise(function(resolve) {
        resolve(bag);
    });
}

/**
 * Gets all Pokemon owned by a user.
 * 
 * @param {string} userId The Discord id of the user.
 * 
 * @returns {Pokemon[]} A list of all Pokemon currently owned
 * by the user.
 */
async function getPokemon(userId) {
    let pokemon = await doQuery('SELECT * FROM pokemon WHERE current_trainer = ? AND pokemon.daycare IS NULL', [userId]);
    /* Need to return the whole list of Pokemon, not just a single row. */
    return new Promise(function(resolve) {
        resolve(pokemon);
    });
}

/**
 * Gets all Pokemon owned by a user that are currently
 * in the day care.
 * 
 * @param {string} userId The Discord id of the user.
 * 
 * @returns {Pokemon[]} A list of all the user's Pokemon
 * that are currently in the day care.
 */
async function getDaycare(userId) {
    let daycarePokemon = await doQuery(`SELECT * FROM daycare WHERE trainer = ?`, [userId]);
    /* Need to return the whole list of Pokemon, not just a single row. */
    return new Promise(function(resolve) {
        resolve(daycarePokemon);
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
    let evolvingPokemon = await doQuery('SELECT * FROM pokemon WHERE pokemon.evolving = 1', []);
    if (evolvingPokemon === null) {
        wereAllEvolutionsFixed = false;
    } else {
        let evolvingPokemonIndex;
        for (evolvingPokemonIndex = 0; evolvingPokemonIndex < evolvingPokemon.length; evolvingPokemonIndex++) {
            if (evolvingPokemon[evolvingPokemonIndex].evolving === 1) {
                let user = await getUser(evolvingPokemon[evolvingPokemonIndex].current_trainer);
                if (user === null) {
                    wereAllEvolutionsFixed = false;
                } else {
                    let evolvingInto = await checkEvolveUponLevelUp(user, evolvingPokemon[evolvingPokemonIndex]);
                    if (evolvingInto != null) {
                        evolving[evolving.length] = new Evolution(evolvingPokemon[evolvingPokemonIndex].current_trainer, evolvingPokemon[evolvingPokemonIndex].name, evolvingInto);
                    } else {
                        wereAllEvolutionsFixed = false;
                    }
                }
            }
        }
    }

    return new Promise(function(resolve) {
        resolve(wereAllEvolutionsFixed);
    });
}

/**
 * Gets all Poke Balls owned by a user, including
 * Great Balls, Net Balls, etc.
 * 
 * @param {string} userId The Discord id of the user.
 * 
 * @returns {Item[]} All Poke Balls owned by a user.
 */
async function getBalls(userId) {
    let balls = await doQuery(`SELECT * FROM pokebot.item WHERE owner = ? AND category = "Ball" AND quantity > 0`, [userId]);
    /* Need to return the whole list of balls, not just a single row. */
    return new Promise(function(resolve) {
        resolve(balls);
    });
}

/**
 * Gets all fishing rods owned by a user.
 * 
 * @param {string} userId The Discord id of the user.
 * 
 * @returns {Item[]} All fishing rods owned by the user.
 */
async function getRods(userId) {
    let rods = await doQuery(`SELECT * FROM pokebot.item WHERE owner = ? AND category = "Key Item" AND name LIKE '% Rod' AND quantity > 0`, [userId]);
    /* Need to return the whole list of rods, not just a single row. */
    return new Promise(function(resolve) {
        resolve(rods);
    });
}

/**
 * Gets an item from the item table in the database.
 * 
 * @param {string} itemId The primary key of the item.
 * 
 * @returns {Item} The item with the specified id, or
 * null if there is no item with that id.
 */
async function getItem(itemId) {
    let item = await doQuery('SELECT * FROM item WHERE item.item_id = ?', [itemId]);
    if (item != null && item.length > 0) {
        item = item[0];
    } else {
        item = null;
    }
    return new Promise(function(resolve) {
        resolve(item);
    });
}

/**
 * Changes a list of move objects into a list of just the move names.
 * 
 * @param {Move[]} moves The list of moves to convert.
 * 
 * @returns {string[]} The name of each move in the same order as the objects were.
 */
function convertMoveObjectsToNames(moves) {
    let nameIndex = 0;
    for (nameIndex; nameIndex < moves.length; nameIndex++) {
        moves[nameIndex] = moves[nameIndex].name;
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
    let wereNoErrorsEncountered = true;
    let user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    let lead = await getLeadPokemon(user.user_id);
    if (lead === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    let locationData = parseJSON(generateLocationJSONPath(user.region, user.location));
    let moves = convertMoveObjectsToNames(await getPokemonKnownMoves(lead.pokemon_id));
    
    if (field === "Walking") {
        if (user.field === "Walking") {
            wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you are already walking."));
        } else {
            if (await doQuery("UPDATE user SET field = ? WHERE user.user_id = ?", [field, message.author.id]) === null) {
                wereNoErrorsEncountered = false;
            }
        }
    } else if (field === "Surfing") {
        if (user.field === "Surfing") {
            wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you are already surfing."));
        } else if (locationData === null) {
            wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you cannot surf here."));
        } else {
            /* If user's lead Pokemon knows the move Surf. */
            if (moves.indexOf("Surf") >= 0) {
                let canSurf = false;
                let wildPokemonIndex;
                /* Checks if any wild Pokemon in the user's current location are found by surfing.
                Presumably if there aren't any Pokemon found by surfing, then its not a location with
                reachable water and therefore the user shouldn't be able to surf there. */
                for (wildPokemonIndex = 0; wildPokemonIndex < locationData.pokemon.length; wildPokemonIndex++) {
                    if (locationData.pokemon[wildPokemonIndex].field === "Surfing") {
                        canSurf = true;
                        break;
                    }
                }
                if (canSurf) {
                    if (await doQuery("UPDATE user SET field = ? WHERE user.user_id = ?", [field, message.author.id]) === null) {
                        await sendMessage(message.channel, (message.author.username + " failed to surf."));
                        wereNoErrorsEncountered = false;
                    } else {
                        wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " is now surfing."));
                    }
                } else {
                    wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you cannot surf here."));
                }
            } else {
                wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " your lead Pokémon must know the move Surf!"));
            }
        }
    } else if (field === "Dive") {
        if (user.field === "Diving") {
            wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you are already diving."));
        } else if (locationData === null) {
            wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you cannot dive here."));
        } else {
            if (moves.indexOf("Dive") >= 0) {
                let canDive = false;
                let wildPokemonIndex;
                for (wildPokemonIndex = 0; wildPokemonIndex < locationData.pokemon.length; wildPokemonIndex++) {
                    if (locationData.pokemon[wildPokemonIndex].field === "Dive") {
                        canSurf = true;
                        break;
                    }
                }
                if (canDive) {
                    if (await doQuery("UPDATE user SET field = ? WHERE user.user_id = ?", [field, message.author.id]) === null) {
                        await sendMessage(message.channel, (message.author.username + " failed to dive."));
                        wereNoErrorsEncountered = false;
                    } else {
                        wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " is now diving."));
                    }
                } else {
                    wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you cannot dive here."));
                }
            } else {
                wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " your lead Pokémon must know the move Dive!"));
            }
        }
    } else if (field === "Headbutt") {
        if (user.field === "Headbutt") {
            wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you are already headbutting trees."));
        } else if (locationData === null) {
            wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you cannot headbutt any trees here."));
        } else {
            if (moves.indexOf("Headbutt") >= 0) {
                let canHeadbutt = false;
                let wildPokemonIndex;
                for (wildPokemonIndex = 0; wildPokemonIndex < locationData.pokemon.length; wildPokemonIndex++) {
                    if (locationData.pokemon[wildPokemonIndex].field === "Headbutt") {
                        canSurf = true;
                        break;
                    }
                }
                if (canHeadbutt) {
                    if (await doQuery("UPDATE user SET field = ? WHERE user.user_id = ?", [field, message.author.id]) === null) {
                        await sendMessage(message.channel, (message.author.username + " failed to begin headbutting trees."));
                        wereNoErrorsEncountered = false;
                    } else {
                        wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " is now headbutting trees."));
                    }
                } else {
                    wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " there is no point in headbutting trees here."));
                }
            } else {
                wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " your lead Pokémon must know the move Headbutt!"));
            }
        }
    } else if (field === "Rock Smash") {
        if (user.field === "Rock Smash") {
            wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you are already smashing rocks."));
        } else if (locationData === null) {
            wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you cannot smash rocks here."));
        } else {
            if (moves.indexOf("Rock Smash") >= 0) {
                let canRockSmash = false;
                let wildPokemonIndex;
                for (wildPokemonIndex = 0; wildPokemonIndex < locationData.pokemon.length; wildPokemonIndex++) {
                    if (locationData.pokemon[wildPokemonIndex].field === "Rock Smash") {
                        canSurf = true;
                        break;
                    }
                }
                if (canRockSmash) {
                    if (await doQuery("UPDATE user SET field = ? WHERE user.user_id = ?", [field, message.author.id]) === null) {
                        await sendMessage(message.channel, (message.author.username + " failed to begin smashing rocks."));
                        wereNoErrorsEncountered = false;
                    } else {
                        wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " is now smashing rocks."));
                    }
                } else {
                    wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " there is no point in smashing rocks here."));
                }
            } else {
                wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " your lead Pokémon must know the move Rock Smash!"));
            }
        }
    } else if (field === "Fish") {
        /**
         * The fishing rods owned by the user.
         */
        let rods = await getRods(user.user_id);
        if (rods === null) {
            return new Promise(function(resolve) {
                resolve(false);
            });
        }

        let rodFound = false;
        /**
         * The rod selected by the user to fish with.
         */
        let selectedRod = null;
        let canFish = false;
        let rod_count;
        let unusedRods = [];
        /* Gets all fishing rods owned by the user that the user is not currently using.
        For example, if a user already owns all three rods but is currently fishing with
        a Great Rod, this list will only contain the Old Rod and Super Rod. */
        for (rod_count = 0; rod_count < rods.length; rod_count++) {
            unusedRods[unusedRods.length] = rods[rod_count].name;
            rodFound = true;
        }
        /* If user doesn't own any fishing rods that are not currently in use. */
        if (unusedRods.length < 1) {
            /* If user is already fishing with the only rod the user owns. */
            if (rodFound) {
                wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you are already fishing with a " + user.field + "."));
            /* If user owns no fishing rods at all. */
            } else {
                wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " you do not own any fishing rods."));
            }
        /* If user only owns two rods and one of the rods is currently in use, then
        automatically swap to the unused rod. */
        } else if (unusedRods.length === 1){
            selectedRod = unusedRods[0];
        /* If user owns multiple rods that are not currently being used, then
        the user is prompted to select which unused rod to begin using. */
        } else if (unusedRods.length > 1) {
            transactions[transactions.length] = new Transaction(message.author.id, "selecting a fishing rod");
            let input = null;
            let cancel = false;
            let string = (message.author.username + " you have multiple fishing rods. Please select a rod from the list below by typing its name or number as shown in the list, or type \"Cancel\" to stop selecting a rod.\n ```");
            for (i = 0; i < rods.length; i++) {
                string += ((i + 1).toString() + ". " + rods[i].name + "\n");
            }
            string += "```";
            
            await sendMessage(message.channel, string);

            while (cancel == false) {
                await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
                .then(collected => {
                    input = collected.first().content.toString().toLowerCase();
                })
                .catch(collected => {
                    console.error(collected);
                    input = "cancel";
                    cancel = true;
                });
                if (input === "cancel") {
                    cancel = true;
                    input = null
                } else if (/^\d+$/.test(input)) {
                    let num = Number(input);
                    if (num > 0 && num <= rods.length) {
                        cancel = true;
                        input = (num - 1);
                    } else {
                        await sendMessage(message.channel, (message.author.username + " that number is not a valid choice. " + string));
                        input = null;
                    }
                } else if (input != null) {
                    let rodsIndex;
                    let match = false;
                    for (rodsIndex = 0; rodsIndex < rods.length; rodsIndex++) {
                        if (rods[rodsIndex].name.toLowerCase() === input) {
                            input = rodsIndex;
                            match = true;
                            cancel = true;
                        }
                    }
                    if (!match) {
                        await sendMessage(message.channel, (message.author.username + "you do not own a fishing rod with that name. " + string));
                        input = null;
                    }
                } else {
                    input = null;
                }
            }
            
            removeTransaction(message.author.id);
            
            if (input === null) {
                wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " cancelled their fishing rod selection."));
                selectedRod = null;
            } else {
                selectedRod = rods[input].name;
            }
        } else {
            wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " your don't have any fishing rods!"));
            selectedRod = null;
        }
        
        if (selectedRod != null) {
            if (locationData === null) {
                wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " there are no Pokémon to fish for here using the " + selectedRod + "."));
            } else {
                let wildPokemonIndex;
                for (wildPokemonIndex = 0; wildPokemonIndex < locationData.pokemon.length; wildPokemonIndex++) {
                    if (locationData.pokemon[wildPokemonIndex].field === selectedRod) {
                        canFish = true;
                    }
                }
                
                if (canFish) {
                    if (await doQuery("UPDATE user SET field = ? WHERE user.user_id = ?", [field, message.author.id]) === null) {
                        await sendMessage(message.channel, (message.author.username + " failed to fish with the " + selectedRod + "."));
                        wereNoErrorsEncountered = false;
                    } else {
                        wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " is now fishing with the " + selectedRod + "."));
                    }
                } else {
                    wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " there are no Pokémon to fish for here using the " + selectedRod + "."));
                }
            }
        }
    }

    return new Promise(function(resolve) {
        resolve(wereNoErrorsEncountered);
    });
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
 * the user, or null if the user declines.
 */
async function nicknamePokemon(message, pokemon) {
    let spriteLink = generateSpriteLink(pokemon.name, pokemon.gender, pokemon.form);
    let embed = {
        "author": {
            "name": pokemon.name,
            "icon_url": spriteLink,
        },
        "title": "Nickname",
        "description": message.author.username + " would you like to nickname your **" + pokemon.name + "** ? React with ✅ to accept or ❌ to decline.",
        "thumbnail": {
            "url": "attachment://" + pokemon.name + ".gif"
        }
    };

    let modelLink = generateModelLink(pokemon.name, pokemon.shiny, pokemon.gender, pokemon.form);
    let nicknameMessage = await sendMessageWithAttachments(message.channel, embed, [{ attachment: modelLink, name: (pokemon.name + '.gif') }], true);

    await nicknameMessage.react('✅');
    await nicknameMessage.react('❌');

    const filter = (reaction, user) => {
        return ['✅','❌'].includes(reaction.emoji.name) && user.id === message.author.id;
    };

    const YES_NICKNAME = true;
    const NO_NICKNAME = null;
    let input = NO_NICKNAME;

    await nicknameMessage.awaitReactions(filter, { max: 1, time: 300000, errors: ['time'] })
    .then(collected => {
        const reaction = collected.first();

        if (reaction.emoji.name === "✅") {
            input = YES_NICKNAME;
        } else if (reaction.emoji.name === "❌") {
            input = NO_NICKNAME;
        }
    })
    .catch(() => {
        selectedBall = null;
    });

    nicknameMessage.delete(0);
    
    if (input === YES_NICKNAME) {
        await sendMessage(message.channel, (message.author.username + " enter the nickname of the **" + pokemon.name + "** you just received. Type its name exactly how you want it to be nicknamed, or type its current name to cancel the nicknaming. The nickname cannot be longer than 20 characters."));
    
        cancel = false;
        /* After this assingment, input represents the Pokemon's nickname rather than the user's
        yes or no response on whether or not they want to nickname their Pokemkon. */
        input = NO_NICKNAME;

        while(cancel === false) {
            await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
            .then(collected => {
                input = collected.first().content.toString();
            })
            .catch(collected => {
                console.error(collected);
                input = NO_NICKNAME;
                cancel = true;
            });
            
            if (input != NO_NICKNAME) {
                input = input.trim();
                if (input === name) {
                    cancel = true;
                    input = NO_NICKNAME;
                } else if (input.length > 0 && input.length <= 20) {
                    cancel = true;
                } else if (input.length <= 0 || input.length > 20) {
                    await sendMessage(message.channel, (message.author.username + " that nickname was not valid. Enter the nickname of the **" + name + "** you just received. Type its name exactly how you want it to be nicknamed, or type its current name to cancel the nicknaming. The nickname cannot be longer than 20 characters."));
                    input = NO_NICKNAME;
                } else {
                    input = NO_NICKNAME;
                }
            }
    
            /**
             * @todo Profanity filter needs to go here.
             */
        }
    }
    
    if (input != NO_NICKNAME) {
        await sendMessage(message.channel, (message.author.username + " nicknamed their **" + pokemon.name + "** '**" + input + "**'."));
    } else {
        await sendMessage(message.channel, (message.author.username + " decided not to nickname their **" + pokemon.name + "**."));
    }

    return new Promise(function(resolve) {
        resolve(input);
    });
}


/**
 * Gets the name of the JSON file containing
 * information about a Pokemon move.
 * 
 * @param {string} name The name of the move.
 * 
 * @returns {string} The relative file path of the move's JSON file.
 */
function generateMoveJSONPath(name) {
    name = name.toLowerCase();
    
    /* Moves with ambiguous names. */
    if (name === "10000000 volt thunderbolt") {
        name = "10 000 000 volt thunderbolt";
    }

    name = name.replace(/-/g,"_");
    name = name.replace(/'/g,"_");
    name = name.replace(/,/g,"_");
    name = name.replace(/ /g,"_");

    return "../data/move/" + name + ".json";
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
    let path = generateMoveJSONPath(moveName);
    let move = parseJSON(path);
    let pp = null;

    if (move != null) {
        pp = move.pp;
    }

    return pp;
}

/**
 * Gets the type of a move.
 * 
 * @param {string} moveName The name of the move.
 * 
 * @returns {number} The type of the move,
 * or null if an error was encountered.
 */
function getMoveType(moveName) {
    let path = generateMoveJSONPath(moveName);
    let move = parseJSON(path);
    let type = null;

    if (move != null) {
        type = move.type;
    }

    return type;
}

/**
 * Updates a user's Pokedex string by setting an index (minus one)
 * of that string to '`1`', where index is the Pokemon's national
 * Pokedex number.
 * 
 * @todo Check if user already has the Pokemon registered in their
 * Pokedex. This will save time by preventing both the substring call
 * and the database query.
 * 
 * @param {User} user The Pokebot user whose Pokedex is being updated.
 * @param {number} dexNum The national Pokedex number of the Pokemon
 * being added to the user's Pokedex.
 * 
 * @returns {Query} The result of the database query.
 */
async function addToPokedex(user, dexNum) {
    /* Prevent off by one error since Pokedex count starts at one. */
    dexNum = dexNum - 1;
    user.pokedex = user.pokedex.substring(0, dexNum) + '1' + user.pokedex.substring(dexNum + 1);
    let queryResult = await doQuery("UPDATE user SET user.pokedex = ? WHERE user.user_id = ?", [user.pokedex, user.user_id]);
    return new Promise(function(resolve) {
        resolve(queryResult);
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
    let movePP = [null, null, null, null];

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
    national_id = national_id.padStart(3, '0');

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
                slot: (i + 1)
            }
            await doQuery("INSERT INTO move SET ?", [move_set]);
        }
    }

    let user = await getUser(userid);
    await addToPokedex(user, pokemon.no);

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
    
    let doesOnlyContainDigits = /^\d+$/.test(item);
    let itemInBag = null;
    
    /**
     * If user is searching the item by name.
     * 
     * @warn This is not future-proof. A new item could eventually
     * be given a name with only digits.
     */
    if (!doesOnlyContainDigits) {
        let bagIndex;
        for (bagIndex = 0; bagIndex < bag.length; bagIndex++) {
            let lowerItem = bag[bagIndex].name.toLowerCase();
            if (lowerItem === item && (bag[bagIndex].category === "Item" || bag[bagIndex].category === "TM" || bag[bagIndex].category === "Key Item")) {
                itemInBag = bag[bagIndex];
                break;
            }
        }
    /* If user input the index of an item. */
    } else {
        if (item <= bag.length && (bag[item].category === "Item" || bag[item].category === "TM" || bag[item].category === "Key Item")) {
            itemInBag = bag[item];
        }
    }
    return itemInBag;
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
    
    let doesOnlyContainDigits = /^\d+$/.test(item);
    let itemInBag = null;
    let itemJSON;
    
    /**
     * If user is searching the item by name.
     * 
     * @warn This is not future-proof. A new item could eventually
     * be given a name with only digits.
     */
    if (!doesOnlyContainDigits) {
        let bagIndex;
        for (bagIndex = 0; bagIndex < bag.length; i++) {
            let lowerItem = bag[i].name.toLowerCase();
            if(lowerItem === item) {
                itemJSON = parseJSON(generateItemJSONPath(item));
                if (itemJSON != null && itemJSON.holdable === true) {
                    itemInBag = bag[i];
                    break;
                }
            }
        }
    /* If user input the index of an item. */
    } else {
        if (item <= bag.length) {
            itemJSON = parseJSON(generateItemJSONPath(bag[item].name));
            if (itemJSON != null && itemJSON.holdable === true) {
                itemInBag = bag[item];
                break;
            }
        }
    }

    return itemInBag;
}

/**
 * Inserts a certain quantity of one item into a user's bag.
 * 
 * @param {string} userId The Discord id of the user.
 * @param {string} itemName The name of the item being added.
 * @param {number} amount The quantity of the item being added.
 * 
 * @returns {boolean} True if the item was added to the user's bag.
 */
async function addItemToBag(userId, itemName, amount) {
    let wasItemAdded = false;
    let itemQuantity = await doQuery("SELECT * from item WHERE item.owner = ? AND item.name = ?", [userId, itemName]);
    let itemJSON = parseJSON(generateItemJSONPath(itemName));
    if (itemQuantity != null) {
        /* If user has never owned the item before, the item object will need to be inserted into the table. */
        if (itemQuantity.length < 1) {
            let itemSet = {
                owner: userId,
                name: itemJSON.name,
                quantity: amount,
                category: itemJSON.category,
                subcategory: itemJSON.subcategory
            }
            if (await doQuery("INSERT INTO item SET ?", [itemSet]) != null) {
                wasItemAdded = true;
            }
        /* If user has already owned the item before, only update its quantity. */
        } else {
            let quantity = bag[0].quantity + amount;
            if (await doQuery("UPDATE item SET quantity = ? WHERE item.owner = ? AND item.name = ?", [quantity, userId, itemName]) != null) {
                wasItemAdded = true;
            }
        }
    }

    return new Promise(function(resolve) {
        resolve(wasItemAdded);
    });
}

/**
 * Removes a certain quantity of one item from a user's bag.
 * 
 * @param {string} userId The Discord id of the user.
 * @param {string} itemName The name of the item being added.
 * @param {number} amount The quantity of the item being added.
 * 
 * @returns {boolean} True if the item was removed from the user's bag.
 */
async function removeItemFromBag(userId, itemName, amount) {
    let wasItemRemoved = false;
    let itemToRemove = await doQuery("SELECT * from item WHERE item.owner = ? AND item.name = ? AND item.quantity > 0", [userId, itemName]);
    if (itemToRemove != null) {
        /* If user owns the item to be removed. */
        if (itemToRemove.length > 0) {
            let updatedQuantity = itemToRemove[0].quantity - amount;
            /* Item quantities cannot be negative. */
            if (updatedQuantity >= 0) {
                if (await doQuery("UPDATE item SET item.quantity = ? WHERE item.owner = ? AND item.name = ?", [updatedQuantity, userId, itemName]) != null) {
                    wasItemRemoved = true;
                }
            }
        }
    }

    return new Promise(function(resolve) {
        resolve(wasItemRemoved);
    });
}

/**
 * Removes one item from a user's bag and gives it to the user's
 * lead Pokemon.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} item The name of the item to give.
 * 
 * @returns {boolean} True if the item was given.
 */
async function giveItem(message, item) {
    let wereNoErrorsEncountered = true;
    let wasItemGiven = false;

    let bag = await getBag(message.author.id);
    if (bag === null) {
        wereNoErrorsEncountered = false;
    }

    item = doesUserHaveHoldableItem(bag, item);
    if (item == null) {
        wereNoErrorsEncountered = false;
    }
    
    let lead = await getLeadPokemon(message.author.id);
    if (lead === null) {
        wereNoErrorsEncountered = false;
    }

    if (wereNoErrorsEncountered === true) {
        if (lead.item == null) {
            if (await doQuery("UPDATE pokemon SET pokemon.item = ? WHERE pokemon.pokemon_id = ?", [item.item_id, lead.pokemon_id]) != null) {
                await sendMessage(message.channel, (message.author.username + " gave the " + item.name + " to " + lead.name + "."));
                if (await removeItemFromBag(message.author.id, item.name, 1) === true) {
                    wasItemGiven = true;
                }
            }
        } else {
            if (lead.item != null) {
                await sendMessage(message.channel, (message.author.username + ", your " + lead.name + " is currently holding one " + lead.item + ". Would you like to swap items? Type \"Yes\" to swap or \"No\" to cancel the item assignment."));
                let cancel = false;
                let input = null;
                const RESPONSE_YES = 1;
                const RESPONSE_NO = -1;
                const RESPONSE_UNDECIDED = 0;
                while(cancel == false) {
                    await message.channel.awaitMessages(response => response.author.id === message.author.id, { max: 1, time: 30000, errors: ['time'] })
                    .then(collected => {
                        input = collected.first().content.toString().toLowerCase();
                    })
                    .catch(collected => {
                        console.error(collected);
                        input = RESPONSE_UNDECIDED;
                        cancel = true;
                    });
    
                    if (input === "no") {
                        cancel = true;
                        input = RESPONSE_NO;
                    } else if (input === "yes") {
                        cancel = true;
                        input = RESPONSE_YES;
                    } else if (input != null) {
                        await sendMessage(message.channel, (message.author.username + ", your response was not recognized. Type \"Yes\" to swap " + lead.item + " with " + item.name + " or \"No\" to cancel the item assignment."));
                        input = RESPONSE_UNDECIDED;
                    } else {
                        input = RESPONSE_UNDECIDED;
                    }
                }
                
                if (input === RESPONSE_YES) {
                    if (await doQuery("UPDATE pokemon SET pokemon.item = ? WHERE pokemon.pokemon_id = ?", [item.item_id, lead.pokemon_id]) != null) {
                        await sendMessage(message.channel, (message.author.username + " gave the " + item.name + " to " + lead.name + "."));
                        if (
                            await addItemToBag(message.author.id, lead.item, 1) === true
                            &&
                            await removeItemFromBag(message.author.id, item.name, 1) === true
                        ) {
                            wasItemGiven = true;
                        }
                    }
                }
            }
        }
    }
    
    return new Promise(function(resolve) {
        resolve(wasItemGiven);
    });
}

/**
 * Sets a Pokemon as evolving.
 * 
 * @param {string} pokemon The id of the Pokemon.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function addEvolutionToPokemon(pokemon) {
    let wasEvolutionAdded = false;
    if (await doQuery("UPDATE pokemon SET pokemon.evolving = 1 WHERE pokemon.pokemon_id = ?", [pokemon.pokemon_id]) != null) {
        wasEvolutionAdded = true;
    }
    return new Promise(function(resolve) {
        resolve(wasEvolutionAdded);
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
 * @todo Allow multiple moves with the same name.
 * 
 * @returns {boolean} True if the Pokemon's moves were updated.
 */
async function updateMoves(pokemon, moves) {
    await doQuery('UPDATE move SET move.slot = NULL WHERE move.pokemon = ? AND move.slot IS NOT NULL', [pokemon.pokemon_id]);
    
    let i = 0;
    for (i; i < moves.length; i++) {
        if (moves[i].name != null && moves[i].pp != null) {
            if (moves[i].id != 0) {
                await doQuery('UPDATE move SET move.slot = ? WHERE move.move_id = ?', [(i + 1), moves[i].id]);
            } else {
                let move_set = {
                    pokemon: pokemon.pokemon_id,
                    name: moves[i].name,
                    max_pp: moves[i].pp_max,
                    current_pp: moves[i].pp,
                    slot: (i + 1)
                }
                await doQuery('INSERT INTO move SET ?', [move_set]);
            }
        }
    }
}

/**
 * Creates a list of four empty moves and populates each move with
 * the name and PP of moves known by the Pokemon, leaving some moves
 * empty if the Pokemon knows less than four moves.
 * 
 * @param {Move[]} knownMoves The moves known by the Pokemon.
 * 
 * @returns {any[]} A list of four moves.
 */
function populateMoves(knownMoves) {
    let moves = [
        {
            name: null,
            pp: null,
            max_pp: null,
            id: null
        },
        {
            name: null,
            pp: null,
            max_pp: null,
            id: null
        },
        {
            name: null,
            pp: null,
            max_pp: null,
            id: null
        },
        {
            name: null,
            pp: null,
            max_pp: null,
            id: null
        }
    ]
    
    let knownMoveIndex = 0;
    for (knownMoveIndex; knownMoveIndex < knownMoves.length; knownMoveIndex++) {
        moves[knownMoveIndex].name = knownMoves[knownMoveIndex].name;
        moves[knownMoveIndex].pp = knownMoves[knownMoveIndex].current_pp;
        moves[knownMoveIndex].max_pp = knownMoves[knownMoveIndex].max_pp;
        moves[knownMoveIndex].id = knownMoves[knownMoveIndex].move_id;
    }

    return moves;
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
    let wereNoErrorsEncountered = true;
    let user = await getUser(message.author.id);
    if (user === null) {
        wereNoErrorsEncountered = false;
    }

    let bag = await getBag(user.user_id);
    if (bag === null) {
        wereNoErrorsEncountered = false;
    }
    
    item = doesUserHaveUsableItem(bag, item);
    if (item === null) {
        wereNoErrorsEncountered = false;
    }
    
    let lead = await getLeadPokemon(user.user_id);
    if (lead === null) {
        wereNoErrorsEncountered = false;
    }

    if (wereNoErrorsEncountered) {
        if (item.name.endsWith("Stone")) {
            wereNoErrorsEncountered = await useEvolutionStoneItem(message, item.name, lead);
        } else if (item.name.startsWith("TM")) {
            wereNoErrorsEncountered = await useTMItem(message, item.name, lead);
        }
    }
    
    return new Promise(function(resolve) {
        resolve(wereNoErrorsEncountered);
    });
}

/**
 * Uses an evolutionary stone on a Pokemon and evolves it
 * if the stone is compatible. Evolutionary stone evolutions
 * cannot be cancelled, so the user is not prompted to evolve
 * their Pokemon.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} item The name of the evolutionary stone used.
 * @param {Pokemon} lead The user's lead Pokemon.
 * 
 * @returns {boolean} True if no errors were encountered.
 */
async function useEvolutionStoneItem(message, item, lead) {
    let wereNoErrorsEncountered = true;
    let speciesToEvolveInto = null;
    if (item === "Fire Stone") {
        if (lead.name === "Vulpix" && lead.form != "Alolan") {
            speciesToEvolveInto = "Ninetails";
        } else if (lead.name === "Growlithe") {
            speciesToEvolveInto = "Arcanine";
        } else if (lead.name === "Eevee") {
            speciesToEvolveInto = "Flareon";
        } else if (lead.name === "Pansear") {
            speciesToEvolveInto = "Simisear";
        }
    } else if (item === "Water Stone") {
        if (lead.name === "Poliwhirl") {
            speciesToEvolveInto = "Poliwrath";
        } else if (lead.name === "Shellder") {
            speciesToEvolveInto = "Cloyster";
        } else if (lead.name === "Staryu") {
            speciesToEvolveInto = "Starmie";
        } else if (lead.name === "Eevee") {
            speciesToEvolveInto = "Vaporeon";
        } else if (lead.name === "Lombre") {
            speciesToEvolveInto = "Ludicolo";
        } else if (lead.name === "Panpour") {
            speciesToEvolveInto = "Simipour";
        }
    } else if (item === "Thunder Stone") {
        if (lead.name === "Pikachu") {
            speciesToEvolveInto = "Raichu";
        } else if (lead.name === "Eevee") {
            speciesToEvolveInto = "Jolteon";
        } else if (lead.name === "Eelektrik") {
            speciesToEvolveInto = "Eelektross";
        }
    } else if (item === "Leaf Stone") {
        if (lead.name === "Gloom") {
            speciesToEvolveInto = "Vileplume";
        } else if (lead.name === "Weepinbell") {
            speciesToEvolveInto = "Victreebel";
        } else if (lead.name === "Exeggcute") {
            speciesToEvolveInto = "Exeggutor";
        } else if (lead.name === "Nuzleaf") {
            speciesToEvolveInto = "Shiftry";
        } else if (lead.name === "Pansage") {
            speciesToEvolveInto = "Simisage";
        }
    } else if (item === "Moon Stone") {
        if (lead.name === "Nidorina") {
            speciesToEvolveInto = "Nidoqueen";
        } else if (lead.name === "Nidorino") {
            speciesToEvolveInto = "Nidoking";
        } else if (lead.name === "Clefairy") {
            speciesToEvolveInto = "Clefable";
        } else if (lead.name === "Jigglypuff") {
            speciesToEvolveInto = "Wigglytuff";
        } else if (lead.name === "Skitty") {
            speciesToEvolveInto = "Delcatty";
        } else if (lead.name === "Munna") {
            speciesToEvolveInto = "Musharna";
        }
    } else if (item === "Sun Stone") {
        if (lead.name === "Gloom") {
            speciesToEvolveInto = "Bellossom";
        } else if (lead.name === "Sunkern") {
            speciesToEvolveInto = "Sunflora";
        } else if (lead.name === "Cottonee") {
            speciesToEvolveInto = "Whimsicott";
        } else if (lead.name === "Petilil") {
            speciesToEvolveInto = "Lilligant";
        } else if (lead.name === "Helioptile") {
            speciesToEvolveInto = "Heliolisk";
        }
    } else if (item === "Shiny Stone") {
        if (lead.name === "Togetic") {
            speciesToEvolveInto = "Togekiss";
        } else if (lead.name === "Roselia") {
            speciesToEvolveInto = "Roserade";
        } else if (lead.name === "Minccino") {
            speciesToEvolveInto = "Cinccino";
        } else if (lead.name === "Floette") {
            speciesToEvolveInto = "Florges";
        }
    } else if (item === "Dusk Stone") {
        if (lead.name === "Murkrow") {
            speciesToEvolveInto = "Honchkrow";
        } else if (lead.name === "Misdreavus") {
            speciesToEvolveInto = "Mismagius";
        } else if (lead.name === "Lampent") {
            speciesToEvolveInto = "Chandelure";
        } else if (lead.name === "Doublade") {
            speciesToEvolveInto = "Aegislash";
        }
    } else if (item === "Dawn Stone") {
        if (lead.name === "Kirlia" && lead.gender === "Male") {
            speciesToEvolveInto = "Gallade";
        } else if (lead.name === "Snorunt" && lead.gender === "Female") {
            speciesToEvolveInto = "Frosslass";
        }
    } else if (item === "Ice Stone") {
        if (lead.name === "Sandshrew" && lead.form === "Alolan") {
            speciesToEvolveInto = "Sandslash";
        } else if (lead.name === "Vulpix" && lead.form === "Alolan") {
            speciesToEvolveInto = "Ninetails";
        }
    }

    if (speciesToEvolveInto != null) {
        await sendMessage(message.channel, ("<@" + message.author.id + "> your " + lead.name + " is evolving into " + speciesToEvolveInto + "!"));
        evolving[evolving.length] = new Evolution(message.author.id, lead.name, speciesToEvolveInto);
        if (
            await addEvolutionToPokemon(lead) === false
            ||
            await removeItemFromBag(message.author.id, item, 1) === false
            ||
            await evolve(message) === false
        ) {
            wereNoErrorsEncountered = false;
        }
    } else {
        wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " the " + item + " could not be used on your " + lead.name));
    }

    return new Promise(function(resolve) {
        resolve(wereNoErrorsEncountered);
    });
}

/**
 * Uses a Technical Machine (TM) on a Pokemon. This will automatically
 * teach the move to the Pokemon if the Pokemon has an available
 * move slot, doesn't already know the move, and can learn the TM.
 * If the Pokemon can learn the TM but doesn't have a free move
 * slot and doesn't already know the TM, then the user will be 
 * prompted to select a known move to replace or cancel teaching
 * the TM.
 * 
 * @todo Check if TMs can be used to teach a Pokemon a duplicate attack.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} item The name of the TM used, including the 'TM' prefix.
 * @param {Pokemon} lead The user's lead Pokemon.
 * 
 * @returns {boolean} True if no errors were encountered.
 */
async function useTMItem(message, item, lead) {
    let wereNoErrorsEncountered = true;
    let pkmn = parseJSON(generatePokemonJSONPath(lead.name, lead.form));
    if (pkmn != null) {
        let moveName;
        if (item.includes("Confide")) {
            moveName = item.substring(6, item.length);
        } else {
            moveName = item.substring(5, item.length);
        }

        let canLearnTM = false;
        let moveLearnsetIndex;
        for (moveLearnsetIndex = 0; moveLearnsetIndex < pkmn.move_learnset.length; moveLearnsetIndex++) {
            if (pkmn.move_learnset[moveLearnsetIndex].hasOwnProperty("tm") && pkmn.move_learnset[moveLearnsetIndex].tm === moveName) {
                canLearnTM = true;
                await teachMove(message, lead, pkmn.move_learnset[moveLearnsetIndex].move, false, false);
                break;
            }
        }
        if (!canLearnTM) {
            wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " your **" + lead.name + "** is unable to learn *" + moveName + "*."));
        }
    } else {
        wereNoErrorsEncountered = false;
    }

    return new Promise(function(resolve) {
        resolve(wereNoErrorsEncountered);
    });
}

/**
 * Teaches a new move to a Pokemon. If the Pokemon doesn't have a free
 * move slot, then the owner of the Pokemon is prompted to select an
 * existing move to replace. This function will update the move database.
 * 
 * @param {Message} message The Discord message sent from the user that triggered the Pokemon to learn a new move.
 * @param {Pokemon} pokemon The Pokemon that is learning the new move.
 * @param {string} newMove The name of the new move to teach.
 * @param {Move[]} currentMoves The list of moves known by the Pokemon.
 * @param {boolean} enableDuplicate If the Pokemon is allowed to learn the new move if it already knows the move.
 * @param {boolean} replacePP If the new move's Power Points should replace the Power Points of the move it replaces.
 * 
 * @returns {boolean} True if no errors were encountered.
 */
async function teachMove(message, pokemon, newMove, enableDuplicate, replacePP) {
    let isInDaycare = false;
    if (pokemon.daycare != null) {
        isInDaycare = true;
    }

    let currentMoves = await getPokemonKnownMoves(pokemon.pokemon_id);
    currentMoves = populateMoves(currentMoves);

    let wereNoErrorsEncountered = true;

    const NO_MOVE_REPLACED = -1;
    let replacedMoveIndex = NO_MOVE_REPLACED;

    let newMovePP = getMovePP(newMove);
    let wasMoveLearned = false;
    
    /**
     * Check if Pokemon already knows the TM move. 
     */
    let alreadyKnowsMove = false;
    let currentMovesIndex;
    for (currentMovesIndex = 0; currentMovesIndex < currentMoves.length; currentMovesIndex++) {
        if (currentMoves[currentMovesIndex].name === newMove) {
            alreadyKnowsMove = true;
            break;
        }
    }

    if (enableDuplicate || !alreadyKnowsMove) {
        /**
         * Check if the Pokemon has a free move slot.
         */
        for (currentMovesIndex = 0; currentMovesIndex < currentMoves.length; currentMovesIndex++) {
            if (currentMoves[currentMovesIndex].name === null) {
                if (!isInDaycare) {
                    await sendMessage(message.channel, (message.author.username + "'s **" + pokemon.name + "** learned *" + newMove + "*!"));
                }
                replacedMoveIndex = currentMovesIndex;
                wasMoveLearned = true;
                break;
            }
        }
        
        /**
         * If Pokemon has no free move slot.
         */
        if (!wasMoveLearned) {
            if (!isInDaycare) {
                transactions[transactions.length] = new Transaction(message.author.id, "teaching your " + pokemon.name + " " + newMove);
                replacedMoveIndex = await replaceMove(message, pokemon, newMove, currentMoves);
                removeTransaction(message.author.id);

                if (replacedMoveIndex === NO_MOVE_REPLACED) {
                    await sendMessage(message.channel, (message.author.username + " decided not to teach their **" + pokemon.name + "** *" + newMove + "*."));
                } else {
                    await sendMessage(message.channel, message.author.username + "'s **" + pokemon.name + "** forgot *" + currentMoves[replacedMoveIndex].name + "* and learned *" + newMove + "*!");
                }
            } else {
                replacedMoveIndex = await replaceMoveDayCare(pokemon);
            }
        }

        /**
         * If a known move was selected by the user to be replaced with the new move,
         * or if there was a free move slot.
         */
        if (replacedMoveIndex > NO_MOVE_REPLACED) {
            currentMoves[replacedMoveIndex].name = newMove;
            currentMoves[replacedMoveIndex].pp_max = newMovePP;
            currentMoves[replacedMoveIndex].id = 0;

            /**
             * Prevent the new move from having more current PP than its max PP.
             */
            if (currentMoves[replacedMoveIndex].pp > newMovePP || replacePP) {
                currentMoves[replacedMoveIndex].pp = newMovePP;
            }

            wereNoErrorsEncountered = await updateMoves(pokemon, currentMoves);
        }

    }

    return new Promise(function(resolve) {
        resolve(wereNoErrorsEncountered);
    });
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
 * @returns {boolean} True if no errors were encountered.
 */
async function takeItem(message) {
    let itemName = lead.item;
    let wereNoErrorsEncountered = true;

    let user = await getUser(message.author.id);
    if (user === null) {
        wereNoErrorsEncountered = false;
    }

    let lead = await getLeadPokemon(user.user_id);
    if (lead === null) {
        wereNoErrorsEncountered = false;
    }

    if (lead.item === null) {
        wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " your " + lead.name + " is not holding anything."));
    } else if (wereNoErrorsEncountered) {
        lead.item = null;
        if (
            await sendMessage(message.channel, (message.author.username + " took the " + itemName + " from " + lead.name + " and put it in their bag.")) === false
            ||
            await addItemToBag(message.author.id, itemName, 1) === false
            ||
            await doQuery("UPDATE pokemon SET pokemon.item = null WHERE pokemon.pokemon_id = ?", [lead.pokemon_id]) === null
        ) {
            wereNoErrorsEncountered = false;
        }
    }
    
    return new Promise(function(resolve) {
        resolve(wereNoErrorsEncountered);
    });
}

/**
 * Allows a user to trade a Pokemon with another user.
 * 
 * @todo Automatically remove items without a cost value.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {string} tradeTo The Discord id of the trainer that the
 * user wants to trade with.
 * 
 * @returns {boolean} True if the item was added to the user's bag.
 */
async function tradeOffer(message, tradeTo) {
    let wasTradeCancelled = false;
    let wereNoErrorsEncountered = true;

    let tradeFromIndex = trading.length;
    trading[tradeFromIndex] = new Trade(message.author.id, tradeTo.id, null, null);
    
    if (tradeTo.id === message.author.id) {
        await sendMessage(message.channel, (message.author.username + " you cannot trade with yourself."));
        removeTrade(message.author.id);
        wereNoErrorsEncountered = false;
    }

    let exists = await userExists(tradeTo.id);
    if (!exists) {
        await sendMessage(message.channel, (message.author.username + " that user is unknown to me."));
        removeTrade(message.author.id);
        wereNoErrorsEncountered = false;
    }
    
    if (isInEvolution(tradeTo.id) != null || (isInTrade(tradeTo.id) != null) || (isInTransaction(tradeTo.id) != null)) {
        await sendMessage(message.channel, (tradeTo.username + " is currently unavailable to trade."));
        removeTrade(message.author.id);
        wereNoErrorsEncountered = false;
    }
    
    let tradeToIndex = trading.length;
    trading[tradeToIndex] = new Trade(tradeTo.id, message.author.id, null, null);

    if (wereNoErrorsEncountered) {
        await sendMessage(message.channel, (tradeTo.username + " you have received a trade offer from " + message.author.username + ". Type \'Yes\' to accept or \'No\' to decline."));
        
        const ACCEPT_TRADE = 1;
        const DECLINE_TRADE = -1;
        const AWAIT_USER_INPUT = 0;

        let input = AWAIT_USER_INPUT;
        let cancel = false;

        /**
         * Ask the receiver of the trade if they want to trade with the sender.
         */
        while (cancel === false) {
            await message.channel.awaitMessages(response => response.author.id === tradeTo.id, { max: 1, time: 30000, errors: ['time'] })
                .then(collected => {
                    input = collected.first().content;
                    input = input.toLowerCase();
                })
                .catch(collected => {
                    console.error(collected);
                    input = "cancel";
                    cancel = true;
                });
    
            if (input === "cancel" || input === "no") {
                cancel = true;
                input = DECLINE_TRADE;
            } else if (input === "accept" || input === "yes") {
                cancel = true;
                input = ACCEPT_TRADE;
            } else {
                await sendMessage(message.channel, (tradeTo.username + " I did not understand your response. Type \'Yes\' to accept or \'No\' to decline the trade with " + message.author.username));
                input = AWAIT_USER_INPUT;
            }
        }
        
        if (input === DECLINE_TRADE) {
            await sendMessage(message.channel, (tradeTo.username + " declined the trade request."));
            wasTradeCancelled = true;
        /**
         * If the receiver accepts the trade offer.
         */
        } else {
            await sendMessage(message.channel, (tradeTo.username + " accepted the trade request."));
            
            let user = await getUser(message.author.id);
            if (user === null) {
                wereNoErrorsEncountered = false;
            }

            let pokemon = await getPokemon(message.author.id);
            if (pokemon === null) {
                wereNoErrorsEncountered = false;
            }

            let selectedPokemon = null;
            let tselectedPokemon = null;

            if (wereNoErrorsEncountered) {
                /**
                 * Prompt the sender to select which of their Pokemon they want to trade.
                 */
                let desc = message.author.username + " please select a Pokémon to trade by typing its name, or type `Cancel` to cancel the trade."
                selectedPokemon = await selectOwnedPokemon(message, user, pokemon, desc);
                if (selectedPokemon != null) {
                    await sendMessage(message.channel, (message.author.username + " selected a " + selectedPokemon.name + " to trade."));
                
                    let tuser = await getUser(tradeTo.id);
                    if (tuser === null) {
                        wereNoErrorsEncountered = false;
                    }
    
                    let tpokemon = await getPokemon(tradeTo.id);
                    if (tpokemon === null) {
                        wereNoErrorsEncountered = false;
                    }

                    if (wereNoErrorsEncountered) {
                        /**
                         * Prompt the receiver to select which of their Pokemon they want to trade.
                         */
                        desc = tradeTo.username + " please select a Pokémon to trade by typing its name, or type `Cancel` to cancel the trade."
                        tselectedPokemon = await selectOwnedPokemon(message, tuser, tpokemon, desc);

                        if (tselectedPokemon != null) {
                            await sendMessage(message.channel, (tradeTo.username + " selected a " + tselectedPokemon.name + " to trade."));
                        } else {
                            await sendMessage(message.channel, (tradeTo.username + " cancelled the trade."));
                            wasTradeCancelled = true;
                        }
                    }
                } else {
                    await sendMessage(message.channel, (message.author.username + " cancelled the trade."));
                    wasTradeCancelled = true;
                }
            }

            /**
             * If both sender and receiver selected a Pokemon to trade.
             */
            if (selectedPokemon != null && tselectedPokemon != null) {
                trading[tradeFromIndex].askPokemon = selectedPokemon.name;
                trading[tradeFromIndex].respondPokemon = tselectedPokemon.name;
                trading[tradeToIndex].askPokemon = tselectedPokemon.name;
                trading[tradeToIndex].respondPokemon = selectedPokemon.name;
                
                await displayAnOwnedPkmn(tselectedPokemon, message);
                await sendMessage(message.channel, (message.author.username + " are you ok with the selected " + tselectedPokemon.name + "? Type \"Yes\" to accept or \"No\" to cancel the trade."));
                
                await displayAnOwnedPkmn(selectedPokemon, message);
                await sendMessage(message.channel, (tradeTo.username + " are you ok with the selected " + selectedPokemon.name + "? Type \"Yes\" to accept or \"No\" to cancel the trade."));
                
                let timeout = 60;
                let accept = null;
                let taccept = null;
                let inputConfirm = null;
                let tinputConfirm = null;
                /**
                 * After details about both offered Pokemon are shown, both the sender and receiver are asked
                 * to verify that they want to trade those Pokemon with each other.
                 * 
                 * @todo Change this so it can listen for a response from both users
                 * instead of checking every second.
                 */
                while((accept == null || taccept == null) && timeout > 0) {
                    timeout--;
                    await message.channel.awaitMessages(msg => {
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

                    if (accept != null && taccept != null) {
                        timeout = 0;
                    }
                }
            
                /**
                 * If sender and receiver both accepted the trade offers.
                 */
                if (accept != null && accept != false && taccept != null && taccept != false) {
                    /**
                     * Update Pokemon trainer ownership.
                     */
                    if (selectedPokemon.lead === 1) {
                        /**
                         * If sender traded their lead Pokemon, update their lead Pokemon to be the Pokemon they just received
                         * from the trade.
                         */
                        await doQuery("UPDATE pokemon SET pokemon.lead = 0, pokemon.current_trainer = ? WHERE pokemon.pokemon_id = ?", [tradeTo.id, selectedPokemon.pokemon_id]);
                        await doQuery("UPDATE pokemon SET pokemon.lead = 1, pokemon.current_trainer = ? WHERE pokemon.pokemon_id = ?", [message.author.id, tselectedPokemon.pokemon_id]);
                        await doQuery("UPDATE user SET user.lead = ? WHERE user.user_id = ?", [tselectedPokemon.pokemon_id, message.author.id]);
                    } else {
                        /**
                         * If sender did not trade their lead Pokemon, make sure the Pokemon they just received
                         * is not marked as a lead Pokemon.
                         */
                        await doQuery("UPDATE pokemon SET pokemon.lead = 0, pokemon.current_trainer = ? WHERE pokemon.pokemon_id = ?", [message.author.id, tselectedPokemon.pokemon_id]);
                    }
                    if (tselectedPokemon.lead === 1) {
                        /**
                         * If receiver traded their lead Pokemon, update their lead Pokemon to be the Pokemon they just received
                         * from the trade.
                         */
                        await doQuery("UPDATE pokemon SET pokemon.lead = 0, pokemon.current_trainer = ? WHERE pokemon.pokemon_id = ?", [message.author.id, selectedPokemon.pokemon_id]);
                        await doQuery("UPDATE pokemon SET pokemon.lead = 1, pokemon.current_trainer = ? WHERE pokemon.pokemon_id = ?", [tradeTo.id, selectedPokemon.pokemon_id]);
                        await doQuery("UPDATE user SET user.lead = ? WHERE user.user_id = ?", [selectedPokemon.pokemon_id, tradeTo.id]);
                    } else {
                        /**
                         * If receiver did not trade their lead Pokemon, make sure the Pokemon they just received
                         * is not marked as a lead Pokemon.
                         */
                        await doQuery("UPDATE pokemon SET pokemon.lead = 0, pokemon.current_trainer = ? WHERE pokemon.pokemon_id = ?", [tradeTo.id, selectedPokemon.pokemon_id]);
                    }

                    await sendMessage(message.channel, ("Congratulations! " + message.author.username + " traded their " + selectedPokemon.name + " for " + tradeTo.username + "'s " + tselectedPokemon.name + "!"));
                    
                    removeTrade(message.author.id);
                    removeTrade(tradeTo.id);

                    /**
                     * Do not await, otherwise the person who received the trade offer may be stuck
                     * waiting for the user who initiated the trade to evolve their Pokemon.
                     */
                    checkForTradeEvolve(message, tselectedPokemon, message.author.id);
                    checkForTradeEvolve(message, selectedPokemon, tradeTo.id);

                    wasTradeCancelled = false;
                } else {
                    wasTradeCancelled = true;
                }
            } else {
                wasTradeCancelled = true;
            }
        }

        if (wasTradeCancelled) {
            await sendMessage(message.channel, ("The trade between " + message.author.username + " and " + tradeTo.username + " has been cancelled."));
            removeTrade(message.author.id);
            removeTrade(tradeTo.id);
        }
    }

    return new Promise(function(resolve) {
        resolve(wereNoErrorsEncountered);
    });
}

/**
 * Gets all Pokemon whose name or nickname match the `name` argument.
 * 
 * @param {string} name The name to search for.
 * @param {Pokemon[]} pokemon The list of Pokemon to search from.
 * 
 * @returns {Pokemon[]} All Pokemon from the list that match the name query.
 */
function getAllOwnedPokemonWithName(name, pokemon) {
    let ownedPokemonIndex;
    let matchedPokemon = [];

    for (ownedPokemonIndex = 0; ownedPokemonIndex < pokemon.length; ownedPokemonIndex++) {
        if (
            name === pokemon[ownedPokemonIndex].name.toLowerCase()
            ||
            (
                pokemon[ownedPokemonIndex].nickname != null
                &&
                name === pokemon[ownedPokemonIndex].nickname.toLowerCase()
            )
        ) {
            matchedPokemon[matchedPokemon.length] = pokemon[ownedPokemonIndex];
        }
    }

    return matchedPokemon;
}

/**
 * Shows a numbered list of Pokemon to the user with matching names/nicknames
 * and lets the user select one of the Pokemon based on its list number.
 * 
 * @todo Username arguments isn't 100% necessary but it saves a function call so might be worth to keep it.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {User} user The Pokebot user who is selecting the Pokemon.
 * @param {string} username The name of the Pokebot user who is selecting the Pokemon.
 * @param {Pokemon[]} pokemon The list of Pokemon to select from.
 * 
 * @returns {Pokemon[]} All Pokemon from the list that match the name query.
 */
async function selectDuplicatePokemon(message, user, username, pokemon) {
    let selectedPokemon = null;

    let description = username + " you have multiple " + pokemon[0].name + " . Please select one by typing its number as shown in the list, or type `Cancel` to cancel selecting a Pokémon.";
    
    printPokemon(message, user.user_id, pokemon, description);

    let cancel = false;
    let input = null;
    while(cancel == false) {
        await message.channel.awaitMessages(response => response.author.id === user.user_id, { max: 1, time: 30000, errors: ['time'] })
        .then(collected => {
            input = collected.first().content.toString().toLowerCase();
        })
        .catch(collected => {
            console.log(collected);
            input = "cancel";
            cancel = true;
        });

        if (input === "cancel") {
            cancel = true;
            input = null;
        } else if (/^\d+$/.test(input)) {
            let num = Number(input);
            if (num > 0 && num <= pokemon.length) {
                cancel = true;
                input = (num - 1);
            } else {
                await sendMessage(message.channel, ("Number is out of range. " + string));
                input = -1;
            }
        } else if (input != null) {
            await sendMessage(message.channel, ("Response not recognized. " + string));
            input = -1;
        } else {
            input = null;
        }
    }

    if (input != null) {
        selectedPokemon = pokemon[input];
    }

    return new Promise(function(resolve) {
        resolve(selectedPokemon);
    });
}

/**
 * Prompts a user to select one Pokemon that the user owns.
 * If a user responds with a Pokemon that they own multiple of,
 * then the user is again prompted to select one from that group.
 * 
 * @param {Message} message The message sent from the user.
 * @param {User} user The Pokebot user who is selecting a Pokemon.
 * @param {Pokemon[]} pokemon All Pokemon currently owned by the user.
 * @param {string} description Descriptive text that tells the user why they are selecting a Pokemon.
 * 
 * @returns {Pokemon} The one Pokemon selected by the user, or null if the user
 * did not select a Pokeon.
 */
async function selectOwnedPokemon(message, user, pokemon, description, name = undefined) {
    let username = await client.fetchUser(user.user_id).then(myUser => {
        return myUser.username;
    });

    let userIsSelectingAPokemon = true;
    let selectedPokemon = null;

    while (userIsSelectingAPokemon) {
        if (name === undefined) {
            printPokemon(message, user.user_id, undefined, description);

            let cancel = false;
    
            while (cancel === false) {
                await message.channel.awaitMessages(response => response.author.id === user.user_id, { max: 1, time: 30000, errors: ['time'] })
                .then(collected => {
                    name = collected.first().content.toString().toLowerCase();
                    cancel = true;
                })
                .catch(() => {
                    name = "cancel";
                    cancel = true;
                });
    
                if (name === "cancel") {
                    name = null;
                }
            }
        }
            
        if (name != null) {
            let matchedPokemon = getAllOwnedPokemonWithName(name, pokemon);
    
            if (matchedPokemon.length <= 0) {
                await sendMessage(message.channel, (username + " you do not have that Pokémon."));
            } if (matchedPokemon.length === 1) {
                selectedPokemon = matchedPokemon[0];
                userIsSelectingAPokemon = false;
            } else if (matchedPokemon.length > 1) {
                selectedPokemon = await selectDuplicatePokemon(message, user, username, matchedPokemon);
                userIsSelectingAPokemon = false;
            }
        } else {
            userIsSelectingAPokemon = false;
        }
    }

    return new Promise(function(resolve) {
        resolve(selectedPokemon);
    });
}

/**
 * Checks if a Pokemon evolves after being traded, and attempts
 * to evolve that Pokemon if it meets its evolution criteria.
 * 
 * @todo "If either Karrablast or Shelmet holds an Everstone when traded for the other, neither can evolve."
 *  
 * @param {Message} message The Discord message sent from the user. 
 * @param {Pokemon} pokemon The Pokemon to check the trade evolution for.
 * @param {string} userId The id of the user who ownes the Pokemon.
 */
async function checkForTradeEvolve(message, pokemon, userId) {
    let tradeEvos = ["Kadabra", "Machoke", "Graveler", "Haunter", "Boldore", "Gurdurr", "Phantump", "Pumpkaboo"];
    let tradeEvosTo = ["Alakazam", "Machamp", "Golem", "Gengar", "Gigalith", "Conkeldurr", "Gourgeist", "Trevenant"];
    let tradeEvoIndex = -1;
    
    if (pokemon.item != "Everstone") {
        var evolveTo = null;
        if (pokemon.name === "Shelmet") {
            if (selectedPokemon.name === "Karrablast") {
                evolveTo = "Accelgor";
            }
        } else if (pokemon.name === "Karrablast") {
            if (selectedPokemon.name === "Shelmet") {
                evolveTo = "Escavalier";
            }
        } else if ((tradeEvoIndex = tradeEvos.indexOf(pokemon.name)) >= 0) {
            evolveTo = tradeEvosTo[tradeEvoIndex];
        } else if (pokemon.name === "Poliwhirl" && pokemon.item === "King's Rock") {
            evolveTo = "Politoed";
        } else if (pokemon.name === "Slowpoke" && pokemon.item === "King's Rock") {
            evolveTo = "Slowking";
        } else if (pokemon.name === "Onix" && pokemon.item === "Metal Coat") {
            evolveTo = "Steelix";
        } else if (pokemon.name === "Seadra" && pokemon.item === "Dragon Scale") {
            evolveTo = "Kindgra";
        } else if (pokemon.name === "Scyther" && pokemon.item === "Metal Coat") {
            evolveTo = "Scizor";
        } else if (pokemon.name === "Porygon" && pokemon.item === "Up-Grade") {
            evolveTo = "Porygon2";
        } else if (pokemon.name === "Clamperl" && pokemon.item === "Deep Sea Tooth") {
            evolveTo = "Huntail";
        } else if (pokemon.name === "Clamperl" && pokemon.item === "Deep Sea Scale") {
            evolveTo = "Gorebyss";
        } else if (pokemon.name === "Feebas" && pokemon.item === "Prism Scale") {
            evolveTo = "Milotic";
        } else if (pokemon.name === "Rhydon" && pokemon.item === "Protector") {
            evolveTo = "Rhyperior";
        } else if (pokemon.name === "Electabuzz" && pokemon.item === "Electirizer") {
            evolveTo = "Electivire";
        } else if (pokemon.name === "Magmar" && pokemon.item === "Magmarizer") {
            evolveTo = "Magmortar";
        } else if (pokemon.name === "Porygon2" && pokemon.item === "Dubious Disc") {
            evolveTo = "Porygon-Z";
        } else if (pokemon.name === "Dusclops" && pokemon.item === "Reaper Cloth") {
            evolveTo = "Dusknoir";
        } else if (pokemon.name === "Feebas" && pokemon.item === "Prism Scale") {
            evolveTo = "Milotic";
        } else if (pokemon.name === "Spritzee" && pokemon.item === "Sachet") {
            evolveTo = "Aromatisse";
        } else if (pokemon.name === "Swirlix" && pokemon.item === "Whipped Dream") {
            evolveTo = "Slurpuff";
        }
        
        if (evolveTo != null) {
            await sendMessage(message.channel, ("<@" + userId + "> your " + pokemon.name + " is evolving into " + evolveTo + "! Type \"B\" to cancel or  \"A\" to accept."));
            await doQuery("UPDATE pokemon SET pokemon.evolving = 1 WHERE pokemon.pokemon_id = ?", [pokemon.pokemon_id]);
            evolving[evolving.length] = new Evolution(message.author.id, pokemon.name, evolveTo);
        }
    }
}

/**
 * Determines which form a Pokemon should be in after it evolves.
 * 
 * @param {string} fromForm The name of the form that the evolving
 * Pokemon is currently in, or null if it doesn't have a form.
 * @param {string} toName The name of the Pokemon that is being evolved into.
 * @param {User} user The user who owns the evolving Pokemon.
 * 
 * @returns {string} The name of the form that the Pokemon will
 * be in after it evolves.
 */
function getFormOfEvolvedPokemon(fromForm, toName, user) {
    let form = null;
    if (toName === "Wormadam") {
        form = fromForm;
    } else if (fromForm === "Alolan") {
        /**
         * @todo Do Alolan Pokemon maintain their form if not evolved in Alola?
         * Currently they maintain their Alolan form but I need to see
         */
        form = fromForm;
    } else if (
        /**
         * Add Alolan form if a compatible non-Alolan Pokemon is evolving in Alola.
         * 
         * Apparently non Alolan form Pokemon that evolve in Alola will keep their non-Alolan forms.
         * Example: Vulpix and Sandshrew.
         * 
         * But Pikachu, Exeggcute, and Cubone are exceptions?
         * 
         * @todo Check if Pikachu etc only evolve into Alolan forms if they were caught in Alola.
         */
        (toName === "Raichu")
        ||
        (toName === "Exeggutor")
        ||
        (toName === "Marowak")
        ) { /* Ultra Space does not trigger Alolan forms. */
        if (user.region === "Alola" && !(user.location.startsWith("Ultra"))) {
            form = "Alolan";
        }
    } else if (toName === "Cherrim") {
        form = "Overcast";
    } else if (toName === "Gastrodon") {
        form = fromForm;
    } else if (toName === "Darmanitan") {
        form = "Standard";
    } else if (toName === "Sawsbuck") {
        form = fromForm;
    } else if (toName === "Vivillon") {
        /**
         * @todo Create function to determine Vivillon form.
         */
        form = "Continental";
    } else if (toName === "Floette") {
        form = fromForm;
    } else if (toName === "Florges") {
        form = fromForm;
    } else if (toName === "Aegislash") {
        form = "Shield";
    } else if (toName === "Gourgeist") {
        form = fromForm;
    } else if (toName === "Lycanroc") {
        let cur = convertToTimeZone(user);
        let n = moment(cur).format('H');
        if (n == 17) {
            form = "Dusk";
        } else if (n > 17 || n < 6) {
            form = "Midnight";
        } else {
            form = "Midday";
        }
    }

    return form;
}

/**
 * Evolves a user's evolving Pokemon and updates all its stats.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if the Pokemon successfully evolved.
 */
async function evolve(message) {
    let wereNoErrorsEncountered = true;

    let user = await getUser(message.author.id);
    if (user === null) {
        wereNoErrorsEncountered = false;
    }

    let evolvingPokemon = await getEvolvingPokemon(message.author.id);
    if (evolvingPokemon === null) {
        wereNoErrorsEncountered = false;
    }

    
    
    let evo = isInEvolution(message.author.id);
    if (evo === null) {
        wereNoErrorsEncountered = false;
    }
    
    let toForm = getFormOfEvolvedPokemon(evolvingPokemon.form, evo.to, user);
    let newPokemon = parseJSON(generatePokemonJSONPath(evo.to, toForm));
    if (newPokemon === null) {
        wereNoErrorsEncountered = false;
    }

    if (wereNoErrorsEncountered) {
        /**
         * Update the evolved Pokemon's name and form.
         */
        evolvingPokemon.name = evo.to;
        evolvingPokemon.form = toForm;

        /**
         * Update the evolved Pokemon's national Pokedex number.
         */
        let national_id = newPokemon.national_id.toString();
        national_id = national_id.padStart(3, '0');
        evolvingPokemon.no = newPokemon.national_id;
    
        /**
         * Update the evolved Pokemon's ability.
         */
        let hidden = [];
        let abilities = [];
        let abilitiesIndex;
        let final_ability;
        /**
         * Meowstic is unique in that it is the only Pokemon species to have different abilities
         * based on its gender.
         */
        if (evolvingPokemon.name === "Meowstic" && evolvingPokemon.abilitySlot === 2) {
            if (evolvingPokemon.gender === "Female") {
                evolvingPokemon.abilitySlot = 3;
                final_ability = "Competitive";
            }
        } else {
            for (abilitiesIndex = 0; abilitiesIndex < newPokemon.abilities.length; abilitiesIndex++) {
                if(newPokemon.abilities[abilitiesIndex].hasOwnProperty('hidden')) {
                    hidden[hidden.length] = newPokemon.abilities[abilitiesIndex].name;
                } else {
                    abilities[abilities.length] = newPokemon.abilities[abilitiesIndex].name;
                }
            }
            if (evolvingPokemon.abilitySlot === 2 && hidden.length > 0) {
                /**
                 * No Pokemon has more than one possible hidden ability, excluding forms.
                 */
                final_ability = hidden[0];
            } else if (evolvingPokemon.abilitySlot === 1 && abilities.length > 1) {
                final_ability = abilities[1];
            } else {
                final_ability = abilities[0];
            }
        }
        evolvingPokemon.ability = final_ability;

        /**
         * Update the evolved Pokemon's stats.
         */
        let stats = [evolvingPokemon.stat_hp, evolvingPokemon.stat_atk, evolvingPokemon.stat_def, evolvingPokemon.stat_spatk, evolvingPokemon.stat_spdef, evolvingPokemon.stat_spd];
        let EVs = [evolvingPokemon.ev_hp, evolvingPokemon.ev_atk, evolvingPokemon.ev_def, evolvingPokemon.ev_spatk, evolvingPokemon.ev_spdef, evolvingPokemon.ev_spd];
        let IVs = [evolvingPokemon.iv_hp, evolvingPokemon.iv_atk, evolvingPokemon.iv_def, evolvingPokemon.iv_spatk, evolvingPokemon.iv_spdef, evolvingPokemon.iv_spd];
        let nature = evolvingPokemon.nature;
        let level = evolvingPokemon.level_current;
        let baseStats;
        baseStats = [newPokemon.base_stats.hp, newPokemon.base_stats.atk, newPokemon.base_stats.def, newPokemon.base_stats.sp_atk, newPokemon.base_stats.sp_def, newPokemon.base_stats.speed];
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
        
        /**
         * Update the evolved Pokemon's types.
         */
        evolvingPokemon.type_1 = newPokemon.types[0];
        if(newPokemon.types.length > 1) {
            evolvingPokemon.type_2 = newPokemon.types[1];
        } else {
            evolvingPokemon.type_2 = null;
        }
        
        /**
         * Hold items that cause an evolution are deleted after the Pokemon evolves.
         */
        let heldItemEvoPokemon = ["Chansey", "Gliscor", "Weavile", "Politoed", "Slowking", "Steelix", "Kindgra", "Scizor", "Porygon2", "Huntail", "Gorebyss", "Milotic", "Rhyperior", "Electivire", "Magmortar", "Porygon-Z", "Dusknoir", "Milotic", "Aromatisse", "Slurpuff"];
        if (heldItemEvoPokemon.indexOf(evolvingPokemon.name) >= 0) {
            evolvingPokemon.item = null;
        }
        
        /**
         * Inkay evolves by holding the 3DS handheld device upside-down. Since that isn't possible to check for
         * within Discord's API, that evolution requirement is replaced with flavor text.
         */
        if (evo.to === "Malamar") {
            await sendMessage(message.channel, ("¡ɹɐɯɐlɐW oʇuᴉ pǝʌloʌǝ sɐɥ ʎɐʞuI s," + flipString(message.author.username)));
        } else {
            await sendMessage(message.channel, (message.author.username + "'s " + evo.from + " has evolved into " + evo.to + "!"));
        }
        
        removeEvolution(message.author.id);
        
        /**
         * Check if the Pokemon learns a move specifically when it evolves.
         */
        let evoMove = checkForNewMoveUponEvo(evo.to, evolvingPokemon.form);
        if (evoMove.length > 0) {
            message.react(duck.id);
            let evolutionMovesIndex;
            for (evolutionMovesIndex = 0; evolutionMovesIndex < evoMove.length; evolutionMovesIndex++) {
                await teachMove(message, evolvingPokemon, evoMove[evolutionMovesIndex], true, true);
            }
        }
        
        /**
         * Check if the Pokemon happened to evolve at a level where its
         * evolution learns a new move.
         */
        let levelMoves = await checkForMoveAtLevel(evolvingPokemon);
        for (move in levelMoves) {
            await teachMove(message, evolvingPokemon, levelMoves[move], true, true);
        }
        
        /**
         * If Nincada evolves into Ninjask, then the user
         * will also receive a Shedinja if the user has a
         * spare Poke Ball. That spare Poke Ball will be
         * removed from the user's bag.
         */
        if (evo.from === "Nincada" && evo.to === "Ninjask") {
            let bag = await getBag(user.user_id);
            if (bag != null) {
                if (doesUserHaveHoldableItem(bag, "Poké Ball") != false) {
                    await removeItemFromBag(user.items, "Poké Ball", 1);
                    let shedinja = await generatePokemonByName(message, "Shedinja", evolvingPokemon.level_current, user.region, user.location, false);
                    shedinja.otid = message.author.id;
                    await addPokemon(user.user_id, shedinja);
                }
            }
        }
    
        let finishedEvolvedPokemon = {
            name: evolvingPokemon.name,
            nickname: evolvingPokemon.nickname,
            number: national_id,
            friendship: evolvingPokemon.friendship,
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

        /**
         * All of these need to be completed successfully for the evolution to complete.
         */
        if (
            (await doQuery("UPDATE pokemon SET ? WHERE pokemon.pokemon_id = ?", [finishedEvolvedPokemon, evolvingPokemon.pokemon_id]) != null)
            &&
            (await addToPokedex(user, newPokemon.national_id) != null)
        ) {
            wereNoErrorsEncountered = true;
        } else {
            wereNoErrorsEncountered = false;
        }
    }

    return new Promise(function(resolve) {
        resolve(wereNoErrorsEncountered);
    });
}

/**
 * Cancels a Pokemon's evolution.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if the evolution was successfully cancelled.
 */
async function cancelEvolve(message) {
    let wasEvolutionCancelled = false;

    let user = await getUser(message.author.id);
    let pokemon = await getPokemon(message.author.id);

    if (user != null && pokemon != null) {
        let ownedPokemonIndex;
        for (ownedPokemonIndex = 0; ownedPokemonIndex < pokemon.length; ownedPokemonIndex++) {
            if(pokemon[ownedPokemonIndex].evolving === 1) {
                if (await doQuery("UPDATE pokemon SET pokemon.evolving = 0 WHERE pokemon.pokemon_id = ?", [pokemon[ownedPokemonIndex].pokemon_id]) != null) {
                    await sendMessage(message.channel, (message.author.username + " has cancelled " + user.pokemon[ownedPokemonIndex].name + "'s evolution."));
                    removeEvolution(message.author.id);
                    wasEvolutionCancelled = true;
                }
            }
        }
    }
    return new Promise(function(resolve) {
        resolve(wasEvolutionCancelled);
    });
}

/**
 * Checks if a Pokemon has met its evolution requirement.
 * 
 * @param {User} user The Pokebot user who owns the Pokemon.
 * @param {Pokemon} pokemon The Pokemon that is being checked for evolution.
 * 
 * @returns {string} The name of the Pokemon that it will evolve into, or null
 * if the Pokemon is not ready to evolve.
 */
async function checkEvolveUponLevelUp(user, pokemon) {
    let evolutionName = null;
    
    let ownedPokemon = await getPokemon(user.user_id);

    let knownMoves = await getPokemonKnownMoves(pokemon.pokemon_id);
    let moves = populateMoves(knownMoves);

    let pkmn = parseJSON(generatePokemonJSONPath(pokemon.name, pokemon.form));

    let cur = convertToTimeZone(user);
    let n = moment(cur).format('H');
    
    if (pkmn != null) {
        if (pokemon.form === "Alolan") { //alolan forms
            if (pokemon.name === "Meowth") {
                if (pokemon.friendship >= 220) {
                    evolutionName = "Persian";
                }
            } else if (pokemon.name === "Rattata") {
                if (pokemon.level_current >= 20 && ((n >= 0 && n < 6) || n >= 18)) {
                    evolutionName = "Raticate";
                }
            } else if (pokemon.name === "Diglett") {
                if (pokemon.level_current >= 26) {
                    evolutionName = "Dugtrio";
                }
            } else if (pokemon.name === "Geodude") {
                if (pokemon.level_current >= 25) {
                    evolutionName = "Graveler";
                }
            } else if (pokemon.name === "Grimer") {
                if (pokemon.level_current >= 38) {
                    evolutionName = "Muk";
                }
            }
        } else if(pkmn.hasOwnProperty('evolutions')) {
            //cosmoem will evolve based on time
            if (pokemon.name === "Cosmoem") {
                if (pokemon.level_current >= 53) {
                    if ((n >= 0 && n < 6) || n >= 18) {
                        evolutionName = "Lunala"; 
                    } else {
                        evolutionName = "Solgaleo";
                    }
                }
            }
            //mantyke requires user to own a remoraid
            else if (pokemon.name === "Mantyke") {
                let ownedPokemonIndex;
                for (ownedPokemonIndex = 0; ownedPokemonIndex < ownedPokemon.length; ownedPokemonIndex++) {
                    if (ownedPokemon[ownedPokemonIndex].name === "Remoraid") {
                        evolutionName = "Mantine";
                    }
                }
            }
            //pangoro requires user to have a dark type
            else if (pokemon.name === "Pancham") {
                if (pokemon.level_current >= 32) {
                    let ownedPokemonIndex;
                    for (ownedPokemonIndex = 0; ownedPokemonIndex < ownedPokemon.length; ownedPokemonIndex++) {
                        if ((ownedPokemon[ownedPokemonIndex].type_1 === "Dark" || ownedPokemon[ownedPokemonIndex].type_2 === "Dark") && ownedPokemon[ownedPokemonIndex].lead === 0) {
                            evolutionName = "Pangoro";
                        }
                    }
                }
            }
            //inkay normally requires user to hold device upside down, but in this case only has level requirement
            else if (pokemon.name === "Inkay") {
                if (pokemon.level_current >= 30) {
                    evolutionName = "Malamar";
                }
            }
            //sliggoo requires it to be raining
            else if (pokemon.name === "Sliggoo") {
                if (pokemon.level_current >= 50) {
                    for (location in raining) {
                        if (raining[location].region === user.region && raining[location].location === user.location) {
                            evolutionName = "Goodra";
                            break;
                        }
                    }
                }
            }
            //tyrogue evolves based on its highest stat
            else if (pokemon.name === "Tyrogue") {
                if (pokemon.level_current >= 20) {
                    if (pokemon.stats_atk > pokemon.stat_def) {
                        evolutionName = "Hitmonlee";
                    } else if (pokemon.stat_def > pokemon.stat_atk) {
                        evolutionName = "Hitmonchan";
                    } else {
                        evolutionName = "Hitmontop";
                    }
                }
            }
            //wurmple evolves based on its personality value
            else if (pokemon.name === "Wurmple") {
                if (pokemon.level_current >= 7) {
                    let pval = Math.trunc(pokemon.personality / 65536);
                    if (pval % 10 < 5) {
                        evolutionName = "Silcoon";
                    } else {
                        evolutionName = "Cascoon";
                    }
                }
            } else {
                let possibleEvolutionsIndex;
                for (possibleEvolutionsIndex = 0; possibleEvolutionsIndex < pkmn.evolutions.length; possibleEvolutionsIndex++) {
                    //holding an item
                    if (pkmn.evolutions[possibleEvolutionsIndex].hasOwnProperty('hold_item')) {
                        if (pokemon.item === pkmn.evolutions[possibleEvolutionsIndex].hold_item) {
                            if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Nighttime") { //night holding an item
                                if ((n >= 0 && n < 6) || n >= 18) {
                                    evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                                }
                            }
                            if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Daytime") { //day holding an item
                                if (n >= 6 && n < 18) {
                                    evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                                }
                            }
                        }
                    }
                    //know a specific move
                    else if (pkmn.evolutions[possibleEvolutionsIndex].hasOwnProperty('move_learned')) {
                        if (moves[0].name === pkmn.evolutions[possibleEvolutionsIndex].move_learned || moves[1].name === pkmn.evolutions[possibleEvolutionsIndex].move_learned || moves[2].name === pkmn.evolutions[possibleEvolutionsIndex].move_learned || moves[3].name === pkmn.evolutions[possibleEvolutionsIndex].move_learned) {
                            evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                        }
                    }
                    //locations based evolutions and unique methods
                    else if (pkmn.evolutions[possibleEvolutionsIndex].hasOwnProperty('conditions')) {
                        //specific to sylveon, only checks for Fairy moves that eevee can learn
                        if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Fairy Type Move") {
                            if (moves[0].name === "Charm" || moves[0].name === "Baby-Doll Eyes" || moves[1].name === "Charm" || moves[1].name === "Baby-Doll Eyes" || moves[2].name === "Charm" || moves[2].name === "Baby-Doll Eyes" || moves[3].name === "Charm" || moves[3].name === "Baby-Doll Eyes") {
                                evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                            }
                        }
                        //level up in a magnetic field area
                        else if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "In a Magnetic Field area") {
                            let magnetic_fields = ["New Mauville", "Mt. Coronet", "Chargestone Cave", "Route 13 (Lumiose Badlands)", "Vast Poni Canyon", "Blush Mountain"];
                            if (magnetic_fields.indexOf(user.location) >= 0) {
                                evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                            }
                        }
                        //level up near a mossy rock
                        else if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Near a Mossy Rock") {
                            let mossy_rocks = ["Petalburg Woods", "Eterna Forest", "Pinwheel Forest", "Route 20 (Winding Woods)", "Lush Jungle"];
                            if (mossy_rocks.indexOf(user.location) >= 0) {
                                evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                            }
                        }
                        //level up near an icy rock
                        else if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Near an Icy Rock") {
                            let mossy_rocks = ["Shoal Cave", "Route 217", "Twist Mountain", "Frost Cavern", "Mount Lanakila"];
                            if (mossy_rocks.indexOf(user.location) >= 0) {
                                evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                            }
                        }
                        //level up at mount lanakila (aka Crabrawler -> Crabominable)
                        if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "At Mount Lanakila") {
                            if (user.location === "Mount Lanakila") {
                                evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                            }
                        }
                    }
                    //friendship
                    else if (pkmn.evolutions[possibleEvolutionsIndex].hasOwnProperty('happiness') && pokemon.friendship >= 220) {
                        //no special conditions
                        if(!pkmn.evolutions[possibleEvolutionsIndex].hasOwnProperty('conditions')) {
                            evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to;
                        } else if (pkmn.evolutions[possibleEvolutionsIndex].hasOwnProperty('conditions')) {
                            if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Nighttime") { //night friendship
                                if ((n >= 0 && n < 6) || n >= 18) {
                                    evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                                }
                            }
                            else if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Daytime") { //day friendship
                                if (n >= 6 && n < 18) {
                                    evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                                }
                            }
                            else if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Male") { //male only
                                if (pokemon.gender === "Male") {
                                    evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                                }
                            }
                            else if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Female") { //female only
                                if (pokemon.gender === "Female") {
                                    evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                                }
                            }
                        }
                    }
                    //level
                    else if (pkmn.evolutions[possibleEvolutionsIndex].hasOwnProperty('level')) {
                        //no special conditions
                        if (pkmn.evolutions[possibleEvolutionsIndex].level <= pokemon.level_current && !pkmn.evolutions[possibleEvolutionsIndex].hasOwnProperty('conditions')) {
                            evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to;
                        } else if (pkmn.evolutions[possibleEvolutionsIndex].level <= pokemon.level_current && pkmn.evolutions[possibleEvolutionsIndex].hasOwnProperty('conditions')) {
                            if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Nighttime") { //night level up
                                if ((n >= 0 && n < 6) || n >= 18) {
                                    evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                                }
                            }
                            else if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Daytime") { //day level up
                                if (n >= 6 && n < 18) {
                                    evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                                }
                            }
                            else if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Male") { //male only
                                if (pokemon.gender === "Male") {
                                    evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                                }
                            }
                            else if (pkmn.evolutions[possibleEvolutionsIndex].conditions[0] === "Female") { //female only
                                if (pokemon.gender === "Female") {
                                    evolutionName = pkmn.evolutions[possibleEvolutionsIndex].to; 
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return new Promise(function(resolve) {
        resolve(evolutionName);
    });
}

/**
 * Updates the stats of a Pokemon based on its base stats,
 * current level, EVs, IVs, and nature. This function does
 * not make any changes to the databse.
 * 
 * @todo Raise level before calling function.
 * 
 * @param {string} name The name of the Pokemon to update stats for.
 * @param {string} form The form that the Pokemon is in.
 * @param {number[]} EVs A list of the Pokemon's six effort values.
 * @param {number[]} IVs A list of the Pokemon's six individual values.
 * @param {number} level The current level of the Pokemon.
 * @param {string} nature The nature of the Pokemon. 
 * 
 * @returns {number[]} The Pokemon's stats after applying
 * all the Pokemon's current stat modifiers.
 */
function updateStats(name, form, EVs, IVs, level, nature) {
    let pkmn = parseJSON(generatePokemonJSONPath(name, form));
    
    let baseStats = [pkmn.base_stats.hp, pkmn.base_stats.atk, pkmn.base_stats.def, pkmn.base_stats.sp_atk, pkmn.base_stats.sp_def, pkmn.base_stats.speed];
    
    let stats = [0,0,0,0,0,0];

    /**
     * Shedinja should never have an HP value that isn't 1.
     */
    if (name === "Shedinja") {
        stats[0] = 1;
    } else {
        stats[0] = calculateStatAtLevel(level, baseStats[0], IVs[0], EVs[0], nature, "hp");
    }
    stats[1] = calculateStatAtLevel(level, baseStats[1], IVs[1], EVs[1], nature, "atk");
    stats[2] = calculateStatAtLevel(level, baseStats[2], IVs[2], EVs[2], nature, "def");
    stats[3] = calculateStatAtLevel(level, baseStats[3], IVs[3], EVs[3], nature, "sp_atk");
    stats[4] = calculateStatAtLevel(level, baseStats[4], IVs[4], EVs[4], nature, "sp_def");
    stats[5] = calculateStatAtLevel(level, baseStats[5], IVs[5], EVs[5], nature, "speed");
    
    return stats;
}

/**
 * Checks if a Pokemon can learn a new move based on its level.
 * 
 * @todo Maybe check if the Pokemon is in the Day Care.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {Pokemon} pokemon The Pokemon that is being checked for a new move.
 * 
 * @returns {string[]} The list of move names the Pokemon learns at its current level, if any.
 */
function checkForMoveAtLevel(pokemon) {
    let pkmn = parseJSON(generatePokemonJSONPath(pokemon.name, pokemon.form));
    let newMoves = [];

    for (i = 0; i < pkmn.move_learnset.length; i++) {
        if (pkmn.move_learnset[i].hasOwnProperty("level") && pkmn.move_learnset[i].level === pokemon.level_current) {
            newMoves[newMoves.length] = pkmn.move_learnset[i].move;
        }
    }

    return new Promise(function(resolve) {
        resolve(newMoves);
    });
}

/**
 * Asks the Pokemon's owner which move the Pokemon should forget if the
 * Pokemon already knows four moves but wants to learn a new move. The
 * move selected by the user is replaced with the new move.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {Pokemon} pokemon The Pokemon that wants to learn a new move.
 * @param {string} newMove The name of the new move the Pokemon wants to learn.
 * @param {Move[]} moves The list of four moves (including null) known by the Pokemon.
 * 
 * @returns {number} The index of the move list (beginning at 0) for the move being replaced,
 * or -1 if user chose not to replace any moves.
 */
async function replaceMove(message, pokemon, newMove, moves) {
    /**
     * By default, have no move be replaced in case an error occurs.
     */
    let moveSlotToReplace = -1;
    
    let knownMovesIndex;
    let fields = [];
    let name;

    /**
     * First four iterations of the loop are for the known moves;
     * fifth iteration is for the new move.
     */
    for (knownMovesIndex = 0; knownMovesIndex <= moves.length; knownMovesIndex++) {
        if (knownMovesIndex < 4) {
            if (moves[knownMovesIndex].name != null) {
                name = moves[knownMovesIndex].name;
            }
        } else {
            name = newMove;
        }

        var move = parseJSON(generateMoveJSONPath(name));

        if (move != null) {
            let acc = move.accuracy;
            if (acc === 0) {
                acc = "---"
            }
    
            let pow = move.power;
            if (pow === 0) {
                pow = "---"
            }
    
            let pp = move.pp;
            if (pp === 0) {
                pp = "---"
            }
            
            let type_icon = client.emojis.find(type_icon => type_icon.name === move.type);
            let nameField;
            let valueField;
            let cat_icon = client.emojis.find(cat_icon => cat_icon.name === move.category);
            let moveCat = `${move.category[0].toUpperCase()}${move.category.slice(1)}`;

            if (knownMovesIndex < 4) {
                nameField = "Known move " + (knownMovesIndex + 1).toString() + ":";
                valueField = type_icon + " " + name + "\n"+ cat_icon + " " + moveCat + "\nPower: " + pow + "\nAccuracy: " + acc + "\nPP: " + pp;
            } else {
                nameField = "New move to learn:";
                valueField = type_icon + " " + name + "\n" + cat_icon + " " + moveCat + "\nPower: " + pow + "\nAccuracy: " + acc + "\nPP: " + pp;
            }
            
            fields[fields.length] = {
                "name": nameField,
                "value": valueField,
                "inline": true
            }
        }
    }
    
    /**
     * If all five moves were successfully read.
     */
    if (fields.length === 5) {
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
    
        
        let spriteLink = generateSpriteLink(pokemon.name, pokemon.gender, pokemon.form);
        if (spriteLink === null) {
            return new Promise(function(resolve) {
                resolve(null);
            });
        }

        let modelLink = generateModelLink(pokemon.name, pokemon.shiny, pokemon.gender, pokemon.form);
        if (modelLink === null) {
            return new Promise(function(resolve) {
                resolve(null);
            });
        }

        let name = pokemon.name;
        if (pokemon.nickname != null) {
            name = pokemon.nickname;
        }
        let embed = {
            "author": {
                "name": name,
                "icon_url": spriteLink,
            },
            "title": "Teach a new move",
            "description": "<@" + message.author.id + "> your **" + name + "** wants to learn **" + newMove + "**, but already knows four moves. Please select a move to replace by reacting with the number that corresponds to the move's slot, or ❌ to cancel learning the new move.",
            "color": getTypeColor(pokemon.type_1),
            "thumbnail": {
                "url": "attachment://" + pokemon.name + ".gif"
            },
            "fields": fields
        };
        
        let moveMessage = await sendMessageWithAttachments(message.channel, embed, [{ attachment: modelLink, name: (pokemon.name + '.gif') }], true);
        
        await moveMessage.react('1⃣');
        await moveMessage.react('2⃣');
        await moveMessage.react('3⃣');
        await moveMessage.react('4⃣');
        await moveMessage.react('❌');
        
        const filter = (reaction, user) => {
            return ['1⃣', '2⃣', '3⃣', '4⃣', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
        };
        
        await moveMessage.awaitReactions(filter, { max: 1, time: 300000, errors: ['time'] })
        .then(collected => {
            const reaction = collected.first();

            if (reaction.emoji.name === '1⃣') {
                moveSlotToReplace = 0;
            } else if (reaction.emoji.name === '2⃣') {
                moveSlotToReplace = 1;
            } else if (reaction.emoji.name === '3⃣') {
                moveSlotToReplace = 2;
            } else if (reaction.emoji.name === '4⃣') {
                moveSlotToReplace = 3;
            } else if (reaction.emoji.name === '❌') {
                moveSlotToReplace = -1;
            }
        })
        .catch(collected => {
            moveSlotToReplace = -1;
        });

        await moveMessage.clearReactions();
    }

    return new Promise(function(resolve) {
        resolve(moveSlotToReplace);
    });
}

/**
 * Automatically determines which move to replace when a Pokemon in the Day Care
 * wants to learn a new move with no free move slots. The Day Care replaces moves
 * in order of the move's index, so that the Pokemon's first move will be replaced
 * first, its second move will be replaced second, and so on, repeating after the
 * fourth move is replaced.
 * 
 * @param {Pokemon} pokemon The Pokemon that wants to learn a new move.
 * 
 * @returns {number} The move index to replace.
 */
async function replaceMoveDayCare(pokemon) {
    let moveIndex = null;
    let daycarePokemon = await doQuery("SELECT * FROM daycare WHERE daycare.pokemon = ?", [pokemon.pokemon_id]);
    if (daycarePokemon.length > 0) {
        if (daycarePokemon[0].last_move_replaced === null) {
            moveIndex = 0;
        } else {
            moveIndex = (daycarePokemon[0].last_move_replaced + 1);
            if (moveIndex === 4) {
                moveIndex = 0;
            }
        }
        
        await doQuery("UPDATE daycare SET last_move_replaced = ? WHERE daycare.pokemon = ?", [moveIndex, pokemon.pokemon_id]);
    }

    return new Promise(function(resolve) {
        resolve(moveIndex);
    });
}

/**
 * Gives experience to a Pokemon.
 * 
 * @todo Split up this function so friendship is calculated separately.
 * @todo Probably should have this function return the number of times the Pokemon leveled up.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {Pokemon} pokemon The Pokemon to give XP to.
 * @param {number} amount The amount of exp. to give to the Pokemon.
 * 
 * @returns {number} The amount of levels gained.
 */
async function giveXP(message, pokemon, amount) {
    let levelsGained = 0;

    let user = await getUser(message.author.id);


    if (pokemon != null && user != null && pokemon.level_current < 100) {
        let finalXP = (((pokemon.level_current / 10) + 1).toFixed(1) * amount);
        if (pokemon.original_trainer != pokemon.current_trainer) {
            finalXP += (finalXP * 1.5);
        }
        if (pokemon.item === "Lucky Egg") {
            finalXP += (finalXP * 1.5);
        }
        pokemon.xp += Math.floor(finalXP);

        let pokemonIsLevelingUp = true;
        let evolveTo = null;
        
        /**
         * Loop once and one more additional loop for each level the Pokemon gains.
         */
        while (pokemonIsLevelingUp) {
            let xpToNextLevel = getXpToNextLevel(pokemon.name, pokemon.xp, pokemon.level_current);
            /**
             * If Pokemon gained enough xp to reach its next level.
             */
            if (xpToNextLevel != null && xpToNextLevel <= 0) {
                levelsGained++;
                pokemon = await levelUp(message, pokemon, user, pokemon.item);
                xpToNextLevel = getXpToNextLevel(pokemon.name, pokemon.xp, pokemon.level_current);
                if (pokemon.item != "Everstone" && pokemon.daycare === null) {
                    evolveTo = await checkEvolveUponLevelUp(user, pokemon);
                }
            } else {
                /**
                 * If a level up triggered a Pokemon's evolution.
                 */
                if (isInEvolution(message.author.id) === null && evolveTo != null) {
                    if (evolveTo === "Malamar") {
                        await sendMessage(message.channel, ("˙ʇdǝɔɔɐ oʇ ,,∀,,  ɹo lǝɔuɐɔ oʇ ,,q,, ǝdʎ┴ ¡**ɹɐɯɐlɐW** oʇuᴉ ƃuᴉʌloʌǝ sᴉ **ʎɐʞuI** ɹnoʎ <@" + message.author.id + ">"));
                    } else {
                        await sendMessage(message.channel, ("<@" + message.author.id + "> your **" + pokemon.name + "** is evolving into **" + evolveTo + "**! Type \"B\" to cancel or  \"A\" to accept."));
                    }
                    pokemon.evolving = 1;
                    evolving[evolving.length] = new Evolution(message.author.id, pokemon.name, evolveTo);
                }
                pokemonIsLevelingUp = false;
            }
        }
    
        await doQuery("UPDATE pokemon SET ? WHERE pokemon.pokemon_id = ?", [pokemon, pokemon.pokemon_id]);
    }
    
    return new Promise(function(resolve) {
        resolve(levelsGained);
    });
}

/**
 * Levels up a Pokemon. This function will increment the Pokemon's level by one,
 * update its stats, teach new moves the Pokemon may learn at its new level, and
 * increase its friendship.
 * 
 * @param {Message} message The Discord message sent from the user that triggered the level up.
 * @param {Pokemon} pokemon The Pokemon that is leveling up.
 * @param {User} user The Pokebot user that owns the leveling up Pokemon.
 * @param {string} item The item held by the Pokemon.
 * 
 * @returns {Pokemon} The Pokemon after its level, stats, and friendship have updated.
 */
async function levelUp(message, pokemon, user, item) {
    if (pokemon.level_current < 100) {
        /**
         * Increment the Pokemon's level.
         */
        pokemon.level_current++;

        /**
         * Update the Pokemon's stats.
         */
        let EVs = [pokemon.ev_hp, pokemon.ev_atk, pokemon.ev_def, pokemon.ev_spatk, pokemon.ev_spdef, pokemon.ev_spd];
        let IVs = [pokemon.iv_hp, pokemon.iv_atk, pokemon.iv_def, pokemon.iv_spatk, pokemon.iv_spdef, pokemon.iv_spd];
        let statsBeforeLevelingUp = [pokemon.stat_hp, pokemon.stat_atk, pokemon.stat_def, pokemon.stat_spatk, pokemon.stat_spdef, pokemon.stat_spd];
        let statsAfterLevelingUp = updateStats(pokemon.name, pokemon.form, EVs, IVs, pokemon.level_current, pokemon.nature);
        pokemon.stat_hp = statsAfterLevelingUp[0];
        pokemon.stat_atk = statsAfterLevelingUp[1];
        pokemon.stat_def = statsAfterLevelingUp[2];
        pokemon.stat_spatk = statsAfterLevelingUp[3];
        pokemon.stat_spdef = statsAfterLevelingUp[4];
        pokemon.stat_spd = statsAfterLevelingUp[5];

        let spriteLink = generateSpriteLink(pokemon.name, pokemon.gender, pokemon.form);
        let modelLink = generateModelLink(pokemon.name, pokemon.shiny, pokemon.gender, pokemon.form);

        if (pokemon.daycare === null) {
            /* Doesn't need to be awaited. */
            message.react(pew.id);

            /**
             * Embedded message showing the Pokemon's new level and stats, along with how much each stat increased.
             */
            let embed = {
                "author": {
                    "name": pokemon.name,
                    "icon_url": spriteLink,
                },
                "title": "⬆️ Level Up",
                "description": message.author.username + " your **" + pokemon.name + "** reached *Level " + pokemon.level_current + "*!",
                "color": getTypeColor(pokemon.type_1),
                "thumbnail": {
                    "url": "attachment://" + pokemon.name + ".gif"
                },
                "fields": [
                    {
                        "name": "Stats",
                        "value": "**HP:** " + statsAfterLevelingUp[0] + "*(+" + (statsAfterLevelingUp[0] - statsBeforeLevelingUp[0]) + ")*\n" +
                                "**Attack:** " + statsAfterLevelingUp[1] + "*(+" + (statsAfterLevelingUp[1] - statsBeforeLevelingUp[1]) + ")*\n" +
                                "**Defense:** " + statsAfterLevelingUp[2] + "*(+" + (statsAfterLevelingUp[2] - statsBeforeLevelingUp[2]) + ")*\n" +
                                "**Sp. Attack:** " + statsAfterLevelingUp[3] + "*(+" + (statsAfterLevelingUp[3] - statsBeforeLevelingUp[3]) + ")*\n" +
                                "**Sp. Defense:** " + statsAfterLevelingUp[4] + "*(+" + (statsAfterLevelingUp[4] - statsBeforeLevelingUp[4]) + ")*\n" +
                                "**Speed:** " + statsAfterLevelingUp[5] + "*(+" + (statsAfterLevelingUp[5] - statsBeforeLevelingUp[5]) + ")*",
                        "inline": true
                    }
                ]
            };

            await sendMessageWithAttachments(message.channel, embed, [{ attachment: modelLink, name: (pokemon.name + '.gif') }]);

            /**
             * Increase the Pokemon's friendship.
             */
            let friend = 5;
            if (pokemon.friendship >= 100 && pokemon.friendship < 200) {
                friend = 4;
            } else if (pokemon.friendship >= 200) {
                friend = 3;
            }
            if (pokemon.ball === "Luxury Ball") {
                friend = friend * 2;
            }
            
            if (item === "Soothe Bell") {
                friend = friend * 1.5;
            }
            
            if ((pokemon.friendship + friend) > 255) {
                pokemon.friendship = 255;
            } else {
                pokemon.friendship += friend;
            }
        }

        
        /**
         * Increase the user's level.
         * @todo User levels will probably be deprecated or calculated differently.
         */
        if (pokemon.level_current >= user.level) {
            await doQuery("UPDATE user SET user.level = ? WHERE user.user_id = ?", [pokemon.level_current, message.author.id]);
        }

        /**
         * Teach the Pokemon any new moves it learns at its new level.
         */
        let levelMoves = await checkForMoveAtLevel(pokemon);
        for (let move in levelMoves) {
            await teachMove(message, pokemon, levelMoves[move], true, true);
        }
    }

    return new Promise(function(resolve) {
        resolve(pokemon);
    });
}

/**
 * Gives experience to all Pokemon owned by a user that are in the Day Care.
 * 
 * @param {Message} message The Discord message sent from the user.
 */
async function giveDayCareXP(message) {
    let daycarePokemon = await getDaycare(message.author.id);
    if (daycarePokemon != null) {
        for (let pkmn in daycarePokemon) {
            let levels = await giveXP(message, daycarePokemon[pkmn], 15);
            await doQuery("UPDATE daycare SET daycare.levels_gained = ? WHERE daycare.pokemon = ?", [(levels + pokemon.levels_gained), daycarePokemon[pkmn].pokemon]);
        }
    }
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
    let totalXp = -1;
    let xpTable = parseJSON("../data/xp.json");

    if (xpTable != null) {
        if (rate === "Erratic") {
            totalXp = xpTable.erratic[currentLevel - 1];
        } else if (rate === "Fast") {
            totalXp = xpTable.fast[currentLevel - 1];
        } else if (rate === "Medium Fast") {
            totalXp = xpTable.medium_fast[currentLevel - 1];
        } else if (rate === "Medium Slow") {
            totalXp = xpTable.medium_slow[currentLevel - 1];
        } else {
            totalXp = xpTable.slow[currentLevel - 1];
        }
    }

    return totalXp;
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
    let xpToNextLevel = null;
    
    if(currentLevel < 100) {
        /**
         * Forms changes do not affect a Pokemon's leveling rate,
         * so we can safely pretend that the Pokemon has a null form.
         */
        let pkmn = parseJSON(generatePokemonJSONPath(name, null));
        let xpTable = parseJSON("../data/xp.json");

        if (pkmn != null && xpTable != null) {
            if (pkmn.leveling_rate === "Erratic") {
                xpToNextLevel = (xpTable.erratic[currentLevel] - currentTotalXp);
            } else if (pkmn.leveling_rate === "Fast") {
                xpToNextLevel = (xpTable.fast[currentLevel] - currentTotalXp);
            } else if (pkmn.leveling_rate === "Medium Fast") {
                xpToNextLevel = (xpTable.medium_fast[currentLevel] - currentTotalXp);
            } else if (pkmn.leveling_rate === "Medium Slow") {
                xpToNextLevel = (xpTable.medium_slow[currentLevel] - currentTotalXp);
            } else {
                xpToNextLevel = (xpTable.slow[currentLevel] - currentTotalXp);
            }
        }
    }

    return xpToNextLevel;
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
    let multiplier = 1;

    let effect = parseJSON(generateNatureJSONPath(nature));
    
    if (effect.increased_stat === statName) {
        multiplier = 1.1;
    } else if (effect.decreased_stat === statName) {
        multiplier = 0.9;
    }

    return multiplier;
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
    let stat;
    if (statName === "hp") {
        stat = Math.floor(((2 * baseValue + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
    } else {
        stat = Math.floor(((Math.floor(((2 * baseValue + iv + Math.floor(ev / 4)) * level) / 100)) + 5) * getNatureStatMultiplier(nature, statName));
    }
    return stat;
}

/**
 * Generates a Pokemon object based on its name.
 * 
 * @todo The `region` and `location` parameters are not necessary and can be easily determined from the `message` parameter.
 * @todo Pass an ability name as an argument. Some abilities affect wild Pokemon, like Compound Eyes and Intimidate.
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
    /**
     * It is ok for user to be null in this function.
     * User should only be null when generating a starter Pokemon.
     * @todo Maybe a seperate generator function could be made for starter Pokemon.
     */
    let user = await getUser(message.author.id);
    let form = getForm(user, name, region, location);
    
    let pkmn = parseJSON(generatePokemonJSONPath(name, form));
    
    let final_ability;
    let abilitySlot = 0;

    /**
     * Meowstic is the only Pokemon to have exclusive (hidden) abilites
     * based on its gender rather than form.
     */
    if (name === "Meowstic" && hidden) {
        if (gender === "Female") {
            abilitySlot = 3;
            final_ability = "Competitive";
        } else {
            abilitySlot = 2;
            final_ability = "Prankster";
        }
    } else {
        /**
         * Randomly determine the ability of the Pokemon.
         */
        let hiddenAbilities = [];
        let abilities = [];

        let abilityIndex = 0;

        if (hidden === true) {
            for (abilityIndex; abilityIndex < pkmn.abilities.length; abilityIndex++) {
                if(pkmn.abilities[abilityIndex].hasOwnProperty('hidden')) {
                    hiddenAbilities[hiddenAbilities.length] = pkmn.abilities[abilityIndex].name;
                }
            }   
        } else {
            for (abilityIndex; abilityIndex < pkmn.abilities.length; abilityIndex++) {
                if(!pkmn.abilities[abilityIndex].hasOwnProperty('hidden')) {
                    abilities[abilities.length] = pkmn.abilities[abilityIndex].name;
                }
            }   
        }

        let random = Math.floor(Math.random() * 100);
        if ((random % 2) === 1) {
            abilitySlot = 1;
        }
        
        if (hiddenAbilities.length === 0) {
            if (abilitySlot > (abilities.length - 1) || abilitySlot === 0) {
                final_ability = abilities[0];
            } else {
                final_ability = abilities[1];
            } 
        } else {
            final_ability = hiddenAbilities[0];
            abilitySlot = 2;
        }
    }

    /**
     * Assign moves to the Pokemon based on the Pokemon's level.
     */
    let moves = [null, null, null, null];
    let moveIndex = 0;
    for (moveIndex = 0; moveIndex < pkmn.move_learnset.length; moveIndex++) {
        if(pkmn.move_learnset[moveIndex].level <= level) {
            if (moves[0] === null) {
                moves[0] = pkmn.move_learnset[moveIndex].move;
            }  else if(moves[1] === null) {
                moves[1] = pkmn.move_learnset[moveIndex].move;
            }  else if(moves[2] === null) {
                moves[2] = pkmn.move_learnset[moveIndex].move;
            } else if(moves[3] === null) {
                moves[3] = pkmn.move_learnset[moveIndex].move;
            } else { /* If Pokemon knows four moves. */
                /**
                 * Replace a random move, or 20% chance to not teach the new move at all.
                 * @todo Learn how moves are assigned to wild Pokemon in the games and apply it here.
                 */
                let random = Math.floor(Math.random() * 100);
                if(random >= 20) {
                    if (random <= 40) {
                        moves[0] = pkmn.move_learnset[moveIndex].move;
                    } else if (random <= 60) {
                        moves[1] = pkmn.move_learnset[moveIndex].move;
                    } else if (random <= 80) {
                        moves[2] = pkmn.move_learnset[moveIndex].move;
                    } else {
                        moves[3] = pkmn.move_learnset[moveIndex].move;
                    }
                }
            }
        }
    }
    
    /**
     * Determine the minimum amount of XP the Pokemon should have at its current level.
     */
    let xp = getTotalXpAtLevel(pkmn.leveling_rate, level, region);
    
    /**
     * Randomly determine the Pokemon's gender, or assign a specific gender
     * if the Pokemon only has one possible gender.
     */
    let gender;
    if (pkmn.gender_ratios === null) {
        gender = null;
    } else if (!pkmn.gender_ratios.hasOwnProperty('male')) {
               gender = "Female";
    } else if (!pkmn.gender_ratios.hasOwnProperty('female')) {
               gender = "Male";
    } else {
        let random = Math.floor(Math.random() * 100);
        if (random <= pkmn.gender_ratios.male) {
            gender = "Male";
        } else {
            gender = "Female";
        }
    }
    
    /**
     * Randomly assign a nature to the Pokemon.
     * Natures apply a small bonus to one stat and a small malus to another stat.
     */
    let natures = ["Hardy", "Lonely", "Brave", "Adamant", "Naughty", "Bold", "Docile", "Relaxed", "Impish", "Lax", "Timid", "Hasty", "Serious", "Jolly", "Naive", "Modest", "Mild", "Quiet", "Bashful", "Rash", "Calm", "Gentle", "Sassy", "Careful", "Quirky"];
    let naturesIndex = Math.floor(Math.random() * natures.length);
    let nature = natures[naturesIndex];
    
    /**
     * Randomly generate Individual Values (IVs) and initialize all Effort Values (EVs) at 0.
     */
    let EVs = [0,0,0,0,0,0];
    let IVs = [0,0,0,0,0,0];
    let ivIndex = 0;
    for (ivIndex; ivIndex < IVs.length; ivIndex++) {
        IVs[ivIndex] = Math.floor(Math.random() * 32);
    }
    
    /**
     * Determine the Pokemon's stats based on its base stats, level, IVs, EVs, and nature.
     */
    let stats = updateStats(name, form, EVs, IVs, level, nature);
    
    /**
     * Randomly determine if the Pokemon is shiny.
     * 1/4096 chance, very rare.
     * 
     * @todo Add an argument to multiply the lucky number, so that a multiplier of
     * 0 disables any chance of shininess and a multiplier of 4095 guarantees shininess.
     */
    let shiny = 0;
    let luckyNumber = Math.floor(Math.random() * 4096);
    if (luckyNumber >= 4095) {
        shiny = 1;
    }
    
    /**
     * Get the Pokemon's type(s).
     */
    let type = [null, null];
    type[0] = pkmn.types[0];
    if(pkmn.types.length === 2) {
        type[1] = pkmn.types[1];
    }
    
    /**
     * Randomly determine if the Pokemon spawns with any possible hold item it can have in the wild.
     * @todo Some abilities increase the liklihood of encountering a Pokemon holding an item.
     */
    let item = null;
    if (pkmn.hasOwnProperty("items")) {
        let itemCount;
        for (itemCount = 0; itemCount < pkmn.items.length; itemCount++) {
            let itemChance = Math.ceil(Math.random() * 100);
            if (itemChance <= pkmn.items[itemCount].chance) {
                item = pkmn.items[itemCount].name;
            }
        }
    }
    
    let nick = null;
    
    let newPokemon = new Pokemon(name, nick, pkmn.national_id, form, type, item, level, xp, moves, final_ability, abilitySlot, nature, stats, IVs, EVs, gender, region, location, level, shiny);
    
    newPokemon.friendship = pkmn.base_friendship;
    
    return new Promise(function(resolve) {
        resolve(newPokemon);
    });
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
async function setLeadPokemon(message, name) {
    name = name.toLowerCase();
    
    let user = await getUser(message.author.id);
    let pokemon = await getPokemon(message.author.id);
    let lead = await getLeadPokemon(message.author.id);

    let wereNoErrorsEncountered = true;

    let selectedPokemon = null;

    if (
        (user != null)
        &&
        (pokemon != null)
        &&
        (lead != null)
    ) {
        let matchedPokemon = getAllOwnedPokemonWithName(name, pokemon);

        /**
         * Check if user tried to set their current lead Pokemon as their new lead Pokemon.
         */
        let onlyMatchIsLead = false;
        if (matchedPokemon.length === 1 && matchedPokemon[0].lead === 1) {
            onlyMatchIsLead = true;
        }
        
        /**
         * If the user tried to set their current lead Pokemon as their new lead Pokemon.
         */
        if (onlyMatchIsLead) {
            await sendMessage(message.channel, (message.author.username + " your **" + matchedPokemon[0].name + "** is already your lead Pokémon."));
        /**
         * If only one Pokemon matched the user's name query.
         */
        } else if (matchedPokemon.length === 1) {
            selectedPokemon = matchedPokemon[0];
        /**
         * If user has multiple Pokemon that matched the name query.
         */
        } else if (matchedPokemon.length > 1) {
            let userIsSelectingAPokemon = true;
            while (userIsSelectingAPokemon) {
                selectedPokemon = await selectDuplicatePokemon(message, user, message.author.username, matchedPokemon);
                if (selectedPokemon != null && selectedPokemon.lead === 1) {
                    await sendMessage(message.channel, (message.author.username + " your **" + selectedPokemon.name + "** is already your lead Pokémon."));
                } else {
                    userIsSelectingAPokemon = false;
                }
            }
        }

        if (selectedPokemon != null) {
            let moves = await getPokemonKnownMoves(selectedPokemon.pokemon_id);
            moves = moves.map(move => move.name);
            
            if (user.field === "Surfing") {
                if (moves.indexOf("Surf") < 0) {
                    await doQuery("UPDATE user SET user.field = ? WHERE user.user_id = ?", ["Walking", message.author.id]);
                    await sendMessage(message.channel, (message.author.username + " stopped surfing on their **" + lead.name + "** and is now walking."));
                }
            } else if (user.field === "Rock Smash") {
                if (moves.indexOf("Rock Smash") < 0) {
                    await doQuery("UPDATE user SET user.field = ? WHERE user.user_id = ?", ["Walking", message.author.id]);
                    await sendMessage(message.channel, (message.author.username + " stopped smashing rocks with **" + lead.name + "** and is now walking."));
                } 
            } else if (user.field === "Headbutt") {
                if (moves.indexOf("Headbutt") < 0) {
                    await doQuery("UPDATE user SET user.field = ? WHERE user.user_id = ?", ["Walking", message.author.id]);
                    await sendMessage(message.channel, (message.author.username + " stopped headbutting trees with **" + lead.name + "** and is now walking."));
                }
            } else if (user.field === "Dive") {
                if (moves.indexOf("Dive") < 0) {
                    await doQuery("UPDATE user SET user.field = ? WHERE user.user_id = ?", ["Walking", message.author.id]);
                    await sendMessage(message.channel, (message.author.username + " stopped diving underwater on their **" + lead.name + "** and is now walking."));
                }
            }

            if (
                (await doQuery("UPDATE pokemon SET pokemon.lead = 0 WHERE pokemon.pokemon_id = ?", [lead.pokemon_id]) != null)
                &&
                (await doQuery("UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?", [selectedPokemon.pokemon_id]) != null)
                &&
                (await doQuery("UPDATE user SET user.lead = ? WHERE user.user_id = ?", [selectedPokemon.pokemon_id, message.author.id]) != null)
            ) {
                wereNoErrorsEncountered = await sendMessage(message.channel, (message.author.username + " set **" + selectedPokemon.name + "** as their lead Pokémon."));
            } else {
                wereNoErrorsEncountered = false;
            }
        }
    } else {
        wereNoErrorsEncountered = false;
    }
    
    return new Promise(function(resolve) {
        resolve(wereNoErrorsEncountered);
    });
}


/**
 * Allows a user to drop off and pick up Pokemon from the Day Care.
 * 
 * @param {Message} message The Discord message sent from the user.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function dayCare(message) {
    /**
     * Check if user is in a location where there is a Day Care.
     */
    let user = await getUser(message.author.id);
    if (user != null) {
        let userIsInDayCareLocation = true;
        if (user.region === "Kanto") {
            if (user.location != "Route 5" && user.location != "Four Island") {
                await sendMessage(message.channel, (message.author.username + " there is no Day Care here. You may find one at **Route 5** or **Four Island** in the **Kanto** region."));
                userIsInDayCareLocation = false;
            }
        } else  if (user.region === "Johto") {
            if (user.location != "Route 34") {
                await sendMessage(message.channel, (message.author.username + " there is no Day Care here. You may find one at **Route 34** in the **Johto** region."));
                userIsInDayCareLocation = false;
            }
        } else  if (user.region === "Hoenn") {
            if (user.location != "Route 117" && user.location != "Battle Resort") {
                await sendMessage(message.channel, (message.author.username + " there is no Day Care here. You may find one at **Route 117** or the **Battle Resort** in the Hoenn region."));
                userIsInDayCareLocation = false;
            }
        } else  if (user.region === "Sinnoh") {
            if (user.location != "Solaceon Town") {
                await sendMessage(message.channel, (message.author.username + " there is no Day Care here. You may find one at **Solaceon Town** in the **Sinnoh** region."));
                userIsInDayCareLocation = false;
            }
        } else  if (user.region === "Unova") {
            if (user.location != "Route 3") {
                await sendMessage(message.channel, (message.author.username + " there is no Day Care here. You may find one at **Route 3** in the **Unova** region."));
                userIsInDayCareLocation = false;
            }
        } else  if (user.region === "Kalos") {
            if (user.location != "Route 7 (Rivière Walk)") {
                await sendMessage(message.channel, (message.author.username + " there is no Day Care here. You may find one at **Route 7 (Rivière Walk)** in the **Kalos** region."));
                userIsInDayCareLocation = false;
            }
        } else  if (user.region === "Alola") {
            if (user.location != "Paniola Ranch") {
                await sendMessage(message.channel, (message.author.username + " there is no Day Care here. You may find one at **Paniola Ranch** in the **Alola** region."));
                userIsInDayCareLocation = false;
            }
        }

        if (userIsInDayCareLocation) {
            const DROP_OFF = 1;
            const PICK_UP = 2;
            const VIEW = 3;
            const LEAVE = 0;

            let dayCareSelection = LEAVE;
            let visitingDaycare = true;

            /**
             * Allow user to do things at the Day Care until the user either times out or decides to leave.
             */
            while (visitingDaycare) {
                let fields = [];
                let allowedEmotes = [];

                /**
                 * Only allow user to select a choice that does something.
                 */
                let daycarePokemon = await getDaycare(message.author.id);
                if (daycarePokemon != null) {
                    /**
                     * If user isn't at the limit of two Pokemon in the Day Care.
                     */
                    if (daycarePokemon.length < 2) {
                        fields[fields.length] = {
                            "name": "📥 Drop Off",
                            "value": "Drop off a Pokémon at the Day Care. It will passively earn experience and the Day Care will automatically teach it new moves that it learns as it levels up. Your Pokémon will be unable to evolve, however.",
                            "inline": false
                        }
                        allowedEmotes[allowedEmotes.length] = '📥';
                    }
                    
                    /**
                     * If user has any Pokemon in the Day Care.
                     */
                    if (daycarePokemon.length > 0) {
                        fields[fields.length] = {
                            "name": "📤 Pick Up",
                            "value": "Pick up a Pokémon from the Day Care. There is a base cost of " + dollar + "100 to pick up a Pokémon, plus an additional " + dollar + "100 for each level it gained.",
                            "inline": false
                        }
                        fields[fields.length] = {
                            "name": "ℹ View Pokémon",
                            "value": "View your Pokémon that are currently in the Day Care.",
                            "inline": false
                        }
                        allowedEmotes[allowedEmotes.length] = '📤';
                        allowedEmotes[allowedEmotes.length] = 'ℹ';
                    }
                }

                /**
                 * User will always be able to leave Day Care regardless of how many Pokemon they have in it.
                 */
                fields[fields.length] = {
                    "name": "❌ Leave",
                    "value": "Leave the Day Care.",
                    "inline": false
                }
                allowedEmotes[allowedEmotes.length] = '❌';

                /**
                 * Send a message showing the Day Care choices to the user.
                 */
                let embed = {
                    "author": {
                        "name": "Day Care"
                    },
                    "title": "Welcome to the Day Care!",
                    "description": message.author.username + " please react using the emote corresponding to the choices below to make a decision.",
                    "fields": fields
                };
                let dayCareMessage = await sendMessage(message.channel, {embed}, true);

                for (let emote in allowedEmotes) {
                    await dayCareMessage.react(allowedEmotes[emote]);
                }

                const filter = (reaction, user) => {
                    return allowedEmotes.includes(reaction.emoji.name) && user.id === message.author.id;
                };
                
                /**
                 * User selects a choice by reacting to the message.
                 */
                await dayCareMessage.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
                .then(collected => {
                    const reaction = collected.first();

                    if (reaction.emoji.name === '📥') {
                        dayCareSelection = DROP_OFF;
                    } else if (reaction.emoji.name === '📤') {
                        dayCareSelection = PICK_UP;
                    } else if (reaction.emoji.name === 'ℹ') {
                        dayCareSelection = VIEW;
                    } else if (reaction.emoji.name === '❌') {
                        dayCareSelection = LEAVE;
                    }
                })
                .catch(collected => {
                    dayCareSelection = LEAVE;
                });

                await dayCareMessage.clearReactions();
                dayCareMessage.delete(0);
        
                if (dayCareSelection === VIEW) {
                    visitingDaycare = await viewDayCare(message, daycarePokemon);
                } else if (dayCareSelection === DROP_OFF) {
                    await placeInDaycare(message, user);
                } else if (dayCareSelection === PICK_UP) {
                    visitingDaycare = await pickUpFromDayCare(message, user);
                } else if (dayCareSelection === LEAVE) {
                    visitingDaycare = false;
                }
            }

            await sendMessage(message.channel, (message.author.username + " left the Day Care."));
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
 * @param {User} user The Pokebot user who is accessing the Day Care.
 * @param {Pokemon[]} daycarePokemon The list of Pokemon owned by the user who are in the Day Care.
 * 
 * @returns {boolean} False is user opted to leave the Day Care.
 */
async function pickUpFromDayCare(message, user) {
    let returnToDayCare = true;
    let pickingUp = true;

    while (pickingUp) {
        let fields = [];
        let reactions = [];
        let cost = [];
        let costForAllPokemon = 0;

        let pokemonNames = [];

        let daycarePokemon = await getDaycare(user.user_id);
    
        let description = message.author.username + " please react using the emote corresponding to the Pokémon below to pick it up. You can return to the other Day Care interactions by reacting with 🔙 or leave the Day Care with ❌.";
        
        if (daycarePokemon.length > 0) {
            /**
             * Get information about the Pokemon in the user's Day Care.
             */
            for (let pkmn in daycarePokemon) {
                cost[cost.length] = (100 + (daycarePokemon[pkmn].levels_gained * 100));
                costForAllPokemon += cost[pkmn];

                let pokemon = await doQuery("SELECT * FROM pokemon WHERE pokemon.pokemon_id = ?", [daycarePokemon[pkmn].pokemon]);
                pokemon = pokemon[0];
                pokemonNames[pokemonNames.length] = pokemon.name;
        
                let value = "**Level:** " + pokemon.level_current + "(+" + daycarePokemon[pkmn].levels_gained + ")\n**Cost:** " + dollar + cost[pkmn] + "\n";

                /**
                 * Tell the user if they can afford to pick up the Pokemon or not.
                 * If so, allow them to pick it up.
                 */
                if (user.money < cost[pkmn]) {
                    value += "**Can't afford!**";

                    fields[fields.length] = {
                        "name": pokemon.name,
                        "value": value,
                        "inline": true
                    }
                } else {
                    if (pkmn === "0") {
                        reactions[reactions.length] = "1⃣";
                    } else if (pkmn === "1") {
                        reactions[reactions.length] = "2⃣";
                    }

                    fields[fields.length] = {
                        "name": reactions[pkmn] + " " + pokemon.name,
                        "value": value,
                        "inline": true
                    }
                }
            }
        }
        /**
         * If user has no Pokemon in the Day Care.
         */
        else {
            fields[fields.length] = {
                "name": "No Pokémon",
                "value": "You currently don't have any Pokémon in the Day Care.",
                "inline": true
            }
        }

        /**
         * If user has two Pokemon in the Day Care and can afford to pick both of them up.
         */
        if (user.money >= costForAllPokemon && daycarePokemon.length == 2) {
            reactions[reactions.length] = '👥';
            description = message.author.username + " please react using the emote corresponding to the Pokémon below to pick it up, or 👥 to pick up both. You can return to the other Day Care interactions by reacting with 🔙 or leave the Day Care with ❌.";
        }
    
        reactions[reactions.length] = '🔙';
        reactions[reactions.length] = '❌';
    
        let embed = {
            "author": {
                "name": "Day Care"
            },
            "title": "Day Care Pick Up",
            "description": description,
            "fields": fields
        };
        
        let dayCareMessage = await sendMessage(message.channel, {embed}, true);
    
        for (let emote in reactions) {
            await dayCareMessage.react(reactions[emote]);
        }
    
        const filter = (reaction, user) => {
            return reactions.includes(reaction.emoji.name) && user.id === message.author.id;
        };
    
        const FIRST_POKEMON = 0;
        const SECOND_POKEMON = 1;
        const BOTH_POKEMON = 2;
        const RETURN = 3;
        const LEAVE = 4;
    
        let selectedOption = LEAVE;
        
        /**
         * User selects a choice by reacting to the message.
         */
        await dayCareMessage.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
        .then(collected => {
            const reaction = collected.first();
    
            if (reaction.emoji.name === "1⃣") {
                selectedOption = FIRST_POKEMON;
            } else if (reaction.emoji.name === "2⃣") {
                selectedOption = SECOND_POKEMON;
            } else if (reaction.emoji.name === '👥') {
                selectedOption = BOTH_POKEMON;
            } else if (reaction.emoji.name === '🔙') {
                selectedOption = RETURN;
            } else if (reaction.emoji.name === '❌') {
                selectedOption = LEAVE;
            }
        })
        .catch(() => {
            selectedOption = LEAVE;
        });
    
        dayCareMessage.delete(0);

        if (selectedOption === FIRST_POKEMON) {
            await doQuery("DELETE FROM daycare WHERE daycare.daycare_id = ?", [daycarePokemon[0].daycare_id]);
            await doQuery("UPDATE user SET user.money = ? WHERE user.user_id = ?", [(user.money - cost[0]), user.user_id]);

            await sendMessage(message.channel, (message.author.username + " picked up their **" + pokemonNames[0] + "** from the Day Care."));
        } else if (selectedOption === SECOND_POKEMON) {
            await doQuery("DELETE FROM daycare WHERE daycare.daycare_id = ?", [daycarePokemon[1].daycare_id]);
            await doQuery("UPDATE user SET user.money = ? WHERE user.user_id = ?", [(user.money - cost[1]), user.user_id]);

            await sendMessage(message.channel, (message.author.username + " picked up their **" + pokemonNames[1] + "** from the Day Care."));
        } else if (selectedOption === BOTH_POKEMON) {
            await doQuery("DELETE FROM daycare WHERE daycare.daycare_id = ?", [daycarePokemon[0].daycare_id]);
            await doQuery("DELETE FROM daycare WHERE daycare.daycare_id = ?", [daycarePokemon[1].daycare_id]);
            await doQuery("UPDATE user SET user.money = ? WHERE user.user_id = ?", [(user.money - costForAllPokemon), user.user_id]);

            await sendMessage(message.channel, (message.author.username + " picked up their **" + pokemonNames[0] + "** and **" + pokemonNames[1] + "** from the Day Care."));
        } else if (selectedOption === RETURN) {
            pickingUp = false;
        } else if (selectedOption === LEAVE) {
            pickingUp = false;
            returnToDayCare = false;
        }
    }

    return new Promise(function(resolve) {
        resolve(returnToDayCare);
    });
}

/**
 * Sends a message containing detailed information about
 * a user's Pokemon that are in the Day Care.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {Pokemon[]} daycarePokemon The list of Pokemon owned by the user who are in the Day Care.
 * 
 * @returns {boolean} False is user opted to leave the Day Care.
 */
async function viewDayCare(message, daycarePokemon) {
    let fields = [];
    let reactions = [];

    let description = message.author.username + " these are your Pokémon that are currently in the Day Care. You can return to the other Day Care interactions by reacting with 🔙 or leave the Day Care with ❌.";
    
    if (daycarePokemon.length > 0) {
        /**
         * Get information about the Pokemon in the user's Day Care.
         */
        for (let pkmn in daycarePokemon) {
            let pokemon = await doQuery("SELECT * FROM pokemon WHERE pokemon.pokemon_id = ?", [daycarePokemon[pkmn].pokemon]);
            pokemon = pokemon[0];

            let pokemonJSON = parseJSON(generatePokemonJSONPath(pokemon.name, pokemon.form));
            let shuffle_icon = await getShuffleEmoji(pokemon.number);
            
            /**
             * Convert moves into a list of just the move names.
             */
            let moveString = "";
            let moves = await getPokemonKnownMoves(daycarePokemon[pkmn].pokemon);
            moves = moves.map(move => move.name);
            for (let move in moves) {
                if (moves[move] != null) {
                    moveString += ("\n" + moves[move]);
                }
            }

            /**
             * Get list of the Pokemon's egg groups.
             */
            let eggGroupsString = "";
            for (group in pokemonJSON.egg_groups) {
                eggGroupsString += ("\n" + pokemonJSON.egg_groups[group]);
            }
    
            /**
             * @todo Other stats relevant to Pokemon breeding should go here.
             */
            let value = "**Level:** " + pokemon.level_current + " (+" + daycarePokemon[pkmn].levels_gained + ")\n**Gender:** " + pokemon.gender + "\n**Ability:** " + pokemon.ability + "\n**Moves:**" + moveString + "\n**Egg Groups:**" + eggGroupsString;

            fields[fields.length] = {
                "name": shuffle_icon + " " + pokemon.name,
                "value": value,
                "inline": true
            }
        }
    }
    /**
     * If user has no Pokemon in the Day Care.
     */
    else {
        fields[fields.length] = {
            "name": "No Pokémon",
            "value": "You currently don't have any Pokémon in the Day Care.",
            "inline": true
        }
    }

    reactions[reactions.length] = '🔙';
    reactions[reactions.length] = '❌';

    let embed = {
        "author": {
            "name": "Day Care"
        },
        "title": "Viewing Pokémon",
        "description": description,
        "fields": fields
    };
    
    let dayCareMessage = await sendMessage(message.channel, {embed}, true);

    for (let emote in reactions) {
        await dayCareMessage.react(reactions[emote]);
    }

    const filter = (reaction, user) => {
        return reactions.includes(reaction.emoji.name) && user.id === message.author.id;
    };

    const RETURN = 0;
    const LEAVE = 1;

    let selectedOption = LEAVE;
    let returnToDayCare = true;
    
    /**
     * User selects a choice by reacting to the message.
     */
    await dayCareMessage.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
    .then(collected => {
        const reaction = collected.first();

        if (reaction.emoji.name === '🔙') {
            selectedOption = RETURN;
        } else if (reaction.emoji.name === '❌') {
            selectedOption = LEAVE;
        }
    })
    .catch(() => {
        selectedOption = LEAVE;
    })

    dayCareMessage.delete(0);

    if (selectedOption === RETURN) {
        returnToDayCare = true;
    } else if (selectedOption === LEAVE) {
        returnToDayCare = false;
    }

    return new Promise(function(resolve) {
        resolve(returnToDayCare);
    });
}

/**
 * Prompts the user to select a Pokemon to place in the Day Care
 * and then places that Pokemon into the Day Care.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {User} user The Pokebot user who is placing a Pokemon in the Day Care.
 * 
 * @returns {boolean} True if a Pokemon was placed in the Day Care.
 */
async function placeInDaycare(message, user) {
    let wasPokemonPlacedInDayCare = false;
    let pokemon = await getPokemon(message.author.id);
    if (pokemon.length === 1) {
        await sendMessage(message.channel, (message.author.username + " you cannot put your only available Pokémon in the Day Care."));
    } else {
        let description = message.author.username + " please enter the name or nickname of the Pokémon you want to drop off, or type `Cancel` to exit the Day Care.";
        let selectedPokemon = await selectOwnedPokemon(message, user, pokemon, description);
        if (selectedPokemon != null) {
            let dayCareInsert = {
                "pokemon": selectedPokemon.pokemon_id,
                "trainer": user.user_id,
                "region": user.region,
                "location": user.location
            }
    
            let dropOff = await doQuery("INSERT INTO daycare SET ?", [dayCareInsert]);
            if (dropOff != null) {
                if (await doQuery("UPDATE pokemon SET pokemon.lead = 0, pokemon.daycare = ? WHERE pokemon.pokemon_id = ?", [dropOff.insertId, selectedPokemon.pokemon_id]) != null) {
                    wasPokemonPlacedInDayCare = true;
                }
            }
            
            if (selectedPokemon.lead === 1) {
                for (pkmn in pokemon) {
                    if (pokemon[pkmn].pokemon_id != selectedPokemon.pokemon_id) {
                        await doQuery("UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?", [pokemon[pkmn].pokemon_id]);
                        await doQuery("UPDATE user SET user.lead = ? WHERE user.user_id = ?", [pokemon[pkmn].pokemon_id, user.user_id]);
                        await sendMessage(message.channel, (message.author.username + " dropped off their **" + selectedPokemon.name + "** at the Day Care and set **" + pokemon[pkmn].name + "** as their new lead Pokémon."));
                        break;
                    }
                }
            } else {
                await sendMessage(message.channel, (message.author.username + " dropped off their **" + selectedPokemon.name + "** at the Day Care."));
            }
        }
    }

    return new Promise(function(resolve) {
        resolve(wasPokemonPlacedInDayCare);
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
 * @returns {boolean} True if a Pokemon was released.
 */
async function releasePokemon(message, name) {
    let wasPokemonReleased = false;

    let user = await getUser(message.author.id);
    let pokemon = await getPokemon(message.author.id);
    
    /**
     * If user only has one Pokemon.
     */
    if (pokemon.length < 2) {
        await sendMessage(message.channel, (message.author.username + " you cannot release your only Pokémon."));
    } else {
        let description = (message.author.username + " please enter the name or nickname of the Pokémon you would like to release.");
        let pokemonToRelease = await selectOwnedPokemon(message, user, pokemon, description, name);
    
        if (pokemonToRelease != null) {
            let confirm = await confirmRelease(message, pokemonToRelease);
            /**
             * If user confirms the release.
             */
            if (confirm) {
                /**
                 * If released Pokemon was the user's lead Pokemon, automatically
                 * set a different Pokemon from the user as lead.
                 */
                if (pokemonToRelease.lead === 1) {
                    for (pkmn in pokemon) {
                        if (pokemon[pkmn].pokemon_id != pokemonToRelease.pokemon_id) {
                            await doQuery("UPDATE user SET user.lead = ? WHERE user.user_id = ?", [pokemon[pkmn].pokemon_id, user.user_id]);
                            await doQuery("DELETE FROM pokemon WHERE pokemon.pokemon_id = ?", [pokemonToRelease.pokemon_id]);
                            await doQuery("UPDATE pokemon SET pokemon.lead = 1 WHERE pokemon.pokemon_id = ?", [pokemon[pkmn].pokemon_id]);
                            await sendMessage(message.channel, (message.author.username + " released their **" + pokemonToRelease.name + "** into the wild and set **" + pokemon[pkmn].name + "** as their new lead Pokémon."));
                            wasPokemonReleased = true;
                            break;
                        }
                    }
                /**
                 * User released a Pokemon that wasn't their lead.
                 */
                } else {
                    /**
                     * Take the Pokemon's held item if it gets released. This is to prevent
                     * unique items from being permanently lost.
                     */
                    if (pokemonToRelease.item != null) {
                        await addItemToBag(message.author.id, pokemonToRelease.item, 1);
                        await sendMessage(message.channel, (message.author.username + " took the *" + pokemonToRelease.item + "* from their **" + pokemonToRelease.name + "** and released the Pokémon into the wild."));
                    } else {
                        await sendMessage(message.channel, (message.author.username + " released their **" + pokemonToRelease.name + "** into the wild."));
                    }
                    wasPokemonReleased = true;
                }
            /**
             * User chose a Pokemon to release but decided to keep it.
             */
            } else {
                await sendMessage(message.channel, (message.author.username + " decided not to release their **" + pokemonToRelease.name + "**."));
            }
        /**
         * User did not choose a Pokemon to release.
         */
        } else {
            await sendMessage(message.channel, (message.author.username + " decided not to release any of their Pokémon."));
        }
    }

    return new Promise(function(resolve) {
        resolve(wasPokemonReleased);
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
    var description = message.author.username + " are you sure you want to release this " + pkmn.name + "? React with ✅ to confirm or ❌ to cancel the release.";

    /**
     * Show detailed stats about the Pokemon.
     */
    let releaseMessage = await displayAnOwnedPkmn(pkmn, message, description, true);

    await releaseMessage.react("✅");
    await releaseMessage.react("❌");

    const filter = (reaction, user) => {
        return ["✅","❌"].includes(reaction.emoji.name) && user.id === message.author.id;
    };

    let releaseDecision = false;
    
    /**
     * User makes a choice by reacting to the message.
     */
    await releaseMessage.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
    .then(collected => {
        const reaction = collected.first();

        if (reaction.emoji.name === "✅") {
            releaseDecision = true;
        } else if (reaction.emoji.name === "❌") {
            releaseDecision = false;
        }
    })
    .catch(collected => {
        releaseDecision = false;
    });
    
    releaseMessage.delete(0);

    return new Promise(function(resolve) {
        resolve(releaseDecision);
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
    let region = user.region;
    let location = user.location;
    let leadLevel = lead.level_current;
    let field = user.field;

    let possiblePokemonRare = [];
    let possiblePokemonNotRare = [];

    let hasHiddenAbility = false;

    let selectedPokemon = null;

    let locationData = parseJSON(generateLocationJSONPath(user.region, user.location));

    /**
     * If a location file for the user's location exists.
     * If it doesn't, then that means the user is in a location with no wild Pokemon.
     */
    if (locationData != null) {
        let rarityIndex = 0;

        /**
         * Get current time of the user. This is needed
         * for regions that have time-based encounters.
         */
        let cur = convertToTimeZone(user);
        let hour = moment(cur).hour();
        if (region === "Kanto" || region === "Johto" || region === "Sinnoh") {
            /**
             * Kanto, Johto, and Sinnoh in Gen. 4 have morning, noon, and evening encounters.
             */
            if (hour >= 10 && hour < 20) {
                rarityIndex = 1;
            } else if (hour >= 20 || hour < 4) {
                rarityIndex = 2;
            }
        } else if (region === "Unova") {
            /**
             * Unova has seasonal encounters.
             */
            rarityIndex = moment().month() % 4;
        } else if (region === "Alola") {
            /**
             * Alola only has day and night encounters.
             */
            if (hour < 6 || hour >= 18) {
                rarityIndex = 1;
            }
        }
    
        /**
         * Check if user has the Poke Radar.
         * The Poke Radar is needed for certain
         * encounters in some regions.
         */
        let hasRadar = false;
        let bag = await getBag(user.user_id);
        if (bag != null) {
            let doesUserHaveIt = bag.map(function(t) { return t.name.toLowerCase(); }).indexOf("Poké Radar");
            if (doesUserHaveIt >= 0) {
                hasRadar = true;
            }
        }
    
        /**
         * @todo Add Pokemon swarms to the weather functions.
         */
        let isSwarming = false;
    
        /**
         * Add all Pokemon with an encounter rate greater than 0 to the wild Pokemon lists.
         * There are two lists: one that stores wild pokemon with less than or equal to 15 encounter rate
         * and the other for pokemon with more than 15 encounter rate.
         */
        let wildPokemonIndex;
        for (wildPokemonIndex = 0; wildPokemonIndex < locationData.pokemon.length; wildPokemonIndex++) {
            if ((locationData.pokemon[wildPokemonIndex].min_level <= leadLevel) && (locationData.pokemon[wildPokemonIndex].field === field) && locationData.pokemon[wildPokemonIndex].rarity[rarityIndex] > 0) {
                /**
                 * If the Pokemon is only encountered during a swarm.
                 */
                if (locationData.pokemon[wildPokemonIndex].hasOwnProperty("swarm")) {
                    if (isSwarming === true) {
                        if (locationData.pokemon[wildPokemonIndex].rarity[rarityIndex] <= 15) {
                            possiblePokemonRare[possiblePokemonRare.length] = new WildPokemon(locationData.pokemon[wildPokemonIndex].name, level, locationData.pokemon[wildPokemonIndex].rarity[rarityIndex], locationData.pokemon[wildPokemonIndex].field);
                        } else {
                            possiblePokemonNotRare[possiblePokemonNotRare.length] = new WildPokemon(locationData.pokemon[wildPokemonIndex].name, level, locationData.pokemon[wildPokemonIndex].rarity[rarityIndex], locationData.pokemon[wildPokemonIndex].field);
                        }
                    }
                /**
                 * If Pokemon requires some type of the Poke Radar.
                 */
                } else if (locationData.pokemon[wildPokemonIndex].hasOwnProperty("dexnav")) {
                    if (hasRadar === true) {
                        if (locationData.pokemon[wildPokemonIndex].rarity[rarityIndex] <= 15) {
                            possiblePokemonRare[possiblePokemonRare.length] = new WildPokemon(locationData.pokemon[wildPokemonIndex].name, level, locationData.pokemon[wildPokemonIndex].rarity[rarityIndex], locationData.pokemon[wildPokemonIndex].field);
                        } else {
                            possiblePokemonNotRare[possiblePokemonNotRare.length] = new WildPokemon(locationData.pokemon[wildPokemonIndex].name, level, locationData.pokemon[wildPokemonIndex].rarity[rarityIndex], locationData.pokemon[wildPokemonIndex].field);
                        }
                    }
                /**
                 * If Pokemon doesn't require any special items or phenomena to encounter.
                 */
                } else {
                    let highestLevel = locationData.pokemon[wildPokemonIndex].max_level;
                    if (highestLevel > lead.level) {
                        highestLevel = lead.level;
                    }
                    let level = Math.floor(Math.random() * (highestLevel - locationData.pokemon[wildPokemonIndex].min_level + 1)) + locationData.pokemon[wildPokemonIndex].min_level;
                    if (locationData.pokemon[wildPokemonIndex].rarity[rarityIndex] <= 15) {
                        possiblePokemonRare[possiblePokemonRare.length] = new WildPokemon(locationData.pokemon[wildPokemonIndex].name, level, locationData.pokemon[wildPokemonIndex].rarity[rarityIndex], locationData.pokemon[wildPokemonIndex].field);
                    } else {
                        possiblePokemonNotRare[possiblePokemonNotRare.length] = new WildPokemon(locationData.pokemon[wildPokemonIndex].name, level, locationData.pokemon[wildPokemonIndex].rarity[rarityIndex], locationData.pokemon[wildPokemonIndex].field);
                    }
                }
            }
        }
    
        /**
         * Sort list of rare wild Pokemon from more rare to least rare.
         */
        if (possiblePokemonNotRare.length != 0 || possiblePokemonRare.length != 0) {
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
        
                /**
                 * For each rare Pokemon, roll a number between 1 and 100.
                 * If that number is less than or equal to the Pokemon's rarity,
                 * then that Pokemon is selected and the other Pokemon are disregarded.
                 */
                let r;
                for (r = 0; r < possiblePokemonRare.length; r++) {
                    if (Math.ceil((Math.random() * 100)) <= possiblePokemonRare[r].rarity) {
                        selectedPokemon = possiblePokemonRare[r];
                        break;
                    }
                }
        
                /**
                 * If no rare Pokemon were selected but there aren't any Pokemon that
                 * aren't rare, then select the least rarest of the rare Pokemon.
                 */
                if (selectedPokemon == null && possiblePokemonNotRare.length === 0) {
                    selectedPokemon = possiblePokemonRare[possiblePokemonRare.length - 1];
                }
            }
        
            /**
             * If no rare Pokemon was selected but there are non rare Pokemon
             * to select from.
             */
            if (selectedPokemon == null) {
                function shuffle(arr) {
                    for (let i = arr.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [arr[i], arr[j]] = [arr[j], arr[i]];
                    }
                    return arr;
                }
        
                /**
                 * Randomly shuffle the non rare Pokemon.
                 */
                shuffle(possiblePokemonNotRare);
        
                /**
                 * For each rare Pokemon, roll a number between 1 and 100.
                 * If that number is less than or equal to the Pokemon's rarity,
                 * then that Pokemon is selected and the other Pokemon are disregarded.
                 */
                let n;
                for (n = 0; n < possiblePokemonNotRare.length; n++) {
                    if (Math.ceil((Math.random() * 100)) <= possiblePokemonNotRare[n].rarity) {
                        selectedPokemon = possiblePokemonNotRare[n];
                        break;
                    }
                }
        
                /**
                 * If no Pokemon was randomly selected, then select whichever non rare Pokemon
                 * was shuffled to the end of the list.
                 */
                if (selectedPokemon == null) {
                    selectedPokemon = possiblePokemonNotRare[possiblePokemonNotRare.length - 1];
                }
            }
        
            /**
             * 5% chance to find a Pokemon with a hidden ability.
             */
            if(Math.ceil((Math.random() * 100) > 95)) {
                hasHiddenAbility = true;
            }
        }
    }

    if (selectedPokemon != null) {
        selectedPokemon = await generatePokemonByName(message, selectedPokemon.name, selectedPokemon.level, region, location, hasHiddenAbility)
    }

    return new Promise(function(resolve) {
        resolve(selectedPokemon);
    });
}

/**
 * Allows a user to catch a Pokemon. The user is continuously prompted
 * on which Poke Ball to use until either the Pokemon is caught or the user
 * runs away from the Pokemon. The user's lead Pokemon also gets its EVs
 * changed based on the encountered Pokemon.
 * 
 * @param {Message} message The Discord message sent from the user.
 * @param {Pokemon} wild The Pokemon that was generated to be caught.
 * @param {User} user The Pokebot user who is catching the Pokemon.
 * @param {string} ball The name of the Poke Ball being thrown.
 * @param {number} turns The number of turns that have occurred during the battle.
 * 
 * @returns {boolean} True if the user caught the Pokemon.
 */
async function throwPokeBall(message, wild, user, ball, turns) {
    let pkmn = parseJSON(generatePokemonJSONPath(wild.name, wild.form));
    
    /* This will be put in a different function that occurs after catching a Pokemon.
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
    */
    
    let catchChance = 30;
    let catchRate = pkmn.catch_rate;

    let wasPokemonCaught = false;
   
    if (ball === "Great Ball") {
        catchChance = catchChance * 1.5;
    } else if (ball === "Ultra Ball") {
        catchChance = catchChance * 2;
    } else if (ball === "Master Ball") {
        catchChance = catchChance * 255;
    } else if (ball === "Level Ball") {
        if (leadLevel >= (wild.level * 4)) {
            catchChance = catchChance * 8;
        } else if (leadLevel >= (wild.level * 2)) {
            catchChance = catchChance * 4;
        } else if (leadLevel >= (wild.level * 1)) {
            catchChance = catchChance * 2;
        }
    } else if (ball === "Lure Ball") {
        if (user.field.includes("Rod")) {
            catchChance = catchChance * 5;
        }
    } else if (ball === "Moon Ball") {
        if (wild.name === "Nidoran♂" || wild.name === "Nidorino" || wild.name === "Nidoking" || wild.name === "Nidoran♀" || wild.name === "Nidorina" || wild.name === "Nidoqueen" || wild.name === "Cleffa" || wild.name === "Clefairy" || wild.name === "Clefable" || wild.name === "Igglybuff" || wild.name === "Jigglypuff" || wild.name === "Wigglytuff" || wild.name === "Skitty" || wild.name === "Delcatty" || wild.name === "Munna" || wild.name === "Musharna") {
            catchChance = catchChance * 4;
        }
    } else if (ball === "Love Ball") {
        if (leadName === wild.name) {
            if (leadGender === "Male" && wild.gender === "Female") {
                catchChance = catchChance * 8;
            } else if (leadGender === "Female" && wild.gender === "Male") {
                catchChance = catchChance * 8;
            }
        }
    } else if (ball === "Heavy Ball") {
        let weight = pkmn.weight_us;
        weight = weight.substring(0, (weight.length - 5));
        weight = parseFloat(weight);
        if (weight >= 661.4) {
            catchChance += 30;
        } else if (weight >= 451.5) {
            catchChance += 20;
        } else if (weight <= 220.2) {
            catchChance -= 20;
        }
    } else if (ball === "Fast Ball") {
        if (pkmn.base_stats.speed >= 100) {
            catchChance = catchChance * 4;
        }
    } else if (ball === "Repeat Ball") {
        /**
         * @todo check if this works.
         */
        if (user.pokedex.charAt(wild.no - 1) === '1') {
            catchChance = catchChance * 3.5;
        }
    } else if (ball === "Timer Ball") {
        let chance = (1 + (turns * (1229/4096)));
        if (chance > 4) {
            chance = 4;
        }
        catchChance = catchChance * chance;
    } else if (ball === "Nest Ball") {
        if (wild.level < 30) {
            let chance = ((41 - wild.level) / 10);
            catchChance = catchChance * chance;
        }
    } else if (ball === "Net Ball") {
        if (pkmn.types[0] === "Water" || pkmn.types[0] === "Bug") {
            catchChance = catchChance * 3.5;
        } else if (pkmn.types.length > 1) {
            if (pkmn.types[1] === "Water" || pkmn.types[1] === "Bug") {
                catchChance = catchChance * 3.5;
            }
        }
    } else if (ball === "Dive Ball") {
        if (user.field.includes("Rod")) {
            catchChance = catchChance * 3.5;
        } else if (user.field === "Surfing" || user.field === "Diving") {
            catchChance = catchChance * 3.5;
        }
    } else if (ball === "Quick Ball") {
        if (turns === 1) {
            catchChance = catchChance * 5;
        }
    } else if (ball === "Dusk Ball") {
        /**
         * @todo timezone
         */
        let locs;
        let isDark = false;
        let time = new Date();
        time = time.getHours();
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
    
    let firstLetter = ball.charAt(0);
    let article = "a";
    if (firstLetter === 'A' || firstLetter === 'E' || firstLetter === 'I' || firstLetter === 'O' || firstLetter === 'U') {
        article = "an";
    }

    let mes = await sendMessage(message.channel, (message.author.username + " threw " + article + " **" + ball + "**!"), true);

    let shakes = 0;
    let luck = ((Math.ceil(Math.random() * catchRate) + catchChance));
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
        await sendMessage(message.channel, ("Oh no! The Pokémon broke free!"));
    } else if (shakes === 1) {
        await sendMessage(message.channel, ("Aww! It appeared to be caught!"));
    } else if (shakes === 2) {
        await sendMessage(message.channel, ("Aargh! Almost had it!"));
    } else if (shakes === 3) {
        await sendMessage(message.channel, ("Gah! It was so close, too!"));
    } else if (shakes === 4) {
        await sendMessage(message.channel, ("Gotcha! " + wild.name + " was caught!"));
        wild.ot = message.author.username;
        wild.otid = message.author.id;
        wild.date = convertToTimeZone(user).format();

        if (ball === "Friend Ball") {
            wild.friendship = 200;
        } else {
            wild.frienship = pkmn.base_friendship;
        }
        
        if (wild.level > user.level) {
            user.level = wild.level;
        }

        wild.caughtIn = ball;
        wild.nick = await nicknamePokemon(message, wild);
        await addPokemon(message.author.id, wild);
        await addToPokedex(user, wild.no);

        wasPokemonCaught = true;
    }

    await removeItemFromBag(message.author.id, ball, 1);

    return new Promise(function(resolve) {
        resolve(wasPokemonCaught);
    });
}

/**
 * Sends a message containing detailed information about a Pokemon that is not
 * owned by any trainers.
 * 
 * @param {Pokemon} pkmn The Pokemon object to be represented in the message.
 * @param {Message} message The Discord message sent from the user.
 * @param {string} description Descriptive text that explains the reactions that the message may have.
 * 
 * @returns {RichEmbed} A rich embedded message.
 */
async function generateWildPokemonEmbed(pkmn, message, description) {
    let footerLink = "https://cdn.bulbagarden.net/upload/9/93/Bag_Pok%C3%A9_Ball_Sprite.png";
    let footerText = "You already have this Pokémon.";
    let user = await getUser(message.author.id);
    if (user != null) {
        if (user.pokedex.charAt(pkmn.no - 1) === '0') {
            footerLink = "https://cdn.bulbagarden.net/upload/7/74/Bag_Heavy_Ball_Sprite.png";
            footerText = "You do not have this Pokémon.";
        }
    } else {
        footerLink = "https://cdn.bulbagarden.net/upload/7/74/Bag_Heavy_Ball_Sprite.png";
        footerText = "You do not have this Pokémon.";
    }

    let spriteLink = generateSpriteLink(pkmn.name, pkmn.gender, pkmn.form);

    let nextLevel = getXpToNextLevel(pkmn.name, pkmn.totalxp, pkmn.level);
    
    let type_icon = await client.emojis.find(type_icon => type_icon.name === pkmn.type[0]);
    let typeString = type_icon + " " + pkmn.type[0];

    if (pkmn.type[1] != "---" && pkmn.type[1] != null) {
        type_icon = await client.emojis.find(type_icon => type_icon.name === pkmn.type[1]);
        typeString += ("\n" + type_icon + " " + pkmn.type[1]);
    }

    let name = pkmn.name;
    if (pkmn.shiny === 1) {
        name += " ⭐";
    }
    
    if (pkmn.form != "None" && pkmn.form != null) {
        name = name + " (" + pkmn.form + ")";
    }
    
    let item = "None";
    if (pkmn.item != "None" && pkmn.item != null) {
        item = pkmn.item;
    }
    
    let imageName = await getGifName(pkmn.name);

    let movesString = "";
    for (move in pkmn.moves) {
        let moveTypeIcon = getMoveType(pkmn.moves[move]);
        if (moveTypeIcon != null) {
            moveTypeIcon = await client.emojis.find(type_icon => type_icon.name === moveTypeIcon);
            movesString += moveTypeIcon;
            movesString += pkmn.moves[move] + "\n";
        }
    }

    let genderString = pkmn.gender;
    if (pkmn.gender === null) {
        genderString = "None";
    }

    let embed = {
        "author": {
            "name": name,
            "icon_url": spriteLink,
        },
        "color": getTypeColor(pkmn.type[0]),
        "description": description,
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
                "value": genderString,
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
    }

    return new Promise(function(resolve) {
        resolve(embed);
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
 * @param {string} pokemonId The id of the owned Pokemon.
 * 
 * @returns {any[]} All moves currently known by the Pokemon.
 */
async function getPokemonKnownMoves(pokemonId) {
    let moves = await doQuery("SELECT * FROM move WHERE move.pokemon = ? AND move.slot IS NOT NULL ORDER BY move.slot", [pokemonId]);
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
 * @param {string} description Optional descriptive text to explain why the Pokemon is being shown.
 * 
 * @returns {Message} The Discord message showing the Pokemon details.
 */
async function displayAnOwnedPkmn(pkmn, message, description = undefined) {
    let modelLink = generateModelLink(pkmn.name, pkmn.shiny, pkmn.gender, pkmn.form);
    let spriteLink = generateSpriteLink(pkmn.name, pkmn.gender, pkmn.form);
    let nextLevel = getXpToNextLevel(pkmn.name, pkmn.xp, pkmn.level_current);

    let year = moment(pkmn.date).format('Y');
    let month = moment(pkmn.date).format('MMMM');
    let today = moment(pkmn.date).format('Do');
    
    /**
     * Show Pokemon's nickname instead of name if it has one.
     */
    let name = pkmn.name;
    let nick = pkmn.nickname;
    if (nick === null) {
        nick = pkmn.name;
    }

    /**
     * Add a star to the end of the name if the Pokemon is shiny.
     */
    if (pkmn.shiny === 1) {
        name += " ⭐";
    }
    
    /**
     * Add the Pokemon's form in braces to the name.
     */
    if (pkmn.form != "None" && pkmn.form != null) {
        name = name + " [" + pkmn.form + "]";
    }
    
    /**
     * If Pokemon doesn't have an item, then print "None".
     */
    let item = "None";
    if (pkmn.item != null) {
        item = pkmn.item;
    }
    
    let imageName = await getGifName(pkmn.name);
    
    /**
     * Gets the name of a Discord user based on the user's id. This is to show the username
     * of the Pokemon's original Trainer.
     */
    let trainerName = await client.fetchUser(pkmn.original_trainer).then(myUser => {
        return myUser.username;
    });
    
    /**
     * Convert Pokemon's types into one string.
     */
    let type_icon = await client.emojis.find(type_icon => type_icon.name === pkmn.type_1);
    let typeString = type_icon + " " + pkmn.type_1;
    if (pkmn.type_2 != "---" && pkmn.type_2 != null) {
        type_icon = await client.emojis.find(type_icon => type_icon.name === pkmn.type_2);
        typeString += ("\n" + type_icon + " " + pkmn.type_2);
    }

    /**
     * Converts Pokemon's moves into one string.
     */
    let moves = await getPokemonKnownMoves(pkmn.pokemon_id);
    let movesString = "";
    for (let move in moves) {
        let moveTypeIcon = getMoveType(moves[move].name);
        if (moveTypeIcon != null) {
            moveTypeIcon = await client.emojis.find(type_icon => type_icon.name === moveTypeIcon);
            movesString += moveTypeIcon;
        }
        movesString += moves[move].name;
        movesString += "\n";
    }
    
    /**
     * If no description was passed as an argument, then only show the Pokemon's characteristic.
     */
    if (description === undefined) {
        description = getCharacteristic(pkmn);
    } else {
        description = (description + "\n\n" + getCharacteristic(pkmn));
    }

    let embed = {
        "author": {
            "name": nick,
            "icon_url": spriteLink,
        },
        "title": name,
        "description": description,
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
    }

    let pkmnMsg = await sendMessageWithAttachments(message.channel, embed, [{ attachment: modelLink, name: (imageName + '.gif') }, { attachment: ("../gfx/balls/" + pkmn.ball + ".png"), name: 'ball.png' }]);

    return new Promise(function(resolve) {
        resolve(pkmnMsg);
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
    let modelLink = generateModelLink(pkmn.name, pkmn.shiny, pkmn.gender, pkmn.form);
    let spriteLink = generateSpriteLink(pkmn.name, pkmn.gender, pkmn.form);

    let EVs = [pkmn.ev_hp, pkmn.ev_atk, pkmn.ev_def, pkmn.ev_spatk, pkmn.ev_spdef, pkmn.ev_spd];
    let IVs = [pkmn.iv_hp, pkmn.iv_atk, pkmn.iv_def, pkmn.iv_spatk, pkmn.iv_spdef, pkmn.iv_spd];

    let name, nick = pkmn.name;
    if (pkmn.nickname != null) {
        nick = pkmn.nickname;
    }
    
    if (pkmn.shiny === 1) {
        name += " ⭐";
    }
    
    if (pkmn.form != null) {
        name = name + " [" + pkmn.form + "]";
    }
    
    /**
     * Get hidden power type.
     */
    let hiddenPow = Math.floor((((IVs[0] % 2) + (2 * (IVs[1] % 2)) + (4 * (IVs[2] % 2)) + (8 * (IVs[5] % 2)) + (16 * (IVs[3] % 2)) + (16 * (IVs[4] % 5))) * 15) / 63);
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

    let type_icon = client.emojis.find(type_icon => type_icon.name === hiddenPow);
    let embed = {
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
    }
    
    sendMessageWithAttachments(message.channel, embed, [{ attachment: modelLink, name: (pkmn.name + '.gif') }]);
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
    let user = await getUser(message.author.id);
    if (user === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }
    
    let pokemon = await getPokemon(message.author.id);
    if (pokemon === null) {
        return new Promise(function(resolve) {
            resolve(false);
        });
    }

    let userID = user.user_id;
    let loc = user.location;

    let possibleEncounter = function(name, no, min, max, rarity, method, hasIt) {
        this.name = name;
        this.no = no;
        this.min = min;
        this.max = max;
        this.rarity = rarity;
        this.method = method;
        this.hasIt = hasIt;
    }

    let locationData = parseJSON(generateLocationJSONPath(user.region, user.location));
    
    var possiblePokemon = [[],[],[],[],[],[]];

    var rarityIndex = 0;
    var cur = convertToTimeZone(user);
    var hour = moment(cur).hour();
    if (user.region === "Kanto" || user.region === "Johto" || user.region === "Sinnoh") {
        if (hour >= 10 && hour < 20) {
            rarityIndex = 1;
        } else if (hour >= 20 || hour < 4) {
            rarityIndex = 2;
        }
    } else if (user.region === "Unova") {
        rarityIndex = moment().month() % 4;
    } else if (user.region === "Alola") {
        if (hour < 6 || hour >= 18) {
            rarityIndex = 1;
        }
    }

    var i;
    for (i = 0; i < locationData.pokemon.length; i++) {
        /**
         * @todo determine a Pokemon's default form based on region and location and send it to the json function below.
         */
        var pth = generatePokemonJSONPath(locationData.pokemon[i].name, null);
        var dat;
        try {
            dat = fs.readFileSync(pth, "utf8");
        } catch (err) {
            console.log(err);
            return null;
        }

        let pkm = JSON.parse(dat);
        let dexNum = pkm.national_id.toString();
        dexNum = dexNum.padStart(3, '0');

        var hasIt = user.pokedex.charAt(pkm.national_id - 1);
        if (hasIt === '1') {
            hasIt = true;
        } else {
            hasIt = false;
        }
        if (locationData.pokemon[i].hasOwnProperty("dexnav")) {
            if (locationData.pokemon[i].field === "Walking") {
                possiblePokemon[0][possiblePokemon[0].length] = new possibleEncounter(locationData.pokemon[i].name, dexNum, locationData.pokemon[i].min_level, locationData.pokemon[i].max_level, locationData.pokemon[i].rarity[rarityIndex], "*Poké Radar*", hasIt);
            } else if (locationData.pokemon[i].field === "Surfing") {
                possiblePokemon[1][possiblePokemon[1].length] = new possibleEncounter(locationData.pokemon[i].name, dexNum, locationData.pokemon[i].min_level, locationData.pokemon[i].max_level, locationData.pokemon[i].rarity[rarityIndex], "*Poké Radar*", hasIt);
            } else if (locationData.pokemon[i].field.includes("Rod")) {
                possiblePokemon[2][possiblePokemon[2].length] = new possibleEncounter(locationData.pokemon[i].name, dexNum, locationData.pokemon[i].min_level, locationData.pokemon[i].max_level, locationData.pokemon[i].rarity[rarityIndex], (locationData.pokemon[i].field + " *Poké Radar*"), hasIt);
            }
        } else if (locationData.pokemon[i].hasOwnProperty("swarm")) {
            if (locationData.pokemon[i].field === "Walking") {
                possiblePokemon[0][possiblePokemon[0].length] = new possibleEncounter(locationData.pokemon[i].name, dexNum, locationData.pokemon[i].min_level, locationData.pokemon[i].max_level, locationData.pokemon[i].rarity[rarityIndex], "*Swarm*", hasIt);
            } else if (locationData.pokemon[i].field === "Surfing") {
                possiblePokemon[1][possiblePokemon[1].length] = new possibleEncounter(locationData.pokemon[i].name, dexNum, locationData.pokemon[i].min_level, locationData.pokemon[i].max_level, locationData.pokemon[i].rarity[rarityIndex], "*Swarm*", hasIt);
            } else if (locationData.pokemon[i].field.includes("Rod")) {
                possiblePokemon[2][possiblePokemon[2].length] = new possibleEncounter(locationData.pokemon[i].name, dexNum, locationData.pokemon[i].min_level, locationData.pokemon[i].max_level, locationData.pokemon[i].rarity[rarityIndex], (locationData.pokemon[i].field + " *Swarm*"), hasIt);
            }
        } else {
            if (locationData.pokemon[i].field === "Walking") {
                possiblePokemon[0][possiblePokemon[0].length] = new possibleEncounter(locationData.pokemon[i].name, dexNum, locationData.pokemon[i].min_level, locationData.pokemon[i].max_level, locationData.pokemon[i].rarity[rarityIndex], null, hasIt);
            } else if (locationData.pokemon[i].field === "Surfing") {
                possiblePokemon[1][possiblePokemon[1].length] = new possibleEncounter(locationData.pokemon[i].name, dexNum, locationData.pokemon[i].min_level, locationData.pokemon[i].max_level, locationData.pokemon[i].rarity[rarityIndex], null, hasIt);
            } else if (locationData.pokemon[i].field.includes("Rod")) {
                possiblePokemon[2][possiblePokemon[2].length] = new possibleEncounter(locationData.pokemon[i].name, dexNum, locationData.pokemon[i].min_level, locationData.pokemon[i].max_level, locationData.pokemon[i].rarity[rarityIndex], locationData.pokemon[i].field, hasIt);
            } else if (locationData.pokemon[i].field === "Rock Smash") {
                possiblePokemon[3][possiblePokemon[3].length] = new possibleEncounter(locationData.pokemon[i].name, dexNum, locationData.pokemon[i].min_level, locationData.pokemon[i].max_level, locationData.pokemon[i].rarity[rarityIndex], null, hasIt);
            } else if (locationData.pokemon[i].field === "Headbutt") {
                possiblePokemon[4][possiblePokemon[4].length] = new possibleEncounter(locationData.pokemon[i].name, dexNum, locationData.pokemon[i].min_level, locationData.pokemon[i].max_level, locationData.pokemon[i].rarity[rarityIndex], null, hasIt);
            } else if (locationData.pokemon[i].field === "Dive") {
                possiblePokemon[5][possiblePokemon[5].length] = new possibleEncounter(locationData.pokemon[i].name, dexNum, locationData.pokemon[i].min_level, locationData.pokemon[i].max_level, locationData.pokemon[i].rarity[rarityIndex], null, hasIt);
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

    let embeds = [null, null, null, null, null, null];
    let emojis = [];
    let shuffle_icon;
    let poke_ball = client.emojis.find(poke_ball => poke_ball.name === "Poke_Ball");
    let possiblePokemonIndex;


    for (possiblePokemonIndex = 0; possiblePokemonIndex < possiblePokemon.length; possiblePokemonIndex++) {
        let title = "";
        let color = "";
        let emojiName = "";
        if (possiblePokemon[possiblePokemonIndex].length > 0) {
            if (possiblePokemonIndex === 0) {
                title = "Tall Grass";
                color = "Grass";
                emojiName = "TallGrass";
            } else if (possiblePokemonIndex === 1) {
                title = "Surfing";
                color = "Water";
                emojiName = "Surfing";
            } else if (possiblePokemonIndex === 2) {
                title = "Fishing";
                color = "Ice";
                emojiName = "FishRod";
            } else if (possiblePokemonIndex === 3) {
                title = "Rock Smash";
                color = "Fighting";
                emojiName = "RockSmash";
            } else if (possiblePokemonIndex === 4) {
                title = "Headbutt";
                color = "Bug";
                emojiName = "HeadbuttTree";
            } else if (possiblePokemonIndex === 5) {
                title = "Diving";
                color = "Ghost";
                emojiName = "Dive";
            }
            emojis[emojis.length] = emojiName;
            possiblePokemon[possiblePokemonIndex].sort(compare);
            embeds[possiblePokemonIndex] = {
                "author": {
                    "name": loc + " in the " + user.region + " Region",
                },
                "title": title,
                "color": getTypeColor(color),
                "footer": {
                    "icon_url": "https://cdn.bulbagarden.net/upload/9/93/Bag_Pok%C3%A9_Ball_Sprite.png",
                    "text": "indicates a Pokémon you already own."
                }
            };
            let fieldCount = 0;
            let embedFields = [];
            let fieldIndex;
            let fieldString = "";
            for (fieldIndex = 0; fieldIndex < possiblePokemon[possiblePokemonIndex].length; fieldIndex++) {
                shuffle_icon = await getShuffleEmoji(possiblePokemon[possiblePokemonIndex][fieldIndex].no);
                fieldString += shuffle_icon;
                if (possiblePokemon[possiblePokemonIndex][fieldIndex].hasIt) {
                    fieldString += " " + poke_ball;
                }
                if (possiblePokemon[possiblePokemonIndex][fieldIndex].min === possiblePokemon[possiblePokemonIndex][fieldIndex].max) {
                    fieldString += " **"  + possiblePokemon[possiblePokemonIndex][fieldIndex].name + "** Level " + possiblePokemon[possiblePokemonIndex][fieldIndex].min + " | Likelihood: " + possiblePokemon[possiblePokemonIndex][fieldIndex].rarity;
                } else {
                    fieldString += " **"  + possiblePokemon[possiblePokemonIndex][fieldIndex].name + "** Levels " + possiblePokemon[possiblePokemonIndex][fieldIndex].min + " - " + possiblePokemon[possiblePokemonIndex][fieldIndex].max + " | Likelihood: " + possiblePokemon[possiblePokemonIndex][fieldIndex].rarity;
                }
                if (possiblePokemon[possiblePokemonIndex][fieldIndex].method != null) {
                    fieldString += " *" + possiblePokemon[possiblePokemonIndex][fieldIndex].method + "*";
                }
                fieldString += "\n";
                if (fieldString.length >= 900) {
                    embedFields[fieldCount] = {
                        "name": 'Possible Pokémon',
                        "value": fieldString
                    }
                    fieldString = "";
                    fieldCount++;
                }
            }
            if (fieldCount === 0) {
                embedFields[fieldCount] = {
                    "name": 'Possible Pokémon',
                    "value": fieldString
                }
            } else if (fieldString != "") {
                embedFields[fieldCount] = {
                    "name": 'Possible Pokémon (cont.)',
                    "value": fieldString
                }
            }
            embeds[possiblePokemonIndex].fields = embedFields;
        }
    }

    /**
     * Set default embed to the users current field,
     * or whichever field is the first to contain wild Pokemon.
     */
    let embed;
    if (user.field === "Walking" && embeds[0] != null) {
        embed = embeds[0];
    } else if (user.field === "Surfing" && embeds[1] != null) {
        embed = embeds[1];
    } else if (user.field.includes("Rod") && embeds[2] != null) {
        embed = embeds[2];
    } else if (user.field === "Rock Smash" && embeds[3] != null) {
        embed = embeds[3];
    } else if (user.field === "Headbutt" && embeds[4] != null) {
        embed = embeds[4];
    } else if (user.field === "Dive" && embeds[5] != null) {
        embed = embeds[5];
    } else if (walkEmbed != null) {
        embed = embeds[0];
    } else if (surfEmbed != null) {
        embed = embeds[1];
    } else if (fishEmbed != null) {
        embed = embeds[2];
    } else if (rockSmashEmbed != null) {
        embed = embeds[3];
    } else if (headbuttEmbed != null) {
        embed = embeds[4];
    } else if (diveEmbed != null) {
        embed = embeds[5];
    }
    
    let msg = await sendMessage(message.channel, {embed}, true);
    
    let reacting = true;
    while (reacting) {
        let emojiIndex;
        for (emojiIndex = 0; emojiIndex < emojis.length; emojiIndex++) {
            await msg.react(client.emojis.find(reactEmoji => reactEmoji.name === emojis[emojiIndex]));
        }
        
        const filter = (reaction, user) => {
            return emojis.includes(reaction.emoji.name) && user.id === userID;
        };

        await msg.awaitReactions(filter, { max: 1, time: 20000, errors: ['time'] })
            .then(collected => {
                const reaction = collected.first();
                
                if (reaction.emoji.name === "TallGrass") {
                    embed = embeds[0];
                    msg.edit({ embed });
                    reaction.remove(userID);
                } else if (reaction.emoji.name === 'Surfing') {
                    embed = embeds[1];
                    msg.edit({ embed });
                    reaction.remove(userID);
                } else if (reaction.emoji.name === 'FishRod') {
                    embed = embeds[2];
                    msg.edit({ embed });
                    reaction.remove(userID);
                } else if (reaction.emoji.name === 'RockSmash') {
                    embed = embeds[3];
                    msg.edit({ embed });
                    reaction.remove(userID);
                } else if (reaction.emoji.name === 'HeadbuttTree') {
                    embed = embeds[4];
                    msg.edit({ embed });
                    reaction.remove(userID);
                } else if (reaction.emoji.name === 'Dive') {
                    embed = embeds[5];
                    msg.edit({ embed });
                    reaction.remove(userID);
                }
            })
            .catch(() => {
                reacting = false;
            });
    }

    await msg.delete(0);
    
    return new Promise(function(resolve) {
        resolve(msg);
    });
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
    
    /**
     * @todo get default form of the Pokemon.
     */
    path = generatePokemonJSONPath(name, null);
    try {
        data = fs.readFileSync(path, "utf8");
    } catch (err) {
        return null;
    }
    
    pkmn = JSON.parse(data);
    
    var imageName = await getGifName(pkmn.name);
    
    var userID = message.author.id;
    
    var modelLink = generateModelLink(pkmn.name, false, "Male", null);
    if (modelLink === null) {
        return new Promise(function(resolve) {
            resolve(null);
        });
    }

    var spriteLink = generateSpriteLink(pkmn.name, "Male", "None");
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
    
    const infoEmbed = {
       "author": {
            "name": pkmn.name,
            "icon_url": spriteLink,
        },
        "title": pkmn.species,
        "description": pkmn.pokedex_entry,
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
    
    var movesByLevelString = pkmn.name + " does not learn any moves by leveling up.";
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
            "name": pkmn.name,
            "icon_url": spriteLink,
        },
        "title": "Moveset (Leveling Up)",
        "color": getTypeColor(pkmn.types[0]),
        "thumbnail": {
             "url": "attachment://" + imageName + ".gif"
        },
        "fields": attackEmbedFields
    };
    
    var movesByTMString = [pkmn.name + " does not learn any moves by TM."];
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
            "name": pkmn.name,
            "icon_url": spriteLink,
        },
        "title": "Moveset (TM)",
        "color": getTypeColor(pkmn.types[0]),
        "thumbnail": {
             "url": "attachment://" + imageName + ".gif"
        },
        "fields": attackTMEmbedFields
    };
    
    var movesByEggString = [pkmn.name + " does not learn any moves by breeding."];
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
            "name": pkmn.name,
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
        evoFromString = pkmn.name + " does not evolve from any Pokémon.";
    } else {
        /**
         * @todo get default form of Pokemon.
         */
        var pth = generatePokemonJSONPath(evolvesFrom[0].name, null);
        var dat;
        try {
            dat = fs.readFileSync(pth, "utf8");
        } catch (err) {
            return null;
        }

        pkm = JSON.parse(dat);
        shuffle_icon = await getShuffleEmoji(pkm.national_id);
        evoFromString = shuffle_icon + " Evolves from " + evolvesFrom[0].name + " " + evolvesFrom[0].method;

        /**
         * @todo Is this necessary? A Pokemon can't evolve from multiple Pokemon.
         */
        if (evolvesFrom.length > 1) {
            var f;
            for (f = 1; f < evolvesFrom.length; f++) {
                /**
                 * @todo Get default form?
                 */
                var pth = generatePokemonJSONPath(evolvesFrom[f].name, null);
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
        evoToString = pkmn.name + " does not evolve into any Pokémon.";
    } else {
        /**
         * @todo Get default form.
         */
        var pth = generatePokemonJSONPath(evolvesTo[0].name, null);
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
                /**
                 * @todo Get default form.
                 */
                var pth = generatePokemonJSONPath(evolvesTo[f].name, null);
                var dat;
                try {
                    dat = fs.readFileSync(pth, "utf8");
                } catch (err) {
                    return null;
                }

                pkm = JSON.parse(dat);
                dexNum = pkm.national_id.toString();
                dexNum = national_id.padStart(3, '0');

                shuffle_icon = await getShuffleEmoji(pkm.national_id);
                evoToString += "\n" + shuffle_icon + "Evolves into " + evolvesTo[f].name + " " + evolvesTo[f].method;
            }
        }
    }
    
    const evoEmbed = {
       "author": {
            "name": pkmn.name,
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
             "name": pkmn.name,
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
                "name": move.name,
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
 * @todo Consider making this an async function.
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
 * @param {Message} message The Discord message sent from the user to print the Pokemon for.
 * @param {string} otherUser An optional overwrite to print Pokemon for a different user.
 * @param {Pokemon[]} pokemon An optional confined list of Pokemon to print instead of all Pokemon owned by a user.
 * @param {string} description An optional descriptive message that tells the user why their Pokemon are being shown to them.
 * 
 * @returns {boolean} True if no errors are encountered.
 */
async function printPokemon(message, otherUser = undefined, pokemon = undefined, description = undefined) {
    var userID = message.author.id;
    let enableNumbering = true;
    
    if (otherUser != undefined) {
        userID = otherUser;
        username = otherUser.username;
    }

    if (pokemon === undefined) {
        pokemon = await getPokemon(userID);

        if (pokemon.length > 1) {
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
        }

        enableNumbering = false;
    }

    var i;
    
    let fields = [];
    let fieldCount = 0;
    let fieldString = "";

    for (i = 0; i < pokemon.length; i++) {
        if (i % 15 === 0 && i > 0) {
            fields[fieldCount] = {
                "name": '\u200b',
                "value": fieldString,
                "inline": false
            }
            fieldCount++;
            fieldString = "";
        }
        
        if (enableNumbering) {
            fieldString += "**" + (i + 1).toString() + ".** ";
        }
        
        let form = pokemon[i].form;
        if (form === null) {
            form = "";
        } else {
            form = " [" + form + "]";
        }

        let shuffle_icon = await getShuffleEmoji(pokemon[i].number);

        if (pokemon[i].nickname === null) {
            fieldString += shuffle_icon + " **" + pokemon[i].name + form + "** Level " + pokemon[i].level_current + ", *" + pokemon[i].ability + "*";
        } else {
            fieldString += shuffle_icon + " **" + pokemon[i].nickname + form + "** Level " + pokemon[i].level_current + ", *" + pokemon[i].ability + "*";
        }

        if (pokemon[i].shiny) {
            fieldString += " ⭐";
        }
        fieldString += "\n";

    }

    if (fieldString != "") {
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
        "description": description,
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

        msg.clearReactions();
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

    for (i = 1; i < 810; i++) {
        let shuffle_icon;
        let name = "----------";
        let num = i.toString();
        num = num.padStart(3, '0');

        if (pokedex.charAt(i - 1) === '1') {
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
        return pkmn.name;
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
            await addItemToBag(user.user_id, items[input].name, 1);
        } else if (cat === "tm") {
            cat = "TM";
            user.money -= (items[input].price * num);
            var query = "UPDATE user SET user.money = ? WHERE user.user_id = ?";
            con.query(query, [user.money, message.author.id], function (err) {
                if (err) {
                    return reject(err);
                }
            });
            await addItemToBag(user.user_id, items[input].name, 1);
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
                        await addItemToBag(user.user_id, items[itemIndex].name, num);
                        
                        if (num >= 10) {
                            await addItemToBag(user.user_id, "Premier Ball", 1);
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
                        await addItemToBag(user.user_id, items[itemIndex].name, num);
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
    let evoMove = [];
    if (to === "Venusaur") {
        evoMove[evoMove.length] = "Petal Dance";
    } else if (to === "Charizard") {
        evoMove[evoMove.length] = "Wing Attack";
    } else if (to === "Metapod") {
        evoMove[evoMove.length] = "Harden";
    } else if (to === "Butterfree") {
        evoMove[evoMove.length] = "Gust";
    } else if (to === "Kakuna") {
        evoMove[evoMove.length] = "Harden";
    } else if (to === "Beedrill") {
        evoMove[evoMove.length] = "Twineedle";
    } else if (to === "Raticate") {
        evoMove[evoMove.length] = "Scary Face";
    } else if (to === "Arbok") {
        evoMove[evoMove.length] = "Crunch";
    } else if (to === "Raichu") {
        if (form === "Alolan") {
            evoMove[evoMove.length] = "Psychic";
        }
    } else if (to === "Sandslash") {
        if (form === "Alolan") {
            evoMove[evoMove.length] = "Icicle Spear";
        }
    } else if (to === "Ninetails") {
        if (form === "Alolan") {
            evoMove[evoMove.length] = "Dazzling Gleam";
        }
    } else if (to === "Venomoth") {
        evoMove[evoMove.length] = "Gust";
    } else if (to === "Dugtrio") {
        evoMove[evoMove.length] = "Sand Tomb";
    } else if (to === "Persian") {
        evoMove[evoMove.length] = "Swift";
    } else if (to === "Primeape") {
        evoMove[evoMove.length] = "Rage";
    } else if (to === "Poliwrath") {
        evoMove[evoMove.length] = "Submission";
    } else if (to === "Kadabra") {
        evoMove[evoMove.length] = "Kinesis";
    } else if (to === "Alakazam") {
        evoMove[evoMove.length] ="Kinesis";
    } else if (to === "Machamp") {
        evoMove[evoMove.length] = "Strength";
    } else if (to === "Victreebel") {
        evoMove[evoMove.length] = "Leaf Tornado";
    } else if (to === "Rapidash") {
        evoMove[evoMove.length] = "Fury Attack";
    } else if (to === "Slowbro") {
        evoMove[evoMove.length] = "Withdraw";
    } else if (to === "Magneton") {
        evoMove[evoMove.length] = "Tri Attack";
    } else if (to === "Dodrio") {
        evoMove[evoMove.length] = "Tri Attack";
    } else if (to === "Dewgong") {
        evoMove[evoMove.length] = "Sheer Cold";
    } else if (to === "Muk") {
        evoMove[evoMove.length] = "Venom Drench";
    } else if (to === "Haunter") {
        evoMove[evoMove.length] = "Shadow Punch";
    } else if (to === "Gengar") {
        evoMove[evoMove.length] = "Shadow Punch";
    } else if (to === "Exeggutor") {
        if (form === "Alolan") {
            evoMove[evoMove.length] = "Dragon Hammer";
        } else {
            evoMove[evoMove.length] = "Stomp";
        }
    } else if (to === "Hitmonlee") {
        evoMove[evoMove.length] = "Double Kick";
    } else if (to === "Hitmonchan") {
        evoMove[evoMove.length] = "Comet Punch";
    } else if (to === "Weezing") {
        evoMove[evoMove.length] = "Double Hit";
    } else if (to === "Rhydon") {
        evoMove[evoMove.length] = "Hammer Arm";
    } else if (to === "Gyarados") {
        evoMove[evoMove.length] = "Bite";
    } else if (to === "Vaporeon") {
        evoMove[evoMove.length] = "Water Gun";
    } else if (to === "Jolteon") {
        evoMove[evoMove.length] = "Thunder Shock";
    } else if (to === "Flareon") {
        evoMove[evoMove.length] = "Ember";
    } else if (to === "Omastar") {
        evoMove[evoMove.length] = "Spike Cannon";
    } else if (to === "Kabutops") {
        evoMove[evoMove.length] = "Slash";
    } else if (to === "Dragonite") {
        evoMove[evoMove.length] = "Wing Attack";
    } else if (to === "Meganium") {
        evoMove[evoMove.length] = "Petal Dance";
    } else if (to === "Furret") {
        evoMove[evoMove.length] = "Agility";
    } else if (to === "Ariados") {
        evoMove[evoMove.length] = "Swords Dance";
    } else if (to === "Crobat") {
        evoMove[evoMove.length] = "Cross Poison";
    } else if (to === "Lanturn") {
        evoMove[evoMove.length] = "Stockpile";
        evoMove[evoMove.length] = "Swallow";
        evoMove[evoMove.length] = "Spit Up";
    } else if (to === "Xatu") {
        evoMove[evoMove.length] = "Air Slash";
    } else if (to === "Ampharos") {
        evoMove[evoMove.length] = "Thunder Punch";
    } else if (to === "Bellossom") {
        evoMove[evoMove.length] = "Magical Leaf";
    } else if (to === "Sudowoodo") {
        evoMove[evoMove.length] = "Slam";
    } else if (to === "Espeon") {
        evoMove[evoMove.length] = "Confusion";
    } else if (to === "Umbreon") {
        evoMove[evoMove.length] = "Pursuit";
    } else if (to === "Forretress") {
        evoMove[evoMove.length] = "Mirror Shot";
        evoMove[evoMove.length] = "Autonomize";
    } else if (to === "Magcargo") {
        evoMove[evoMove.length] = "Shell Smash";
    } else if (to === "Piloswine") {
        evoMove[evoMove.length] = "Fury Attack";
    } else if (to === "Octillery") {
        evoMove[evoMove.length] = "Octazooka";
    } else if (to === "Donphan") {
        evoMove[evoMove.length] = "Fury Attack";
    } else if (to === "Hitmontop") {
        evoMove[evoMove.length] = "Rolling Kick";
    } else if (to === "Grovyle") {
        evoMove[evoMove.length] = "Fury Cutter";
    } else if (to === "Sceptile") {
        evoMove[evoMove.length] = "Dual Chop";
    } else if (to === "Combusken") {
        evoMove[evoMove.length] = "Double Kick";
    } else if (to === "Blaziken") {
        evoMove[evoMove.length] = "Blaze Kick";
    } else if (to === "Marshtomp") {
        evoMove[evoMove.length] = "Mud Shot";
    } else if (to === "Mightyena") {
        evoMove[evoMove.length] = "Snarl";
    } else if (to === "Silcoon") {
        evoMove[evoMove.length] = "Harden";
    } else if (to === "Beautifly") {
        evoMove[evoMove.length] = "Gust";
    } else if (to === "Cascoon") {
        evoMove[evoMove.length] = "Harden";
    } else if (to === "Dustox") {
        evoMove[evoMove.length] = "Gust";
    } else if (to === "Lombre") {
        evoMove[evoMove.length] = "Razor Leaf";
    } else if (to === "Pelipper") {
        evoMove[evoMove.length] = "Protect";
    } else if (to === "Breloom") {
        evoMove[evoMove.length] = "Mach Punch";
    } else if (to === "Slaking") {
        evoMove[evoMove.length] = "Swagger";
    } else if (to === "Ninjask") {
        evoMove[evoMove.length] = "Double Team";
        evoMove[evoMove.length] = "Screech";
        evoMove[evoMove.length] = "Fury Cutter";
    } else if (to === "Loudred") {
        evoMove[evoMove.length] = "Bite";
    } else if (to === "Exploud") {
        evoMove[evoMove.length] = "Crunch";
    } else if (to === "Swalot") {
        evoMove[evoMove.length] = "Body Slam";
    } else if (to === "Sharpedo") {
        evoMove[evoMove.length] = "Slash";
    } else if (to === "Camerupt") {
        evoMove[evoMove.length] = "Rock Slide";
    } else if (to === "Grumpig") {
        evoMove[evoMove.length] = "Teeter Dance";
    } else if (to === "Vibrava") {
        evoMove[evoMove.length] = "Dragon Breath";
    } else if (to === "Flygon") {
        evoMove[evoMove.length] = "Dragon Claw";
    } else if (to === "Cacturne") {
        evoMove[evoMove.length] = "Spiky Shield";
    } else if (to === "Altaria") {
        evoMove[evoMove.length] = "Dragon Breath";
    } else if (to === "Whiscash") {
        evoMove[evoMove.length] = "Thrash";
    } else if (to === "Crawdaunt") {
        evoMove[evoMove.length] = "Swift";
    } else if (to === "Claydol") {
        evoMove[evoMove.length] = "Hyper Beam";
    } else if (to === "Milotic") {
        evoMove[evoMove.length] = "Water Pulse";
    } else if (to === "Dusclops") {
        evoMove[evoMove.length] = "Shadow Punch";
    } else if (to === "Glalie") {
        evoMove[evoMove.length] = "Freeze-Dry";
    } else if (to === "Sealeo") {
        evoMove[evoMove.length] = "Swagger";
    } else if (to === "Walrein") {
        evoMove[evoMove.length] = "Ice Fang";
    } else if (to === "Shelgon") {
        evoMove[evoMove.length] = "Protect";
    } else if (to === "Salamence") {
        evoMove[evoMove.length] = "Fly";
    } else if (to === "Metang") {
        evoMove[evoMove.length] = "Confusion";
        evoMove[evoMove.length] = "Metal Claw";
    } else if (to === "Metagross") {
        evoMove[evoMove.length] = "Hammer Arm";
    } else if (to === "Torterra") {
        evoMove[evoMove.length] = "Earthquake";
    } else if (to === "Monferno") {
        evoMove[evoMove.length] = "Mach Punch";
    } else if (to === "Infernape") {
        evoMove[evoMove.length] = "Close Combat";
    } else if (to === "Prinplup") {
        evoMove[evoMove.length] = "Metal Claw";
    } else if (to === "Empoleon") {
        evoMove[evoMove.length] = "Aqua Jet";
    } else if (to === "Staraptor") {
        evoMove[evoMove.length] = "Close Combat";
    } else if (to === "Bibarel") {
        evoMove[evoMove.length] = "Water Gun";
    } else if (to === "Kricketune") {
        evoMove[evoMove.length] = "Fury Cutter";
    } else if (to === "Rampardos") {
        evoMove[evoMove.length] = "Endeavor";
    } else if (to === "Bastiodon") {
        evoMove[evoMove.length] = "Block";
    } else if (to === "Wormadam") {
        evoMove[evoMove.length] = "Quiver Dance";
    } else if (to === "Mothim") {
        evoMove[evoMove.length] = "Quiver Dance";
    } else if (to === "Vespiquen") {
        evoMove[evoMove.length] = "Slash";
    } else if (to === "Cherrim") {
        evoMove[evoMove.length] = "Petal Dance";
    } else if (to === "Lopunny") {
        evoMove[evoMove.length] = "Return";
    } else if (to === "Purugly") {
        evoMove[evoMove.length] = "Swagger";
    } else if (to === "Skuntank") {
        evoMove[evoMove.length] = "Flamethrower";
    } else if (to === "Bronzong") {
        evoMove[evoMove.length] = "Block";
    } else if (to === "Gabite") {
        evoMove[evoMove.length] = "Dual Chop";
    } else if (to === "Garchomp") {
        evoMove[evoMove.length] = "Crunch";
    } else if (to === "Lucario") {
        evoMove[evoMove.length] = "Aura Sphere";
    } else if (to === "Garchomp") {
        evoMove[evoMove.length] = "Crunch";
    } else if (to === "Lucario") {
        evoMove[evoMove.length] = "Aura Sphere";
    } else if (to === "Magnezone") {
        evoMove[evoMove.length] = "Tri Attack";
    } else if (to === "Leafeon") {
        evoMove[evoMove.length] = "Razor Leaf";
    } else if (to === "Glaceon") {
        evoMove[evoMove.length] = "Icy Wind";
    } else if (to === "Gallade") {
        evoMove[evoMove.length] = "Slash";
    } else if (to === "Froslass") {
        evoMove[evoMove.length] = "Ominous Wind";
    } else if (to === "Pignite") {
        evoMove[evoMove.length] = "Arm Thrust";
    } else if (to === "Samurott") {
        evoMove[evoMove.length] = "Slash";
    } else if (to === "Watchog") {
        evoMove[evoMove.length] = "Confuse Ray";
    } else if (to === "Gigalith") {
        evoMove[evoMove.length] = "Power Gem";
    } else if (to === "Excadrill") {
        evoMove[evoMove.length] = "Horn Drill";
    } else if (to === "Seismitoad") {
        evoMove[evoMove.length] = "Acid";
    } else if (to === "Swadloon") {
        evoMove[evoMove.length] = "Protect";
    } else if (to === "Leavanny") {
        evoMove[evoMove.length] = "Slash";
    } else if (to === "Whirlipede") {
        evoMove[evoMove.length] = "Iron Defense";
    } else if (to === "Scolipede") {
        evoMove[evoMove.length] = "Baton Pass";
    } else if (to === "Darmanitan") {
        evoMove[evoMove.length] = "Hammer Arm";
    } else if (to === "Cofagrigus") {
        evoMove[evoMove.length] = "Scary Face";
    } else if (to === "Zoroark") {
        evoMove[evoMove.length] = "Night Slash";
    } else if (to === "Reuniclus") {
        evoMove[evoMove.length] = "Dizzy Punch";
    } else if (to === "Sawsbuck") {
        evoMove[evoMove.length] = "Horn Leech";
    } else if (to === "Galvantula") {
        evoMove[evoMove.length] = "Sticky Web";
    } else if (to === "Ferrothorn") {
        evoMove[evoMove.length] = "Power Whip";
    } else if (to === "Klinklang") {
        evoMove[evoMove.length] = "Magnetic Flux";
    } else if (to === "Eelektross") {
        evoMove[evoMove.length] = "Crunch";
    } else if (to === "Beartic") {
        evoMove[evoMove.length] = "Icicle Crash";
    } else if (to === "Golurk") {
        evoMove[evoMove.length] = "Heavy Slam";
    } else if (to === "Braviary") {
        evoMove[evoMove.length] = "Superpower";
    } else if (to === "Mandibuzz") {
        evoMove[evoMove.length] = "Bone Rush";
    } else if (to === "Volcarona") {
        evoMove[evoMove.length] = "Quiver Dance";
    } else if (to === "Quilladin") {
        evoMove[evoMove.length] = "Needle Arm";
    } else if (to === "Chesnaught") {
        evoMove[evoMove.length] = "Spiky Shield";
    } else if (to === "Delphox") {
        evoMove[evoMove.length] = "Mystical Fire";
    } else if (to === "Greninja") {
        evoMove[evoMove.length] = "Water Shuriken";
    } else if (to === "Fletchinder") {
        evoMove[evoMove.length] = "Ember";
    } else if (to === "Spewpa") {
        evoMove[evoMove.length] = "Protect";
    } else if (to === "Vivillon") {
        evoMove[evoMove.length] = "Gust";
    } else if (to === "Gogoat") {
        evoMove[evoMove.length] = "Aerial Ace";
    } else if (to === "Pangoro") {
        evoMove[evoMove.length] = "Bullet Punch";
    } else if (to === "Dragalge") {
        evoMove[evoMove.length] = "Twister";
    } else if (to === "Clawitzer") {
        evoMove[evoMove.length] = "Aura Sphere";
    } else if (to === "Tyrantrum") {
        evoMove[evoMove.length] = "Rock Slide";
    } else if (to === "Aurorus") {
        evoMove[evoMove.length] = "Freeze-Dry";
    } else if (to === "Sylveon") {
        evoMove[evoMove.length] = "Fairy Wind";
    } else if (to === "Goodra") {
        evoMove[evoMove.length] = "Aqua Tail";
    } else if (to === "Trevenant") {
        evoMove[evoMove.length] = "Shadow Claw";
    } else if (to === "Avalugg") {
        evoMove[evoMove.length] = "Body Slam";
    } else if (to === "Decidueye") {
        evoMove[evoMove.length] = "Spirit Shackle";
    } else if (to === "Incineroar") {
        evoMove[evoMove.length] = "Darkest Lariat";
    } else if (to === "Primarina") {
        evoMove[evoMove.length] = "Sparkling Aria";
    } else if (to === "Toucannon") {
        evoMove[evoMove.length] = "Beak Blast";
    } else if (to === "Charjabug") {
        evoMove[evoMove.length] = "Charge";
    } else if (to === "Vikavolt") {
        evoMove[evoMove.length] = "Thunderbolt";
    } else if (to === "Crabominable") {
        evoMove[evoMove.length] = "Ice Punch";
    } else if (to === "Ribombee") {
        evoMove[evoMove.length] = "Pollen Puff";
    } else if (to === "Lycanroc") {
        if (form === "Midday") {
            evoMove[evoMove.length] = "Accelerock";
        } else if (form === "Midnight") {
            evoMove[evoMove.length] = "Counter";
        } else {
            evoMove[evoMove.length] = "Thrash";
        }
    } else if (to === "Toxapex") {
        evoMove[evoMove.length] = "Baneful Bunker";
    } else if (to === "Lurantis") {
        evoMove[evoMove.length] = "Petal Blizzard";
    } else if (to === "Salazzle") {
        evoMove[evoMove.length] = "Captivate";
    } else if (to === "Bewear") {
        evoMove[evoMove.length] = "Bind";
    } else if (to === "Steenee") {
        evoMove[evoMove.length] = "Double Slap";
    } else if (to === "Tsareena") {
        evoMove[evoMove.length] = "Trop Kick";
    } else if (to === "Golisopod") {
        evoMove[evoMove.length] = "First Impression";
    } else if (to === "Silvally") {
        evoMove[evoMove.length] = "Multi-Attack";
    } else if (to === "Hakamo-o") {
        evoMove[evoMove.length] = "Sky Uppercut";
    } else if (to === "Kommo-o") {
        evoMove[evoMove.length] = "Clanging Scales";
    } else if (to === "Cosmoem") {
        evoMove[evoMove.length] = "Cosmic Power";
    } else if (to === "Solgaleo") {
        evoMove[evoMove.length] = "Sunsteel Strike";
    } else if (to === "Lunala") {
        evoMove[evoMove.length] = "Moongeist Beam";
    }

    return evoMove;
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
    for (i = 0; i < pkmn.move_learnset.length; i++) {
        if (pkmn.move_learnset[i].hasOwnProperty(method)) {
            moves[moves.length] = pkmn.move_learnset[i];
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
        /**
         * @todo Get default form.
         */
        var path = generatePokemonJSONPath(pkmn.evolution_from, null);
        var data;
        try {
            data = fs.readFileSync(path, "utf8");
        } catch (err) {
            console.log(err);
            return null;
        }
        var from = JSON.parse(data);
        var evoFrom = getEvolvesTo(from, pkmn.name);
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
    else if (pkmn.name === "Cosmoem") {
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
    else if (pkmn.name === "Mantyke") {
        var k = evolutions.length;
        evolutions[k] = {
            "name": "Mantine",
            "method": "by leveling up while owning a Remoraid."
        }
    }
    //pangoro requires user to have a dark type
    else if (pkmn.name === "Pancham") {
        var k = evolutions.length;
        evolutions[k] = {
            "name": "Pangoro",
            "method": "at level 32 while owning another Dark-type Pokémon."
        }
    }
    //inkay normally requires user to hold device upside down, but in this case only has level requirement
    else if (pkmn.name === "Inkay") {
        var k = evolutions.length;
        evolutions[k] = {
            "name": "Malamar",
            "method": "at level 30."
        }
    }
    //sliggoo requires it to be raining
    else if (pkmn.name === "Sliggoo") {
        var k = evolutions.length;
        evolutions[k] = {
            "name": "Goodra",
            "method": "at level 50 while in rain."
        }
    }
    //tyrogue evolves based on its highest stat
    else if (pkmn.name === "Tyrogue") {
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
    else if (pkmn.name === "Wurmple") {
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
                        if (pkmn.name === "Shelmet") {
                            var k = evolutions.length;
                            evolutions[k] = {
                                "name": "Accelgor",
                                "method": "by trading for a Karrablast."
                            }
                        } else if (pkmn.name === "Karrablast") {
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
        evolutions[specIndex].name = pkmn.name;
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

