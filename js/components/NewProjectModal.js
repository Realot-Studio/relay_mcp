/**
 * NewProjectModal.js
 * New project dialog: template gallery on the left, details + project name
 * + Create on the right. Mounted once at #modal-root and toggled with the
 * .open class so the typed name survives re-renders of other views.
 */
window.RealotNewProjectModal = {
    nameValue: '',

    render() {
        const { el } = window.RealotDom;
        const state = window.RealotStore.getState();
        const tpl = window.RealotTemplateGrid.find(state.selectedTemplateId) || window.RealotTemplates[0];

        const create = () => {
            const project = window.RealotStore.createProject({ name: this.nameValue.trim() });
            this.nameValue = '';
            window.RealotNav.openEditor(project);
        };

        const nameInput = el('input', {
            type: 'text',
            class: 'field-input',
            placeholder: tpl.name,
            value: this.nameValue,
            oninput: (e) => { this.nameValue = e.target.value; },
            onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } }
        });

        const preview = el('div', { class: 'side-preview' + (tpl.thumbnail ? '' : ' plain') }, [
            tpl.thumbnail
                ? el('img', { src: tpl.thumbnail, alt: tpl.name + ' preview' })
                : el('span', { html: `<svg data-lucide="${tpl.icon}"></svg>` })
        ]);

        const side = el('div', { class: 'modal-side' }, [
            el('div', { class: 'side-body' }, [
                preview,
                el('div', {}, [
                    el('div', { class: 'side-name' }, [tpl.name]),
                    el('div', { class: 'side-desc' }, [tpl.description])
                ]),
                el('div', {}, [
                    el('label', { class: 'field-label' }, ['Project name']),
                    nameInput
                ])
            ]),
            el('div', { class: 'side-footer' }, [
                el('button', { class: 'btn btn-ghost', onClick: () => window.RealotStore.closeModal() }, ['Cancel']),
                el('button', { class: 'btn btn-primary', onClick: create }, [
                    'Create project',
                    el('span', { html: '<svg data-lucide="arrow-right"></svg>' })
                ])
            ])
        ]);

        const panel = el('div', { class: 'modal-panel', role: 'dialog', 'aria-label': 'New project' }, [
            el('div', { class: 'modal-header' }, [
                el('div', { class: 'modal-title' }, ['New project']),
                el('button', { class: 'btn btn-icon', title: 'Close', 'aria-label': 'Close', onClick: () => window.RealotStore.closeModal() }, [
                    el('span', { html: '<svg data-lucide="x"></svg>' })
                ])
            ]),
            el('div', { class: 'modal-split' }, [
                el('div', { class: 'modal-gallery' }, [
                    el('div', { class: 'field-label', style: 'margin-bottom:10px;' }, ['Choose a template']),
                    window.RealotTemplateGrid.render()
                ]),
                side
            ])
        ]);

        const overlay = el('div', {
            class: 'modal-overlay' + (state.modalOpen ? ' open' : ''),
            onClick: (e) => { if (e.target === overlay) window.RealotStore.closeModal(); }
        }, [panel]);

        overlay.tabIndex = -1;
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') window.RealotStore.closeModal();
        });

        return overlay;
    }
};
