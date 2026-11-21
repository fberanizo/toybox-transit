// src/game.js — game controller: owns the level, the authoritative core state and the undo stack.
// Taps go to the core first; the view only animates the resulting events.

import { prepare, initialState, applyMove, outcome, tapRejection, firstBlocker, remainingByColor } from './core/rules.js';
import { OUTCOME } from './core/defs.js';

export class GameController {
    /**
     * @param view  BoardView
     * @param ui    { onLevel(info), onState(L, state), onWin(info), onLoss(info), toast(msg), afterSettle(fn) }
     */
    constructor(view, ui) {
        this.view = view;
        this.ui = ui;
        this.L = null;
        this.state = null;
        this.history = [];
        this.info = null;
        this.ended = false;
    }

    /** info: { number, name, hint, seed, band, ... } */
    load(rawLevel, info = {}) {
        this.L = prepare(rawLevel);
        this.info = info;
        this.state = initialState(this.L);
        this.history = [];
        this.moveLog = [];
        this.ended = false;
        this.endToken = (this.endToken || 0) + 1;
        this.view.load(this.L, this.state);
        this.ui.onLevel(this.L, info);
        this.ui.onState(this.L, this.state, this.history.length);
    }

    /** Moves made since the level started (for saving progress across reloads). */
    moveList() {
        return this.moveLog ? this.moveLog.slice() : [];
    }

    /** Re-apply saved moves instantly (no animation). Stops at the first move that is no longer legal. */
    restoreMoves(moves) {
        for (const m of moves || []) {
            const r = applyMove(this.L, this.state, m, { withEvents: false });
            if (!r.ok) break;
            this.history.push(this.state);
            this.state = r.state;
            this.moveLog.push(m);
        }
        this.ended = outcome(this.L, this.state) !== OUTCOME.PLAYING;
        this.view.sync(this.state);
        this.ui.onState(this.L, this.state, this.history.length);
    }

    restart() {
        if (!this.L) return;
        this.state = initialState(this.L);
        this.history = [];
        this.moveLog = [];
        this.ended = false;
        this.endToken++;
        this.view.sync(this.state);
        this.ui.onState(this.L, this.state, 0);
    }

    tap(i) {
        if (!this.L || this.ended || i < 0) return;
        const reason = tapRejection(this.L, this.state, i);
        if (reason === 'NOT_IN_LOT') return;
        if (reason === 'BLOCKED') {
            this.view.shake(i);
            const b = firstBlocker(this.L, this.state, i);
            if (b && b.kind === 'vehicle') this.view.pulseVehicle(b.index);
            if (window.soundController) window.soundController.playHonk();
            // Explain the shake the first few times only.
            this.blockedHints = (this.blockedHints || 0) + 1;
            if (this.blockedHints <= 3) this.ui.toast('Road blocked — clear its path first');
            return;
        }
        if (reason === 'BAYS_FULL') {
            this.view.shake(i);
            this.view.flashBays();
            if (window.soundController) window.soundController.playHonk();
            this.ui.toast('All bays are full');
            return;
        }
        const r = applyMove(this.L, this.state, i);
        if (!r.ok) return;
        this.history.push(this.state);
        this.moveLog.push(i);
        this.state = r.state;
        if (window.soundController) window.soundController.playDrive();
        const settleAt = this.view.play(r.events, this.state);
        this.ui.onState(this.L, this.state, this.history.length);
        const out = outcome(this.L, this.state);
        if (out !== OUTCOME.PLAYING) {
            this.ended = true;
            const token = this.endToken;
            this.ui.afterSettle(settleAt + 0.25, () => {
                if (token !== this.endToken) return;   // undone / restarted in the meantime
                if (out === OUTCOME.WIN) this.ui.onWin(this.info);
                else this.ui.onLoss({ outcome: out, plaza: this.state.pool.slice() });
            });
        }
    }

    undo() {
        if (!this.history.length) return false;
        this.state = this.history.pop();
        this.moveLog.pop();
        this.ended = false;
        this.endToken++;
        this.view.sync(this.state);
        this.ui.onState(this.L, this.state, this.history.length);
        return true;
    }

    remaining() {
        return remainingByColor(this.L, this.state);
    }
}
