const pokemon = require('../../src/pokemon.js')();
const pFiles = require('../../src/files.js')();

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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
        
        try {
			const selectedPokemon = await getOnePokemon(option, "Male", null);
            const thumbo = getPokeImage(option, false, "Male", null);
            const dexNum = "#" + dexNumberToString(selectedPokemon);

            const dexEmbed = new EmbedBuilder()
            .setColor(getTypeColor(selectedPokemon.types[0]))
            .setTitle(selectedPokemon.name)
            .setDescription(selectedPokemon.species)
            .setAuthor({ name: dexNum, iconURL: 'https://github.com/jsziede/pokebot/blob/master/gfx/icons/menu_sprites/001.png?raw=true', url: 'https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)' })
            .setThumbnail(thumbo)
            .addFields(
                { name: 'Description', value: selectedPokemon.pokedex_entry },
                { name: 'Type', value: "<:grass:1349950711126822946> Grass\n<:poison:1349950737416847370> Poison", inline: true },
                { name: 'Height', value: (selectedPokemon.height_us + "\n" + selectedPokemon.height_eu), inline: true },
                { name: 'Weight', value: (selectedPokemon.weight_us + "\n" + selectedPokemon.weight_eu), inline: true }
            )
            .setTimestamp();

            await interaction.reply({ embeds: [dexEmbed] });
		} catch (error) {
            console.log("ERROR: DEX command did not work for " + option);
			await interaction.reply({ content: "Pokémon not found." });
		}

	}
};