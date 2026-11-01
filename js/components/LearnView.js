/**
 * LearnView.js
 * Documentation entry point. The docs themselves live in /docs/index.html
 * (static, works offline because it is listed in offline-manifest.json).
 */
window.RealotLearnView = {
    render() {
        const { el } = window.RealotDom;

        const card = (href, icon, label, desc) =>
            el('a', { class: 'learn-card', href, target: '_blank', rel: 'noopener' }, [
                el('div', { class: 'learn-icon' }, [el('span', { html: `<svg data-lucide="${icon}"></svg>` })]),
                el('div', {}, [
                    el('div', { class: 'learn-title' }, [label]),
                    el('div', { class: 'learn-desc' }, [desc])
                ])
            ]);

        return el('div', { class: 'section' }, [
            el('div', { class: 'section-head' }, [el('div', { class: 'section-title' }, ['Documentation'])]),
            el('div', { class: 'learn-grid' }, [
                card('/docs/index.html', 'book-open', 'Quick start', 'Make your first scene and press play.'),
                card('/docs/index.html#api', 'code-2', 'Script API', 'Lifecycle functions, globals and components.'),
                card('/docs/index.html#safety', 'shield-check', 'Safety', 'Running scripts from shared projects.')
            ])
        ]);
    }
};
