const game = new URLSearchParams(location.search).get('game') === 'sfza' ? 'sfza' : 'kof98';
window.EJS_player = '#game';
window.EJS_core = game === 'sfza' ? 'fbalpha2012_cps2' : 'fbneo';
window.EJS_gameUrl = `./roms/${game}.zip`;
window.EJS_biosUrl = game === 'kof98' ? 'neogeo.zip' : '';
window.EJS_dontExtractBIOS = true;
window.EJS_gameName = game;
window.EJS_gameID = game === 'kof98' ? 9802 : 9502;
window.EJS_pathtodata = 'https://cdn.emulatorjs.org/4.2.3/data/';
window.EJS_threads = false;
window.EJS_startOnLoaded = false;
window.EJS_startButtonName = 'Start game';
window.EJS_color = '#b72232';
window.EJS_backgroundColor = '#111';
window.EJS_volume = 0.5;
window.EJS_noAutoFocus = true;
window.EJS_language = 'en-US';
window.EJS_defaultControls = {
    0: {
        4: { value: 'w', value2: 'DPAD_UP' }, 5: { value: 's', value2: 'DPAD_DOWN' },
        6: { value: 'a', value2: 'DPAD_LEFT' }, 7: { value: 'd', value2: 'DPAD_RIGHT' },
        1: { value: game === 'kof98' ? 'o' : 'u', value2: 'BUTTON_4' }, 9: { value: game === 'kof98' ? 'j' : 'i', value2: 'BUTTON_3' },
        10: { value: game === 'kof98' ? '' : 'o', value2: 'LEFT_TOP_SHOULDER' }, 0: { value: game === 'kof98' ? 'u' : 'j', value2: 'BUTTON_2' },
        8: { value: game === 'kof98' ? 'i' : 'k', value2: 'BUTTON_1' }, 11: { value: game === 'kof98' ? '' : 'l', value2: 'RIGHT_TOP_SHOULDER' },
        2: { value: 'v', value2: 'SELECT' }, 3: { value: 'enter', value2: 'START' }
    },
    1: {}, 2: {}, 3: {}
};

const message = document.getElementById('message');
const status = document.getElementById('status');
const retry = document.getElementById('retry');
let timeout;
retry.addEventListener('click', () => location.reload());

window.pauseGame = () => {
    const emulator = window.EJS_emulator;
    if (!emulator?.started) return;
    emulator.pause();
    for (let player = 0; player < 4; player++) {
        for (let button = 0; button < 16; button++) emulator.gameManager.simulateInput(player, button, 0);
    }
};
document.getElementById('game').addEventListener('pointerdown', event => {
    if (!event.target.closest('button, input, select, a')) document.querySelector('.ejs_parent')?.focus();
});

function fail(text) {
    clearTimeout(timeout);
    status.textContent = text;
    message.hidden = false;
    retry.hidden = false;
    document.getElementById('game').hidden = true;
}

window.EJS_ready = () => {
    clearTimeout(timeout);
    if (retry.hidden) message.hidden = true;
    if (game === 'sfza') window.EJS_emulator.on('saveDatabaseLoaded', fs => fs.symlink('/sfza.zip', '/sfa.zip'));
    const start = document.querySelector('.ejs_start_button');
    if (!start) return;
    start.setAttribute('role', 'button');
    start.tabIndex = 0;
    start.addEventListener('keydown', event => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        start.click();
    });
};
window.EJS_onGameStart = () => {
    const arcade = parent.document.getElementById('arcade');
    if (document.hidden || (arcade && (arcade.hidden || !arcade.classList.contains('active')))) {
        window.pauseGame();
    } else document.querySelector('.ejs_parent')?.focus();
};
document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.pauseGame();
});

function loadEmulator() {
    retry.hidden = true;
    document.getElementById('game').hidden = false;
    status.textContent = 'The emulator loads. The first start can take a minute.';
    timeout = setTimeout(() => fail('The emulator did not load. You can retry.'), 30000);
    const script = document.createElement('script');
    script.src = window.EJS_pathtodata + 'loader.js';
    script.onerror = () => fail('The emulator download failed. You can retry.');
    document.head.append(script);
}

(async () => {
    try {
        const files = [window.EJS_gameUrl, window.EJS_biosUrl].filter(Boolean);
        const results = await Promise.all(files.map(url => fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) })));
        const missing = files.filter((url, index) => !results[index].ok);
        if (missing.length) {
            fail(`The site lacks these game files: ${missing.map(url => url.split('/').pop()).join(', ')}.`);
            return;
        }
        loadEmulator();
    } catch {
        fail('The site could not load the game files. You can retry.');
    }
})();
