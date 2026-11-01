/**
 * TemplateGrid.js
 * Template presentation, shared by the Projects home ("Start with a
 * template" strip) and the New Project dialog (gallery on the left).
 * Also exposes art(), the preview image/placeholder used by project cards
 * so a project looks like the template it started from.
 */
window.RealotTemplateGrid = {
    find(id) {
        return window.RealotTemplates.find(t => t.id === id) || null;
    },

    /** Preview art for a template: its thumbnail, or a tinted icon tile.
     *  `shot` (optional) is a screenshot of the user's own game saved by
     *  the editor (project.art); it wins over the template art. */
    art(tpl, extraClass, shot) {
        const { el } = window.RealotDom;
        if (typeof shot === 'string' && shot.indexOf('data:image/') === 0) {
            return el('div', { class: 'tpl-art' + (extraClass ? ' ' + extraClass : '') }, [
                el('img', { src: shot, alt: 'Game preview' })
            ]);
        }
        const cls = 'tpl-art' + (tpl && tpl.thumbnail ? '' : ' plain') + (extraClass ? ' ' + extraClass : '');
        if (tpl && tpl.thumbnail) {
            return el('div', { class: cls }, [
                el('img', { src: tpl.thumbnail, alt: tpl.name + ' preview', loading: 'lazy' })
            ]);
        }
        const icon = (tpl && tpl.icon) || 'monitor';
        return el('div', { class: cls }, [el('span', { html: `<svg data-lucide="${icon}"></svg>` })]);
    },

    tile(tpl, { selected, compact, onClick }) {
        const { el } = window.RealotDom;
        const art = this.art(tpl);
        art.append(el('span', { class: 'tpl-check', html: '<svg data-lucide="check"></svg>' }));
        return el('div', {
            class: 'tpl-tile' + (selected ? ' selected' : '') + (compact ? ' compact' : ''),
            role: 'button',
            tabindex: '0',
            'aria-pressed': selected ? 'true' : 'false',
            title: tpl.description,
            onClick,
            onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }
        }, [
            art,
            el('div', { class: 'tpl-info' }, [
                el('div', { class: 'tpl-name' }, [tpl.name]),
                el('div', { class: 'tpl-desc' }, [tpl.description])
            ])
        ]);
    },

    /** Gallery used inside the New Project dialog (click = select). */
    render() {
        const { el } = window.RealotDom;
        const state = window.RealotStore.getState();
        return el('div', { class: 'template-strip' }, window.RealotTemplates.map(tpl =>
            this.tile(tpl, {
                selected: state.selectedTemplateId === tpl.id,
                onClick: () => window.RealotStore.selectTemplate(tpl.id)
            })
        ));
    },

    /** Quick-start row on the Projects home (click = open dialog on it). */
    renderStrip() {
        const { el } = window.RealotDom;
        return el('div', { class: 'template-strip' }, window.RealotTemplates.map(tpl =>
            this.tile(tpl, {
                compact: true,
                onClick: () => window.RealotStore.openModal(tpl.id)
            })
        ));
    }
};
