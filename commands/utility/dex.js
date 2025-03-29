const pokemon = require('../../src/pokemon.js')();
const emojis = require('../../src/emoji.js')();
const pFiles = require('../../src/files.js')();

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('dex')
		.setDescription('View Pokédex data for one Pokémon')
		.addStringOption(option =>
			option
                .setName('species')
				.setDescription('Species to search for')
                .setAutocomplete(true)
                .setRequired(true)
    ),
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        
        const filtered = pokemonList.filter(choice => choice.toLowerCase().includes(focusedValue.toLowerCase()));
        
        let options;
        if (filtered.length > 25) {
            options = filtered.slice(0, 25);
        } else {
            options = filtered;
        }
        
        await interaction.respond(
            options.map(choice => ({ name: choice, value: choice })),
        );
    },
    async execute(interaction) {
        const option = interaction.options.getString("species").toLowerCase();
        
        const selectedPokemon = await getOnePokemon(option, "Male", null);
        const thumbo = getPokeImage(option, false, "Male", null);
        const dexNum = "#" + dexNumberToString(selectedPokemon);
        const typeString = getTypeString(selectedPokemon.types);
        const abilityString = getAbilityString(selectedPokemon.abilities);
        const baseStatsString = getBaseStatsString(selectedPokemon.base_stats);
        const evString = getEVYieldsString(selectedPokemon.ev_yield);
        const heldItemsString = getWildHeldItemsString(selectedPokemon);
        const otherString = getMiscString(selectedPokemon);

        const infoEmbed = new EmbedBuilder()
        .setColor(getTypeColor(selectedPokemon.types[0]))
        .setTitle(typeString + "\n" + selectedPokemon.name)
        .setDescription(selectedPokemon.species)
        .setAuthor({ name: dexNum, iconURL: 'https://github.com/jsziede/pokebot/blob/master/gfx/icons/menu_sprites/001.png?raw=true', url: 'https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)' })
        .setThumbnail(thumbo)
        .addFields(
            { name: 'Description', value: selectedPokemon.pokedex_entry },
            { name: 'Height', value: (selectedPokemon.height_us + "\n" + selectedPokemon.height_eu), inline: true },
            { name: 'Weight', value: (selectedPokemon.weight_us + "\n" + selectedPokemon.weight_eu), inline: true }
        )
        .setTimestamp();

        const statsEmbed = new EmbedBuilder()
        .setColor(getTypeColor(selectedPokemon.types[0]))
        .setTitle(typeString + "\n" + selectedPokemon.name)
        .setDescription(selectedPokemon.species)
        .setAuthor({ name: dexNum, iconURL: 'https://github.com/jsziede/pokebot/blob/master/gfx/icons/menu_sprites/001.png?raw=true', url: 'https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)' })
        .setThumbnail(thumbo)
        .addFields(
            { name: 'Abilities', value: (abilityString), inline: true },
            { name: 'Wild Items', value: (heldItemsString), inline: true },
            { name: 'Catch Rate', value: selectedPokemon.catch_rate.toString(), inline: true },
            { name: 'Base Stats', value: (baseStatsString), inline: true },
            { name: 'EV Yields', value: (evString), inline: true },
            { name: 'Other Stats', value: otherString, inline: true }
        )
        .setTimestamp();

        let infoDex = new ButtonBuilder()
            .setCustomId('info')
            .setLabel('Info')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('ℹ️');


        let statsDex = new ButtonBuilder()
            .setCustomId('stats')
            .setLabel('Stats')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⚔️');

        let row = new ActionRowBuilder()
            .addComponents(infoDex, statsDex);

        let confirmation;
        try {
            let response = await interaction.reply({ embeds: [infoEmbed], components: [row], withResponse: true });
            const collectorFilter = i => i.user.id === interaction.user.id;
            let buttonsAreActive = true;
            while (buttonsAreActive) {
                try {
                    confirmation = await response.resource.message.awaitMessageComponent({ filter: collectorFilter, time: 60_000 });
                    if (confirmation.customId === 'info') {
                        await confirmation.update({ embeds: [infoEmbed] });
                    } else if (confirmation.customId === 'stats') {
                        await confirmation.update({ embeds: [statsEmbed] });
                    } 
                } catch {
                    buttonsAreActive = false;
                    interaction.editReply({components: []});
                }
            }
        } catch (error) {
            console.log("ERROR: DEX command did not work for " + option);
            console.log(error);
            await interaction.reply({ content: "Pokémon not found." });
        }
        
	}
};