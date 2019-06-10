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
        assert.equal(file, itemName);

        /**
         * Check if item has all properties.
         */
        expect(item).to.have.property('name');
        expect(item).to.have.property('sell_price');
        expect(item).to.have.property('holdable');
        expect(item).to.have.property('battle');
        expect(item).to.have.property('category');
        expect(item).to.have.property('subcategory');

        /**
         * Assert item properties are proper types.
         */
        assert.isString(item.name);
        assert.isBoolean(item.holdable);
        assert.isBoolean(item.battle);
        expect(item.sell_price).to.satisfy(function(value) {
            return (value === null || (typeof value === "number"));
        });
    });
}

testItemFiles();