// src/view/textures.js — load an image texture once, hand out repeat-configured copies.
// URLs stay as "assets/<name>" in source; the Artifact build swaps them for embedded data: URIs.

const images = new Map();

export function loadTexture(url, repeatX = 1, repeatY = 1) {
    const tex = new THREE.Texture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 4;
    const apply = (img) => { tex.image = img; tex.needsUpdate = true; };
    if (images.has(url)) {
        const entry = images.get(url);
        if (entry.img) apply(entry.img); else entry.waiting.push(apply);
    } else {
        const entry = { img: null, waiting: [apply] };
        images.set(url, entry);
        const img = new Image();
        img.onload = () => { entry.img = img; entry.waiting.forEach((f) => f(img)); entry.waiting = []; };
        img.onerror = () => { entry.waiting = []; }; // keep the plain material colour if an asset is missing
        img.src = url;
    }
    return tex;
}
