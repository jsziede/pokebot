# Pokébot / data

The `data` directory contains all the JSON files used by Pokébot. These files collectively contain almost all the information relating to the main series of Pokémon games, with the only significant missing data being NPC Trainers. Each subdirectory will eventually contain a README that details how these JSON files are structured so that users can easily create new files or modify existing files, or reference the data structures when modifying the source code.

## xp.json

`xp.json` contains the total amount of XP needed for a Pokémon to reach a specific level. This file contains a collection of six lists that each have 100 items. Each list represents the different XP formulae and each item represents how much total XP is needed to achieve level `x` for that formula, where `x` is the item's index plus one.

```json
{
    "name of xp formula 1":
    [
        "total xp needed for level 1",
        "total xp needed for level 2",
        "...",
        "total xp needed for level 99",
        "total xp needed for level 100"
    ],
    "name of xp formula 2":
    [
        "total xp needed for level 1",
        "total xp needed for level 2",
        "...",
        "total xp needed for level 99",
        "total xp needed for level 100"
    ]
}
```

## pokedex.json

`pokedex.json` is simply a list of all Pokémon in alphabetical order.

```json
{
    "pokemon": [
        "Abomasnow",
        "Abra",
        "Absol",
        "...",
        "Wishiwashi",
        "Xurkitree",
        "Yungoos",
        "Zeraora"
    ]
}
```