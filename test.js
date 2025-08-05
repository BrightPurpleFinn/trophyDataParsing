const { exchangeAccessCodeForAuthTokens, exchangeNpssoForAccessCode,
    getTitleTrophies, getUserTitles, getUserTrophiesEarnedForTitle } = require("psn-api");
const fs = require("fs");
require('dotenv').config();

const npsso = "b"

async function main() {
    const startTime = new Date().getTime();
    authCode = await getAuth();

    //If game list and online list match up in length, use updateData
    gameListLength = (JSON.parse(fs.readFileSync('data/gameList.json'))).length;
    onlineListLength = (await removeHiddenGames(await getAllTitles(authCode))).length;

    if (gameListLength== onlineListLength) {
        console.log("updating changed data")
        await updateData();
    } else { //else update all data.
        await forceUpdateData();
    }

    const duration = (new Date().getTime() - startTime) / 1000;
    console.log("Program Duration: " + duration.toString() + "s");
}

/**
 * Forces an entire update of the existing gameList.json and trophyDataList.json by completely rewriting the data in them.
 */
async function forceUpdateData() {
    const response = await getAllTitles(authCode);
    var gameList = response.map(extractGameData);
    gameList = removeHiddenGames(gameList);
    trophyDataList = await getAllTitlesTrophyData(gameList);

    fs.writeFileSync("data/gameList.json", JSON.stringify(gameList, null, 3));
    fs.writeFileSync("data/trophyDataList.json", JSON.stringify(trophyDataList, null, 3))
}

/**
 * Updates the existing gameList.json and trophyDataList.json by updating the ones that have had changes.
 */
async function updateData() {
    gameList = JSON.parse(fs.readFileSync('data/gameList.json'));
    trophyDataList = JSON.parse(fs.readFileSync('data/trophyDataList.json'))
    anyMismatches = false

    onlineList = await getAllTitles(authCode);
    onlineList = await removeHiddenGames(onlineList);

    for (let x = 0; x < gameList.length; x++) {
        console.log((Number(x) + 1).toString() + "/" + gameList.length.toString());
        onlineData = onlineList[x];

        if (gameList[x].gameName != onlineData.trophyTitleName) console.log("name mismatch")

        if (gameList[x].lastUpdatedTime != onlineData.lastUpdatedDateTime) {
            anyMismatches = true
            console.log("Game outdated: " + gameList[x].gameName);
            if (trophyDataList[x].gameName != gameList[x].gameName) throw Error("Mismatch Indexes");

            gameList[x] = extractGameData(onlineData);

            trophyDataList[x] = await getTrophyDataForTitle(gameList[x]);
        }
    }
    if (anyMismatches) {
        console.log("Updating files");
        fs.writeFileSync("data/trophyDataList.json", JSON.stringify(trophyDataList, null, 3));
        fs.writeFileSync("data/gameList.json", JSON.stringify(gameList, null, 3));
    } else {
        console.log("No updates needed")
    }
}

/**
 * 
 * @param {} gameList gameList to Remove the hidden games from
 * @returns gameList updated with the hidden games removed
 */
function removeHiddenGames(gameList) {
    hidden = JSON.parse(fs.readFileSync("data/hidden.json"));
    for (x in gameList) {
        if (hidden.indexOf(gameList[x].gameName) > -1 || hidden.indexOf(gameList[x].trophyTitleName) > -1) {
            gameList.splice(x, 1);
        }
    }
    return gameList;
}

/**
 * Compiles a list of trophy data for tall of the games that have been supplied to the function
 * @param {*} gameList List of games to get trophydata for
 * @returns 
 */
async function getAllTitlesTrophyData(gameList) {
    trophyDataList = []
    for (x in gameList) {
        console.log((Number(x) + 1).toString() + "/" + gameList.length.toString());
        data = await getTrophyDataForTitle(gameList[x])
        trophyDataList = trophyDataList.concat(data);
    }
    return trophyDataList;
}

/**
 * Acquires full trophy data for single game title
 * @param {*} game Game meta data that the trophy data for the game is to be acquired for
 * @returns 
 */
async function getTrophyDataForTitle(game) {
    trophyListData = await getTrophyMetaData(game)

    if (trophyListData.nextOffset != undefined) throw Error("Next offset present, need to make sure all trophies are found")
    
    trophyEarnedData = await getTrophyPersonalData(game)

    trophyListMerged = []

    trophyListDataTrophies = trophyListData.trophies;
    trophyEarnedDataTrophies = trophyEarnedData.trophies;

    for (y in trophyListDataTrophies) {
        if (trophyListDataTrophies[y].trophyId != trophyEarnedDataTrophies[y].trophyId) throw Error("Trophy IDs not matching");

        trophyListMerged = trophyListMerged.concat(extractTrophyData(trophyListDataTrophies[y], trophyEarnedDataTrophies[y]))
    }

    data = {
        "gameName": game.gameName,
        "trophyList": trophyListMerged
    }
    return data;
}

/**
 * Parses the useful meta trophy data and personal trophy data into one object
 * @param {*} trophyData 
 * @param {*} trophyEarned 
 * @returns 
 */
function extractTrophyData(trophyData, trophyEarned) {
    data = {
        "trophyId": trophyData.trophyId,
        "trophyType": trophyData.trophyType,
        "trophyName": trophyData.trophyName,
        "trophyDetail": trophyData.trophyDetail,
        "trophyIconUrl": trophyData.trophyIconUrl,
        "trophyGroupId": trophyData.trophyGroupId,
        "trophyEarned": trophyEarned.earned,
        "trophyEarnedDate": trophyEarned.earnedDateTime,
        "trophyRate": trophyEarned.trophyEarnedRate,
    }
    return data;
}

/** 
 * Grabs the meta trophy data for a game
 * @param {*} game
 * @returns
 */
async function getTrophyMetaData(game) {
    var data = await getTitleTrophies(authCode, game.gameId, "all", (game.platform[2] != '5') ? { npServiceName: "trophy" } : {});
    data["gameName"] = game.gameName;
    return data;
}

/**
 * Grabs the personal trophy data for a game
 * @param {*} game 
 * @returns 
 */
async function getTrophyPersonalData(game) {
    var data =  await getUserTrophiesEarnedForTitle(
        authCode, "me", game.gameId, "all", (game.platform[2] != '5') ? { npServiceName: "trophy" } : {});
    data["gameName"] = game.gameName;
    return data;
}

/**
 * Parses the useful game data into one object
 * @param {*} object Game data
 * @returns 
 */
function extractGameData(object) {
    data = {
        "gameName": object.trophyTitleName,
        "gameId": object.npCommunicationId,
        "gameIconUrl": object.trophyTitleIconUrl,
        "platform": object.trophyTitlePlatform,
        "dlcCount": object.trophyGroupCount - 1,
        "gameTrophies": object.definedTrophies,
        "earnedTrophies": object.earnedTrophies,
        "hiddenFlag": object.hiddenFlag,
        "lastUpdatedTime": object.lastUpdatedDateTime
    };
    return data;
}

/**
 * Gets the authentication code for my account
 * @returns 
 */
async function getAuth() {
    try {
        return await exchangeAccessCodeForAuthTokens(await exchangeNpssoForAccessCode(npsso));
    } catch (error) {
        throw (new Error("TESTING"));
    }
}

/**
 * Gets all game titles for my account
 * @param {*} authCode 
 * @returns 
 */
async function getAllTitles(authCode) {
    var titles = [];
    var offset = 0;
    var allNotFound = true;
    while (allNotFound) {
        var foundTitles = await getUserTitles(authCode, "me", { limit: 100, offset: offset });
        titles = titles.concat(foundTitles.trophyTitles);
        allNotFound = foundTitles.trophyTitles.length == 100;
        offset += 100;
    }
    return titles;
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});