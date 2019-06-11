/**
 *  Pokébot - A simulation of the Pokémon video games that runs in the Discord environment.
 *  Copyright (C) 2019 Joshua Sziede
*/

const assert = require('chai').assert;
const expect = require('chai').expect;

const fs = require('fs');

function convertStringToJsonFilename(name) {
    name = name.toLowerCase();
    name = name.replace(/\./gi, '');
    name = name.replace(/\-/gi, '_');
    name = name.replace(/\'/gi, '_');
    name = name.replace(/ /gi, '_');
    name = name.replace(/\é/gi, 'e');
    name = name + ".json";
    return name;
}

/**
 * Determine integrity of data files.
 */
describe('Data File Integrity', function() {
    /**
     * Determine integrity of item data files.
     */
    it('Items', function(done) {
        let itemDir = "./data/items";
        fs.readdirSync(itemDir).forEach(file => {
            let itemPath = itemDir + "/" + file;
            let itemJSON = fs.readFileSync(itemPath);  
            let item = JSON.parse(itemJSON);

            /**
             * Assert file name is consistent with the item name.
             */
            let itemName = convertStringToJsonFilename(item.name);
            assert.equal(itemName, file, (item.name + " does not match the file name of " + file));

            /**
             * Check if item has all properties.
             */
            expect(item, (file + " does not have name property.")).to.have.property('name');
            expect(item, (file + " does not have sell_price property.")).to.have.property('sell_price');
            expect(item, (file + " does not have holdable property.")).to.have.property('holdable');
            expect(item, (file + " does not have battle property.")).to.have.property('battle');
            expect(item, (file + " does not have category property.")).to.have.property('category');
            expect(item, (file + " does not have subcategory property.")).to.have.property('subcategory');

            /**
             * Assert item properties are proper types.
             */
            assert.isString(item.name, (file + " name property is not a string."));
            assert.isBoolean(item.holdable, (file + " holdable property is not a boolean."));
            assert.isBoolean(item.battle, (file + " battle property is not a boolean."));
            expect(item.sell_price, (file + " sell_price property is not a number or null.")).to.satisfy(function(value) {
                return (value === null || (typeof value === "number"));
            });
        });
        done();
    });

    /**
     * Determine integrity of Pokemon data files.
     */
    it('Pokemon', function(done) {
        let pokemonDir = "./data/pokemon";
        fs.readdirSync(pokemonDir).forEach(file => {
            let pokemonPath = pokemonDir + "/" + file;
            let pokemonJSON = fs.readFileSync(pokemonPath);  
            let pokemon = JSON.parse(pokemonJSON);

            /**
             * Check if Pokemon has all properties.
             */
            expect(pokemon, (file + " does not have name property.")).to.have.property('name');
            expect(pokemon, (file + " does not have national_id property.")).to.have.property('national_id');
            expect(pokemon, (file + " does not have types property.")).to.have.property('types');
            expect(pokemon, (file + " does not have abilities property.")).to.have.property('abilities');
            expect(pokemon, (file + " does not have catch_rate property.")).to.have.property('catch_rate');
            expect(pokemon, (file + " does not have egg_groups property.")).to.have.property('egg_groups');
            expect(pokemon, (file + " does not have hatch_time property.")).to.have.property('hatch_time');
            expect(pokemon, (file + " does not have height_us property.")).to.have.property('height_us');
            expect(pokemon, (file + " does not have gender_ratios property.")).to.have.property('gender_ratios');
            expect(pokemon, (file + " does not have height_eu property.")).to.have.property('height_eu');
            expect(pokemon, (file + " does not have weight_us property.")).to.have.property('weight_us');
            expect(pokemon, (file + " does not have weight_eu property.")).to.have.property('weight_eu');
            expect(pokemon, (file + " does not have base_exp_yield property.")).to.have.property('base_exp_yield');
            expect(pokemon, (file + " does not have leveling_rate property.")).to.have.property('leveling_rate');
            expect(pokemon, (file + " does not have base_friendship property.")).to.have.property('base_friendship');
            expect(pokemon, (file + " does not have ev_yield property.")).to.have.property('ev_yield');
            expect(pokemon, (file + " does not have base_stats property.")).to.have.property('base_stats');
            expect(pokemon, (file + " does not have evolution_from property.")).to.have.property('evolution_from');
            expect(pokemon, (file + " does not have evolutions property.")).to.have.property('evolutions');
            expect(pokemon, (file + " does not have species property.")).to.have.property('species');
            expect(pokemon, (file + " does not have mega_evolves property.")).to.have.property('mega_evolves');
            expect(pokemon, (file + " does not have pokedex_entry property.")).to.have.property('pokedex_entry');
            expect(pokemon, (file + " does not have move_learnset property.")).to.have.property('move_learnset');

            /**
             * Assert Pokemon properties are proper types.
             */
            assert.isString(pokemon.name, (file + " name property is not a string."));
            assert.isString(pokemon.height_us, (file + " height_us property is not a string."));
            assert.isString(pokemon.height_eu, (file + " height_eu property is not a string."));
            assert.isString(pokemon.weight_us, (file + " weight_us property is not a string."));
            assert.isString(pokemon.weight_eu, (file + " weight_eu property is not a string."));
            assert.isString(pokemon.leveling_rate, (file + " leveling_rate property is not a string."));
            assert.isString(pokemon.species, (file + " species property is not a string."));
            assert.isString(pokemon.pokedex_entry, (file + " pokedex_entry property is not a string."));
            assert.isBoolean(pokemon.mega_evolves, (file + " mega_evolves property is not a boolean."));
            assert.isNumber(pokemon.national_id, (file + " national_id property is not a number."));
            assert.isNumber(pokemon.catch_rate, (file + " catch_rate property is not a number."));
            assert.isNumber(pokemon.base_exp_yield, (file + " base_exp_yield property is not a number."));
            assert.isNumber(pokemon.base_friendship, (file + " base_friendship property is not a number."));
            assert.isArray(pokemon.types, (file + " types property is not a list."));
            assert.isArray(pokemon.abilities, (file + " abilities property is not a list."));
            assert.isArray(pokemon.egg_groups, (file + " egg_groups property is not a list."));
            assert.isArray(pokemon.hatch_time, (file + " hatch_time property is not a list."));
            assert.isArray(pokemon.evolutions, (file + " evolutions property is not a list."));
            assert.isArray(pokemon.move_learnset, (file + " move_learnset property is not a list."));
            assert.isObject(pokemon.ev_yield, (file + " ev_yield property is not an object."));
            assert.isObject(pokemon.base_stats, (file + " base_stats property is not an object."));
            expect(pokemon.evolution_from, (file + " evolution_from property is not a string or null.")).to.satisfy(function(name) {
                return (name === null || (typeof name === "string"));
            });
            expect(pokemon.gender_ratios, (file + " gender_ratios property is not a string or null.")).to.satisfy(function(ratios) {
                return (ratios === null || (typeof ratios === "object"));
            });

            /**
             * Assert Pokemon has at least one type and ability.
             */
            expect(pokemon.abilities).to.have.lengthOf.at.least(1);
            expect(pokemon.types).to.have.lengthOf.at.least(1);
        });
        done();
    });
});