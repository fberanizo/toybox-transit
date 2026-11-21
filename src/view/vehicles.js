// src/view/vehicles.js — chunky toy vehicles built from rounded extrusions. Nose points to local -Z.

import { colorInfo, drawSymbol } from './palette.js';

const geoCache = new Map();
const matCache = new Map();

function roundedRectShape(w, l, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -l / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + l - r); s.quadraticCurveTo(x + w, y + l, x + w - r, y + l);
    s.lineTo(x + r, y + l); s.quadraticCurveTo(x, y + l, x, y + l - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
}

/** Rounded "toy block": footprint w × l, height h, soft bevel. Sits on y = 0. */
function toyBlock(w, l, h, r = 0.14, bevel = 0.06) {
    const key = `blk:${w.toFixed(2)}:${l.toFixed(2)}:${h.toFixed(2)}:${r}:${bevel}`;
    if (geoCache.has(key)) return geoCache.get(key);
    const shape = roundedRectShape(w - bevel * 2, l - bevel * 2, Math.max(0.01, r - bevel));
    const g = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.01, h - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
        bevelSegments: 3, curveSegments: 6
    });
    g.rotateX(Math.PI / 2);          // extrude along -Y …
    g.translate(0, h - bevel, 0);    // … then lift so the block sits on y = 0
    g.computeVertexNormals();
    geoCache.set(key, g);
    return g;
}

function mat(key, make) {
    if (!matCache.has(key)) matCache.set(key, make());
    return matCache.get(key);
}

const bodyMat = (color) => mat('body:' + color, () => new THREE.MeshStandardMaterial({ color: colorInfo(color).hex, roughness: 0.45, metalness: 0.0 }));
const darkMat = () => mat('dark', () => new THREE.MeshStandardMaterial({ color: 0x2b3245, roughness: 0.7 }));
const glassMat = () => mat('glass', () => new THREE.MeshStandardMaterial({ color: 0xcfeaff, roughness: 0.15, metalness: 0.1 }));
const whiteMat = () => mat('white', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0x555555 }));
const outlineMat = () => mat('outline', () => new THREE.MeshBasicMaterial({ color: 0x1f2740 }));
const skirtMat = (color) => mat('skirt:' + color, () => new THREE.MeshStandardMaterial({ color: colorInfo(color).dark, roughness: 0.6 }));

function arrowGeo() {
    if (geoCache.has('arrow')) return geoCache.get('arrow');
    const s = new THREE.Shape();
    // Fat arrow pointing to -Y in shape space (→ -Z after rotation).
    s.moveTo(0, -0.42);
    s.lineTo(0.34, -0.02);
    s.lineTo(0.13, -0.02);
    s.lineTo(0.13, 0.36);
    s.lineTo(-0.13, 0.36);
    s.lineTo(-0.13, -0.02);
    s.lineTo(-0.34, -0.02);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 });
    g.rotateX(Math.PI / 2);
    geoCache.set('arrow', g);
    return g;
}

function arrowPlane() {
    if (!geoCache.has('arrowPlane')) geoCache.set('arrowPlane', new THREE.PlaneGeometry(0.86, 0.86));
    return geoCache.get('arrowPlane');
}

/** Canvas decal: a fat rounded arrow pointing up the texture (→ the vehicle's nose after rotation). */
function arrowDecalMat() {
    return mat('arrowDecal', () => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const ctx = c.getContext('2d');
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(64, 12);
        ctx.lineTo(112, 62);
        ctx.lineTo(82, 62);
        ctx.lineTo(82, 112);
        ctx.lineTo(46, 112);
        ctx.lineTo(46, 62);
        ctx.lineTo(16, 62);
        ctx.closePath();
        ctx.lineWidth = 14;
        ctx.strokeStyle = '#1f2740';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        const t = new THREE.CanvasTexture(c);
        t.anisotropy = 4;
        return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    });
}

function symbolTexture(color) {
    return mat('sym:' + color, () => {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        drawSymbol(ctx, colorInfo(color).symbol, 32, 32, 24);
        const t = new THREE.CanvasTexture(c);
        return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
    });
}

// Silhouettes: car = low with a cabin bump; van = tall boxy block; bus = long, a little lower than the van,
// with a full window band. Length (2/3/4 cells) is the main tell; height and roof shape back it up.
const DIMS = {
    car: { w: 0.76, h: 0.36, cabin: 0.3, cabinFrac: 0.6, wheels: 2 },
    van: { w: 0.86, h: 0.9, cabin: 0, cabinFrac: 0, wheels: 2 },
    bus: { w: 0.9, h: 0.7, cabin: 0, cabinFrac: 0, wheels: 3 }
};

export class VehicleView {
    /** @param v normalised vehicle {kind,color,dir,len,cap} @param index vehicle index in the level */
    constructor(v, index) {
        this.v = v;
        this.index = index;
        this.group = new THREE.Group();
        this.group.userData.vehicleIndex = index;
        this.body = new THREE.Group();          // inner group for squash/hop without fighting position tweens
        this.group.add(this.body);
        this.build();
        this.badge = this.makeBadge();
        this.badge.visible = false;
        this.group.add(this.badge);
        this.seats = v.cap;
        this.setFacing(v.dir);
    }

    build() {
        const { kind, color, len } = this.v;
        const d = DIMS[kind];
        const L = len - 0.16;
        // Dark chassis skirt: separates neighbouring vehicles of the same colour and reads as a toy base.
        const skirt = new THREE.Mesh(toyBlock(d.w + 0.04, L + 0.02, 0.2, 0.18, 0.05), skirtMat(color));
        skirt.position.y = 0.08;
        skirt.castShadow = true;
        this.body.add(skirt);
        const body = new THREE.Mesh(toyBlock(d.w, L, d.h + 0.1, 0.16), bodyMat(color));
        body.position.y = 0.16;
        body.castShadow = true;
        body.receiveShadow = true;
        this.body.add(body);
        let roofY = 0.16 + d.h + 0.1;

        if (kind === 'car') {
            const cab = new THREE.Mesh(toyBlock(d.w * 0.9, L * d.cabinFrac, d.cabin, 0.12, 0.05), bodyMat(color));
            cab.position.set(0, roofY - 0.02, 0.06);
            cab.castShadow = true;
            this.body.add(cab);
            const glass = new THREE.Mesh(toyBlock(d.w * 0.92, L * d.cabinFrac * 0.86, d.cabin * 0.62, 0.1, 0.03), glassMat());
            glass.position.set(0, roofY + 0.02, 0.06);
            this.body.add(glass);
            roofY += d.cabin - 0.02;
        } else {
            // Window band around the upper body.
            const band = new THREE.Mesh(toyBlock(d.w + 0.02, L - 0.3, 0.2, 0.14, 0.03), glassMat());
            band.position.set(0, 0.16 + d.h * 0.62, kind === 'bus' ? 0 : 0.05);
            this.body.add(band);
            // Windscreen accent at the nose.
            const ws = new THREE.Mesh(toyBlock(d.w * 0.86, 0.12, d.h * 0.42, 0.04, 0.02), glassMat());
            ws.position.set(0, 0.16 + d.h * 0.45, -L / 2 + 0.03);
            this.body.add(ws);
        }

        // Wheels.
        const wheelGeo = geoCache.get('wheel') || (() => {
            const g = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14);
            g.rotateZ(Math.PI / 2);
            geoCache.set('wheel', g);
            return g;
        })();
        const n = d.wheels;
        for (let i = 0; i < n; i++) {
            const z = -L / 2 + 0.38 + (i * (L - 0.76)) / Math.max(1, n - 1);
            for (const sx of [-1, 1]) {
                const w = new THREE.Mesh(wheelGeo, darkMat());
                w.position.set(sx * (d.w / 2 - 0.02), 0.17, z);
                this.body.add(w);
            }
        }

        // Roof arrow decal: white fill with a dark rounded stroke, so it reads on every body colour.
        const az = kind === 'car' ? -0.02 : -L * 0.12;
        const s = kind === 'car' ? 1.0 : 1.2; // car arrow must stay within its cabin roof
        const arrow = new THREE.Mesh(arrowPlane(), arrowDecalMat());
        arrow.rotation.x = -Math.PI / 2;
        arrow.position.set(0, roofY + 0.015, az);
        arrow.scale.setScalar(s);
        arrow.renderOrder = 2;
        this.body.add(arrow);
        void arrowGeo; void outlineMat; void whiteMat;
        // Colour symbol on every vehicle: on the hood for cars, near the tail for vans and buses.
        const sym = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), symbolTexture(color));
        sym.rotation.x = -Math.PI / 2;
        if (kind === 'car') sym.position.set(0, 0.16 + d.h + 0.105, -L / 2 + 0.2);
        else sym.position.set(0, roofY + 0.012, L / 2 - 0.4);
        if (kind === 'car') sym.scale.setScalar(0.72);
        this.body.add(sym);
        this.roofY = roofY;
    }

    makeBadge() {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 80;
        this.badgeCanvas = c;
        const tex = new THREE.CanvasTexture(c);
        tex.minFilter = THREE.LinearFilter;
        this.badgeTex = tex;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        sp.scale.set(0.95, 0.6, 1);
        // Shown only while docked (nose up): sits on the bay floor just behind the tail, off the roof arrow.
        sp.position.set(0, 0.35, this.v.len / 2 + 0.42);
        sp.renderOrder = 10;
        return sp;
    }

    setSeats(n) {
        this.seats = n;
        const ctx = this.badgeCanvas.getContext('2d');
        ctx.clearRect(0, 0, 128, 80);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(10, 8, 108, 64, 28) : ctx.rect(10, 8, 108, 64);
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = colorInfo(this.v.color).css;
        ctx.stroke();
        // Seats left: a little person glyph + number.
        ctx.fillStyle = colorInfo(this.v.color).css;
        ctx.beginPath();
        ctx.arc(40, 30, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(29, 40, 22, 20, 8) : ctx.rect(29, 40, 22, 20);
        ctx.fill();
        ctx.fillStyle = '#26314a';
        ctx.font = '800 40px Fredoka, Nunito, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), 80, 43);
        this.badgeTex.needsUpdate = true;
    }

    setFacing(dir) {
        const yaw = { U: 0, R: -Math.PI / 2, D: Math.PI, L: Math.PI / 2 }[dir] ?? 0;
        this.group.rotation.y = yaw;
        this.badge.material.rotation = 0;
    }

    dispose() {
        this.badgeTex.dispose();
        this.badge.material.dispose();
    }
}
