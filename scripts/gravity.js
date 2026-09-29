(() => {
    let session;
    const dependencies = new Map();
    function load(name, file) {
        if (window[name]) return Promise.resolve();
        if (!dependencies.has(name)) dependencies.set(name, new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `./scripts/vendor/${file}`;
            script.onload = resolve;
            script.onerror = () => { dependencies.delete(name); script.remove(); reject(new Error('Gravity could not load. You can restore the desktop and try again.')); };
            document.head.append(script);
        }));
        return dependencies.get(name);
    }

    async function start(event) {
        if (session || document.querySelector('#destroy-game')) return;
        const shell = document.getElementById('desktop-shell'), music = document.getElementById('music');
        document.getElementById('start-menu').hidden = true;
        document.getElementById('start-button').setAttribute('aria-expanded', 'false');
        document.getElementById('arcade-frame').contentWindow?.pauseGame?.();
        const root = document.createElement('div');
        root.id = 'gravity-game'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'Drop this website');
        root.innerHTML = `<canvas tabindex="0" aria-label="Desktop items fall and collide. You can drag and throw them with a mouse or touch."></canvas>
            <section class="gravity-panel"><header>Drop this website</header><div>
            <p>You can drag and throw desktop items.</p>
            <nav aria-label="Gravity controls"><button data-pause disabled aria-pressed="false">Pause</button><button data-shake disabled>Shake</button><button data-reset disabled>Reset</button><button data-exit>Restore desktop</button></nav>
            <p data-status role="status">The desktop is preparing. You can press Escape to exit.</p></div></section>`;
        const g = session = { root, events: new AbortController(), returnFocus: event.currentTarget,
            width: innerWidth, height: innerHeight, floor: innerHeight - document.getElementById('taskbar').getBoundingClientRect().height, items: [], paused: matchMedia('(prefers-reduced-motion: reduce)').matches,
            previous: [shell.inert, music.inert] };
        const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
        const pause = root.querySelector('[data-pause]'), status = root.querySelector('[data-status]');
        const on = (target, type, handler) => target.addEventListener(type, handler, { signal: g.events.signal });
        const scale = Math.min(devicePixelRatio || 1, 2);
        canvas.width = g.width * scale; canvas.height = g.height * scale;
        ctx.scale(scale, scale);
        shell.inert = music.inert = true;
        document.body.append(root);
        root.querySelector('[data-exit]').focus();
        function release() {
            if (g.joint) Matter.Composite.remove(g.engine.world, g.joint);
            g.joint = null; g.pointer = null; canvas.classList.remove('grabbing');
        }
        function exit() {
            if (session !== g) return;
            cancelAnimationFrame(g.frame); g.events.abort();
            if (g.engine) { Matter.Composite.clear(g.engine.world, false); Matter.Engine.clear(g.engine); }
            root.remove(); document.body.classList.remove('gravity-playing');
            shell.inert = g.previous[0]; music.inert = g.previous[1]; session = null;
            const focus = g.returnFocus.closest('[hidden]') ? document.getElementById('start-button') : g.returnFocus;
            focus?.focus({ preventScroll: true });
        }
        function setPaused(value) {
            release(); g.paused = value;
            pause.textContent = value ? 'Resume' : 'Pause';
            pause.setAttribute('aria-pressed', String(value));
            status.textContent = value ? 'Gravity is paused. You can select Resume.' : 'You can press Escape to restore the desktop.';
        }
        on(root.querySelector('[data-exit]'), 'click', exit);
        on(pause, 'click', () => setPaused(!g.paused));
        on(window, 'resize', exit);
        on(window, 'blur', () => { if (g.engine) setPaused(true); });
        on(document, 'visibilitychange', () => { if (document.hidden && g.engine) setPaused(true); });
        on(root, 'keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); exit(); }
            if (event.key === 'Tab') {
                const buttons = [...root.querySelectorAll('button:not(:disabled)')];
                const index = buttons.indexOf(document.activeElement);
                event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
            }
        });
        try {
            await Promise.all([load('html2canvas', 'html2canvas-1.4.1.min.js'), load('Matter', 'matter-0.20.0.min.js')]);
            if (session !== g) return;
            const { Engine, Bodies, Body, Composite, Constraint, Query, Sleeping } = Matter;
            g.engine = Engine.create({ enableSleeping: true });
            const elements = [...document.querySelectorAll('#desktop-icons .desktop-icon, #workspace > .window:not([hidden])')];
            if (!music.hidden) elements.push(...music.querySelectorAll('#main-window, #equalizer-window, #playlist-window'));
            for (const element of elements) {
                const rect = element.getBoundingClientRect();
                if (rect.width < 2 || rect.height < 2 || rect.bottom <= 0 || rect.top >= g.height || rect.right <= 0 || rect.left >= g.width) continue;
                const surface = await html2canvas(element, { backgroundColor: null, scale: 1, logging: false, useCORS: true, imageTimeout: 2000,
                    ignoreElements: item => item === root });
                if (session !== g) return;
                const parts = element.matches('.window') ? [...element.querySelectorAll('.titlebar, .toolbar, .addressbar, .searchbar, .statusbar, .profile-heading, .home-footer, .home-sections, .contact-panel, .window-body :is(h1, h2, h3, p, li), .arcade-screen')] : [element];
                for (const part of parts.filter(part => !parts.some(parent => parent !== part && parent.contains(part)))) {
                    const bounds = part.getBoundingClientRect(), clip = part.closest('.window-body')?.getBoundingClientRect() || rect;
                    const left = Math.max(0, rect.left, clip.left, bounds.left), top = Math.max(0, rect.top, clip.top, bounds.top);
                    const w = Math.min(g.width, rect.right, clip.right, bounds.right) - left, h = Math.min(g.floor, rect.bottom, clip.bottom, bounds.bottom) - top;
                    if (w < 2 || h < 2) continue;
                    const x = left + w / 2, y = top + h / 2, sx = left - rect.left, sy = top - rect.top;
                    const body = Bodies.rectangle(x, y, w, h, { restitution: .32, friction: .5, frictionAir: .012 });
                    Body.setAngularVelocity(body, (Math.random() - .5) * .025);
                    Body.setVelocity(body, { x: (Math.random() - .5) * 2, y: 0 });
                    g.items.push({ surface, body, w, h, x, y, sx, sy });
                }
            }
            Composite.add(g.engine.world, g.items.map(item => item.body));
            Composite.add(g.engine.world, [
                Bodies.rectangle(g.width / 2, g.floor + 50, g.width + 200, 100, { isStatic: true }),
                Bodies.rectangle(g.width / 2, -100, g.width + 200, 100, { isStatic: true }),
                Bodies.rectangle(-50, g.height / 2, 100, g.height + 300, { isStatic: true }),
                Bodies.rectangle(g.width + 50, g.height / 2, 100, g.height + 300, { isStatic: true })
            ]);
            on(canvas, 'pointerdown', event => {
                canvas.focus({ preventScroll: true });
                if (g.paused || g.pointer != null || event.button !== 0) return;
                const point = { x: event.clientX, y: event.clientY };
                const body = Query.point(g.items.map(item => item.body), point).at(-1);
                if (!body) return;
                event.preventDefault(); canvas.setPointerCapture(event.pointerId); g.pointer = event.pointerId;
                Sleeping.set(body, false);
                g.joint = Constraint.create({ pointA: point, bodyB: body,
                    pointB: { x: point.x - body.position.x, y: point.y - body.position.y }, stiffness: .15, damping: .12, length: 0 });
                Composite.add(g.engine.world, g.joint); canvas.classList.add('grabbing');
            });
            on(canvas, 'pointermove', event => {
                if (g.joint && g.pointer === event.pointerId) g.joint.pointA = { x: event.clientX, y: event.clientY };
            });
            for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) on(canvas, type, event => {
                if (g.pointer === event.pointerId) release();
            });
            on(root.querySelector('[data-shake]'), 'click', () => {
                setPaused(false);
                for (const { body } of g.items) {
                    Sleeping.set(body, false); Body.setVelocity(body, { x: (Math.random() - .5) * 16, y: -9 - Math.random() * 9 });
                    Body.setAngularVelocity(body, (Math.random() - .5) * .12);
                }
            });
            on(root.querySelector('[data-reset]'), 'click', () => {
                release();
                for (const { body, x, y } of g.items) {
                    Body.setPosition(body, { x, y }); Body.setAngle(body, 0); Body.setVelocity(body, { x: 0, y: 0 });
                    Body.setAngularVelocity(body, 0); Sleeping.set(body, false);
                }
            });
            root.querySelectorAll('button').forEach(button => button.disabled = false);
            setPaused(g.paused); document.body.classList.add('gravity-playing');
            let last = performance.now(), accumulator = 0;
            function frame(now) {
                accumulator += g.paused ? 0 : Math.min(now - last, 50); last = now;
                while (accumulator >= 1000 / 60) { Engine.update(g.engine, 1000 / 60); accumulator -= 1000 / 60; }
                ctx.clearRect(0, 0, g.width, g.height);
                for (const { body, surface, w, h, sx, sy } of g.items) {
                    ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
                    ctx.drawImage(surface, sx, sy, w, h, -w / 2, -h / 2, w, h); ctx.restore();
                }
                g.frame = requestAnimationFrame(frame);
            }
            frame(last);
        } catch (error) {
            if (session === g) status.textContent = `${error.message} You can select Restore desktop.`;
        }
    }
    document.querySelectorAll('[data-gravity]').forEach(button => button.addEventListener('click', start));
})();
