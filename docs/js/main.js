if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("js/sw.js").then(console.log('Service Worker Registered'));
}

const RESULT_WINNER = 'winner';
const RESULT_LOSER = 'loser';
const RESULT_DRAW = 'draw';

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

async function openDB() {
    return await idb.openDB('db1', 2, {
        upgrade(db, oldVersion, newVersion, transaction, event) {
            switch (oldVersion) {
                case 0:
                    db.createObjectStore('games', {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                case 1:
                    db.createObjectStore('settings');
            }
        },
    });
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

async function exportDb() {
    const db = await openDB();
    const tx = db.transaction(['games', 'settings'], 'readwrite');
    const games = await tx.objectStore('games').getAll();
    const settingKeys = await tx.objectStore('settings').getAllKeys();

    const settings = {};
    for (const key of settingKeys) {
        settings[key] = await tx.objectStore('settings').get(key);
    }

    return {
        games,
        settings,
    }
}

async function importDb(dbData) {
    const db = await openDB();
    const tx = db.transaction(['games', 'settings'], 'readwrite');
    const gamesStore = tx.objectStore('games');
    const settingsStore = tx.objectStore('settings');

    await gamesStore.clear();
    for (const game of dbData.games) {
        await gamesStore.put(game);
    }

    await settingsStore.clear();
    for (const [key, value] of Object.entries(dbData.settings)) {
        await settingsStore.put(value, key);
    }

    await tx.done;
    return db;
}

async function getTagsByGameTitle(gameTitle) {
    const db = await openDB();
    const tags = [];
    const games = await db.getAll('games');
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
    const games = await db.getAll('games');
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

function getGamesList(games) {
    return SessionCache.cache('gamesList', function() {
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
        'https://functions.yandexcloud.net/d4e3kne4n6iimdh38773',
        {
            method: 'GET',
            headers,
        },
    );

    if (resp.status === 304) {
        return {data: null, etag: etag};
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
        'https://functions.yandexcloud.net/d4e3kne4n6iimdh38773?method=sync',
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
    const uuid = window.localStorage.getItem('uuid');
    if (!uuid) {
        return openDB();
    }

    if (AppSettings.syncState === 0) {
        console.log('db not synced, try sync');
        await saveDBToCloud();
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
    setSyncState: function(v) {
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
    set: function(key, value) {
        sessionStorage.setItem(key, JSON.stringify(value));
    },
    get: function(key) {
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
    reset: function() {
        sessionStorage.clear();
    }
}
