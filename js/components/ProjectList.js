/**
 * ProjectList.js
 * The Projects home: a "Start with a template" row, then the user's
 * projects as a grid or list (with sort + view toggle).
 */
window.RealotProjectList = {
    render() {
        const { el } = window.RealotDom;
        const state = window.RealotStore.getState();
        const store = window.RealotStore;

        const query = state.searchQuery.trim().toLowerCase();
        let items = state.projects.slice();
        if (query) items = items.filter(p => p.name.toLowerCase().includes(query));
        if (state.sortBy === 'name') items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        else items.sort((a, b) => b.lastOpened - a.lastOpened);

        const page = el('div', {});

        // ── Templates ────────────────────────────────────────────────────
        if (!query) {
            page.append(el('div', { class: 'section' }, [
                el('div', { class: 'section-head' }, [
                    el('div', { class: 'section-title' }, ['Start with a template'])
                ]),
                window.RealotTemplateGrid.renderStrip()
            ]));
        }

        // ── Projects ─────────────────────────────────────────────────────
        const toolbar = el('div', { class: 'section-tools' }, [
            el('select', {
                class: 'select-field',
                'aria-label': 'Sort projects',
                onChange: (e) => store.setSortBy(e.target.value)
            }, [
                el('option', { value: 'recent', selected: state.sortBy !== 'name' ? 'selected' : null }, ['Last opened']),
                el('option', { value: 'name', selected: state.sortBy === 'name' ? 'selected' : null }, ['Name A–Z'])
            ]),
            el('div', { class: 'seg', role: 'group', 'aria-label': 'View' }, [
                el('button', {
                    class: state.viewMode === 'grid' ? 'active' : '', title: 'Grid view', 'aria-label': 'Grid view',
                    onClick: () => store.setViewMode('grid')
                }, [el('span', { html: '<svg data-lucide="layout-grid"></svg>' })]),
                el('button', {
                    class: state.viewMode === 'list' ? 'active' : '', title: 'List view', 'aria-label': 'List view',
                    onClick: () => store.setViewMode('list')
                }, [el('span', { html: '<svg data-lucide="list"></svg>' })])
            ])
        ]);

        const head = el('div', { class: 'section-head' }, [
            el('div', { class: 'section-title' }, [
                'Your projects',
                el('span', { class: 'section-count' }, [String(state.projects.length)])
            ]),
            state.projects.length ? toolbar : el('span')
        ]);

        let body;
        if (state.projects.length === 0) {
            body = window.RealotEmptyState.render({
                icon: 'folder-plus',
                title: 'No projects yet',
                desc: 'Pick a template above, or start from a blank canvas.',
                actionLabel: 'New project',
                onAction: () => store.openModal()
            });
        } else if (items.length === 0) {
            body = window.RealotEmptyState.render({
                icon: 'search-x',
                title: 'No matches',
                desc: 'Nothing in your projects matches "' + state.searchQuery + '".'
            });
        } else if (state.viewMode === 'list') {
            body = el('div', { class: 'project-list' }, [
                el('div', { class: 'list-head' }, [
                    el('span'), el('span', {}, ['Name']), el('span', {}, ['Template']), el('span', {}, ['Last opened']), el('span')
                ]),
                ...items.map(p => window.RealotProjectCard.render(p, 'list'))
            ]);
        } else {
            const newCard = el('div', {
                class: 'new-card', role: 'button', tabindex: '0', title: 'Create a new project',
                onClick: () => store.openModal(),
                onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); store.openModal(); } }
            }, [
                el('span', { html: '<svg data-lucide="plus"></svg>' }),
                el('span', { style: 'font-size:var(--fs-sm);' }, ['New project'])
            ]);
            body = el('div', { class: 'project-grid' }, [
                ...(query ? [] : [newCard]),
                ...items.map(p => window.RealotProjectCard.render(p, 'grid'))
            ]);
        }

        page.append(el('div', { class: 'section' }, [head, body]));
        return page;
    }
};
