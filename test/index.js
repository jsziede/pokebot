const describe = require('mocha').describe;
const it = require('mocha').it;
const assert = require('chai').assert;
const expect = require('chai').expect;
const should = require('chai').should();

const fs = require('fs');

/**
 * Determine integrity of file items.
 */
function testItemFiles() {
    let itemDir = "./data/items";
    fs.readdirSync(itemDir).forEach(file => {
        let itemPath = itemDir + "/" + file;
        let itemJSON = fs.readFileSync(itemPath);  
        let item = JSON.parse(itemJSON);

        /**
         * Assert file name is consistent with the item name.
         */
        let itemName = item.name.toLowerCase();
        itemName = itemName.replace(/\./gi, '');
        itemName = itemName.replace(/\-/gi, '_');
        itemName = itemName.replace(/\'/gi, '_');
        itemName = itemName.replace(/ /gi, '_');
        itemName = itemName.replace(/\é/gi, 'e');
        itemName = itemName + ".json";
        assert.equal(itemName, file, (itemName + " does not match the file name of " + file));

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
}

testItemFiles();