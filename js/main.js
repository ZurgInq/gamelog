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

function deleteGameId(gameId, callback) {
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