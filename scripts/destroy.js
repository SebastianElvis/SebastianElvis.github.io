(() => {
    const shell = document.getElementById('desktop-shell');
    const music = document.getElementById('music');
    const weapons = [
        { name: 'Pistol', delay: .25, speed: 950, cut: 6, color: '#ffe9a0' },
        { name: 'SMG', delay: .075, speed: 1050, cut: 4, color: '#ffdc57' },
        { name: 'Shotgun', delay: .65, speed: 850, cut: 5, spread: .24, count: 7, color: '#ffd49c' },
        { name: 'Rocket', delay: .8, speed: 420, cut: 8, radius: 64, color: '#ff763b' },
        { name: 'Railgun', delay: .85, speed: 2200, cut: 10, pierce: true, color: '#65efff' },
        { name: 'Flame', delay: .055, speed: 370, cut: 4, radius: 12, color: '#ffab38' },
        { name: 'Eraser', delay: 1.1, speed: 580, cut: 10, radius: 90, color: '#ef8bff' }
    ];
    let game, audio, noise, renderer;
    const cellSize = 4, playerScale = 1.3;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

    function segmentHit(x, y, nx, ny, target) {
        let near = 0, far = 1;
        for (const [origin, delta, min, max] of [[x, nx - x, target.x, target.x + target.w], [y, ny - y, target.y, target.y + target.h]]) {
            if (Math.abs(delta) < .00001) { if (origin < min || origin > max) return null; }
            else {
                const a = (min - origin) / delta, b = (max - origin) / delta;
                near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
                if (near > far) return null;
            }
        }
        return near;
    }

    function enableAudio() {
        try {
            audio ||= new AudioContext();
            if (!noise) {
                noise = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
                const samples = noise.getChannelData(0);
                for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
            }
            return audio.resume();
        } catch { return Promise.reject(new Error('Audio is unavailable.')); }
    }

    function sound(frequency, duration = .09, impact = false, chime = false) {
        if (!game?.sound || !audio || audio.state !== 'running') return;
        const gain = audio.createGain(), filter = audio.createBiquadFilter();
        const oscillator = audio.createOscillator(), burst = audio.createBufferSource();
        oscillator.type = impact || chime ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(chime ? frequency * 2 : 35, audio.currentTime + duration);
        burst.buffer = noise;
        filter.type = 'lowpass'; filter.frequency.value = impact ? 700 : 1800 + frequency * 4;
        gain.gain.setValueAtTime(impact ? .24 : .11, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
        if (!chime) burst.connect(filter);
        oscillator.connect(filter); filter.connect(gain).connect(audio.destination);
        oscillator.start(); burst.start(0, Math.random() * .5);
        oscillator.stop(audio.currentTime + duration); burst.stop(audio.currentTime + duration);
        burst.onended = () => { oscillator.disconnect(); burst.disconnect(); filter.disconnect(); gain.disconnect(); };
    }

    async function preparePixels(g) {
        if (!window.html2canvas) {
            renderer ||= new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = './scripts/vendor/html2canvas-1.4.1.min.js';
                script.onload = resolve;
                script.onerror = () => { script.remove(); renderer = null; reject(new Error('The game renderer could not load.')); };
                document.head.append(script);
            });
            await renderer;
        }
        if (game !== g) return;
        const options = { backgroundColor: null, scale: 1, logging: false, useCORS: true,
            width: g.width, height: g.height, windowWidth: g.width, windowHeight: g.height,
            scrollX: 0, scrollY: 0, imageTimeout: 3000,
            ignoreElements: element => element.id === 'destroy-game' };
        const original = await html2canvas(document.body, options);
        if (game !== g) return;
        const empty = await html2canvas(document.body, { ...options, onclone: doc => {
            doc.querySelectorAll('#desktop-shell, #desktop-shell *, #music, #music *').forEach(element => element.style.setProperty('visibility', 'hidden', 'important'));
        } });
        if (game !== g) return;
        const originalContext = original.getContext('2d', { willReadFrequently: true });
        const emptyContext = empty.getContext('2d', { willReadFrequently: true });
        g.total = 0;
        for (const target of g.targets) {
            target.x = Math.floor(target.x); target.y = Math.floor(target.y);
            target.w = Math.min(Math.ceil(target.w) + 1, g.width - target.x);
            target.h = Math.min(Math.ceil(target.h) + 1, g.height - target.y);
            const pixels = originalContext.getImageData(target.x, target.y, target.w, target.h);
            const background = emptyContext.getImageData(target.x, target.y, target.w, target.h).data;
            target.columns = Math.ceil(target.w / cellSize); target.rows = Math.ceil(target.h / cellSize);
            target.cells = new Uint8Array(target.columns * target.rows);
            for (let y = 0; y < target.h; y++) for (let x = 0; x < target.w; x++) {
                const i = (y * target.w + x) * 4;
                const difference = Math.max(Math.abs(pixels.data[i] - background[i]), Math.abs(pixels.data[i + 1] - background[i + 1]), Math.abs(pixels.data[i + 2] - background[i + 2]), Math.abs(pixels.data[i + 3] - background[i + 3]));
                if (difference < 12) pixels.data[i + 3] = 0;
                else target.cells[Math.floor(y / cellSize) * target.columns + Math.floor(x / cellSize)] = 1;
            }
            target.original = document.createElement('canvas');
            target.original.width = target.w; target.original.height = target.h;
            target.original.getContext('2d').putImageData(pixels, 0, 0);
            target.surface = document.createElement('canvas'); target.surface.width = target.w; target.surface.height = target.h;
            target.context = target.surface.getContext('2d');
            target.initialCells = target.cells.slice();
            target.remaining = target.cells.reduce((sum, value) => sum + value, 0);
            g.total += target.remaining;
        }
        g.targets = g.targets.filter(target => target.remaining);
        g.ready = true;
        document.body.classList.add('destroy-rasterized');
        restart();
        g.root.querySelector('[data-restart]').disabled = false;
    }

    function surfaceHit(x, y, nx, ny, target) {
        const near = segmentHit(x, y, nx, ny, target);
        if (near === null) return null;
        const dx = nx - x, dy = ny - y, step = 2 / Math.max(1, Math.abs(dx), Math.abs(dy));
        for (let t = near; t <= 1; t += step) {
            const col = Math.floor((x + dx * t - target.x) / cellSize), row = Math.floor((y + dy * t - target.y) / cellSize);
            if (col >= 0 && col < target.columns && row >= 0 && row < target.rows && target.cells[row * target.columns + col]) return t;
        }
        return null;
    }

    function particles(x, y, color, count = 12) {
        const g = game;
        for (let i = 0; i < count && g.particles.length < 500; i++) {
            g.particles.push({ x, y, vx: (Math.random() - .5) * 310, vy: -Math.random() * 260,
                life: .4 + Math.random() * .55, color, size: 2 + Math.random() * 4 });
        }
    }

    function damage(target, radius, x, y) {
        if (target.dead) return;
        const g = game;
        const fromX = Math.max(0, Math.floor((x - radius - target.x) / cellSize));
        const toX = Math.min(target.columns - 1, Math.ceil((x + radius - target.x) / cellSize));
        const fromY = Math.max(0, Math.floor((y - radius - target.y) / cellSize));
        const toY = Math.min(target.rows - 1, Math.ceil((y + radius - target.y) / cellSize));
        let removed = 0;
        for (let row = fromY; row <= toY; row++) for (let col = fromX; col <= toX; col++) {
            const index = row * target.columns + col, sx = col * cellSize, sy = row * cellSize;
            const px = target.x + sx + cellSize / 2, py = target.y + sy + cellSize / 2;
            if (!target.cells[index] || Math.hypot(px - x, py - y) > radius) continue;
            target.cells[index] = 0; target.context.clearRect(sx, sy, cellSize, cellSize);
            removed++; target.remaining--;
            if (g.particles.length < 1400) {
                const angle = Math.atan2(py - y, px - x), force = 100 + Math.random() * 200;
                g.particles.push({ x: px, y: py, vx: Math.cos(angle) * force, vy: Math.sin(angle) * force - 150,
                    life: 1.4 + Math.random(), size: cellSize, source: target.original, sx, sy,
                    angle: 0, spin: (Math.random() - .5) * 14 });
            }
        }
        if (!removed) return;
        target.damaged = true;
        target.dead = target.remaining === 0; g.destroyed += removed;
        const percent = Math.min(100, Math.floor(g.destroyed / Math.max(1, g.total) * 100));
        g.root.querySelector('progress').value = percent;
        g.root.querySelector('[data-score]').textContent = `${percent}%`;
        if (g.destroyed === g.total && !g.won) {
            g.won = true;
            g.root.querySelector('[data-secret]').hidden = false;
            g.root.querySelector('[data-message]').textContent = 'You cleared the desktop! You can restart or restore it.';
            sound(880, .3);
        }
    }

    function explode(x, y, radius) {
        particles(x, y, '#ffb840', 40);
        game.rings.push({ x, y, radius, life: .3 });
        for (const target of game.targets) {
            if (!target.dead && Math.hypot(x - clamp(x, target.x, target.x + target.w), y - clamp(y, target.y, target.y + target.h)) <= radius) damage(target, radius, x, y);
        }
        sound(85, .38, true);
    }

    function fire(grenade = false) {
        const g = game;
        if (!g || !g.ready || g.paused || (grenade ? g.grenadeCooldown > 0 : g.cooldown > 0)) return;
        const p = g.player, weapon = weapons[g.weapon];
        const angle = Math.atan2(g.aim.y - (p.y - 22 * playerScale), g.aim.x - p.x);
        const distance = Math.hypot(g.aim.x - p.x, g.aim.y - (p.y - 22 * playerScale)), muzzle = Math.min(27 * playerScale, distance);
        if (grenade) g.grenadeCooldown = .65; else g.cooldown = weapon.delay;
        for (let i = 0; i < (grenade ? 1 : weapon.count || 1); i++) {
            const a = angle + (grenade || i === 0 ? 0 : (Math.random() - .5) * (weapon.spread || 0) * 2);
            const life = Math.max(.001, (distance - muzzle) / (grenade ? 470 : weapon.speed)), speed = (distance - muzzle) / life;
            g.bullets.push({ x: p.x + Math.cos(a) * muzzle, y: p.y - 22 * playerScale + Math.sin(a) * muzzle,
                vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - (grenade ? 325 * life : 0), life, grenade, weapon });
        }
        particles(p.x + Math.cos(angle) * muzzle, p.y - 22 * playerScale + Math.sin(angle) * muzzle, weapon.color, 3);
        sound(grenade ? 180 : [170, 240, 100, 75, 900, 65, 120][g.weapon], grenade ? .1 : [.12, .07, .22, .3, .2, .08, .3][g.weapon]);
    }

    function chooseWeapon(index) {
        const g = game;
        g.weapon = (index + weapons.length) % weapons.length;
        g.root.querySelectorAll('[data-weapon]').forEach((button, i) => button.setAttribute('aria-pressed', String(i === g.weapon)));
        g.root.querySelector('[data-weapon-name]').textContent = weapons[g.weapon].name;
    }

    function clearInput() {
        if (!game) return;
        game.keys.clear(); game.firing = false; game.player.jumpQueued = false;
        game.root.querySelectorAll('[data-touch]').forEach(button => button.classList.remove('held'));
    }

    function pause(value = !game.paused) {
        game.paused = value;
        clearInput();
        game.root.querySelector('[data-pause]').textContent = value ? 'Resume' : 'Pause';
        game.root.querySelector('[data-pause]').setAttribute('aria-pressed', String(value));
        game.root.querySelector('[data-message]').textContent = value ? 'The game is paused.' : 'You can restore the desktop at any time.';
    }

    function resize() {
        const g = game, scale = Math.min(devicePixelRatio || 1, 2);
        g.width = innerWidth; g.height = innerHeight;
        g.canvas.width = Math.round(g.width * scale); g.canvas.height = Math.round(g.height * scale);
        g.ctx.setTransform(scale, 0, 0, scale, 0, 0);
        g.floor = innerHeight - 3;
        g.player.x = clamp(g.player.x, 12, g.width - 12);
        g.player.y = Math.min(g.player.y, g.floor);
        g.bullets.length = 0;
    }

    function restart() {
        const g = game;
        if (!g.ready) return;
        g.targets.forEach(target => { target.dead = false; target.damaged = false; target.cells = target.initialCells.slice(); target.remaining = target.cells.reduce((sum, value) => sum + value, 0); target.context.clearRect(0, 0, target.w, target.h); target.context.drawImage(target.original, 0, 0); });
        g.destroyed = 0; g.bullets = []; g.particles = []; g.rings = []; g.won = false; g.hasFlown = false;
        g.root.querySelector('[data-secret]').hidden = true;
        g.player = { x: Math.max(120, innerWidth / 2), y: innerHeight - document.getElementById('taskbar').getBoundingClientRect().height, vx: 0, vy: 0, grounded: true, jumps: 1, jumpHeld: false, jumpQueued: false, jetHold: 0, jetOn: false, jetDeploy: -1, jetThrust: 0, jetSound: 0 };
        g.cooldown = 0; g.grenadeCooldown = 0;
        g.root.querySelector('progress').value = 0;
        g.root.querySelector('[data-score]').textContent = '0%';
        pause(false);
        g.canvas.focus({ preventScroll: true });
    }

    function exit() {
        const g = game;
        if (!g) return;
        cancelAnimationFrame(g.frame);
        g.events.abort();
        shell.inert = g.shellInert; music.inert = g.musicInert;
        g.root.remove();
        document.body.classList.remove('destroy-playing', 'destroy-rasterized');
        game = null;
        if (g.returnFocus?.isConnected) g.returnFocus.focus({ preventScroll: true });
    }

    function update(dt) {
        const g = game, p = g.player, keys = g.keys;
        g.cooldown -= dt; g.grenadeCooldown -= dt;
        const direction = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
        p.vx += (direction * (p.jetOn ? 330 : 255) - p.vx) * Math.min(1, dt * 14);
        const flying = keys.has('KeyW'), dropping = keys.has('KeyS');
        const jumping = p.jumpQueued || (flying && !p.jumpHeld); p.jumpQueued = false;
        if (jumping && !dropping && (p.grounded || (p.jumps > 0 && !p.jetOn))) {
            p.vy = p.grounded ? -650 : -590; p.jumps = p.grounded ? 1 : 0; p.grounded = false;
        }
        if (!flying && p.jumpHeld && p.vy < 0 && !p.jetOn) p.vy *= .5;
        p.jumpHeld = flying; p.jetHold = flying ? p.jetHold + dt : 0;
        if (!p.grounded && !p.jetOn && flying && !dropping && p.jetHold > .12 && (p.vy > -150 || p.jetHold > .45)) {
            p.jetOn = true; p.jetDeploy = 0; p.jumps = 0; sound(280, .12);
        }
        if (p.jetDeploy >= 0) p.jetDeploy += dt;
        const thrusting = p.jetOn && !p.grounded && flying && !dropping && p.jetDeploy >= .14;
        g.hasFlown ||= thrusting;
        p.jetThrust += (Number(thrusting) - p.jetThrust) * Math.min(1, dt * (thrusting ? 11 : 7));
        p.vy = Math.min(1150, p.vy + 1900 * (dropping ? 1.6 : 1) * dt - (dropping ? 0 : 3700 * p.jetThrust * dt));
        if (p.vy < -430 && p.jetOn) p.vy += (-430 - p.vy) * Math.min(1, dt * 8);
        p.jetSound -= dt;
        if (thrusting && p.jetSound <= 0) { sound(70, .13, true); p.jetSound = .1; }
        const oldY = p.y;
        p.x = clamp(p.x + p.vx * dt, 10, g.width - 10);
        p.y = Math.max(42 * playerScale, p.y + p.vy * dt);
        if (p.y === 42 * playerScale) p.vy = Math.max(0, p.vy);
        p.grounded = false;
        if (p.vy >= 0 && !dropping) {
            let landing = g.floor;
            for (const target of g.targets) {
                if (target.dead || p.x + 7 * playerScale < target.x || p.x - 7 * playerScale > target.x + target.w || oldY > target.y + target.h || p.y < target.y) continue;
                const col = clamp(Math.floor((p.x - target.x) / cellSize), 0, target.columns - 1);
                for (let row = Math.max(0, Math.floor((oldY - target.y) / cellSize)); row < target.rows && target.y + row * cellSize <= p.y; row++) {
                    if (target.cells[row * target.columns + col]) { landing = Math.min(landing, target.y + row * cellSize); break; }
                }
            }
            if (p.y >= landing) { p.y = landing; p.vy = 0; p.grounded = true; }
        }
        if (p.y >= g.floor) { p.y = g.floor; p.vy = 0; p.grounded = true; }
        if (p.grounded) { p.jetOn = false; p.jetThrust = 0; p.jumps = 1; }
        if (g.firing || keys.has('KeyF')) fire();
        for (const bullet of g.bullets) {
            const step = Math.min(dt, Math.max(0, bullet.life)); bullet.life -= dt;
            const nx = bullet.x + bullet.vx * step, ny = bullet.y + bullet.vy * step + (bullet.grenade ? 325 * step * step : 0);
            if (bullet.grenade) bullet.vy += 650 * step;
            const hits = [];
            for (const target of g.targets) {
                if (target.dead || !target.w || !target.h) continue;
                const t = surfaceHit(bullet.x, bullet.y, nx, ny, target);
                if (t !== null) hits.push({ target, t });
            }
            hits.sort((a, b) => a.t - b.t);
            if (hits.length && !bullet.grenade) {
                for (const { target, t } of hits) {
                    const x = bullet.x + (nx - bullet.x) * t, y = bullet.y + (ny - bullet.y) * t;
                    damage(target, bullet.weapon.cut, x, y);
                    if (bullet.weapon.pierce) for (let t = 0; t < 1; t += bullet.weapon.cut / Math.max(1, Math.hypot(nx - bullet.x, ny - bullet.y))) damage(target, bullet.weapon.cut, bullet.x + (nx - bullet.x) * t, bullet.y + (ny - bullet.y) * t);
                    if (bullet.weapon.radius) explode(x, y, bullet.weapon.radius);
                    if (!bullet.weapon.pierce) { bullet.life = 0; break; }
                }
            }
            bullet.x = nx; bullet.y = ny;
            if (bullet.grenade && (ny >= g.floor || hits.length)) {
                bullet.x = hits.length ? nx - bullet.vx * step * (1 - hits[0].t) : nx;
                bullet.y = hits.length ? ny - bullet.vy * step * (1 - hits[0].t) - 4 : g.floor - 4;
                bullet.vy = -Math.abs(bullet.vy) * .5; bullet.vx *= .7;
            }
            if (bullet.life <= 0 && (bullet.grenade || (!hits.length && bullet.weapon.radius))) explode(bullet.x, bullet.y, bullet.grenade ? 80 : bullet.weapon.radius);
        }
        g.bullets = g.bullets.filter(b => b.life > 0 && b.x > -160 && b.x < g.width + 160 && b.y > -160 && b.y < g.height + 160);
        for (const bit of g.particles) {
            bit.life -= dt; bit.vy += 700 * dt; bit.x += bit.vx * dt; bit.y += bit.vy * dt;
            if (bit.source) { bit.angle += bit.spin * dt; if (bit.y >= g.floor) { bit.y = g.floor; bit.vy *= -.3; bit.vx *= .8; bit.spin *= .7; } }
        }
        g.particles = g.particles.filter(bit => bit.life > 0);
        g.rings.forEach(ring => { ring.life -= dt; });
        g.rings = g.rings.filter(ring => ring.life > 0);
    }

    function draw() {
        const g = game, c = g.ctx, p = g.player;
        const hint = g.root.querySelector('[data-flight-hint]');
        hint.hidden = !g.ready || g.hasFlown;
        hint.style.transform = `translate(${clamp(p.x - 83, 8, Math.max(8, g.width - 174))}px, ${Math.max(8, p.y - 88)}px)`;
        c.clearRect(0, 0, g.width, g.height);
        for (const target of g.targets) if (g.ready && !target.dead) c.drawImage(target.surface, target.x, target.y);
        for (const ring of g.rings) {
            c.strokeStyle = `rgba(255,165,55,${ring.life / .3})`; c.lineWidth = 3;
            c.beginPath(); c.arc(ring.x, ring.y, ring.radius * (1 - ring.life / .3), 0, Math.PI * 2); c.stroke();
        }
        for (const bit of g.particles) {
            c.globalAlpha = Math.min(1, bit.life * 2);
            if (bit.source) { c.save(); c.translate(bit.x, bit.y); c.rotate(bit.angle); c.drawImage(bit.source, bit.sx, bit.sy, cellSize, cellSize, -cellSize / 2, -cellSize / 2, cellSize, cellSize); c.restore(); }
            else { c.fillStyle = bit.color; c.fillRect(bit.x, bit.y, bit.size, bit.size); }
        }
        c.globalAlpha = 1;
        for (const b of g.bullets) {
            c.fillStyle = b.grenade ? '#617b32' : b.weapon.color;
            c.strokeStyle = '#263339'; c.lineWidth = 1;
            c.beginPath(); c.arc(b.x, b.y, b.grenade || b.weapon.radius ? 4 : 2, 0, Math.PI * 2); c.fill(); c.stroke();
            if (!b.grenade) { c.strokeStyle = b.weapon.color; c.lineWidth = b.weapon.pierce ? 3 : 2; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx * .025, b.y - b.vy * .025); c.stroke(); }
        }
        const angle = Math.atan2(g.aim.y - (p.y - 22 * playerScale), g.aim.x - p.x);
        const stride = p.grounded ? Math.sin(performance.now() / 85) * Math.min(7, Math.abs(p.vx) / 30) : 4;
        c.save(); c.translate(Math.round(p.x), Math.round(p.y)); c.scale(playerScale, playerScale);
        c.lineCap = 'round'; c.lineJoin = 'round';
        const back = Math.cos(angle) >= 0 ? -1 : 1;
        c.save(); c.translate(back * 7, -21);
        c.fillStyle = '#718296'; c.strokeStyle = '#263339'; c.lineWidth = 1;
        c.fillRect(-5, -9, 10, 17); c.strokeRect(-5, -9, 10, 17);
        for (const nozzle of [-3, 3]) {
            c.fillStyle = '#263339'; c.fillRect(nozzle - 2, 6, 4, 4);
            if (p.jetThrust > .05) {
                const flame = (16 + Math.sin(performance.now() / 35 + nozzle) * 5) * p.jetThrust;
                c.fillStyle = '#ff7919'; c.beginPath(); c.moveTo(nozzle - 3, 10); c.lineTo(nozzle, 10 + flame); c.lineTo(nozzle + 3, 10); c.fill();
                c.fillStyle = '#fff2a0'; c.fillRect(nozzle - 1, 10, 2, flame * .55);
            }
        }
        c.restore();
        for (const [color, width] of [['#ffffffb0', 7], ['#111', 5]]) {
            c.strokeStyle = color; c.lineWidth = width;
            c.beginPath(); c.moveTo(0, -26); c.lineTo(0, -12); c.lineTo(-6 - stride, -1);
            c.moveTo(0, -12); c.lineTo(6 + stride, -1); c.moveTo(0, -23); c.lineTo(Math.cos(angle) * 14, -22 + Math.sin(angle) * 14); c.stroke();
        }
        c.fillStyle = '#111'; c.strokeStyle = '#ffffffb0'; c.lineWidth = 1;
        c.beginPath(); c.arc(0, -33, 6, 0, Math.PI * 2); c.fill(); c.stroke();
        c.translate(Math.cos(angle) * 10, -22 + Math.sin(angle) * 10); c.rotate(angle);
        c.fillStyle = '#35475a'; c.fillRect(0, -3, 17, 6); c.fillStyle = weapons[g.weapon].color; c.fillRect(9, -2, 7, 2);
        c.restore();
        c.strokeStyle = '#172d44'; c.lineWidth = 3;
        for (const color of ['#172d44', '#fff']) {
            c.strokeStyle = color; c.beginPath();
            c.moveTo(g.aim.x - 9, g.aim.y); c.lineTo(g.aim.x - 3, g.aim.y);
            c.moveTo(g.aim.x + 3, g.aim.y); c.lineTo(g.aim.x + 9, g.aim.y);
            c.moveTo(g.aim.x, g.aim.y - 9); c.lineTo(g.aim.x, g.aim.y - 3);
            c.moveTo(g.aim.x, g.aim.y + 3); c.lineTo(g.aim.x, g.aim.y + 9); c.stroke(); c.lineWidth = 1;
        }
    }

    function frame(time) {
        const g = game;
        if (!g) return;
        const dt = Math.min((time - g.lastTime) / 1000, .033);
        g.lastTime = time;
        if (g.ready && !g.paused) update(dt);
        draw();
        g.frame = requestAnimationFrame(frame);
    }

    function startGame(event) {
        if (game) return;
        document.getElementById('start-menu').hidden = true;
        document.getElementById('start-button').setAttribute('aria-expanded', 'false');
        const root = document.createElement('section');
        root.id = 'destroy-game'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Destroy this website');
        root.innerHTML = `<canvas tabindex="0" aria-label="Game field. Use A and D to move. Tap W to jump. Hold W to use the jetpack. Hold S to descend. Use F to shoot." aria-describedby="destroy-controls"></canvas>
            <div class="destroy-panel">
                <div class="destroy-title"><strong>Destroy this website</strong><button type="button" data-exit aria-label="Exit and restore desktop">×</button></div>
                <div class="destroy-body"><div class="destroy-status"><span>You destroyed <b data-score>0%</b></span><strong data-weapon-name>Pistol</strong></div>
                <progress max="100" value="0" aria-label="Page destruction"></progress>
                <h3 class="destroy-help-title">How to play</h3><dl id="destroy-controls">
                    <div><dt>Mouse + click</dt><dd>Aim with the cursor.<br>Click or hold to shoot.</dd></div>
                    <div><dt><kbd>A</kbd> <kbd>D</kbd></dt><dd>Move left or right.</dd></div>
                    <div><dt><kbd>W</kbd></dt><dd>Tap to jump.<br>Hold to fly.</dd></div>
                    <div><dt><kbd>S</kbd></dt><dd>Hold to descend through platforms.</dd></div>
                    <div><dt>Right-click</dt><dd>Throw a grenade.</dd></div>
                    <div><dt>Mouse wheel</dt><dd>Change weapons.</dd></div>
                </dl><details><summary>More controls</summary><p>Hold <kbd>F</kbd> to shoot. Press <kbd>G</kbd> for a grenade, <kbd>1</kbd>–<kbd>7</kbd> to select a weapon, or <kbd>Esc</kbd> to pause.</p></details>
                <div class="destroy-weapons" role="group" aria-label="Weapons">${weapons.map((w, i) => `<button type="button" data-weapon="${i}" aria-pressed="${i === 0}" title="${i + 1}: ${w.name}"><kbd>${i + 1}</kbd> ${w.name}</button>`).join('')}</div>
                <div class="destroy-actions"><button type="button" data-pause aria-pressed="false">Pause</button><button type="button" data-restart disabled>Restart</button><button type="button" data-sound aria-pressed="true">Sound: On</button><button type="button" data-exit>Exit game</button></div>
                <p data-message role="status">You can restore the desktop at any time.</p></div>
            </div>
            <p class="destroy-flight-hint" data-flight-hint hidden>Hold <kbd>W</kbd> to fly.</p>
            <aside class="destroy-secret" data-secret hidden role="status"><div class="destroy-title"><strong>Desktop cleanup complete</strong></div><div class="destroy-body"><h2>You deleted the Internet.</h2><p>The grass is still here.</p><p>You can use Restart to undo your success.</p></div></aside>
            <div class="destroy-touch" role="group" aria-label="Touch controls"><button type="button" data-touch="KeyA" aria-label="Move left">A</button><button type="button" data-touch="KeyD" aria-label="Move right">D</button><button type="button" data-touch="KeyW" aria-label="Use jetpack">W</button><button type="button" data-touch="KeyF">Fire</button><button type="button" data-grenade>Grenade</button></div>`;
        const canvas = root.querySelector('canvas');
        const g = game = { targets: [{ x: 0, y: 0, w: innerWidth, h: innerHeight, dead: false }], root, canvas, ctx: canvas.getContext('2d'), events: new AbortController(), keys: new Set(),
            player: { x: innerWidth / 2, y: innerHeight - 36 }, aim: { x: innerWidth / 2 + 100, y: innerHeight / 2 },
            weapon: 0, sound: true, ready: false, paused: false, destroyed: 0, bullets: [], particles: [], rings: [],
            returnFocus: event.currentTarget, shellInert: shell.inert, musicInert: music.inert, lastTime: performance.now() };
        shell.inert = true; music.inert = true;
        document.body.append(root); document.body.classList.add('destroy-playing');
        resize(); g.canvas.focus({ preventScroll: true });
        g.root.querySelector('[data-message]').textContent = 'The game is preparing the page.';
        enableAudio().then(() => { if (game === g) sound(440, .65, false, true); }).catch(() => { if (game === g) { g.sound = false; g.root.querySelector('[data-sound]').textContent = 'Sound: Off'; g.root.querySelector('[data-sound]').setAttribute('aria-pressed', 'false'); } });
        preparePixels(g).catch(error => { if (game === g) g.root.querySelector('[data-message]').textContent = `${error.message} You can exit and try again.`; });
        const on = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: g.events.signal });
        root.querySelectorAll('[data-exit]').forEach(button => on(button, 'click', exit));
        on(root.querySelector('[data-pause]'), 'click', () => pause());
        on(root.querySelector('[data-restart]'), 'click', restart);
        root.querySelectorAll('[data-weapon]').forEach(button => on(button, 'click', () => chooseWeapon(Number(button.dataset.weapon))));
        on(root.querySelector('[data-sound]'), 'click', async event => {
            const button = event.currentTarget;
            try {
                await enableAudio();
                if (game !== g) return;
                g.sound = !g.sound; button.textContent = g.sound ? 'Sound: On' : 'Sound: Off';
                button.setAttribute('aria-pressed', String(g.sound)); sound(440);
            } catch { if (game === g) g.root.querySelector('[data-message]').textContent = 'Your browser cannot play game sound.'; }
        });
        const aim = event => { g.aim = { x: event.clientX, y: event.clientY }; };
        on(canvas, 'pointermove', aim);
        on(canvas, 'pointerdown', event => {
            event.preventDefault(); aim(event); canvas.focus({ preventScroll: true });
            canvas.setPointerCapture(event.pointerId);
            if (event.button === 2) fire(true);
            else if (event.button === 0) { g.firing = true; fire(); }
        });
        on(canvas, 'contextmenu', event => event.preventDefault());
        on(canvas, 'pointerup', () => { g.firing = false; });
        on(canvas, 'pointercancel', clearInput);
        on(canvas, 'lostpointercapture', () => { g.firing = false; });
        on(canvas, 'wheel', event => { event.preventDefault(); chooseWeapon(g.weapon + Math.sign(event.deltaY)); }, { passive: false });
        on(window, 'keydown', event => {
            if (event.code === 'Tab') {
                const focusable = [canvas, ...root.querySelectorAll('button, summary')];
                let index = focusable.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1);
                if (index < 0) index = focusable.length - 1;
                if (index >= focusable.length) index = 0;
                event.preventDefault(); focusable[index].focus(); return;
            }
            if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) pause(); return; }
            if (event.target.closest('button, summary') && ['Space', 'Enter'].includes(event.code)) return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (/^Digit[1-7]$/.test(event.code)) { chooseWeapon(Number(event.code.slice(-1)) - 1); return; }
            if (!['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyG'].includes(event.code)) return;
            event.preventDefault();
            if (g.paused) return;
            if (event.code === 'KeyG') { if (!event.repeat) fire(true); return; }
            if (!event.repeat && event.code === 'KeyW') g.player.jumpQueued = true;
            g.keys.add(event.code);
            if (event.code === 'KeyF' && !event.repeat) fire();
        });
        on(window, 'keyup', event => g.keys.delete(event.code));
        on(window, 'blur', () => pause(true));
        on(document, 'visibilitychange', () => { if (document.hidden) pause(true); });
        on(window, 'resize', () => { const launcher = g.returnFocus; exit(); startGame({ currentTarget: launcher }); });
        root.querySelectorAll('[data-touch]').forEach(button => {
            on(button, 'pointerdown', event => {
                event.preventDefault(); if (g.paused) return;
                button.setPointerCapture(event.pointerId); g.keys.add(button.dataset.touch); button.classList.add('held');
                if (button.dataset.touch === 'KeyW') g.player.jumpQueued = true;
                if (button.dataset.touch === 'KeyF') fire();
            });
            for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) on(button, type, () => { g.keys.delete(button.dataset.touch); button.classList.remove('held'); });
        });
        on(root.querySelector('[data-grenade]'), 'click', () => fire(true));
        g.frame = requestAnimationFrame(frame);
    }
    document.querySelectorAll('[data-destroy]').forEach(button => button.addEventListener('click', startGame));
})();
