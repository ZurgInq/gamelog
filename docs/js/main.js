function debounceFn(fn, wait) {
    let timeoutId = null;
    return function() {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => fn(...arguments), wait);
    }
}

async function openDB() {
    return idb.openDB('db1', 2, {
        upgrade(db, oldVersion, newVersion, transaction, event) {
            switch (newVersion) {
                case 1:
                    const games = db.createObjectStore('games', {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                case 2:
                    db.createObjectStore('settings');
            }
        },
    });
}

async function incDBVersion(tx) {
    const settingsStore = tx.objectStore('settings');
    const version = await settingsStore.get('version');
    return settingsStore.put(Number.isInteger(version) ? version + 1 : 1, 'version');
}

async function loadGameById(gameId) {
    return (await openDB()).get('games', gameId);
}

async function updateGameId(gameId, update) {
    const db = await openDB();
    const tx = db.transaction(['games', 'settings'], 'readwrite');
    const gamesStore = tx.objectStore('games');
    const game = await gamesStore.get(gameId);
    await gamesStore.put(update(game));
    await incDBVersion(tx);
    return tx.done;
}

async function deleteGame(gameId) {
    const db = await openDB();
    const tx = db.transaction(['games', 'settings'], 'readwrite');
    const gamesStore = tx.objectStore('games');
    await gamesStore.delete(gameId);
    await incDBVersion(tx);
    return tx.done;
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

    return tx.done;
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
