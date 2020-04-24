var myconfig = {
    /**
     * Database credentials
     */
    "database": {
        host: "localhost",
        user: "root",
        password: "~~~password_for_root~~~",
        database: '~~~database_name~~~',
        charset: 'utf8mb4'
    },

    /**
     * Discord bot token
     */
    "token": '~~~token_here~~~',

    /**
     * true = Pokebot will attach local images from this repository on your computer when possible for messages
     * false = Pokebot will always use image URLs from the online repository for messages
     */
    "useLocalImages": true
};
module.exports = myconfig;