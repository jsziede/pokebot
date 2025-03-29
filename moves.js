const fs = require('node:fs');
const pFiles = require('./src/files.js')();
const pokemon = require('./src/pokemon.js')();
const file = "./a.json";
fs.readFile(file, function(err, data) { 

    if (err) throw err;

    const lmao = JSON.parse(data);
    let moves_level = [];
    let moves_tm = [];
    let moves_egg = [];
    let games = ["scarlet-violet", "sword-shield", "ultra-sun-ultra-moon"];
    let findSV = 0;
    let findSS = 0;
    let findUS = 0;
    let iteration = 0;
    while (iteration < 3) {
        lmao.moves.forEach((move) => {
            move.version_group_details.forEach((game) => {
                if (game.version_group.name == games[iteration]) {
                    if (iteration == 0) {
                        findSV = 1;
                    } else if (iteration == 1) {
                        findSS = 1;
                    } else if (iteration == 2) {
                        findUS = 1;
                    }
                    const method = game.move_learn_method.name;
                    let moveName = move.move.name.replace(/-/g, "_");
                    moveName = apostropheFix(moveName);
                    moveName = openFile(moveName);
                    if (method == "level-up") {
                        let moveLevel = game.level_learned_at.toString();
                        if (moveLevel == "0") {
                            moveLevel = "Evo";
                        }
                        let newLvMove = {
                            move: moveName,
                            level: moveLevel
                        }
                        moves_level.push(newLvMove);
                    } else if (method == "machine") {
                        moves_tm.push(moveName);
                    } else if (method == "egg") {
                        moves_egg.push(moveName);
                    }
                }
            });
        });

        if (findSV || findSS || findUS) {
            console.log(games[iteration]);
            iteration = 4;
        } else {
            iteration++;
        }
    }

    const selectedPokemon = getPokemonFile(lmao.name, null);
    delete selectedPokemon["move_learnset"];
    selectedPokemon.moves_level = moves_level;
    selectedPokemon.moves_tm = moves_tm;
    selectedPokemon.moves_egg = moves_egg;
    console.log(selectedPokemon);
    fs.writeFileSync("./new.json", JSON.stringify(selectedPokemon));
}); 

let apostropheFix = function (name) {
    if (name == "forests_curse") {
        return "forest_s_curse";
    } else if (name == "kings_shield") {
        return "king_s_shield";
    } else if (name == "lands_wrath") {
        return "land_s_wrath";
    } else if (name == "natures_madness") {
        return "nature_s_madness";
    } else if (name == "lets_snuggle_forever") {
        return "let_s_snuggle_forever";
    } else {
        return name;
    }
}

let openFile = function (moveName) {
    let path = './data/moves/' + moveName + '.json';
    const data = fs.readFileSync(path,
        { encoding: 'utf8', flag: 'r' });

    lol = JSON.parse(data);
    return lol.name;
}

let getPokemonFile = function (name, form) {
        let lower = name.toLowerCase();
    
        /**
         * replace apostrophes with dashes.
         */
        lower = lower.replace(/'/g,"-");
        /**
         * replace spaces with dashes.
         */
        lower = lower.replace(/ /g,"-");
        /**
         * replace acute e with regular e.
         */
        lower = lower.replace(/é/g,"e");
    
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
    
        let path = './data/pokemon/' + lower + '.json';
        const data = fs.readFileSync(path,
            { encoding: 'utf8', flag: 'r' });
    
        lol = JSON.parse(data);
        return lol;
    }