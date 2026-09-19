window.EJS_player = '#game';
window.EJS_core = 'fbneo';
window.EJS_gameUrl = './roms/kof98.zip';
window.EJS_externalFiles = { '/neogeo.zip': './roms/neogeo.zip' };
window.EJS_gameName = "The King of Fighters '98";
window.EJS_pathtodata = 'https://cdn.emulatorjs.org/4.2.3/data/';
window.EJS_threads = false;
window.EJS_startOnLoaded = false;
window.EJS_startButtonName = 'Start game';
window.EJS_color = '#b72232';
window.EJS_backgroundColor = '#111';
window.EJS_volume = 0.5;
window.EJS_noAutoFocus = true;
window.EJS_disableAutoLang = true;

const message = document.getElementById('message');
const status = document.getElementById('status');
const retry = document.getElementById('retry');
const localFiles = document.getElementById('local-files');
let timeout;
retry.addEventListener('click', () => location.reload());
localFiles.addEventListener('submit', event => {
    event.preventDefault();
    const rom = document.getElementById('rom').files[0];
    const bios = document.getElementById('bios').files[0];
    if (rom?.name !== 'kof98.zip' || bios?.name !== 'neogeo.zip') {
        status.textContent = 'You must select kof98.zip and neogeo.zip.';
        return;
    }
    window.EJS_gameUrl = URL.createObjectURL(rom);
    window.EJS_gameName = 'kof98.zip';
    window.EJS_externalFiles['/neogeo.zip'] = URL.createObjectURL(bios);
    loadEmulator();
});

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
    localFiles.hidden = true;
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
        const files = [window.EJS_gameUrl, window.EJS_externalFiles['/neogeo.zip']];
        const results = await Promise.all(files.map(url => fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) })));
        const missing = files.filter((url, index) => !results[index].ok);
        if (missing.length) {
            fail(`The site lacks these game files: ${missing.map(url => url.split('/').pop()).join(', ')}.`);
            localFiles.hidden = false;
            return;
        }
        loadEmulator();
    } catch {
        fail('The site could not load the game files. You can retry.');
        localFiles.hidden = false;
    }
})();
