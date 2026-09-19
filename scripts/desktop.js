const windows = [...document.querySelectorAll('#workspace .window')];
const music = document.getElementById('music');
const apps = [...windows, music];
const workspace = document.getElementById('workspace');
const tasks = document.getElementById('tasks');
const start = document.getElementById('start-button');
const menu = document.getElementById('start-menu');
const mobile = matchMedia('(max-width: 640px)');
const taskButtons = new Map();
let layer = 1;
let desktopHidden = [];
let player;
let playerLoading;

function focusWindow(win, moveFocus = false) {
    apps.forEach(item => item.classList.toggle('active', item === win));
    win.style.zIndex = ++layer;
    taskButtons.forEach((button, id) => button.setAttribute('aria-pressed', String(id === win.id && !win.hidden)));
    if (moveFocus) (win.querySelector('.window-controls button') || taskButtons.get(win.id))?.focus({ preventScroll: true });
}

function setMenu(open, returnFocus = false) {
    menu.hidden = !open;
    start.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('button').focus();
    else if (returnFocus) start.focus();
}

function openWindow(id, moveFocus = true) {
    const win = apps.find(app => app.id === id);
    if (!win) return;
    win.hidden = false;
    if (!taskButtons.has(id)) {
        const button = document.createElement('button');
        const icon = document.createElement('img');
        icon.src = id === 'music' ? './img/winamp.png' : win.querySelector('.titlebar img').getAttribute('src');
        icon.alt = '';
        const label = document.createElement('span');
        label.textContent = id === 'music' ? 'Winamp' : id === 'home' ? 'My Homepage' : win.querySelector('h2').textContent;
        button.append(icon, label);
        button.setAttribute('aria-controls', id);
        button.addEventListener('click', () => {
            if (!win.hidden && win.classList.contains('active')) hideWindow(win);
            else openWindow(id);
        });
        taskButtons.set(id, button);
        tasks.append(button);
    }
    setMenu(false);
    focusWindow(win, moveFocus);
    if (id === 'music') loadPlayer();
    else keepInBounds(win);
}

function hideWindow(win, close = false) {
    win.hidden = true;
    win.classList.remove('active');
    taskButtons.get(win.id)?.setAttribute('aria-pressed', 'false');
    if (close) {
        taskButtons.get(win.id)?.remove();
        taskButtons.delete(win.id);
        if (win === music) player?.pause();
    }
    const next = apps.filter(item => !item.hidden).sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex))[0];
    if (next) focusWindow(next, true);
    else (taskButtons.get(win.id) || document.querySelector(`button[data-open="${win.id}"]`) || start).focus();
}

function maximize(win) {
    if (mobile.matches) return;
    const active = win.classList.toggle('maximized');
    const button = win.querySelector('[data-action="maximize"]');
    button.setAttribute('aria-label', `${active ? 'Restore' : 'Maximize'} ${win.querySelector('h2').textContent}`);
    button.setAttribute('aria-pressed', String(active));
    focusWindow(win);
}

function keepInBounds(win) {
    if (mobile.matches || win.hidden || win.classList.contains('maximized')) return;
    const rect = win.getBoundingClientRect();
    if (rect.left < 0 || rect.right > workspace.clientWidth) win.style.left = Math.max(0, workspace.clientWidth - rect.width) + 'px';
    if (rect.top < 0 || rect.bottom > workspace.clientHeight) win.style.top = Math.max(0, workspace.clientHeight - rect.height) + 'px';
}

apps.forEach(win => {
    win.addEventListener('pointerdown', () => focusWindow(win));
    win.addEventListener('focusin', () => focusWindow(win));
});
windows.forEach(win => {
    win.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
        if (button.dataset.action === 'maximize') maximize(win);
        else hideWindow(win, button.dataset.action === 'close');
    }));
    const bar = win.querySelector('.titlebar');
    bar.addEventListener('dblclick', event => { if (!event.target.closest('button')) maximize(win); });
    bar.addEventListener('pointerdown', event => {
        if (mobile.matches || win.classList.contains('maximized') || event.target.closest('button') || event.button !== 0) return;
        const rect = win.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        bar.setPointerCapture(event.pointerId);
        const move = next => {
            win.style.left = Math.max(0, Math.min(next.clientX - offsetX, workspace.clientWidth - win.offsetWidth)) + 'px';
            win.style.top = Math.max(0, Math.min(next.clientY - offsetY, workspace.clientHeight - win.offsetHeight)) + 'px';
        };
        const stop = () => {
            bar.removeEventListener('pointermove', move);
            bar.removeEventListener('lostpointercapture', stop);
        };
        bar.addEventListener('pointermove', move);
        bar.addEventListener('lostpointercapture', stop);
        event.preventDefault();
    });
});
document.querySelectorAll('button[data-open]').forEach(button => button.addEventListener('click', () => openWindow(button.dataset.open)));
document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    openWindow('home', false);
    document.getElementById('main-content').focus();
});
start.addEventListener('click', () => setMenu(menu.hidden));
document.addEventListener('pointerdown', event => {
    if (!menu.contains(event.target) && !start.contains(event.target)) setMenu(false);
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) setMenu(false, true);
    if (!menu.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...menu.querySelectorAll('button, a[href]')];
        const index = buttons.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
    }
});
document.getElementById('show-desktop').addEventListener('click', () => {
    const visible = apps.filter(win => !win.hidden);
    if (visible.length) {
        desktopHidden = visible;
        visible.forEach(win => { win.hidden = true; win.classList.remove('active'); });
        taskButtons.forEach(button => button.setAttribute('aria-pressed', 'false'));
    } else {
        desktopHidden.filter(win => taskButtons.has(win.id)).forEach(win => openWindow(win.id, false));
        desktopHidden = [];
    }
});
document.getElementById('reset-desktop').addEventListener('click', () => {
    player?.close();
    apps.forEach(win => { win.hidden = true; win.style.cssText = ''; win.classList.remove('maximized', 'active'); });
    windows.forEach(win => {
        const button = win.querySelector('[data-action="maximize"]');
        button.setAttribute('aria-label', `Maximize ${win.querySelector('h2').textContent}`);
        button.setAttribute('aria-pressed', 'false');
    });
    tasks.replaceChildren();
    taskButtons.clear();
    desktopHidden = [];
    start.focus();
});
if (['#true', '#false'].includes(location.hash)) history.replaceState(null, '', location.pathname + location.search);
addEventListener('resize', () => windows.forEach(keepInBounds));
const boundsObserver = new ResizeObserver(entries => entries.forEach(entry => keepInBounds(entry.target)));
windows.forEach(win => boundsObserver.observe(win));

async function loadPlayer() {
    if (player) { player.reopen(); return; }
    if (playerLoading) return;
    const message = document.createElement('div');
    message.id = 'player-message';
    message.setAttribute('role', 'status');
    message.textContent = 'Winamp is loading.';
    music.replaceChildren(message);
    playerLoading = (async () => {
        if (!window.Webamp) await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = './scripts/vendor/webamp-2.3.1.min.js';
            script.onload = resolve;
            script.onerror = () => { script.remove(); reject(new Error('The player could not load.')); };
            document.head.append(script);
        });
        if (music.hidden) return;
        if (!Webamp.browserIsSupported()) throw new Error('This browser does not support Webamp.');
        const doubled = music.clientWidth >= 566 && music.clientHeight >= 480;
        const instance = new Webamp({
            initialTracks: [],
            zIndex: 1,
            enableHotkeys: false,
            enableDoubleSizeMode: doubled,
            windowLayout: {
                main: { position: { top: 0, left: 0 } },
                equalizer: { position: { top: doubled ? 232 : 116, left: 0 }, closed: true },
                playlist: { position: { top: doubled ? 232 : 116, left: 0 }, size: { extraWidth: doubled ? 11 : 0, extraHeight: doubled ? 4 : 0 } }
            }
        });
        instance.onClose(() => hideWindow(music, true));
        instance.onMinimize(() => hideWindow(music));
        await instance.renderInto(music);
        player = instance;
    })();
    try { await playerLoading; }
    catch (error) {
        message.textContent = error.message;
        const close = document.createElement('button');
        close.textContent = 'Close';
        close.addEventListener('click', () => hideWindow(music, true));
        message.append(document.createElement('br'), close);
        music.replaceChildren(message);
    } finally { playerLoading = null; }
}
const search = document.getElementById('paper-search');
const papers = [...document.querySelectorAll('#research .document li')];
function filterPapers() {
    const query = search.value.trim().toLowerCase();
    let count = 0;
    papers.forEach(paper => { paper.hidden = !paper.textContent.toLowerCase().includes(query); if (!paper.hidden) count++; });
    document.getElementById('paper-count').textContent = `${count} ${count === 1 ? 'paper' : 'papers'}`;
    document.getElementById('no-papers').hidden = count !== 0;
}
search.addEventListener('input', filterPapers);
filterPapers();
function updateClock() {
    const now = new Date();
    const clock = document.getElementById('clock');
    clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    clock.dateTime = now.toISOString();
    clock.title = now.toLocaleDateString();
}
updateClock();
setInterval(updateClock, 30000);
