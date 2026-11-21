// src/view/layout.js — maps grid cells, bays and queue slots to world coordinates (1 world unit = 1 cell).
//
//   z ↑ (negative = further up the screen)
//   queue rows      z ≈ bayTop - 0.9 …
//   bays            z ∈ [bayTop, apronTop]
//   apron road      z ∈ [apronTop, 0]
//   lot             z ∈ [0, rows]
//   bottom road     z ∈ [rows, rows + ROAD]

import { isVertical } from '../core/defs.js';

export const ROAD = 1.3;       // width of the ring road around the lot
export const BAY_W = 1.25;     // bay width
export const BAY_D = 4.4;      // bay depth (fits a 4-cell bus)
export const PAX_GAP = 0.64;   // passenger spacing in the queue
export const QUEUE_PER_ROW = 7;
export const LINE_PER_ROW = 7;     // incoming line: 2 rows × 7 = 14 people visible before the plaza
export const LINE_VISIBLE = 14;

export class Layout {
    constructor(L) {
        this.cols = L.cols;
        this.rows = L.rows;
        this.bays = L.bays;
        this.x0 = -L.cols / 2;                         // world x of the lot's left edge
        this.apronTop = -ROAD;                         // apron road between lot and bays
        this.bayTop = this.apronTop - BAY_D;
        this.queueZ = this.bayTop - 0.75;              // (legacy) front queue row
        // Plaza: an oval walkway above the bays where waiting passengers circle.
        this.pool = L.pool || 1;
        this.plazaRX = Math.max(2.6, Math.min(3.6, 1.6 + this.pool * 0.18));
        this.plazaRZ = Math.max(1.15, Math.min(1.6, 0.9 + this.pool * 0.06));
        this.plazaZ = this.bayTop - 0.7 - this.plazaRZ;
        // Incoming line: two rows above the plaza, entering at the plaza's top.
        this.lineZ = this.plazaZ - this.plazaRZ - 1.15;
        this.leftRoad = this.x0 - ROAD / 2;
        this.rightRoad = -this.x0 + ROAD / 2;
        this.bottomRoad = L.rows + ROAD / 2;
        this.apronZ = this.apronTop / 2;
        const baysW = L.bays * BAY_W;
        this.baysX0 = -baysW / 2;
        this.halfWidth = Math.max(L.cols / 2 + ROAD, baysW / 2 + 0.3, (QUEUE_PER_ROW * PAX_GAP) / 2 + 0.4);
    }

    cellCenter(x, y) { return { x: this.x0 + x + 0.5, z: y + 0.5 }; }

    /** Centre of a vehicle occupying its grid cells. */
    vehicleCenter(v) {
        const vert = isVertical(v.dir);
        return {
            x: this.x0 + v.x + (vert ? 0.5 : v.len / 2),
            z: v.y + (vert ? v.len / 2 : 0.5)
        };
    }

    /** Where a vehicle of length len parks in bay b (nose up, nose aligned with the top of the bay). */
    bayCenter(b, len = 2) {
        return { x: this.baysX0 + BAY_W * (b + 0.5), z: this.bayTop + 0.2 + len / 2 };
    }

    /** Door point beside a bay where passengers walk to. */
    bayDoor(b) {
        return { x: this.baysX0 + BAY_W * (b + 0.5), z: this.bayTop + 0.25 };
    }

    /** Queue slot k (0 = front). Two rows snake: front row left→right, then back row right→left. */
    queueSlot(k) {
        const row = Math.floor(k / QUEUE_PER_ROW);
        const col = k % QUEUE_PER_ROW;
        const w = (QUEUE_PER_ROW - 1) * PAX_GAP;
        const x = row % 2 === 0 ? -w / 2 + col * PAX_GAP : w / 2 - col * PAX_GAP;
        return { x, z: this.queueZ - row * 0.62 };
    }

    /** Point on the plaza oval at angle a (0 = right, π/2 = toward the bays). */
    plazaPoint(a) {
        return { x: Math.cos(a) * this.plazaRX, z: this.plazaZ + Math.sin(a) * this.plazaRZ };
    }

    /** Gate where the line enters the plaza (top of the oval). */
    get gateAngle() { return -Math.PI / 2; }

    /** Line slot k (0 = next to enter). Starts at the gate and runs right, then wraps left on a second row. */
    lineSlot(k) {
        const perRow = LINE_PER_ROW;
        const row = Math.floor(k / perRow);
        const col = k % perRow;
        const x0 = 0.35;
        const x = row % 2 === 0 ? x0 + col * PAX_GAP : x0 + (perRow - 1 - col) * PAX_GAP;
        return { x, z: this.lineZ - row * 0.72 };
    }

    /** World waypoints from a vehicle's lot position, out along its arrow, around the ring road, into bay b. */
    exitPath(v, b) {
        const c = this.vehicleCenter(v);
        const bay = this.bayCenter(b, v.len);
        const pts = [{ x: c.x, z: c.z }];
        const ax = this.apronZ;
        if (v.dir === 'U') {
            pts.push({ x: c.x, z: ax });
        } else if (v.dir === 'D') {
            pts.push({ x: c.x, z: this.bottomRoad });
            const sideX = c.x < 0 ? this.leftRoad : this.rightRoad; // nearer side road
            pts.push({ x: sideX, z: this.bottomRoad });
            pts.push({ x: sideX, z: ax });
        } else if (v.dir === 'L') {
            pts.push({ x: this.leftRoad, z: c.z });
            pts.push({ x: this.leftRoad, z: ax });
        } else {
            pts.push({ x: this.rightRoad, z: c.z });
            pts.push({ x: this.rightRoad, z: ax });
        }
        pts.push({ x: bay.x, z: ax });
        pts.push({ x: bay.x, z: bay.z });
        // Drop zero-length segments.
        return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 1e-3);
    }

    /** Axis-aligned world bounds of everything that must stay on screen. */
    bounds() {
        const lineRight = 0.35 + (LINE_PER_ROW - 1) * PAX_GAP + 0.4;
        const hw = Math.max(this.halfWidth, this.plazaRX + 0.6, lineRight);
        return {
            minX: -hw, maxX: hw,
            minZ: this.lineZ - 0.72 - 0.9,
            maxZ: this.rows + ROAD
        };
    }
}
