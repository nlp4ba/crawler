const axios = require("axios");
const cheerio = require('cheerio');

async function getAllCategories() {
    var response = await axios.get("https://www.chefkoch.de/rezepte/kategorien/").catch((err) => console.log(err));
    if(response.status !== 200){
        console.log("Error occurred while fetching data");
        return;
    }
    var html = response.data;
    var dom = cheerio.load(html);
    return dom;
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
            const receipes = dom('.ds-recipe-card__link');
            for (const recipe of receipes){
                await new Promise(async (resolve, reject) => {
                var recipeAttributes = recipe.attribs;
                let link = recipeAttributes['href'];

                var recipeContentResult = await axios.get(link);
                var recipeConentHTML = recipeContentResult.data;
                var recipeContent = cheerio.load(recipeConentHTML);

                var regexDuration = /(\d+\s*[a-zA-Z]+)/;
                var regexDifficulty = /\s+([a-zA-Z]+)/;
                var duration = recipeContent('.recipe-preptime').text().match(regexDuration)[1];
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
                var fullRecipeData = {link: link, duration: duration, difficulty: difficulty, ingredients: ingredients.join("; "), description: description.replace(/(\r\n|\n|\r)/gm, "").trim()};
                allRecipies.push(fullRecipeData);
                console.log(fullRecipeData);
                resolve();
                });
            }

            page++;

        }
        });

        return allRecipies;
}

getAllCategories().then(async (categoriesDOM) => {
    const categories = categoriesDOM('.category-column > div > a');
    for (const element of categories){
        const attributes = element.attribs;
        let link = attributes['href'];
       
        console.log("Categorie", link);

        var test = await getLinksToRecipesByPageNumber('https://www.chefkoch.de' + link);
        console.log(test);
    }

    });
