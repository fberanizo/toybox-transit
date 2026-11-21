// src/storage.js — localStorage wrapper that never throws (private windows, sandboxed iframes, previews).

const PREFIX = 'toybox-transit:';

export const store = {
    get(key, fallback = null) {
        try {
            const raw = window.localStorage.getItem(PREFIX + key);
            return raw == null ? fallback : JSON.parse(raw);
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        try {
            window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }
};
