const axios = require("axios");
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();

let db = new sqlite3.Database('./master_db/recipes_' + new Date() + '.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Connected to the database.');

    db.serialize(() => {
        db.run("CREATE TABLE recipes (link TEXT, duration TEXT, full_duration Text, difficulty TEXT, ingredients TEXT, description TEXT)");
    });

    getAllCategories().then(async (categoriesDOM) => {
        const categories = categoriesDOM('.category-column > div > a');
        //slice(32)
        for (const element of categories){
            const attributes = element.attribs;
            let link = attributes['href'];
           
            console.log("Categorie", link);
    
            await getLinksToRecipesByPageNumber('https://www.chefkoch.de' + link);
        }
    
        db.close((err) => {
            if (err) {
              console.error(err.message);
            }
            console.log('Close the database connection.');
          });
    
        });

});

async function getAllCategories() {
    try {
        var response = await axios.get("https://www.chefkoch.de/rezepte/kategorien/").catch((err) => console.log(err));
        if(response.status !== 200){
            console.log("Error occurred while fetching data");
            return;
        }
        var html = response.data;
        var dom = cheerio.load(html);
        return dom;
    }catch (e) {
        console.log("Fetching categories failed");
        return;
    }
}

async function getLinksToRecipesByPageNumber(link) {
    console.log(link);
    var allRecipies = [];
    var page = 0;

    await new Promise(async (resolve, reject) => {

        while(true){
            var regex = /\/rs\/s(\d+)/;
            link = link.replace(regex.exec(link)[0], "/rs/s" + page);
            try {
            var response = await axios.get(link);
            } catch (err) {
                console.log("Request failed. Maybe just the end of pagination");
                resolve();
                break;
            }

            if(response.status !== 200){
                console.log("Error occurred while fetching data");
                resolve();
                break;
            }
            var indexCategorieURL = regex.exec(link)[1];
            var indexRealURL = regex.exec(response.request.res.responseUrl)[1];
            console.log(link,response.request.res.responseUrl, indexCategorieURL, indexRealURL);
            if(indexCategorieURL == 0 && indexRealURL == 0){
                link = response.request.res.responseUrl;
            }
            if(response.request.res.responseUrl, regex.exec(link)[1] != regex.exec(response.request.res.responseUrl)[1]){
                resolve()
                break;
            }

            var html = response.data;
            var dom = cheerio.load(html);
            const receipes = dom('div:not([data-vars-payed-content-type="plus_recipe"]) > .ds-recipe-card__link');
            for (const recipe of receipes){
                await new Promise(async (resolve, reject) => {
                var recipeAttributes = recipe.attribs;
                let link = recipeAttributes['href'];

                function sleep(ms) {
                    return new Promise((resolve) => {
                      setTimeout(resolve, ms);
                    });
                  }

                const requestReceipeData = async () => {
                    try {
                        var recipeContentResult = await axios.get(link);
                        return recipeContentResult;
                    }
                    catch (err) {
                        console.log("Recipe Request failed, wait for 10 seconds");
                        await sleep(10000);
                        return false;
                    }
                }
                
                var recipeContentResult = await requestReceipeData();
                recipeContentResult == false ? recipeContentResult = await requestReceipeData() : recipeContentResult;

                if(recipeContentResult == false){
                    return;
                }
                
                var recipeConentHTML = recipeContentResult.data;
                var recipeContent = cheerio.load(recipeConentHTML);

                var regexDifficulty = /\s+([a-zA-Z]+)/;
                var duration = recipeContent('.recipe-preptime')['0'].children[1].data.trim();
                var full_duration = recipeContent('.rds-recipe-meta > .rds-recipe-meta__badge').filter((index, element) => {return element.children[1].data.includes("Gesamtzeit")})[0].children[1].data.replace("Gesamtzeit ca. ", "").trim();
                var difficulty = regexDifficulty.exec(recipeContent('.recipe-difficulty').text())[1];
                var ingredientsElement = recipeContent('.ingredients > tbody > tr');
                var ingredients = []
                for (const ingredient of ingredientsElement){
                    try {
                        
                    var allTDs = recipeContent(ingredient).children('td');
                    var amount = allTDs['0'].children[0]?.children[0].data.trim().replace(/\s+/gm, " ");
                    var type = allTDs['1'].children[1].children[0].hasOwnProperty('data') ? allTDs['1'].children[1].children[0].data.trim().replace(/\s+/gm, " ") : recipeContent(ingredient).children('td')['1'].children[1].children[0].children[0].data.trim().replace(/\s+/gm, " ");
                    ingredients.push(amount != undefined ? amount + " " + type : type); 
                    } catch (e) {
                        console.log(allTDs['0']);
                        console.log(link);
                        throw Error;
                    }
                }
                var description = recipeContent('body > main > article.ds-box.ds-grid-float.ds-col-12.ds-col-m-8.ds-or-3 > div:nth-child(3)').text();
                var fullRecipeData = {link: link, duration: duration, full_duration: full_duration, difficulty: difficulty, ingredients: ingredients.join("; "), description: description.replace(/(\r\n|\n|\r)/gm, "").trim()};
                allRecipies.push(fullRecipeData);
                //Write to Database
                console.log(fullRecipeData);
                db.run("INSERT INTO recipes(link, duration, full_duration, difficulty, ingredients, description) VALUES (?, ?, ?, ?, ?, ?)", [link, duration, full_duration, difficulty, ingredients.join("; "), description.replace(/(\r\n|\n|\r)/gm, "").trim()]);
                resolve();
                });
            }

            page++;

        }
        });

        return allRecipies;
}
