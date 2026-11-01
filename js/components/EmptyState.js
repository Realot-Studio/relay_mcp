/**
 * EmptyState.js
 * Reusable centered empty / zero-result state.
 */
window.RealotEmptyState = {
    /**
     * @param {{icon:string,title:string,desc:string,actionLabel?:string,onAction?:Function,fill?:boolean}} opts
     */
    render({ icon, title, desc, actionLabel, onAction, fill }) {
        const { el } = window.RealotDom;

        const children = [
            el('div', { class: 'empty-icon' }, [el('span', { html: `<svg data-lucide="${icon}"></svg>` })]),
            el('div', { class: 'empty-title' }, [title]),
            el('div', { class: 'empty-desc' }, [desc])
        ];

        if (actionLabel && onAction) {
            children.push(
                el('button', { class: 'btn btn-primary', onClick: onAction }, [
                    el('span', { html: '<svg data-lucide="plus"></svg>' }),
                    actionLabel
                ])
            );
        }

        return el('div', { class: 'empty-state' + (fill ? ' fill' : '') }, children);
    }
};
