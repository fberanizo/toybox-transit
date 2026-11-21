// src/view/palette.js — colours used by the 3D view and the DOM HUD.
// Each colour also has a symbol so colours never have to be told apart by hue alone.

// Hues are spread so that neighbours differ in lightness as well as hue (red is deep, pink is pale,
// purple leans violet-blue); the symbol is the second, colour-independent cue.
export const PALETTE = {
    red:    { hex: 0xe8433a, css: '#e8433a', dark: 0xa52a23, symbol: 'heart' },
    blue:   { hex: 0x2f7cf6, css: '#2f7cf6', dark: 0x1d52b0, symbol: 'drop' },
    yellow: { hex: 0xffcc33, css: '#ffcc33', dark: 0xc98f0a, symbol: 'star' },
    green:  { hex: 0x2fbf62, css: '#2fbf62', dark: 0x1b8040, symbol: 'leaf' },
    purple: { hex: 0x7b5cf0, css: '#7b5cf0', dark: 0x4f35b0, symbol: 'moon' },
    pink:   { hex: 0xff93cc, css: '#ff93cc', dark: 0xd0619c, symbol: 'diamond' }
};

export const colorInfo = (key) => PALETTE[key] || PALETTE.blue;

/** Draw a colour's symbol centred at (x, y) with radius r on a 2D canvas context (filled with current fillStyle). */
export function drawSymbol(ctx, symbol, x, y, r) {
    ctx.beginPath();
    switch (symbol) {
        case 'heart': {
            ctx.moveTo(x, y + r * 0.85);
            ctx.bezierCurveTo(x - r * 1.3, y - r * 0.1, x - r * 0.55, y - r * 1.05, x, y - r * 0.35);
            ctx.bezierCurveTo(x + r * 0.55, y - r * 1.05, x + r * 1.3, y - r * 0.1, x, y + r * 0.85);
            break;
        }
        case 'drop': {
            ctx.moveTo(x, y - r);
            ctx.bezierCurveTo(x + r * 0.2, y - r * 0.5, x + r * 0.85, y, x + r * 0.75, y + r * 0.35);
            ctx.arc(x, y + r * 0.3, r * 0.75, 0.05, Math.PI - 0.05);
            ctx.bezierCurveTo(x - r * 0.85, y, x - r * 0.2, y - r * 0.5, x, y - r);
            break;
        }
        case 'star': {
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + (i * Math.PI) / 5;
                const rr = i % 2 === 0 ? r : r * 0.45;
                const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            break;
        }
        case 'leaf': {
            ctx.moveTo(x - r * 0.8, y + r * 0.8);
            ctx.quadraticCurveTo(x - r * 0.9, y - r * 0.9, x + r * 0.85, y - r * 0.85);
            ctx.quadraticCurveTo(x + r * 0.9, y + r * 0.9, x - r * 0.8, y + r * 0.8);
            break;
        }
        case 'moon': {
            ctx.arc(x, y, r * 0.9, Math.PI * 0.35, Math.PI * 1.65);
            ctx.arc(x + r * 0.42, y - r * 0.05, r * 0.68, Math.PI * 1.55, Math.PI * 0.45, true);
            break;
        }
        default: { // diamond
            ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.8, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.8, y);
        }
    }
    ctx.closePath();
    ctx.fill();
}
