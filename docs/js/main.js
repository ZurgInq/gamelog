async function loadUUIDV7() {
    if (!window.uuidv7) {
        window.uuidv7 = (await import("./uuidv7.js")).uuidv7;
    }
}

if ('serviceWorker' in navigator) {
    let path = 'sw.js';
    const options = {};
    if (window.location.host === 'zurginq.github.io') {
        path = '/gamelog/sw.js';
        options['scope'] = '/gamelog/';
    }
    navigator.serviceWorker
        .register(path, options)
        .then((reg) => {
            // reg.update();
            console.log('Service Worker Registered');
        })
        .catch(function (err) {
            console.log(err);
        });
}

const RESULT_WINNER = 'winner';
const RESULT_LOSER = 'loser';
const RESULT_DRAW = 'draw';

const defaultDBName = 'db1';

function splitMinutes(durationMinutes) {
    durationMinutes = parseInt(durationMinutes) || 0;
    return [parseInt(durationMinutes / 60), durationMinutes % 60];
}

function joinToMinutes(hours, minutes) {
    return hours * 60 + minutes;
}

function formatDuration(minutes) {
    const parts = splitMinutes(minutes);
    while (String(parts[0]).length < 2) {
        parts[0] = '0' + String(parts[0]);
    }

    while (String(parts[1]).length < 2) {
        parts[1] = '0' + String(parts[1]);
    }

    return parts;
}

function debounceFn(fn, wait) {
    let timeoutId = null;
    return function () {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => fn(...arguments), wait);
    }
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min);
}

function strToInt(value) {
    const parsed = parseInt(value);
    if (parsed === NaN) {
        return null;
    }
    return parsed;
}

// ToDo убрать, бессмысленно
function ProxyInput(inputElement, options = {}) {
    const el = inputElement;
    return new Proxy({
        value: undefined,
    }, {
        get(target, prop, receiver) {
            if (prop === 'value') {
                if (options.type === 'int') {
                    return strToInt(el.value);
                }
                return el.value;
            }
            return target[prop];
        },
        set(target, property, value, receiver) {
            if (property === 'value') {
                el.value = value;
            }
            target[property] = value;
        }
    });
}

function hideEl(el) {
    if (el) {
        el.classList.add('d-none');
    }
}

function showEl(el) {
    if (el) {
        el.classList.remove('d-none');
    }
}

function textLoaderHide() {
    const textLoader = document.getElementById('text-loader');
    if (textLoader) {
        document.getElementById('text-loader').classList.add('d-none');
    }
}

function textLoaderShow() {
    const textLoader = document.getElementById('text-loader');
    if (textLoader) {
        document.getElementById('text-loader').classList.remove('d-none');
    }
}

function showSyncStatus() {
    document.getElementById('sync-status-label').textContent = `${AppSettings.syncState} ? 'ok' : 'fail'`;
    showEl(document.getElementById('sync-status-label'));
}

async function migrateDataFromV4(transaction) {
    const gamesStore = transaction.objectStore('games');
    let cursor = await gamesStore.openCursor();
    while (cursor) {
        const game = cursor.value;
        if (!game.uuid) {
            game.uuid = uuidv7();
        }
        await gamesStore.put(game);
        cursor = await cursor.continue();
    }

    const gameNotesStore = transaction.objectStore('game-notes');
    cursor = await gameNotesStore.openCursor();
    while (cursor) {
        const gameNotes = cursor.value;
        if (!gameNotes.uuid) {
            gameNotes.uuid = uuidv7();
        }
        await gameNotesStore.put(gameNotes);
        cursor = await cursor.continue();
    }
}

async function openDB() {
    const loadTime = new Date();
    textLoaderShow();
    await loadUUIDV7();

    const db = await idb.openDB(defaultDBName, 5, {
        async upgrade(db, oldVersion, newVersion, transaction, event) {
            let gamesStore;
            let gameNotesStore;

            console.log(`upgrade DB from ${oldVersion} to ${newVersion}`);
            switch (oldVersion) {
                case 0:
                    db.createObjectStore('games', {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                case 1:
                    db.createObjectStore('settings');
                case 2:
                    gamesStore = transaction.objectStore('games');
                    gamesStore.createIndex('gameTitle', 'gameTitle');
                    gamesStore.createIndex('tags', 'tags');
                    gamesStore.createIndex('players', 'players', { multiEntry: true });
                case 3:
                    db.createObjectStore('game-notes', {
                        keyPath: 'id',
                        autoIncrement: true,
                    });

                    gameNotesStore = transaction.objectStore('game-notes');
                    gameNotesStore.createIndex('gameTitle', 'gameTitle');
                case 4:
                    gamesStore = transaction.objectStore('games');
                    gamesStore.createIndex('uuid', 'uuid', { unique: true });

                    gameNotesStore = transaction.objectStore('game-notes');
                    gameNotesStore.createIndex('uuid', 'uuid', { unique: true });

                    migrateDataFromV4(transaction);
            }
        },
    });

    textLoaderHide();
    console.log('openDB load time', new Date() - loadTime);

    return db;
}

async function loadGameById(gameId) {
    return (await openDB()).get('games', gameId);
}

/**
 * @param {number} gameId 
 * @param {updateCallback} updateCallback 
 */
async function updateGameId(gameId, updateCallback) {
    const db = await openDB();
    const tx = db.transaction('games', 'readwrite');
    const gamesStore = tx.objectStore('games');
    const game = await gamesStore.get(gameId);
    const updatedGame = updateCallback(game);
    if (
        updatedGame
        && updatedGame.resultByScores
        && updatedGame.players
    ) {
        let winnerIdx = null;
        for (let index = 0; index < updatedGame.players.length; index++) {
            const player = updatedGame.players[index];
            const score = parseInt(player.score);
            if (score === NaN) {
                continue;
            }
            if (winnerIdx === null) {
                winnerIdx = index;
                updatedGame.players[winnerIdx].result = RESULT_WINNER;
                continue;
            }
            const winnerScore = parseInt(updatedGame.players[winnerIdx].score);
            if (score < winnerScore) {
                updatedGame.players[index].result = RESULT_LOSER;
            } else if (score > winnerScore) {
                updatedGame.players[winnerIdx].result = RESULT_LOSER;
                updatedGame.players[index].result = RESULT_WINNER;
                winnerIdx = index;
            } else if (score == winnerScore) {
                updatedGame.players[winnerIdx].result = RESULT_DRAW;
            }
        }
    }
    await gamesStore.put(updatedGame);
    await tx.done;
    await saveDBToCloud();

    return updatedGame;
}

/**
 * @param {number} gameId 
 * @param {updateCallback} updateCallback 
 */
async function updateGameById(gameId, updateCallback) {
    return updateGameId(gameId, updateCallback);
}

async function deleteGame(gameId) {
    console.log(`delete game ${gameId}`);
    const db = await openDB();
    db.transaction('games', 'readwrite')
        .objectStore('games')
        .delete(parseInt(gameId));
    await saveDBToCloud();
}

async function addGame(game) {
    const db = await openDB();
    const insertedId = await db.transaction('games', 'readwrite')
        .objectStore('games')
        .add(game);
    await saveDBToCloud();
    return insertedId;
}

async function getGameNotesByTitle(gameTitle) {
    const db = await openDB();
    return db.getAllFromIndex('game-notes', 'gameTitle', IDBKeyRange.only(gameTitle));
}

async function updateGameNotes(gameNotesId, updateCallback) {
    const db = await openDB();
    const tx = db.transaction('game-notes', 'readwrite');
    const gameNotesStore = tx.objectStore('game-notes');

    const gameNotes = gameNotesId
        ? await gameNotesStore.get(gameNotesId)
        : { gameTitle };
    const updated = updateCallback(gameNotes);

    await gameNotesStore.put(updated);
    await saveDBToCloud();
}

async function renameGameTitle(oldGameTitle, newGameTitle) {
    const db = await openDB();
    const tx = db.transaction(['games', 'game-notes'], 'readwrite');
    const gameStore = tx.objectStore('games');
    const gameNotesStore = tx.objectStore('game-notes');

    const games = await gameStore.index('gameTitle').getAll(IDBKeyRange.only(oldGameTitle));
    const gameNotes = await gameNotesStore.index('gameTitle').get(IDBKeyRange.only(oldGameTitle));

    for (let index = 0; index < games.length; index++) {
        const game = games[index];
        game.gameTitle = newGameTitle;
        await gameStore.put(game);
    }

    if (gameNotes) {
        gameNotes.gameTitle = newGameTitle;
        await gameNotesStore.put(gameNotes);
    }
    await tx.done;
    await saveDBToCloud();
}

async function gameIsExists(gamesStore, game) {
    // match by uuid
    if (game.uuid) {
        return await gamesStore.index('uuid').get(game.uuid);
    }

    // для старых дампов без uuid у которых случился рассинхрон данных

    // match by id+gameTitle+... в дампе для этого ИД может быть другая игра
    const key1 = (g) => `${g.id}_${g.gameTitle}_${g.gameDate}_${g.gameDuration}_${g.tags}`;
    const gameKey1 = key1(game);

    // match by gameTitle+... в дампе эта игра может быть под другим ИД
    const key2 = (g) => `${g.gameTitle}_${g.gameDate}_${g.gameDuration}_${g.tags}`;
    const gameKey2 = key2(game);

    const gamesByTitle = await gamesStore.index('gameTitle').getAll();
    for (let index = 0; index < gamesByTitle.length; index++) {
        const gameFromStore = gamesByTitle[index];
        if (gameKey1 === key1(gameFromStore)) {
            return gameFromStore;
        }

        if (gameKey2 === key2(gameFromStore)) {
            return gameFromStore;
        }
    }

    return null;
}

async function exportDb() {
    const db = await openDB();
    const tx = db.transaction(['games', 'settings', 'game-notes'], 'readwrite');
    const games = await tx.objectStore('games').getAll();
    const gameNotes = await tx.objectStore('game-notes').getAll();
    const settingKeys = await tx.objectStore('settings').getAllKeys();

    const settings = {};
    for (const key of settingKeys) {
        settings[key] = await tx.objectStore('settings').get(key);
    }
    await tx.done;

    return {
        games,
        settings,
        gameNotes,
    }
}

async function importDb(dbData, outputStats) {
    if (!outputStats) {
        outputStats = {}
    }

    outputStats.totalGames = 0;
    outputStats.skipped = 0;
    outputStats.added = 0;

    const db = await openDB();
    const tx = db.transaction(['games', 'settings', 'game-notes'], 'readwrite');
    const gamesStore = tx.objectStore('games');
    const settingsStore = tx.objectStore('settings');
    const gameNotesStore = tx.objectStore('game-notes');

    if (dbData.settings) {
        await settingsStore.clear();
        for (const [key, value] of Object.entries(dbData.settings)) {
            await settingsStore.put(value, key);
        }
    }

    if (dbData.games) {
        outputStats.totalGames = dbData.games.length;
        const gameForImports = [];
        for (const game of dbData.games) {
            const exists = await gameIsExists(gamesStore, game);
            if (exists) {
                console.log('game already exists, skip', exists);
                outputStats.skipped++;
                continue;
            }

            delete game.id;
            if (!game.uuid) {
                game.uuid = uuidv7();
            }
            gameForImports.push(game);
        }

        for (let index = 0; index < gameForImports.length; index++) {
            const game = gameForImports[index];
            console.log('add new game', game);
            await gamesStore.add(game); // add new
            outputStats.added++;
        }
    }

    if (dbData.gameNotes) {
        for (const gameNotes of dbData.gameNotes) {
            const exists = await gameNotesStore.index('uuid', gameNotes.uuid || '');
            if (!exists) {
                delete gameNotes.id;
                if (!gameNotes.uuid) {
                    gameNotes.uuid = uuidv7();
                }
                await gameNotesStore.add(gameNotes); // add new
            }
        }
    }

    await tx.done;

    console.log(outputStats);

    return db;
}

async function deleteDB() {
    return new Promise((resolve, reject) => {
        const deleteResult = indexedDB.deleteDatabase(defaultDBName);
        deleteResult.onsuccess = (event) => {
            AppSettings.dbEtag = "";
            AppSettings.lastSyncTime = null;
            resolve(true);
        }
        deleteResult.onerror = (event) => {
            reject(false);
        }
    });
}

function importFromFileHandler(dbData) {
    let outputStats = {};
    importDb(dbData, outputStats).then(async () => {
        console.log(outputStats);
        alert(`Добавлено: ${outputStats.added}/${outputStats.totalGames}; Пропущено: ${outputStats.skipped}`);
        await saveDBToCloud();
        window.location.reload();
    });
}

async function getTagsByGameTitle(gameTitle) {
    const db = await openDB();
    const tags = [];
    const games = await db.getAllFromIndex('games', 'gameTitle', IDBKeyRange.only(gameTitle));

    for (const game of games) {
        if (game.gameTitle === gameTitle) {
            (game.tags || '').split(',').map((tag) => tags.push(tag));
        }
    }
    return tags.
        filter(tag => tag !== '').
        filter((value, index, array) => array.indexOf(value) === index);
}

async function getPlayerTagsByGameTitle(gameTitle) {
    const db = await openDB();
    const tags = [];
    const games = await db.getAllFromIndex('games', 'gameTitle', IDBKeyRange.only(gameTitle));
    for (const game of games) {
        if (game.gameTitle === gameTitle) {
            for (const player of (game.players || [])) {
                (player.tags || '').split(',').map((tag) => tags.push(tag));
            }
        }
    }
    return tags.
        filter(tag => tag !== '').
        filter((value, index, array) => array.indexOf(value) === index);
}

async function getGames(db, gameTitle) {
    if (gameTitle) {
        return db.getAllFromIndex('games', 'gameTitle', IDBKeyRange.only(gameTitle));
    }
    return await db.getAll('games');
}

function getIntParamFromUrl(param) {
    const urlParams = new URLSearchParams(window.location.search);
    const value = parseInt(urlParams.get(param));
    if (isNaN(value)) {
        return null;
    }
    return value;
}

function getGameIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = parseInt(urlParams.get('gameId'));
    if (isNaN(gameId)) {
        return null;
    }
    return gameId;
}

function downloadFile(file) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(file);

    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}


function escapeCSVString(str) {
    if (!str || str.length === 0) {
        return '';
    }
    return `"` + str.replace(/"/g, `""`) + `"`;
}

function getWinners(game) {
    return (game.players || [])
        .filter(player => player.result === 'winner');
}

function getLosers(game) {
    return (game.players || [])
        .filter(player => player.result === 'loser');
}

function getDraws(game) {
    return (game.players || [])
        .filter(player => player.result === 'draw');
}

function getWinnersNames(game) {
    return getWinners(game).map(player => player.name).join(',');
}

function makeGamesList(games) {
    console.log('makeGamesList');
    const gamesByTitle = {};
    for (const game of games) {
        if (!gamesByTitle[game.gameTitle]) {
            gamesByTitle[game.gameTitle] = [];
        }
        gamesByTitle[game.gameTitle].push(game);
    }
    const titles = Object.keys(gamesByTitle);
    titles.sort();

    const playersByGameTitle = {};
    for (const gameTitle of titles) {
        const playersByName = {};
        const games = gamesByTitle[gameTitle];
        for (const game of games) {
            for (const player of (game.players ?? [])) {
                playersByName[player.name] ??= [];
                playersByName[player.name].push(player);
            }
        }

        playersByGameTitle[gameTitle] = Object.values(playersByName).map((players) => {
            const playerName = players[0].name;
            return {
                name: players[0].name,
                winCount: getWinners({ players }).length,
                loseCount: getLosers({ players }).length,
                drawCount: getDraws({ players }).length,
            }
        })
    }

    return {
        titles,
        games: gamesByTitle,
        players: playersByGameTitle,
    }
}

function getGamesList(games, gameTitle) {
    return makeGamesList(games); // disable cache
    const cacheKey = `gamesList|${gameTitle ? gameTitle : ''}`;
    return SessionCache.cache(cacheKey, function () {
        return makeGamesList(games);
    });
}

async function loadFromCloud(uuid, etag) {
    console.log(`load data with current etag ${etag}`);
    const headers = {
        'UUID': uuid,
        'APIKey': AppSettings.apiKey,
    };
    if (etag) {
        headers['If-None-Match'] = etag;
    }
    const resp = await fetch(
        AppSettings.apiHost,
        {
            method: 'GET',
            headers,
        },
    );

    if (resp.status === 304) {
        return { data: null, etag: etag };
    }

    if (resp.status !== 200) {
        return {};
    }

    if (resp.headers['etag'] === etag) {
        return {};
    }
    return {
        data: await resp.json(),
        etag: resp.headers.get('etag'),
    };
}

async function saveToCloud(uuid, data) {
    console.log('save data to cloud');
    const headers = {
        'UUID': uuid,
        'APIKey': AppSettings.apiKey,
    };
    const resp = await fetch(
        AppSettings.apiHost,
        {
            method: 'PUT',
            headers,
            body: JSON.stringify(data),
        },
    );
    if (resp.status >= 200 || resp.status < 300) {
        return resp.headers.get('etag');
    }
    return null;
}

async function refreshDBFromCloud(force = false) {
    textLoaderShow();
    const uuid = window.localStorage.getItem('uuid');
    if (!uuid) {
        return openDB();
    }

    const secondsInMs = 1000;
    const refreshDbPeriod = 60 * secondsInMs;
    if (
        !force
        && AppSettings.lastSyncTime
        && AppSettings.lastSyncTime.getTime() + refreshDbPeriod > (new Date()).getTime()
    ) {
        console.log('Skip refresh db by time');
        return openDB();
    }

    const dbEtag = AppSettings.dbEtag;
    try {
        const { data, etag } = await loadFromCloud(uuid, dbEtag);
        if (dbEtag && dbEtag == etag) {
            AppSettings.lastSyncTime = new Date();
            console.log('already synced');
        } else if (data && etag !== dbEtag) {
            window.localStorage.setItem('dbEtag', etag);
            console.log(`db loaded with etag ${etag}`);
            const db = await importDb(data);
            console.log(`db imported`);
            AppSettings.lastSyncTime = new Date();
            SessionCache.reset();
            return db;
        } else if (!data) {
            console.log('fail load data from cloud');
        }
    } catch (e) {
        console.log(`fail load db from cloud ${e}`);
        return openDB();
    }

    if (AppSettings.syncState === 0) {
        console.log('db not synced, try sync');
        await saveDBToCloud();
        return openDB();
    }

    return openDB();
}

async function saveDBToCloud() {
    const uuid = window.localStorage.getItem('uuid');
    if (uuid) {
        AppSettings.setSyncState(0);
        const data = await exportDb();
        try {
            const etag = await saveToCloud(uuid, data);
            if (etag !== null) {
                AppSettings.dbEtag = etag;
            }
            console.log(`success save db to cloud, etag=${etag}`);
            AppSettings.setSyncState(1);
        } catch (e) {
            console.log(`fail save db to cloud ${e}`);
        }
    }
    SessionCache.reset();
}

const AppSettings = {
    setSyncState: function (v) {
        v = parseInt(v);
        this.syncState = v;
        if (v === 1) {
            this.lastSyncTime = new Date();
        }
    },
    // getters
    get uuid() {
        return window.localStorage.getItem('uuid');
    },
    get apiHost() {
        return window.localStorage.getItem('apiHost');
    },
    get apiKey() {
        return window.localStorage.getItem('apiKey');
    },
    get dbEtag() {
        return window.localStorage.getItem('dbEtag');
    },
    get syncState() {
        return parseInt(window.localStorage.getItem('syncState'));
    },
    get lastSyncTime() {
        const t = parseInt(window.sessionStorage.getItem('lastSyncTime'));
        if (!t) {
            return null;
        }
        return new Date(t);
    },
    // setters
    set uuid(v) {
        return window.localStorage.setItem('uuid', v);
    },
    set apiHost(v) {
        return window.localStorage.setItem('apiHost', v);
    },
    set apiKey(v) {
        return window.localStorage.setItem('apiKey', v);
    },
    set dbEtag(v) {
        return window.localStorage.setItem('dbEtag', v);
    },
    set syncState(v) {
        return window.localStorage.setItem('syncState', parseInt(v));
    },
    set lastSyncTime(d) {
        if (!d) {
            window.sessionStorage.removeItem('lastSyncTime');
        }
        return window.sessionStorage.setItem('lastSyncTime', d.getTime());
    }
}

const SessionCache = {
    set: function (key, value) {
        sessionStorage.setItem(key, JSON.stringify(value));
    },
    get: function (key) {
        return JSON.parse(sessionStorage.getItem(key));
    },
    cache(key, callback) {
        let cachedData = this.get(key);
        if (cachedData !== null) {
            return cachedData;
        }

        cachedData = callback();
        this.set(key, cachedData);
        return cachedData;
    },
    reset: function () {
        sessionStorage.clear();
        console.log('SessionCache.reset');
    }
}
