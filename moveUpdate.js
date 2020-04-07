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

let itemDir = "./data/move";
fs.readdirSync(itemDir).forEach(file => {
    let itemPath = itemDir + "/" + file;
    let itemJSON = fs.readFileSync(itemPath);  
    let item = JSON.parse(itemJSON);

    let movesDir = "../moves/";
    let moveName = convertStringToJsonFilename(item.names.en);

    let newMove = {
        index_number: item.index_number,
        name: item.names.en,
        type: item.type,
        pp: item.pp,
        max_pp: item.max_pp,
        power: item.power,
        accuracy: item.accuracy,
        category: item.category,
        priority: item.priority,
        critical_hit: item.critical_hit,
        target: item.target,
        makes_contact: item.makes_contact,
        affected_by_protect: item.affected_by_protect,
        affected_by_magic_coat: item.affected_by_magic_coat,
        affected_by_snatch: item.affected_by_snatch,
        affected_by_mirror_move: item.affected_by_mirror_move,
        affected_by_kings_rock: item.affected_by_kings_rock,
        description: item.pokedex_entries[ 'Ultra Sun' ].en
    }

    fs.writeFileSync((movesDir + moveName), JSON.stringify(newMove, null, 4));
});