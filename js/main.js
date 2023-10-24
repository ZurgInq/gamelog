function openDB() {
    return idb.openDB('db1', 1, {
        upgrade(db) {
            const store = db.createObjectStore('games', {
                keyPath: 'id',
                autoIncrement: true,
            });
        },
    });
}

function loadGameById(gameId, callback) {
    openDB().then(db => {
        db.get('games', gameId).then(callback);
    });
}

function updateGameId(gameId, update, done) {
    openDB().then(db => {
        const tx = db.transaction('games', 'readwrite');
        tx.store.get(gameId).then(game => {
            tx.store.put(update(game));
        });
        tx.done.then(done);
    });
}

function deleteGame(gameId, callback) {
    openDB().then(db => {
        db.delete('games', gameId).then(callback);
    });
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
