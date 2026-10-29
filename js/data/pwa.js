/**
 * pwa.js
 * Registers the service worker and captures the browser's install
 * prompt, so the titlebar can show a real "Install app" button instead
 * of the browser's own (often hidden) install affordance. Same
 * IIFE + pub/sub shape as store.js, kept as its own module since this
 * is orthogonal to project/UI state — components only need to know
 * "can I offer an install button right now."
 */
(function () {
    const state = {
        // Set from the captured beforeinstallprompt event. Non-null only
        // while an install is actually offerable — Chromium-family
        // browsers only fire this once the PWA criteria (manifest +
        // service worker + not already installed) are met.
        deferredPrompt: null,
        // True once the app is confirmed running as an installed PWA
        // (already installed launches with display-mode: standalone, or
        // the appinstalled event already fired this session) — used to
        // hide the button rather than offer to "install" an already-
        // installed app.
        installed: window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    };

    // First-visit auto install: browsers only allow the install dialog from
    // a user gesture, so we fire it on the visitor's first click/key/tap in
    // the Hub. It is offered once per browser; if they dismiss it, the
    // titlebar button stays available but we never nag again.
    const AUTO_KEY = 'realot.pwa.autoPrompted';
    function autoPromptedBefore() {
        try { return localStorage.getItem(AUTO_KEY) === '1'; } catch (_) { return false; }
    }
    function markAutoPrompted() {
        try { localStorage.setItem(AUTO_KEY, '1'); } catch (_) {}
    }
    function armAutoInstall() {
        if (autoPromptedBefore()) return;
        const events = ['pointerup', 'keydown'];
        const onGesture = () => {
            // Wait until the browser has actually confirmed installability.
            if (!window.RealotPWA || !window.RealotPWA.canInstall()) return;
            events.forEach(ev => window.removeEventListener(ev, onGesture, true));
            markAutoPrompted();
            window.RealotPWA.promptInstall();
        };
        events.forEach(ev => window.addEventListener(ev, onGesture, true));
    }

    const listeners = new Set();
    function notify() { listeners.forEach(fn => fn(state)); }

    // Fires when the browser decides this page qualifies as installable.
    // Prevent the default mini-infobar so our own titlebar button is the
    // only install affordance shown — matches the MDN-documented pattern.
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        state.deferredPrompt = e;
        notify();
    });

    window.addEventListener('appinstalled', () => {
        state.deferredPrompt = null;
        state.installed = true;
        notify();
    });

    if ('serviceWorker' in navigator) {
        // Registered from the root so its scope covers the whole Hub
        // (launcher + linked editor/player pages), matching manifest.
        // webmanifest's "scope": "/". Registration failure (e.g. running
        // over plain http on a non-localhost host) is swallowed — it
        // only means no install prompt is offered, never a broken app.
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => { /* no offline/installability support this session */ });
        });
    }

    window.RealotPWA = {
        getState() { return state; },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        /** True when there's a real, currently-valid prompt to show. */
        canInstall() { return !state.installed && !!state.deferredPrompt; },
        /** Show the button only when the browser confirmed this page is installable (right host, HTTPS, manifest + service worker, not installed). */
        canOfferInstall() { return !state.installed && !!state.deferredPrompt; },
        /**
         * Shows the browser's native install prompt. Must be called
         * directly from a user gesture (click) — the captured event can
         * only be used once, so it's cleared immediately after.
         */
        async promptInstall() {
            const promptEvent = state.deferredPrompt;
            // No confirmed-installable prompt means nothing to do (the button
            // is hidden in that case, so this is only a safety net).
            if (!promptEvent) return;
            state.deferredPrompt = null;
            notify();
            promptEvent.prompt();
            // outcome is 'accepted' | 'dismissed' — not surfaced further
            // today; appinstalled (above) is the source of truth for
            // "installed" state either way.
            await promptEvent.userChoice.catch(() => {});
        }
    };
    armAutoInstall();
})();
