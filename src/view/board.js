// src/view/board.js — renders a level and *plays back* rule events. It never decides anything:
// the core has already resolved every move; this only animates it. sync() snaps to any state instantly.

import { ST } from '../core/defs.js';
import { Layout, ROAD, BAY_W, BAY_D, LINE_PER_ROW, LINE_VISIBLE } from './layout.js';
import { VehicleView } from './vehicles.js';
import { makePassenger } from './passengers.js';
import { colorInfo } from './palette.js';
import { ease } from './tween.js';

import { loadTexture } from './textures.js';

const DRIVE_SPEED = 17;   // world units / s
const RUN_TIME = 0.26;    // passenger run to the bay
const BOARD_GAP = 0.055;  // stagger between passengers

const mats = {};
const M = (k, make) => (mats[k] ||= make());

export class BoardView {
    constructor(scene, tweens) {
        this.scene = scene;
        this.tw = tweens;
        this.root = new THREE.Group();
        scene.add(this.root);
        this.L = null;
        this.vviews = [];
        this.queueMeshes = [];
        this.settleAt = 0;
    }

    // ---------------------------------------------------------------- build

    load(L, state) {
        this.tw.clear();
        this.clear();
        this.L = L;
        this.layout = new Layout(L);
        this.staticGroup = new THREE.Group();
        this.dynGroup = new THREE.Group();
        this.root.add(this.staticGroup, this.dynGroup);
        this.buildStatic();
        this.vviews = L.vehicles.map((v, i) => {
            const vv = new VehicleView(v, i);
            this.dynGroup.add(vv.group);
            return vv;
        });
        this.sync(state);
    }

    clear() {
        for (const vv of this.vviews) vv.dispose();
        this.vviews = [];
        this.queueMeshes = [];
        if (this.staticGroup) this.root.remove(this.staticGroup);
        if (this.dynGroup) this.root.remove(this.dynGroup);
        this.garageSprites = [];
    }

    buildStatic() {
        const L = this.L, lay = this.layout, g = this.staticGroup;
        const roadMat = M('road', () => new THREE.MeshStandardMaterial({ color: 0x5b6478, roughness: 0.9 }));
        const lotMat = M('lot', () => new THREE.MeshStandardMaterial({ color: 0xe9e4f5, roughness: 0.85 }));
        const lineMat = M('line', () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
        const dotMat = M('dot', () => new THREE.MeshBasicMaterial({ color: 0xcfc6e6 }));

        const box = (w, h, d, m, x, y, z) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x, y, z);
            mesh.receiveShadow = true;
            g.add(mesh);
            return mesh;
        };

        // Ring road (one slab under lot + apron + bays) then the lot on top.
        const halfW = Math.max(L.cols / 2 + ROAD, (L.bays * BAY_W) / 2 + 0.35);
        const top = lay.bayTop - 0.25;
        const bottom = L.rows + ROAD;
        box(halfW * 2, 0.1, bottom - top, roadMat, 0, -0.05, (top + bottom) / 2);
        box(L.cols + 0.16, 0.12, L.rows + 0.16, lotMat, 0, 0.0, L.rows / 2);
        // Play-mat surface (Flow texture): one mat square per grid cell (the tile has 8×8 squares).
        const matTex = loadTexture('assets/playmat.jpg', L.cols / 8, L.rows / 8);
        const mat = new THREE.Mesh(new THREE.PlaneGeometry(L.cols, L.rows),
            new THREE.MeshStandardMaterial({ map: matTex, color: 0xe4dcf2, roughness: 0.95 }));
        mat.rotation.x = -Math.PI / 2;
        mat.position.set(0, 0.062, L.rows / 2);
        mat.receiveShadow = true;
        g.add(mat);

        void dotMat; // cell dots replaced by the play-mat squares

        // Bays: white outlines.
        this.bayMeshes = [];
        for (let b = 0; b < L.bays; b++) {
            const c = lay.bayCenter(b, BAY_D - 0.3);
            const outline = new THREE.Group();
            const w = BAY_W - 0.18, d = BAY_D - 0.4;
            const t = 0.07;
            for (const [bw, bd, ox, oz] of [[w, t, 0, -d / 2], [t, d, -w / 2, 0], [t, d, w / 2, 0]]) {
                const m = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.02, bd), lineMat);
                m.position.set(ox, 0.01, oz);
                outline.add(m);
            }
            const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0 }));
            fill.rotation.x = -Math.PI / 2;
            fill.position.y = 0.012;
            outline.add(fill);
            outline.position.set(c.x, 0.0, lay.bayTop + 0.2 + d / 2);
            g.add(outline);
            this.bayMeshes.push({ outline, fill });
        }

        // Plaza: an oval walkway (passengers circle on it) around a little lawn, with a gate at the top where
        // the incoming line joins.
        const walkMat = M('walk', () => new THREE.MeshStandardMaterial({ color: 0xc9b99a, roughness: 0.9 }));
        const lawnMat = M('lawn', () => new THREE.MeshStandardMaterial({ color: 0x9fdc8a, roughness: 0.9 }));
        const edgeMat = M('walkEdge', () => new THREE.MeshStandardMaterial({ color: 0x8c7b62, roughness: 0.9 }));
        const ovalRing = (inner, outer, mat, y) => {
            const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), mat);
            m.rotation.x = -Math.PI / 2;
            m.scale.set(1, lay.plazaRZ / lay.plazaRX, 1); // circle → oval (scale applies before rotation)
            m.position.set(0, y, lay.plazaZ);
            m.receiveShadow = true;
            g.add(m);
            return m;
        };
        const rx = lay.plazaRX;
        ovalRing(rx - 0.42, rx + 0.42, edgeMat, 0.005);
        ovalRing(rx - 0.36, rx + 0.36, walkMat, 0.01);
        const lawn = new THREE.Mesh(new THREE.CircleGeometry(rx - 0.42, 48), lawnMat);
        lawn.rotation.x = -Math.PI / 2;
        lawn.scale.set(1, lay.plazaRZ / rx, 1);
        lawn.position.set(0, 0.012, lay.plazaZ);
        g.add(lawn);
        // Path from the plaza down to the bays, and the incoming line's walkway.
        const path = new THREE.Mesh(new THREE.PlaneGeometry(1.0, Math.max(0.2, lay.bayTop - (lay.plazaZ + lay.plazaRZ) + 0.2)), walkMat);
        path.rotation.x = -Math.PI / 2;
        path.position.set(0, 0.008, (lay.bayTop + lay.plazaZ + lay.plazaRZ) / 2);
        g.add(path);
        const lineLen = (LINE_PER_ROW - 1) * 0.64 + 1.0;
        for (const row of [0, 1]) {
            const strip = new THREE.Mesh(new THREE.PlaneGeometry(lineLen, 0.56), walkMat);
            strip.rotation.x = -Math.PI / 2;
            strip.position.set(0.35 + lineLen / 2 - 0.5, 0.008, lay.lineZ - row * 0.72);
            g.add(strip);
        }
        // Plaza capacity badge, so the limit is readable.
        const cap = document.createElement('canvas');
        cap.width = 160; cap.height = 64;
        const cctx = cap.getContext('2d');
        cctx.fillStyle = 'rgba(255,255,255,0.92)';
        cctx.beginPath();
        cctx.roundRect ? cctx.roundRect(4, 6, 152, 52, 26) : cctx.rect(4, 6, 152, 52);
        cctx.fill();
        cctx.fillStyle = '#26314a';
        cctx.font = '800 30px Fredoka, Nunito, system-ui, sans-serif';
        cctx.textAlign = 'center';
        cctx.textBaseline = 'middle';
        cctx.fillText(`plaza ${lay.pool}`, 80, 33);
        const capSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cap), transparent: true, depthTest: false }));
        capSp.scale.set(1.25, 0.5, 1);
        capSp.position.set(0, 0.6, lay.plazaZ);
        capSp.renderOrder = 9;
        g.add(capSp);

        // Walls (toy cones) and garages.
        const wallMat = M('wall', () => new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.55 }));
        const stripeMat = M('stripe', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
        const baseMat = M('conebase', () => new THREE.MeshStandardMaterial({ color: 0x2b3245, roughness: 0.7 }));
        for (const [x, y] of L.walls) {
            const c = lay.cellCenter(x, y);
            const grp = new THREE.Group();
            const base = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.08, 0.78), baseMat);
            base.position.y = 0.1;
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.95, 20), wallMat);
            cone.position.y = 0.6;
            cone.castShadow = true;
            const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.14, 20), stripeMat);
            stripe.position.y = 0.62;
            grp.add(base, cone, stripe);
            grp.position.set(c.x, 0, c.z);
            g.add(grp);
        }
        const garMat = M('garage', () => new THREE.MeshStandardMaterial({ color: 0x8a7bd8, roughness: 0.6 }));
        const doorMat = M('door', () => new THREE.MeshStandardMaterial({ color: 0x3b3363, roughness: 0.8 }));
        this.garageSprites = L.garages.map((G) => {
            const c = lay.cellCenter(G.x, G.y);
            const grp = new THREE.Group();
            const house = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.75, 0.92), garMat);
            house.position.y = 0.4;
            house.castShadow = true;
            const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.0, 0.66, 0.36, 4, 1), garMat);
            roof.rotation.y = Math.PI / 4;
            roof.position.y = 0.95;
            const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.05), doorMat);
            door.position.set(0, 0.3, -0.47);
            grp.add(house, roof, door);
            grp.position.set(c.x, 0, c.z);
            grp.rotation.y = { U: 0, R: -Math.PI / 2, D: Math.PI, L: Math.PI / 2 }[G.dir];
            g.add(grp);
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 96;
            const tex = new THREE.CanvasTexture(canvas);
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
            sp.scale.set(0.95, 0.72, 1);
            sp.position.set(c.x, 1.65, c.z);
            sp.renderOrder = 11;
            g.add(sp);
            return { canvas, tex, sp };
        });
    }

    updateGarage(gi, state) {
        const G = this.L.garages[gi];
        const gs = this.garageSprites[gi];
        const left = G.ids.length - state.gptr[gi];
        const ctx = gs.canvas.getContext('2d');
        ctx.clearRect(0, 0, 128, 96);
        gs.sp.visible = left > 0;
        if (left <= 0) { gs.tex.needsUpdate = true; return; }
        const next = this.L.vehicles[G.ids[state.gptr[gi]]];
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(6, 8, 116, 72, 30) : ctx.rect(6, 8, 116, 72);
        ctx.fill();
        // House glyph tinted with the next vehicle's colour, then "×N" still inside the garage.
        ctx.fillStyle = colorInfo(next.color).css;
        ctx.beginPath();
        ctx.moveTo(18, 40); ctx.lineTo(40, 20); ctx.lineTo(62, 40); ctx.lineTo(62, 68); ctx.lineTo(18, 68);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(31, 48, 18, 20);
        ctx.fillStyle = '#26314a';
        ctx.font = '800 34px Fredoka, Nunito, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('×' + left, 92, 46);
        gs.tex.needsUpdate = true;
    }

    // ---------------------------------------------------------------- snap to state

    sync(state) {
        this.tw.clear();
        const L = this.L, lay = this.layout;
        this.state = state;
        L.vehicles.forEach((v, i) => {
            const vv = this.vviews[i];
            vv.group.scale.set(1, 1, 1);
            vv.body.position.set(0, 0, 0);
            vv.body.rotation.set(0, 0, 0);
            vv.arrival = 0;
            vv.viewBoarded = state.boarded[i];
            const st = state.st[i];
            vv.group.visible = st === ST.LOT || st === ST.BAY;
            vv.badge.visible = st === ST.BAY;
            if (st === ST.LOT) {
                const c = lay.vehicleCenter(v);
                vv.group.position.set(c.x, 0.06, c.z);
                vv.setFacing(v.dir);
            } else if (st === ST.BAY) {
                const b = Array.from(state.bays).indexOf(i);
                const c = lay.bayCenter(b, v.len);
                vv.group.position.set(c.x, 0.0, c.z);
                vv.setFacing('U');
                vv.setSeats(v.cap - state.boarded[i]);
            }
        });
        L.garages.forEach((_, gi) => this.updateGarage(gi, state));
        // Plaza (people circling) and the incoming line.
        for (const m of this.poolMeshes || []) this.dynGroup.remove(m);
        for (const m of this.lineMeshes || []) this.dynGroup.remove(m);
        this.poolMeshes = [];
        this.lineMeshes = [];
        this.slotTaken = new Array(L.pool).fill(false);
        this.ringAngle = this.ringAngle || 0;
        state.pool.forEach((color) => {
            const m = makePassenger(color);
            m.userData.slot = this.takeSlot();
            m.userData.inRing = true;
            this.dynGroup.add(m);
            this.poolMeshes.push(m);
        });
        this.lineHead = state.qi;
        for (let k = 0; k < LINE_VISIBLE && state.qi + k < L.queue.length; k++) {
            const m = makePassenger(L.queue[state.qi + k]);
            const p = lay.lineSlot(k);
            m.position.set(p.x, 0, p.z);
            m.rotation.y = -Math.PI / 2; // walking toward the gate (left)
            this.dynGroup.add(m);
            this.lineMeshes.push(m);
        }
        this.visualDone = state.done;
        this.visualQi = state.qi;
        if (this.onVisual) this.onVisual();
        this.update(0);
        this.boardCursor = this.tw.time;
        this.settleAt = this.tw.time;
        this.bayMeshes.forEach((b) => (b.fill.material.opacity = 0));
    }

    // ---------------------------------------------------------------- playback

    /** Animate the events of one move. Returns the time (tween clock) when everything has settled. */
    play(events, state) {
        this.state = state;
        const now = this.tw.time;
        for (const e of events) {
            if (e.type === 'exit') this.animExit(e, now);
            else if (e.type === 'spawn') this.animSpawn(e, now + 0.12);
            else if (e.type === 'board') this.animBoard(e);
            else if (e.type === 'enter') this.animEnter(e);
            else if (e.type === 'depart') this.animDepart(e);
        }
        this.L.garages.forEach((_, gi) => this.updateGarage(gi, state));
        return this.settleAt;
    }

    animExit(e, now) {
        const vv = this.vviews[e.vehicle];
        const v = this.L.vehicles[e.vehicle];
        const pts = this.layout.exitPath(v, e.bay);
        const segs = [];
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
            const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
            segs.push({ a: pts[i - 1], b: pts[i], d, s: total });
            total += d;
        }
        const dur = Math.min(0.62, Math.max(0.32, total / DRIVE_SPEED));
        vv.arrival = now + dur;
        vv.viewBoarded = 0;
        vv.setSeats(v.cap);
        this.tw.add({
            duration: dur,
            easing: ease.inOutQuad,
            update: (k) => {
                const dist = k * total;
                let seg = segs[segs.length - 1];
                for (const s of segs) if (dist <= s.s + s.d) { seg = s; break; }
                const t = seg.d > 0 ? (dist - seg.s) / seg.d : 1;
                vv.group.position.set(seg.a.x + (seg.b.x - seg.a.x) * t, 0.0, seg.a.z + (seg.b.z - seg.a.z) * t);
                const dx = seg.b.x - seg.a.x, dz = seg.b.z - seg.a.z;
                if (Math.hypot(dx, dz) > 1e-3) vv.group.rotation.y = Math.atan2(-dx, -dz);
            },
            done: () => {
                vv.setFacing('U');
                vv.badge.visible = true;
                // Little settle bounce.
                this.tw.add({ duration: 0.18, update: (k) => { vv.body.position.y = Math.sin(k * Math.PI) * 0.12; } });
                if (window.soundController) window.soundController.playPark?.();
            }
        });
        this.settleAt = Math.max(this.settleAt, vv.arrival);
    }

    animSpawn(e, at) {
        const vv = this.vviews[e.vehicle];
        const v = this.L.vehicles[e.vehicle];
        const c = this.layout.vehicleCenter(v);
        vv.setFacing(v.dir);
        this.tw.add({
            delay: at - this.tw.time,
            duration: 0.3,
            easing: ease.outBack,
            start: () => { vv.group.visible = true; vv.group.position.set(c.x, 0.06, c.z); },
            update: (k) => vv.group.scale.set(1, Math.max(0.01, k), Math.max(0.01, k))
        });
    }

    // ---------------------------------------------------------------- plaza helpers

    slotAngle(slot) {
        return this.ringAngle + (Math.PI * 2 * slot) / this.L.pool;
    }

    /** Free slot whose current position is closest to the gate. */
    takeSlot() {
        let best = -1, bestD = Infinity;
        const gate = this.layout.gateAngle;
        for (let i = 0; i < this.slotTaken.length; i++) {
            if (this.slotTaken[i]) continue;
            let d = Math.abs(((this.slotAngle(i) - gate) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
            if (d < bestD) { bestD = d; best = i; }
        }
        if (best >= 0) this.slotTaken[best] = true;
        return Math.max(0, best);
    }

    /** Per-frame: people in the plaza keep walking around the oval. */
    update(dt) {
        if (!this.L || !this.poolMeshes) return;
        this.ringAngle += dt * 0.22;
        const lay = this.layout;
        for (const m of this.poolMeshes) {
            if (!m.userData.inRing) continue;
            const a = this.slotAngle(m.userData.slot);
            const p = lay.plazaPoint(a);
            m.position.set(p.x, Math.abs(Math.sin(this.tw.time * 9 + m.userData.slot)) * 0.04, p.z);
            // Face the walking direction (tangent of the oval).
            const tx = -Math.sin(a) * lay.plazaRX, tz = Math.cos(a) * lay.plazaRZ;
            m.rotation.y = Math.atan2(tx, tz);
        }
    }

    animBoard(e) {
        const vv = this.vviews[e.vehicle];
        const m = this.poolMeshes.splice(e.slot, 1)[0];
        const t0 = Math.max(this.tw.time, vv.arrival - 0.12, this.boardCursor + BOARD_GAP);
        this.boardCursor = t0;
        const door = this.layout.bayDoor(e.bay);
        if (m) {
            const start = { x: 0, z: 0 };
            this.tw.add({
                delay: t0 - this.tw.time,
                duration: RUN_TIME,
                start: () => {
                    m.userData.inRing = false;
                    this.slotTaken[m.userData.slot] = false;
                    start.x = m.position.x; start.z = m.position.z;
                    m.rotation.y = Math.atan2(door.x - start.x, door.z - start.z);
                },
                update: (k) => {
                    m.position.set(start.x + (door.x - start.x) * k, Math.abs(Math.sin(k * Math.PI * 2)) * 0.18, start.z + (door.z - start.z) * k);
                    m.scale.setScalar(Math.max(0.01, 1 - Math.max(0, k - 0.75) * 3));
                },
                done: () => {
                    this.dynGroup.remove(m);
                    this.visualDone++;
                    if (this.onVisual) this.onVisual();
                    vv.viewBoarded++;
                    vv.setSeats(vv.v.cap - vv.viewBoarded);
                    if (vv.viewBoarded >= vv.v.cap) vv.badge.visible = false;
                    if (window.soundController) window.soundController.playBubble(vv.viewBoarded / vv.v.cap);
                }
            });
        }
        vv.lastBoardEnd = t0 + RUN_TIME;
        this.settleAt = Math.max(this.settleAt, vv.lastBoardEnd);
    }

    /** The head of the line walks into the plaza; the line shuffles forward and a new person joins the tail. */
    animEnter(e) {
        const lay = this.layout;
        const m = this.lineMeshes.shift();
        this.lineHead++;
        const t0 = Math.max(this.tw.time, this.boardCursor + 0.03);
        if (m) {
            this.poolMeshes.push(m);
            const start = { x: 0, z: 0 };
            this.tw.add({
                delay: t0 - this.tw.time,
                duration: 0.3,
                start: () => {
                    m.userData.slot = this.takeSlot();
                    start.x = m.position.x; start.z = m.position.z;
                    this.visualQi++;
                    if (this.onVisual) this.onVisual();
                },
                update: (k) => {
                    const p = lay.plazaPoint(this.slotAngle(m.userData.slot));
                    m.position.set(start.x + (p.x - start.x) * k, Math.abs(Math.sin(k * Math.PI * 2)) * 0.12, start.z + (p.z - start.z) * k);
                },
                done: () => { m.userData.inRing = true; }
            });
        }
        // Line shuffles forward; a new person appears at the tail.
        this.lineMeshes.forEach((pm, k) => {
            const target = lay.lineSlot(k);
            const from = { x: 0, z: 0 };
            this.tw.add({
                delay: t0 + 0.02 - this.tw.time, duration: 0.16,
                start: () => { from.x = pm.position.x; from.z = pm.position.z; },
                update: (q) => pm.position.set(from.x + (target.x - from.x) * q, 0, from.z + (target.z - from.z) * q)
            });
        });
        const nextIdx = this.lineHead + this.lineMeshes.length;
        if (this.lineMeshes.length < LINE_VISIBLE && nextIdx < this.L.queue.length) {
            const nm = makePassenger(this.L.queue[nextIdx]);
            const p = lay.lineSlot(this.lineMeshes.length);
            nm.position.set(p.x, 0, p.z);
            nm.rotation.y = -Math.PI / 2;
            nm.scale.setScalar(0.01);
            this.dynGroup.add(nm);
            this.lineMeshes.push(nm);
            this.tw.add({ delay: t0 + 0.02 - this.tw.time, duration: 0.2, easing: ease.outBack, update: (q) => nm.scale.setScalar(Math.max(0.01, q)) });
        }
        this.settleAt = Math.max(this.settleAt, t0 + 0.3);
    }

    animDepart(e) {
        const vv = this.vviews[e.vehicle];
        const at = Math.max(vv.lastBoardEnd || 0, vv.arrival) + 0.08;
        // Back out of the bay onto the apron road, then drive off to the right with a little hop of joy.
        const start = { x: 0, z: 0 };
        const lay = this.layout;
        const exitX = lay.rightRoad + 8;
        const apronZ = lay.apronZ;
        this.tw.add({
            delay: at - this.tw.time,
            duration: 0.22,
            easing: ease.inOutQuad,
            start: () => {
                vv.badge.visible = false;
                start.x = vv.group.position.x; start.z = vv.group.position.z;
                if (window.soundController) window.soundController.playBusDepart();
            },
            update: (k) => {
                vv.group.position.set(start.x, Math.sin(k * Math.PI) * 0.25, start.z + (apronZ - start.z) * k);
            },
            done: () => {
                vv.group.rotation.y = -Math.PI / 2; // face right
                const sx = vv.group.position.x, sz = apronZ;
                this.tw.add({
                    duration: 0.38,
                    easing: ease.inQuad,
                    update: (k) => vv.group.position.set(sx + (exitX - sx) * k, 0, sz),
                    done: () => { vv.group.visible = false; }
                });
            }
        });
        this.settleAt = Math.max(this.settleAt, at + 0.6);
    }

    // ---------------------------------------------------------------- feedback

    shake(i) {
        const vv = this.vviews[i];
        if (!vv) return;
        const v = this.L.vehicles[i];
        // Nudge forward along the arrow and bounce back.
        this.tw.add({
            duration: 0.3,
            update: (k) => { vv.body.position.z = -Math.sin(k * Math.PI * 3) * (1 - k) * 0.16; }
        });
        void v;
    }

    pulseVehicle(i) {
        const vv = this.vviews[i];
        if (!vv) return;
        this.tw.add({ duration: 0.4, update: (k) => { vv.body.position.y = Math.sin(k * Math.PI * 2) * 0.1 * (1 - k); } });
    }

    flashBays() {
        for (const b of this.bayMeshes) {
            this.tw.add({ duration: 0.5, update: (k) => { b.fill.material.opacity = Math.sin(k * Math.PI) * 0.35; } });
        }
    }

    /** Vehicle index under a raycast hit, or -1. */
    pick(raycaster) {
        const hits = raycaster.intersectObjects(this.dynGroup.children, true);
        for (const h of hits) {
            let o = h.object;
            while (o && o !== this.dynGroup) {
                if (o.userData && o.userData.vehicleIndex !== undefined) return o.userData.vehicleIndex;
                o = o.parent;
            }
        }
        return -1;
    }
}
