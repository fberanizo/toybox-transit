// src/audio.js - Gerador de áudio procedural via Web Audio API (100% offline, sem arquivos externos)

class SoundController {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.masterGain = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass();
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.4, this.ctx.currentTime);
                this.masterGain.connect(this.ctx.destination);
            }
        }
        if (this.ctx && this.ctx.state === 'suspended' && !document.hidden) {
            this.ctx.resume();
        }
        if (this.ctx && !this._visHooked) {
            // Pause everything (music included) while the tab is hidden.
            this._visHooked = true;
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
            });
            if (this.sampleUrls) { this.loadSample('bubble'); }
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.4, this.ctx.currentTime);
        }
        return this.muted;
    }

    isMuted() {
        return this.muted;
    }

    // ------------------------------------------------------------ recorded samples (bubble, music)
    // URLs are "assets/..." in dev and data: URIs in the single-file build; data: is decoded locally
    // (no fetch), so it also works inside the Artifact sandbox.

    setSampleUrls(urls) {
        this.sampleUrls = urls;
        this.samples = this.samples || {};
    }

    async loadSample(name) {
        if (!this.ctx || !this.sampleUrls || !this.sampleUrls[name]) return null;
        if (this.samples[name]) return this.samples[name];
        if (this.samples['_' + name]) return this.samples['_' + name];
        const url = this.sampleUrls[name];
        const p = (async () => {
            let buf;
            if (url.startsWith('data:')) {
                const b64 = url.slice(url.indexOf(',') + 1);
                const bin = atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                buf = bytes.buffer;
            } else {
                buf = await (await fetch(url)).arrayBuffer();
            }
            const decoded = await this.ctx.decodeAudioData(buf);
            this.samples[name] = decoded;
            return decoded;
        })().catch(() => null);
        this.samples['_' + name] = p;
        return p;
    }

    /** Bubble pop when a passenger boards; pitch rises as the vehicle fills (fill 0..1). */
    playBubble(fill = 0) {
        this.init();
        if (this.muted || !this.ctx) return;
        const buf = this.samples && this.samples.bubble;
        if (!buf) { this.loadSample('bubble'); this.playBoard(); return; }
        const now = this.ctx.currentTime;
        if (this.lastBubble && now - this.lastBubble < 0.03) return; // avoid phasing when many board at once
        this.lastBubble = now;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = 0.92 + fill * 0.38 + Math.random() * 0.06;
        const g = this.ctx.createGain();
        g.gain.value = 0.9;
        src.connect(g);
        g.connect(this.masterGain);
        src.start(now);
    }

    /** Background music on a loop (separate on/off from sound effects). */
    async setMusic(on) {
        this.musicOn = on;
        if (!on) {
            if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
            return;
        }
        this.init();
        if (!this.ctx) return;
        const buf = await this.loadSample('music');
        if (!buf || !this.musicOn) return;
        if (!this.musicGain) {
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0;
            this.musicGain.connect(this.ctx.destination);
        }
        if (!this.musicSrc) {
            this.musicSrc = this.ctx.createBufferSource();
            this.musicSrc.buffer = buf;
            this.musicSrc.loop = true;
            this.musicSrc.connect(this.musicGain);
            this.musicSrc.start();
        }
        this.musicGain.gain.setTargetAtTime(0.32, this.ctx.currentTime, 0.4);
    }

    playClick() {
        this.init();
        if (this.muted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.06);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.06);
    }

    playHonk() {
        this.init();
        if (this.muted || !this.ctx) return;
        const now = this.ctx.currentTime;

        // Buzina de carro: dois tons levemente dissonantes (430Hz e 510Hz)
        [430, 510].forEach(freq => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.18, now);
            gain.gain.setValueAtTime(0.18, now + 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + 0.22);
        });
    }

    playDrive() {
        this.init();
        if (this.muted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(280, now + 0.35);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.35);
    }

    playBoard() {
        this.init();
        if (this.muted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Som de "pop" de embarque alegre
        osc.type = 'sine';
        const baseFreq = 480 + Math.random() * 80;
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.6, now + 0.08);

        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.09);
    }

    playBusDepart() {
        this.init();
        if (this.muted || !this.ctx) return;
        const now = this.ctx.currentTime;

        // Acorde alegre de partida (Dó Maior)
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const startT = now + i * 0.06;

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startT);

            gain.gain.setValueAtTime(0.2, startT);
            gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.25);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(startT);
            osc.stop(startT + 0.25);
        });
    }

    playWin() {
        this.init();
        if (this.muted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const notes = [392, 523.25, 659.25, 783.99, 1046.5]; // G4, C5, E5, G5, C6

        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const noteStart = now + idx * 0.1;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, noteStart);

            gain.gain.setValueAtTime(0.25, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.5);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(noteStart);
            osc.stop(noteStart + 0.55);
        });
    }

    playGameOver() {
        this.init();
        if (this.muted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const notes = [440, 415, 392, 349]; // Declínio melancólico

        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const noteStart = now + idx * 0.16;

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, noteStart);

            gain.gain.setValueAtTime(0.2, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.3);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(noteStart);
            osc.stop(noteStart + 0.32);
        });
    }
}

window.soundController = new SoundController();
