// src/view/passengers.js — little peg-people for the queue.

import { colorInfo } from './palette.js';

const cache = new Map();
const get = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };

export function makePassenger(color) {
    const g = new THREE.Group();
    const m = get('pm:' + color, () => new THREE.MeshStandardMaterial({ color: colorInfo(color).hex, roughness: 0.5 }));
    const bodyGeo = get('pbody', () => new THREE.CylinderGeometry(0.15, 0.19, 0.4, 12));
    const headGeo = get('phead', () => new THREE.SphereGeometry(0.16, 14, 12));
    const eyeGeo = get('peye', () => new THREE.SphereGeometry(0.028, 6, 6));
    const eyeMat = get('peyem', () => new THREE.MeshBasicMaterial({ color: 0x1b2236 }));
    const body = new THREE.Mesh(bodyGeo, m);
    body.position.y = 0.22;
    body.castShadow = true;
    const head = new THREE.Mesh(headGeo, m);
    head.position.y = 0.55;
    head.castShadow = true;
    g.add(body, head);
    for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(eyeGeo, eyeMat);
        e.position.set(sx * 0.055, 0.58, 0.14);
        g.add(e);
    }
    g.userData.color = color;
    g.children.forEach((c) => { c.position.multiplyScalar(1.25); c.scale.setScalar(1.25); });
    return g;
}
