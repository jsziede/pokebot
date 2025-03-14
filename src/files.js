const fs = require('node:fs');

module.exports = function() {
    this.getPokemonFile = function (name, form) {
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
        fs.readFile(path, function(err, data) { 

            if (err) throw err;

            return JSON.parse(data);
        }); 
    }
}