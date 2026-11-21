// src/main.js — bootstrap: Three.js scene, camera fitting, input, HUD and level progression.

import { BoardView } from './view/board.js';
import { Tweens } from './view/tween.js';
import { GameController } from './game.js';
import { LevelSource } from './levels/source.js';
import { colorInfo, drawSymbol } from './view/palette.js';
import { queueRuns } from './core/level.js';
import { VISIBLE_RUNS } from './core/metrics.js';
import { store } from './storage.js';
import { loadTexture } from './view/textures.js';
import { GEN_VERSION } from './core/version.js';

const BUILD_ID = (typeof window !== 'undefined' && window.__BUILD_ID__) || 'dev';

class App {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.tweens = new Tweens();
        this.initThree();
        this.view = new BoardView(this.scene, this.tweens);
        this.view.onVisual = () => this.renderRibbon();
        this.source = new LevelSource();
        this.game = new GameController(this.view, {
            onLevel: (L, info) => this.onLevel(L, info),
            onState: (L, s, undoCount) => this.onState(L, s, undoCount),
            onWin: (info) => this.onWin(info),
            onLoss: (info) => this.onLoss(info),
            toast: (m) => this.toast(m),
            afterSettle: (t, fn) => this.tweens.after(Math.max(0, t - this.tweens.time), fn)
        });
        this.initUI();
        this.initInput();
        this.levelNumber = store.get('level', 1);
        this.resume();
        this.last = performance.now();
        this.animate();
        window.addEventListener('resize', () => this.onResize());
        // Debug handle only on a local dev server; shipped builds (Artifacts, Pages) never expose game state.
        if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !window.__BUILD_ID__) window.__dbg = this;
    }

    // ---------------------------------------------------------------- three

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf6efe3);
        this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        // Phones: slightly lower pixel ratio and shadow resolution keep frame times and heat down.
        this.coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.coarse ? 1.75 : 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9cdb6, 0.62));
        const sun = new THREE.DirectionalLight(0xfff3e0, 0.68);
        sun.position.set(-8, 24, 12);
        sun.castShadow = true;
        sun.shadow.mapSize.set(this.coarse ? 1024 : 2048, this.coarse ? 1024 : 2048);
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 80;
        sun.shadow.radius = 4;
        sun.shadow.bias = -0.0006;
        this.sun = sun;
        this.scene.add(sun, sun.target);

        // Tabletop under everything.
        // Tabletop (Flow texture), one tile every 6 world units.
        const table = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
            new THREE.MeshStandardMaterial({ map: loadTexture('assets/tabletop.jpg', 400 / 6, 400 / 6), color: 0xfff8ee, roughness: 1 }));
        table.rotation.x = -Math.PI / 2;
        table.position.y = -0.11;
        table.receiveShadow = true;
        this.scene.add(table);
        this.onResize();
    }

    /** Fit the level's bounds into the screen area not covered by the HUD. */
    fitCamera() {
        if (!this.view.layout) return;
        const w = window.innerWidth, h = window.innerHeight;
        const hudBottom = Math.max(
            document.getElementById('ribbon').getBoundingClientRect().bottom,
            document.getElementById('hud').getBoundingClientRect().bottom
        ) + 6;
        const bottomPad = 14 + (this.hintEl.classList.contains('hidden') ? 0 : 44);
        const side = 8;
        const uw = Math.max(50, w - side * 2), uh = Math.max(50, h - hudBottom - bottomPad);
        const cam = this.camera;
        cam.aspect = uw / uh;
        cam.setViewOffset(uw, uh, -side, -hudBottom, w, h);

        const b = this.view.layout.bounds();
        const corners = [];
        for (const x of [b.minX, b.maxX]) for (const z of [b.minZ, b.maxZ]) for (const y of [0, 1.2]) corners.push(new THREE.Vector3(x, y, z));
        // Portrait: steep view. Landscape: lower angle, so the tall board uses more of the screen height.
        const aspect = uw / uh;
        const elev = THREE.MathUtils.degToRad(aspect < 0.8 ? 62 : aspect < 1.3 ? 54 : 44);
        const dirv = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
        const target = new THREE.Vector3(0, 0, (b.minZ + b.maxZ) / 2);
        const project = (d) => {
            cam.position.copy(target).addScaledVector(dirv, d);
            cam.lookAt(target);
            cam.updateMatrixWorld();
            cam.updateProjectionMatrix();
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            // Project with the un-offset projection (fit inside the usable frame).
            const v = new THREE.Vector3();
            for (const c of corners) {
                v.copy(c).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(this.baseProj);
                minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
                minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
            }
            return { minX, maxX, minY, maxY };
        };
        // Base projection for the usable frame (no view offset).
        const tmp = new THREE.PerspectiveCamera(cam.fov, cam.aspect, cam.near, cam.far);
        tmp.updateProjectionMatrix();
        this.baseProj = tmp.projectionMatrix;
        let dist = 30;
        for (let iter = 0; iter < 4; iter++) {
            let lo = 4, hi = 300;
            for (let k = 0; k < 40; k++) {
                const mid = (lo + hi) / 2;
                const p = project(mid);
                if (p.minX >= -0.97 && p.maxX <= 0.97 && p.minY >= -0.97 && p.maxY <= 0.97) hi = mid; else lo = mid;
            }
            dist = hi;
            const p = project(dist);
            const cy = (p.minY + p.maxY) / 2;
            const spanZ = b.maxZ - b.minZ;
            target.z -= cy * (spanZ / Math.max(0.1, p.maxY - p.minY));
        }
        project(dist);
        // Keep the shadow camera tight around the board.
        const s = this.sun.shadow.camera;
        const half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 2;
        s.left = -half; s.right = half; s.top = half; s.bottom = -half;
        s.updateProjectionMatrix();
        this.sun.target.position.set(0, 0, (b.minZ + b.maxZ) / 2);
        this.sun.position.set(-8, 24, (b.minZ + b.maxZ) / 2 + 12);
    }

    onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        this.renderer.setSize(w, h);
        if (this.view && this.view.layout) this.fitCamera();
        else { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const now = performance.now();
        // Real-time clock; only very long gaps (tab in background) are clamped so animations don't skip whole moves.
        const dt = Math.min(0.25, (now - this.last) / 1000);
        this.last = now;
        this.tweens.tick(dt);
        this.view.update(dt);
        this.renderer.render(this.scene, this.camera);
    }

    // ---------------------------------------------------------------- input

    initInput() {
        const ray = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        const el = this.renderer.domElement;
        const pickAt = (cx, cy) => {
            const r = el.getBoundingClientRect();
            ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
            ray.setFromCamera(ndc, this.camera);
            return this.view.pick(ray);
        };
        el.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (window.soundController) window.soundController.init();
            const i = pickAt(e.clientX, e.clientY);
            if (i >= 0) this.game.tap(i);
        });
        el.addEventListener('pointermove', (e) => {
            if (e.pointerType !== 'mouse') return;
            const i = pickAt(e.clientX, e.clientY);
            el.style.cursor = i >= 0 && this.game.state && this.game.state.st[i] === 1 ? 'pointer' : 'default';
        });
        window.addEventListener('keydown', (e) => {
            if ((e.key === 'z' && (e.ctrlKey || e.metaKey)) || e.key === 'u' || e.key === 'Backspace') { e.preventDefault(); this.undo(); }
            else if (e.key === 'r') this.restart();
        });
    }

    // ---------------------------------------------------------------- UI

    initUI() {
        this.hintEl = document.getElementById('hint');
        this.toastEl = document.getElementById('toast');
        this.winBanner = document.getElementById('win-banner');
        this.lossCard = document.getElementById('loss-card');
        this.menu = document.getElementById('menu');
        this.undoBtn = document.getElementById('btn-undo');
        document.getElementById('build-id').textContent = 'Build ' + BUILD_ID;
        const click = (id, fn) => document.getElementById(id).addEventListener('click', () => {
            if (window.soundController) { window.soundController.init(); window.soundController.playClick(); }
            fn();
        });
        click('btn-restart', () => this.restart());
        click('btn-undo', () => this.undo());
        click('btn-next', () => this.next());
        click('btn-loss-undo', () => { this.lossCard.classList.add('hidden'); this.undo(); });
        click('btn-loss-restart', () => { this.lossCard.classList.add('hidden'); this.restart(); });
        click('btn-menu', () => this.openMenu());
        click('btn-menu-close', () => this.menu.classList.add('hidden'));
        click('btn-copy-seed', () => this.copySeed());
        click('btn-fav', () => this.toggleFav());
        document.getElementById('seed-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('seed-input');
            if (this.playSeed(input.value)) { input.value = ''; this.menu.classList.add('hidden'); }
            else {
                const err = document.getElementById('seed-error');
                err.textContent = 'That seed is not valid for this version. Seeds look like g1-hard-1234.';
                err.hidden = false;
            }
        });
        document.getElementById('seed-input').addEventListener('focus', (e) => e.target.select());
        document.getElementById('seed-input').placeholder = `e.g. g${GEN_VERSION}-medium-1234`;
        // Keyboard shortcuts must not fire while typing a seed.
        this.menu.addEventListener('keydown', (e) => e.stopPropagation());
        // Recorded audio: bubble pop on boarding and looping background music (starts on the first tap,
        // since browsers only allow audio after an interaction).
        if (window.soundController) window.soundController.setSampleUrls({ bubble: 'assets/bubble.mp3', music: 'assets/music.mp3' });
        const musicBtn = document.getElementById('btn-music');
        this.musicOn = store.get('music', true);
        musicBtn.textContent = 'Music: ' + (this.musicOn ? 'on' : 'off');
        musicBtn.addEventListener('click', () => {
            this.musicOn = !this.musicOn;
            store.set('music', this.musicOn);
            musicBtn.textContent = 'Music: ' + (this.musicOn ? 'on' : 'off');
            if (window.soundController) window.soundController.setMusic(this.musicOn);
        });
        const startMusicOnce = () => {
            window.removeEventListener('pointerdown', startMusicOnce, true);
            if (window.soundController) {
                window.soundController.init();
                if (this.musicOn) window.soundController.setMusic(true);
            }
        };
        window.addEventListener('pointerdown', startMusicOnce, true);
        const soundBtn = document.getElementById('btn-sound');
        const muted = store.get('muted', false);
        if (muted && window.soundController && !window.soundController.isMuted()) window.soundController.toggleMute();
        soundBtn.textContent = 'Sound: ' + (muted ? 'off' : 'on');
        soundBtn.addEventListener('click', () => {
            const m = window.soundController.toggleMute();
            store.set('muted', m);
            soundBtn.textContent = 'Sound: ' + (m ? 'off' : 'on');
        });
    }

    openMenu() {
        const info = this.game.info || {};
        const where = this.seedMode ? 'Seed play' : `Level ${this.levelNumber}`;
        document.getElementById('level-info').textContent = info.seed
            ? `${where} · ${info.band || ''} · seed ${info.seed}`
            : `${where} · ${info.name || ''} (teaching level)`;
        document.getElementById('btn-copy-seed').disabled = !info.seed;
        const favBtn = document.getElementById('btn-fav');
        favBtn.disabled = !info.seed;
        favBtn.textContent = this.isFav(info.seed) ? '★ Favorited' : '☆ Favorite';
        document.getElementById('seed-error').hidden = true;
        this.renderFavs();
        this.menu.classList.remove('hidden');
    }

    favs() { return store.get('favs', []); }
    isFav(seed) { return !!seed && this.favs().some((f) => f.seed === seed); }

    toggleFav() {
        const info = this.game.info || {};
        if (!info.seed) return;
        let favs = this.favs();
        if (this.isFav(info.seed)) favs = favs.filter((f) => f.seed !== info.seed);
        else favs.unshift({ seed: info.seed, band: info.band || '' });
        store.set('favs', favs.slice(0, 30));
        document.getElementById('btn-fav').textContent = this.isFav(info.seed) ? '★ Favorited' : '☆ Favorite';
        this.renderFavs();
    }

    renderFavs() {
        const el = document.getElementById('fav-list');
        el.textContent = '';
        for (const f of this.favs().slice(0, 12)) {
            const b = document.createElement('button');
            b.className = 'fav-chip';
            b.type = 'button';
            b.textContent = `★ ${f.band ? f.band + ' · ' : ''}${f.seed.split('-').pop()}`;
            b.title = f.seed;
            b.addEventListener('click', () => { this.menu.classList.add('hidden'); this.playSeed(f.seed); });
            el.appendChild(b);
        }
    }

    copySeed() {
        const seed = this.game.info && this.game.info.seed;
        if (!seed) return;
        const done = () => this.toast('Seed copied');
        try {
            navigator.clipboard.writeText(seed).then(done, () => this.selectSeedText(seed));
        } catch {
            this.selectSeedText(seed);
        }
    }

    selectSeedText(seed) {
        const input = document.getElementById('seed-input');
        input.value = seed;
        input.focus();
        input.select();
        this.toast('Seed selected — copy it');
    }

    playSeed(raw) {
        const seed = String(raw || '').trim();
        const entry = this.source.fromSeed(seed);
        if (!entry) return false;
        this.seedMode = true;
        this.winBanner.classList.add('hidden');
        this.lossCard.classList.add('hidden');
        clearTimeout(this.autoNext);
        this.game.load(entry.level, { number: 'Seed', ...entry.info });
        return true;
    }

    toast(msg) {
        this.toastEl.textContent = msg;
        this.toastEl.classList.remove('hidden');
        requestAnimationFrame(() => this.toastEl.classList.add('show'));
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            this.toastEl.classList.remove('show');
            setTimeout(() => this.toastEl.classList.add('hidden'), 200);
        }, 1400);
    }

    /** Restore the level in progress (track or seed play) and its moves after a reload. */
    resume() {
        const s = store.get('session', null);
        this.restoring = true;
        let restored = false;
        if (s && s.mode === 'seed' && s.seed) restored = this.playSeed(s.seed);
        if (!restored) this.loadLevel(this.levelNumber);
        const info = this.game.info || {};
        const same = s && ((s.mode === 'seed' && this.seedMode && s.seed === info.seed) ||
            (s.mode === 'track' && !this.seedMode && s.level === this.levelNumber && (s.seed || null) === (info.seed || null)));
        if (same && Array.isArray(s.moves) && s.moves.length) {
            this.game.restoreMoves(s.moves);
            if (this.game.state && this.game.ended) this.game.restart();
        }
        this.restoring = false;
        this.saveSession();
    }

    saveSession() {
        if (this.restoring || !this.game.L) return;
        const info = this.game.info || {};
        store.set('session', {
            mode: this.seedMode ? 'seed' : 'track',
            level: this.levelNumber,
            seed: info.seed || null,
            moves: this.game.ended ? [] : this.game.moveList()
        });
    }

    loadLevel(n) {
        const entry = this.source.get(n);
        if (!entry) { n = 1; return this.loadLevel(1); }
        this.seedMode = false;
        this.levelNumber = n;
        store.set('level', n);
        this.winBanner.classList.add('hidden');
        this.lossCard.classList.add('hidden');
        clearTimeout(this.autoNext);
        this.game.load(entry.level, { number: n, ...entry.info });
    }

    onLevel(L, info) {
        document.getElementById('level-num').textContent = info.number === 'Seed' ? 'Seed play' : `Level ${info.number}`;
        document.getElementById('level-name').textContent = info.name || (info.band ? info.band : '');
        document.getElementById('btn-next').textContent = this.seedMode ? `Back to level ${this.levelNumber} ➜` : 'Next level ➜';
        if (info.hint) { this.hintEl.textContent = info.hint; this.hintEl.classList.remove('hidden'); }
        else this.hintEl.classList.add('hidden');
        this.fitCamera();
    }

    onState(L, s, undoCount) {
        this.undoBtn.disabled = undoCount === 0;
        this.saveSession();
        if (s.moves > 0) this.hintEl.classList.add('hidden');
        this.renderRibbon();
    }

    /** Ribbon follows the animation (view.visualQi), not the already-resolved core state. */
    renderRibbon() {
        const L = this.game.L;
        if (!L) return;
        // "left" = everyone not yet on a vehicle; the chips are the line still to enter the plaza.
        const qi = Math.min(this.view.visualQi ?? 0, L.queue.length);
        const left = L.queue.length - (this.view.visualDone ?? 0);
        document.getElementById('pax-left').textContent = `${left} left`;
        const runsEl = document.getElementById('runs');
        runsEl.textContent = '';
        const runs = queueRuns(L.queue.slice(qi)).slice(0, VISIBLE_RUNS);
        runs.forEach(([c, n], k) => {
            if (k > 0) {
                const a = document.createElement('span');
                a.className = 'arrow';
                a.textContent = '›';
                runsEl.appendChild(a);
            }
            const chip = document.createElement('span');
            chip.className = 'run' + (k === 0 ? ' front' : '');
            const dot = document.createElement('span');
            dot.className = 'dot';
            dot.style.background = colorInfo(c).css;
            dot.appendChild(symbolSvg(colorInfo(c).symbol));
            chip.appendChild(dot);
            chip.appendChild(document.createTextNode(String(n)));
            chip.title = `${n} × ${c}`;
            runsEl.appendChild(chip);
        });
    }

    onWin() {
        if (window.soundController) window.soundController.playWin();
        this.winBanner.classList.remove('hidden');
        clearTimeout(this.autoNext);
        // The track flows straight on; a seed side-trip waits for the player instead of jumping back.
        if (!this.seedMode) this.autoNext = setTimeout(() => this.next(), 1800);
    }

    onLoss(info) {
        if (window.soundController) window.soundController.playGameOver();
        const reason = info.outcome === 'LOSS_BAYS'
            ? 'Every bay is taken and nobody in the plaza matches a parked vehicle.'
            : 'No vehicle can drive out any more.';
        document.getElementById('loss-reason').textContent = reason;
        this.lossCard.classList.remove('hidden');
    }

    next() {
        clearTimeout(this.autoNext);
        if (this.winBanner.classList.contains('hidden') && !this.game.ended) return;
        // A seed side-trip returns to where the track left off; otherwise advance.
        this.loadLevel(this.seedMode ? this.levelNumber : this.levelNumber + 1);
    }

    undo() {
        clearTimeout(this.autoNext);
        this.winBanner.classList.add('hidden');
        this.lossCard.classList.add('hidden');
        this.game.undo();
    }

    restart() {
        clearTimeout(this.autoNext);
        this.winBanner.classList.add('hidden');
        this.lossCard.classList.add('hidden');
        this.game.restart();
    }
}

function symbolSvg(symbol) {
    // Tiny canvas-drawn symbol converted to an <img> would need a data URL; draw as SVG via canvas path instead.
    const c = document.createElement('canvas');
    c.width = c.height = 22;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    drawSymbol(ctx, symbol, 11, 11, 8);
    c.style.width = c.style.height = '11px';
    return c;
}

// Inline bundles (Artifact build) may run after DOMContentLoaded has already fired.
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => new App());
else new App();
