(() => {
    const shell = document.getElementById('desktop-shell');
    const music = document.getElementById('music');
    const weapons = [
        { name: 'Pistol', kind: 'bullet', delay: .16, speed: 2300, cut: 8.5, spread: .012, push: 0, color: '#ffe9a0', help: 'Fast, precise shots at the cursor.' },
        { name: 'SMG', kind: 'bullet', delay: .068, speed: 2000, cut: 6.5, spread: .07, auto: true, push: 14, color: '#ffdc57', help: 'Hold to fire a rapid burst.' },
        { name: 'Shotgun', kind: 'bullet', delay: .62, speed: 1750, cut: 5.5, spread: .17, count: 10, push: 230, color: '#ffd49c', help: 'Ten pellets spread around the cursor.' },
        { name: 'Rocket', kind: 'rocket', delay: .85, speed: 420, radius: 46, push: 120, color: '#ff763b', help: 'An accelerating rocket explodes at the cursor.' },
        { name: 'Railgun', kind: 'rail', delay: 1.1, charge: .38, cut: 7, push: 260, color: '#65efff', help: 'A charged beam cuts across the whole screen.' },
        { name: 'Flamethrower', kind: 'flame', delay: 1 / 60, speed: 560, spread: .1, count: 5, auto: true, push: 0, color: '#ffab38', help: 'Hold to spread fire. The page keeps burning.' },
        { name: 'Too Much', kind: 'cluster', delay: 1.9, speed: 760, push: 300, color: '#ef8bff', help: 'A parachute shell releases eight explosive bombs.' }
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
            target.materialAt = new Int16Array(target.cells.length).fill(-1);
            g.materials.forEach((material, id) => {
                for (let row = Math.max(0, Math.floor((material.y - target.y) / cellSize)); row < target.rows && target.y + row * cellSize < material.y + material.h; row++) {
                    for (let col = Math.max(0, Math.floor((material.x - target.x) / cellSize)); col < target.columns && target.x + col * cellSize < material.x + material.w; col++) target.materialAt[row * target.columns + col] = id;
                }
            });
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

    function measureMaterials() {
        const materials = [], bannerSelector = '.titlebar, .toolbar, .addressbar, .profile-heading, .statusbar, .home-footer, #taskbar';
        const visible = (element, rect) => {
            let left = Math.max(0, rect.left), top = Math.max(0, rect.top), right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
            for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
                const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
                if (style.overflowX !== 'visible') { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
                if (style.overflowY !== 'visible') { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
            }
            if (right - left < 2 || bottom - top < 2) return null;
            const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
            if (!hit || !(element.contains(hit) || hit.contains(element))) return null;
            return { x: Math.floor(left), y: Math.floor(top), w: Math.ceil(right) - Math.floor(left), h: Math.ceil(bottom) - Math.floor(top) };
        };
        for (const [selector, kind] of [[bannerSelector, 'banner'], ['#desktop-shell img, #music img', 'glass']]) {
            document.querySelectorAll(selector).forEach(element => {
                const rect = visible(element, element.getBoundingClientRect());
                if (rect && (kind !== 'glass' || rect.w >= 24 && rect.h >= 24)) materials.push({ ...rect, kind });
            });
        }
        const walker = document.createTreeWalker(shell, NodeFilter.SHOW_TEXT), range = document.createRange();
        let node;
        while ((node = walker.nextNode()) && materials.length < 2200) {
            const element = node.parentElement;
            if (element.closest(bannerSelector + ', script, style, [hidden]') || !element.getClientRects().length) continue;
            for (let i = 0; i < node.length && materials.length < 2200; i++) {
                if (!node.textContent[i].trim()) continue;
                range.setStart(node, i); range.setEnd(node, i + 1);
                const rect = visible(element, range.getBoundingClientRect());
                if (rect) materials.push({ ...rect, kind: 'letter' });
            }
        }
        return materials;
    }

    function updateScore() {
        const g = game, percent = Math.min(100, Math.floor(g.destroyed / Math.max(1, g.total) * 100));
        g.root.querySelector('progress').value = percent;
        g.root.querySelector('[data-score]').textContent = `${percent}%`;
        if (g.destroyed === g.total && !g.won) {
            g.won = true;
            g.root.querySelector('[data-secret]').hidden = false;
            g.root.querySelector('[data-message]').textContent = 'You cleared the desktop! You can restart or restore it.';
            sound(880, .3);
        }
    }

    function breakMaterial(material, target, radius, x, y) {
        if (material.broken) return;
        const g = game, m = material;
        m.hits++;
        if (m.kind === 'glass' && m.hits < 3 && radius < 20) {
            const c = target.context, ix = clamp(x - target.x, m.x, m.x + m.w), iy = clamp(y - target.y, m.y, m.y + m.h);
            c.save(); c.globalCompositeOperation = 'source-atop'; c.beginPath(); c.rect(m.x, m.y, m.w, m.h); c.clip();
            for (let i = 0; i < 7; i++) {
                const angle = i * Math.PI * 2 / 7 + Math.random() * .3, length = Math.max(m.w, m.h) * (.3 + Math.random() * .5);
                const endX = ix + Math.cos(angle) * length, endY = iy + Math.sin(angle) * length;
                c.strokeStyle = '#233d60b0'; c.lineWidth = 1; c.beginPath(); c.moveTo(ix, iy); c.lineTo((ix + endX) / 2 + 3, (iy + endY) / 2 - 2); c.lineTo(endX, endY); c.stroke();
                c.strokeStyle = '#effaffd0'; c.beginPath(); c.moveTo(ix + 1, iy); c.lineTo(endX + 1, endY); c.stroke();
            }
            c.restore(); sound(1700, .08); return;
        }
        if (m.kind === 'banner' && m.hits < 4 && radius < 32) return;
        m.broken = true;
        const corners = [[0, 0], [m.w, 0], [m.w, m.h], [0, m.h]], polygons = [];
        if (m.kind === 'glass') {
            const center = [clamp(x - m.x, m.w * .2, m.w * .8), clamp(y - m.y, m.h * .2, m.h * .8)];
            for (let i = 0; i < 4; i++) {
                const a = corners[i], b = corners[(i + 1) % 4], midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
                polygons.push([center, a, midpoint], [center, midpoint, b]);
            }
        } else polygons.push(corners);
        for (const polygon of polygons) {
            if (g.fragments.length >= 220) break;
            const left = Math.floor(Math.min(...polygon.map(p => p[0]))), top = Math.floor(Math.min(...polygon.map(p => p[1])));
            const w = Math.max(1, Math.ceil(Math.max(...polygon.map(p => p[0]))) - left), h = Math.max(1, Math.ceil(Math.max(...polygon.map(p => p[1]))) - top);
            const surface = document.createElement('canvas'); surface.width = w; surface.height = h;
            const c = surface.getContext('2d'); c.translate(-left, -top); c.beginPath(); polygon.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.closePath(); c.clip();
            c.drawImage(target.surface, m.x - target.x, m.y - target.y, m.w, m.h, 0, 0, m.w, m.h);
            if (m.kind === 'letter') {
                const pixels = c.getImageData(0, 0, w, h), colors = new Map();
                for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
                    if (px && py && px !== w - 1 && py !== h - 1) continue;
                    const i = (py * w + px) * 4, color = pixels.data.slice(i, i + 3).join(',');
                    if (pixels.data[i + 3]) colors.set(color, (colors.get(color) || 0) + 1);
                }
                const background = [...colors].sort((a, b) => b[1] - a[1])[0]?.[0].split(',').map(Number);
                if (background) for (let i = 0; i < pixels.data.length; i += 4) {
                    if (Math.max(...background.map((color, channel) => Math.abs(pixels.data[i + channel] - color))) < 55) pixels.data[i + 3] = 0;
                }
                c.putImageData(pixels, 0, 0);
            }
            if (m.kind === 'glass') { c.strokeStyle = '#e4f6ffc0'; c.lineWidth = 1; c.stroke(); }
            const px = m.x + left + w / 2, py = m.y + top + h / 2, angle = Math.atan2(py - y, px - x), side = x < m.x + m.w / 2 ? -1 : 1;
            g.fragments.push({ x: px, y: py, w, h, surface, kind: m.kind, vx: Math.cos(angle) * (80 + radius * 3), vy: Math.sin(angle) * 100 - 100,
                angle: 0, spin: (Math.random() - .5) * (m.kind === 'letter' ? 15 : 4), life: m.kind === 'letter' ? 4 : 9, age: 0,
                pivot: m.kind === 'banner' ? { x: side < 0 ? m.x + m.w : m.x, y: m.y, dx: side < 0 ? w / 2 : -w / 2, dy: -h / 2, side } : null });
        }
        for (let row = Math.max(0, Math.floor((m.y - target.y) / cellSize)); row < target.rows && target.y + row * cellSize < m.y + m.h; row++) {
            for (let col = Math.max(0, Math.floor((m.x - target.x) / cellSize)); col < target.columns && target.x + col * cellSize < m.x + m.w; col++) {
                const index = row * target.columns + col;
                if (!target.cells[index]) continue;
                target.cells[index] = 0; target.remaining--; g.destroyed++;
                target.context.clearRect(col * cellSize, row * cellSize, cellSize, cellSize);
            }
        }
        target.dead = !target.remaining;
        for (const child of g.materials) if (child !== m && child.x >= m.x && child.y >= m.y && child.x + child.w <= m.x + m.w && child.y + child.h <= m.y + m.h) child.broken = true;
        if (m.kind !== 'letter') sound(m.kind === 'glass' ? 1900 : 130, m.kind === 'glass' ? .24 : .3, m.kind === 'banner');
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
        let removed = 0; const struck = new Set();
        for (let row = fromY; row <= toY; row++) for (let col = fromX; col <= toX; col++) {
            const index = row * target.columns + col, sx = col * cellSize, sy = row * cellSize;
            const px = target.x + sx + cellSize / 2, py = target.y + sy + cellSize / 2;
            if (!target.cells[index] || Math.hypot(px - x, py - y) > radius) continue;
            const material = g.materials?.[target.materialAt?.[index]];
            if (material && !material.broken) { struck.add(material); if (material.kind === 'letter') continue; }
            target.cells[index] = 0; target.context.clearRect(sx, sy, cellSize, cellSize);
            removed++; target.remaining--;
            if (g.particles.length < 1400) {
                const angle = Math.atan2(py - y, px - x), force = 100 + Math.random() * 200;
                g.particles.push({ x: px, y: py, vx: Math.cos(angle) * force, vy: Math.sin(angle) * force - 150,
                    life: 1.4 + Math.random(), size: cellSize, source: target.original, sx, sy,
                    angle: 0, spin: (Math.random() - .5) * 14 });
            }
        }
        if (!removed && !struck.size) return;
        target.damaged = true;
        target.dead = target.remaining === 0; g.destroyed += removed;
        for (const material of struck) breakMaterial(material, target, radius, x, y);
        updateScore();
    }

    function scorch(target, x, y, radius) {
        const c = target.context, px = x - target.x, py = y - target.y;
        const gradient = c.createRadialGradient(px, py, radius * .7, px, py, radius + 8);
        gradient.addColorStop(0, '#24170e'); gradient.addColorStop(.65, '#5b3825c0'); gradient.addColorStop(1, '#5b382500');
        c.save(); c.globalCompositeOperation = 'source-atop'; c.fillStyle = gradient;
        c.beginPath(); c.arc(px, py, radius + 8, 0, Math.PI * 2); c.fill(); c.restore();
    }

    function explode(x, y, radius) {
        particles(x, y, '#ffb840', 40);
        game.rings.push({ x, y, radius, life: .3 });
        for (const target of game.targets) {
            if (!target.dead && Math.hypot(x - clamp(x, target.x, target.x + target.w), y - clamp(y, target.y, target.y + target.h)) <= radius) { scorch(target, x, y, radius); damage(target, radius, x, y); }
        }
        sound(85, .38, true);
    }

    function fire(grenade = false) {
        const g = game;
        if (!g || !g.ready || g.paused || (grenade ? g.grenadeCooldown > 0 : g.cooldown > 0 || g.charge)) return false;
        const p = g.player, weapon = weapons[g.weapon], kind = grenade ? 'grenade' : weapon.kind;
        const dx = g.aim.x - p.x, dy = g.aim.y - (p.y - 22 * playerScale), angle = Math.atan2(dy, dx);
        const distance = Math.hypot(dx, dy), muzzle = Math.min(27 * playerScale, distance), range = Math.max(0, distance - muzzle);
        const x = p.x + Math.cos(angle) * muzzle, y = p.y - 22 * playerScale + Math.sin(angle) * muzzle;
        if (grenade) g.grenadeCooldown = .55; else g.cooldown = weapon.delay;
        if (kind === 'rail') { g.charge = { x, y, angle, remaining: weapon.charge, weapon }; sound(900, .38); return true; }
        for (let i = 0; i < (grenade ? 1 : weapon.count || 1); i++) {
            const spread = (weapon.spread || 0) + (kind === 'bullet' && weapon.auto ? g.bloom : 0);
            const a = angle + (grenade ? 0 : (Math.random() - .5) * spread * 2);
            const speed = grenade ? 0 : weapon.speed * (kind === 'flame' ? .78 + Math.random() * .37 : weapon.count ? .82 + Math.random() * .26 : 1);
            const flight = clamp(range / 620, .32, .85), life = kind === 'flame' ? .42 + Math.random() * .3 : grenade ? 1.55 : 6;
            g.bullets.push({ x, y, vx: grenade ? (g.aim.x - x) / flight : Math.cos(a) * speed,
                vy: grenade ? (g.aim.y - y) / flight - 950 * flight : Math.sin(a) * speed,
                range, life, age: 0, kind, weapon, chute: -1, bounced: false });
        }
        if (kind === 'bullet' && g.casings.length < 320) g.casings.push({
            x: x - Math.cos(angle) * 17, y: y - Math.sin(angle) * 17, vx: -Math.sign(Math.cos(angle) || 1) * (50 + Math.random() * 100) + p.vx * .5,
            vy: -150 - Math.random() * 130, angle: 0, spin: (Math.random() - .5) * 30,
            delay: g.weapon === 2 ? .26 : 0, life: 30 + Math.random() * 12, red: g.weapon === 2 });
        g.kick = grenade ? 0 : [4, 2.6, 7, 6, 9, .5, 11][g.weapon];
        if (kind === 'bullet' && weapon.auto) g.bloom = Math.min(.1, g.bloom + .014);
        if (!grenade) { p.vx -= Math.cos(angle) * weapon.push * (p.grounded ? .45 : 1); if (!p.grounded) p.vy -= Math.sin(angle) * weapon.push * .8; }
        particles(x, y, weapon.color, kind === 'flame' ? 0 : 4);
        if (kind !== 'flame' || g.flameSound <= 0) { sound(grenade ? 180 : [170, 240, 100, 75, 900, 65, 120][g.weapon], kind === 'flame' ? .12 : .18); g.flameSound = .1; }
        return true;
    }

    function fireRail(shot) {
        const g = game, dx = Math.cos(shot.angle), dy = Math.sin(shot.angle);
        let distance = 4000;
        if (dx) distance = Math.min(distance, ((dx > 0 ? g.width : 0) - shot.x) / dx);
        if (dy) distance = Math.min(distance, ((dy > 0 ? g.height : 0) - shot.y) / dy);
        for (let d = 0; d <= distance; d += 3) for (const target of g.targets) damage(target, shot.weapon.cut, shot.x + dx * d, shot.y + dy * d);
        g.beams.push({ x: shot.x, y: shot.y, nx: shot.x + dx * distance, ny: shot.y + dy * distance, life: .3 });
        g.player.vx -= dx * shot.weapon.push * (g.player.grounded ? .45 : 1);
        if (!g.player.grounded) g.player.vy -= dy * shot.weapon.push * .8;
        g.kick = 9; particles(shot.x, shot.y, '#65efff', 25); sound(1200, .35, true);
    }

    function ignite(x, y) {
        const g = game, key = `${Math.floor(x / 12)},${Math.floor(y / 12)}`;
        if (g.fires.has(key) || g.fires.size >= 180) return;
        for (const target of g.targets) {
            const col = Math.floor((x - target.x) / cellSize), row = Math.floor((y - target.y) / cellSize);
            if (col >= 0 && row >= 0 && col < target.columns && row < target.rows && target.cells[row * target.columns + col]) {
                g.fires.set(key, { x, y, target, life: 2, tick: 0 }); return;
            }
        }
    }

    function splitCluster(bullet) {
        const g = game;
        for (let i = 0; i < 8; i++) g.bullets.push({ x: bullet.x, y: bullet.y + 4,
            vx: ((i + .5) / 8 - .5) * 620 + (Math.random() - .5) * 120 + bullet.vx * .3,
            vy: -240 + Math.random() * 200, life: 1.3 + Math.random() * .6, age: 0,
            kind: 'bomblet', weapon: bullet.weapon, bounced: false });
        bullet.life = 0; particles(bullet.x, bullet.y, '#fff2a0', 20); sound(300, .2);
    }

    function chooseWeapon(index) {
        const g = game;
        g.weapon = (index + weapons.length) % weapons.length;
        g.root.querySelectorAll('[data-weapon]').forEach((button, i) => button.setAttribute('aria-pressed', String(i === g.weapon)));
        g.root.querySelector('[data-weapon-name]').textContent = weapons[g.weapon].name;
        g.root.querySelector('[data-weapon-help]').textContent = weapons[g.weapon].help;
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
        g.destroyed = 0; g.bullets = []; g.casings = []; g.fragments = []; g.particles = []; g.rings = []; g.won = false; g.hasFlown = false; g.charge = null; g.beams = []; g.fires = new Map(); g.kick = 0; g.flameSound = 0;
        g.materials?.forEach(material => { material.hits = 0; material.broken = false; });
        g.root.querySelector('[data-secret]').hidden = true;
        g.player = { x: Math.max(120, innerWidth / 2), y: innerHeight - document.getElementById('taskbar').getBoundingClientRect().height, vx: 0, vy: 0, grounded: true, jumps: 1, jumpHeld: false, jumpQueued: false, jetHold: 0, jetOn: false, jetDeploy: -1, jetThrust: 0, jetSound: 0 };
        g.cooldown = 0; g.grenadeCooldown = 0; g.bloom = 0;
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
        g.cooldown -= dt; g.grenadeCooldown -= dt; g.flameSound -= dt; g.kick *= Math.exp(-18 * dt); g.bloom = Math.max(0, g.bloom - .08 * dt);
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
        if (g.charge) { g.charge.remaining -= dt; if (g.charge.remaining <= 0) { fireRail(g.charge); g.charge = null; } }
        if (g.firing || keys.has('KeyF')) for (let n = 0; n < 4 && g.cooldown <= 0; n++) {
            const overdue = Math.max(-weapons[g.weapon].delay * 3, g.cooldown);
            if (!fire()) break;
            g.cooldown += overdue;
        }
        for (const bullet of g.bullets.slice()) {
            const step = Math.min(dt, Math.max(0, bullet.life)); bullet.life -= dt; bullet.age += step;
            const { kind, weapon } = bullet;
            let gravity = kind === 'grenade' || kind === 'bomblet' ? 1900 : kind === 'cluster' ? 1178 : 0;
            if (kind === 'cluster' && bullet.chute >= 0) {
                gravity = 0; bullet.chute += step; bullet.vy += (62 - bullet.vy) * Math.min(1, step * 4.5); bullet.vx *= Math.exp(-1.8 * step);
            }
            if (kind === 'rocket') {
                const speed = Math.hypot(bullet.vx, bullet.vy), next = Math.min(1250, speed + 1900 * step);
                if (speed) { bullet.vx *= next / speed; bullet.vy *= next / speed; }
                particles(bullet.x, bullet.y, '#a5a3a0', 1);
            }
            let dx = bullet.vx * step, dy = bullet.vy * step + gravity * step * step / 2;
            bullet.vy += gravity * step;
            if (kind === 'bullet' || kind === 'rocket') {
                const distance = Math.hypot(dx, dy), fraction = distance ? Math.min(1, bullet.range / distance) : 0;
                dx *= fraction; dy *= fraction; bullet.range = Math.max(0, bullet.range - distance);
                if (bullet.range <= .001) bullet.life = 0;
            }
            const nx = bullet.x + dx, ny = bullet.y + dy;
            if (['grenade', 'bomblet', 'cluster'].includes(kind) && bullet.vy > 0) {
                let hit = ny >= g.floor ? clamp((g.floor - bullet.y) / Math.max(.001, dy), 0, 1) : null;
                for (const target of g.targets) { const t = surfaceHit(bullet.x, bullet.y, nx, ny, target); if (t !== null && (hit === null || t < hit)) hit = t; }
                if (hit !== null) {
                    bullet.x += dx * hit; bullet.y += dy * hit - 4;
                    if (kind === 'bomblet' && (bullet.bounced || Math.random() >= .35)) bullet.life = 0;
                    else { bullet.vy = -Math.abs(bullet.vy) * .42; bullet.vx *= .7; bullet.bounced = true; }
                } else { bullet.x = nx; bullet.y = ny; }
            } else { bullet.x = nx; bullet.y = ny; }
            if (['grenade', 'bomblet', 'cluster'].includes(kind)) {
                if (bullet.x < 4 || bullet.x > g.width - 4) { bullet.x = clamp(bullet.x, 4, g.width - 4); bullet.vx *= -.5; }
            }
            if (kind === 'cluster') {
                if (bullet.chute < 0 && ((bullet.age > .42 && bullet.vy > 30) || bullet.bounced)) { bullet.chute = 0; sound(450, .12); }
                const surface = bullet.y + 95 >= g.floor || g.targets.some(target => surfaceHit(bullet.x, bullet.y, bullet.x, bullet.y + 95, target) !== null);
                if (bullet.chute > 1.8 || (bullet.chute > .55 && surface) || bullet.life <= 0) splitCluster(bullet);
            } else if (kind === 'flame') {
                bullet.vx *= Math.exp(-step * 1.2); bullet.vy = bullet.vy * Math.exp(-step * 1.2) - 65 * step;
                for (let d = 0; d <= 1; d += .25) ignite(nx - dx * d, ny - dy * d);
            } else if (bullet.life <= 0) {
                if (kind === 'bullet') {
                    for (const target of g.targets) {
                        damage(target, weapon.cut, bullet.x, bullet.y);
                        const angle = Math.atan2(bullet.vy, bullet.vx);
                        damage(target, weapon.cut * .7, bullet.x + Math.cos(angle) * weapon.cut, bullet.y + Math.sin(angle) * weapon.cut);
                    }
                    particles(bullet.x, bullet.y, weapon.color, 5);
                } else explode(bullet.x, bullet.y, kind === 'grenade' ? 50 : kind === 'bomblet' ? 30 : weapon.radius);
            }
        }
        g.bullets = g.bullets.filter(b => b.life > 0 && b.x > -160 && b.x < g.width + 160 && b.y > -400 && b.y < g.height + 160);
        for (const [key, flame] of [...g.fires]) {
            flame.life -= dt; flame.tick -= dt;
            if (flame.life <= 0 || flame.target.dead) { g.fires.delete(key); continue; }
            if (flame.tick > 0) continue;
            flame.tick = .1; scorch(flame.target, flame.x, flame.y, 5 + (2 - flame.life) * 6); damage(flame.target, 5 + (2 - flame.life) * 6, flame.x, flame.y);
            const angle = Math.random() * Math.PI * 2;
            ignite(flame.x + Math.cos(angle) * 16, flame.y + Math.sin(angle) * 16);
            particles(flame.x, flame.y, '#ff8b28', 1);
        }
        g.beams.forEach(beam => { beam.life -= dt; }); g.beams = g.beams.filter(beam => beam.life > 0);
        for (const piece of g.fragments) {
            piece.age += dt; piece.life -= dt;
            if (piece.pivot && piece.age < .75) {
                piece.angle += piece.pivot.side * dt * piece.age * 2;
                const cos = Math.cos(piece.angle), sin = Math.sin(piece.angle), pivot = piece.pivot;
                piece.x = pivot.x - (pivot.dx * cos - pivot.dy * sin); piece.y = pivot.y - (pivot.dx * sin + pivot.dy * cos);
            } else {
                piece.pivot = null; piece.vy += 1100 * dt; piece.x += piece.vx * dt; piece.y += piece.vy * dt; piece.angle += piece.spin * dt;
                const bottom = Math.abs(Math.sin(piece.angle)) * piece.w / 2 + Math.abs(Math.cos(piece.angle)) * piece.h / 2;
                if (piece.y + bottom >= g.floor) { piece.y = g.floor - bottom; piece.vy = -Math.abs(piece.vy) * .2; piece.vx *= .7; piece.spin *= .5; piece.life = Math.min(piece.life, 3); }
            }
        }
        g.fragments = g.fragments.filter(piece => piece.life > 0 && piece.x + piece.w > -100 && piece.x - piece.w < g.width + 100);
        for (const casing of g.casings) {
            if (casing.delay > 0) { casing.delay -= dt; continue; }
            casing.life -= dt; casing.vy += 1710 * dt; casing.angle += casing.spin * dt;
            const nx = casing.x + casing.vx * dt, ny = casing.y + casing.vy * dt;
            let hit = ny >= g.floor ? clamp((g.floor - casing.y) / Math.max(.001, ny - casing.y), 0, 1) : null;
            if (casing.vy > 0) for (const target of g.targets) { const t = surfaceHit(casing.x, casing.y, nx, ny, target); if (t !== null && (hit === null || t < hit)) hit = t; }
            if (hit !== null) {
                casing.x += (nx - casing.x) * hit; casing.y += (ny - casing.y) * hit - 1;
                casing.vy *= -.3; casing.vx *= .65; casing.spin *= .5;
                if (Math.abs(casing.vy) < 30) { casing.vy = 0; casing.vx = 0; casing.spin = 0; }
            } else { casing.x = nx; casing.y = ny; }
        }
        g.casings = g.casings.filter(casing => casing.life > 0 && casing.x > -20 && casing.x < g.width + 20);
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
        for (const piece of g.fragments || []) {
            c.save(); c.translate(piece.x, piece.y); c.rotate(piece.angle); c.globalAlpha = Math.min(1, piece.life * 2);
            c.drawImage(piece.surface, -piece.w / 2, -piece.h / 2); c.restore();
        }
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
        for (const flame of g.fires?.values() || []) {
            c.fillStyle = '#ff8b28'; c.beginPath(); c.ellipse(flame.x, flame.y - 4, 5, 9 + Math.sin(performance.now() / 60 + flame.x) * 3, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#ffe9a0'; c.fillRect(flame.x - 1, flame.y - 5, 2, 5);
        }
        for (const b of g.bullets) {
            if (b.kind === 'flame') {
                c.globalAlpha = Math.min(1, b.life * 3); c.fillStyle = b.life > .25 ? '#ffab38' : '#e45520';
                c.beginPath(); c.arc(b.x, b.y, 3 + b.age * 14, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; continue;
            }
            c.save(); c.translate(Math.round(b.x), Math.round(b.y)); c.scale(playerScale, playerScale);
            if (b.kind === 'grenade') {
                c.fillStyle = '#171820'; c.fillRect(-5, -4, 10, 10); c.fillRect(-3, -7, 6, 3);
                c.fillStyle = '#737780'; c.fillRect(-2, -8, 6, 2); c.fillRect(4, -6, 2, 5);
                c.fillStyle = '#168cda'; c.fillRect(-5, 1, 9, 2); c.fillStyle = '#e9b54a'; c.fillRect(4, 1, 1, 2);
            } else {
                c.rotate(Math.atan2(b.vy, b.vx));
                if (b.kind === 'bullet') {
                    c.fillStyle = '#e9b54a'; c.fillRect(-Math.min(22, Math.hypot(b.vx, b.vy) * .01), -1, 22, 2);
                    c.fillStyle = '#fff5cf'; c.fillRect(-2, -1, 4, 2);
                } else {
                    const cluster = b.kind === 'cluster', width = cluster ? 18 : b.kind === 'rocket' ? 15 : 11, height = cluster ? 10 : 4;
                    c.fillStyle = '#171820'; c.fillRect(-width / 2, -height / 2 - 1, width, height + 2);
                    c.fillStyle = '#555b70'; c.fillRect(-width / 2 + 2, -height / 2, width - 5, 2);
                    c.fillStyle = b.kind === 'rocket' ? '#ff1685' : '#13c9ff';
                    c.fillRect(-width / 2 - 2, -height / 2 - 3, 3, 4); c.fillRect(-width / 2 - 2, height / 2 - 1, 3, 4);
                    if (b.kind !== 'rocket') c.fillRect(-width / 2 + 1, 1, width - 2, 2);
                    c.fillStyle = b.kind === 'rocket' ? '#d3d6e1' : '#ffe849'; c.fillRect(width / 2, -1, 3, 2);
                    if (cluster) { c.fillStyle = '#ffe849'; c.fillRect(-3, -3, 2, 6); c.fillRect(-5, -1, 6, 2); }
                }
            }
            c.restore();
            if (b.kind === 'cluster' && b.chute >= 0) {
                c.save(); c.translate(Math.round(b.x), Math.round(b.y));
                c.strokeStyle = '#171820'; c.lineWidth = 2;
                c.beginPath(); c.moveTo(-22, -29); c.lineTo(0, 0); c.lineTo(22, -29); c.moveTo(0, -45); c.lineTo(0, 0); c.stroke();
                c.fillStyle = '#171820'; c.beginPath(); c.moveTo(-25, -29); c.lineTo(-20, -44); c.lineTo(-8, -53); c.lineTo(8, -53); c.lineTo(20, -44); c.lineTo(25, -29); c.closePath(); c.fill();
                c.fillStyle = '#e5e5f0'; c.fillRect(-16, -43, 32, 6); c.fillRect(-8, -49, 16, 6);
                c.fillStyle = '#67697f'; c.fillRect(-18, -36, 36, 5);
                c.fillStyle = '#13c9ff'; c.fillRect(-2, -51, 4, 23); c.fillRect(-22, -38, 3, 9); c.fillRect(19, -38, 3, 9); c.restore();
            }
        }
        for (const casing of g.casings || []) {
            if (casing.delay > 0) continue;
            c.save(); c.translate(casing.x, casing.y); c.rotate(casing.angle); c.globalAlpha = Math.min(1, casing.life);
            c.fillStyle = casing.red ? '#c93d35' : '#e9b54a'; c.fillRect(-3, -1, casing.red ? 7 : 5, 2);
            c.fillStyle = '#9b6a22'; c.fillRect(-3, -1, 2, 2); c.restore();
        }
        for (const beam of g.beams || []) {
            c.globalAlpha = beam.life / .3; c.strokeStyle = '#65efff'; c.lineWidth = 14;
            c.beginPath(); c.moveTo(beam.x, beam.y); c.lineTo(beam.nx, beam.ny); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 4; c.stroke(); c.globalAlpha = 1;
        }
        if (g.charge) {
            c.strokeStyle = '#65efff'; c.lineWidth = 2; c.beginPath(); c.arc(g.charge.x, g.charge.y, 5 + g.charge.remaining * 50, 0, Math.PI * 2); c.stroke();
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
        const thickness = [5, 7, 6, 10, 7, 9, 13][g.weapon];
        c.translate(-(g.kick || 0), 0); c.fillStyle = '#35475a'; c.fillRect(0, -thickness / 2, 17, thickness); c.fillRect(2, 0, 5, 8);
        c.fillStyle = weapons[g.weapon].color; c.fillRect(9, -thickness / 2 + 1, 7, 2);
        if (g.weapon === 2) { c.fillStyle = '#88603f'; c.fillRect(6, 1, 10, 3); }
        if (g.weapon === 3 || g.weapon === 6) { c.fillStyle = '#617b32'; c.fillRect(-8, -thickness / 2, 8, thickness); }
        if (g.weapon === 4) { c.fillStyle = '#65efff'; for (let x = 3; x < 15; x += 4) c.fillRect(x, -5, 2, 10); }
        if (g.weapon === 5) { c.fillStyle = '#ae3b24'; c.fillRect(-3, -2, 5, 9); }
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
                <div class="destroy-weapons" role="group" aria-label="Weapons">${weapons.map((w, i) => `<button type="button" data-weapon="${i}" aria-pressed="${i === 0}" title="${i + 1}: ${w.name}. ${w.help}"><kbd>${i + 1}</kbd> ${w.name}</button>`).join('')}</div>
                <p data-weapon-help>Fast, precise shots at the cursor.</p><div class="destroy-actions"><button type="button" data-pause aria-pressed="false">Pause</button><button type="button" data-restart disabled>Restart</button><button type="button" data-sound aria-pressed="true">Sound: On</button><button type="button" data-exit>Exit game</button></div>
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
        g.materials = measureMaterials();
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
