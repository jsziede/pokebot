const assert = require('chai').assert;
const expect = require('chai').expect;
const should = require('chai').should();

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
});