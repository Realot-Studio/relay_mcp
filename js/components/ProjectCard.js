/**
 * ProjectCard.js
 * A project, shown either as a card (grid view) or as a row (list view).
 * Both open the project on click; the pencil renames inline (rename mode is
 * tracked in RealotStore.state.renamingProjectId so only one edits at a
 * time) and the trash removes it from the Hub.
 */
window.RealotProjectCard = {
    render(project, mode) {
        const { el } = window.RealotDom;
        const isRenaming = window.RealotStore.getState().renamingProjectId === project.id;
        const tpl = window.RealotTemplateGrid.find(project.templateId) || window.RealotTemplateGrid.find('blank');

        const commitRename = (inputEl) => window.RealotStore.renameProject(project.id, inputEl.value);

        const nameNode = isRenaming
            ? el('input', {
                class: 'project-name-input',
                type: 'text',
                value: project.name,
                'aria-label': 'Project name',
                onClick: (e) => e.stopPropagation(),
                onKeydown: (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(e.target); }
                    else if (e.key === 'Escape') { e.preventDefault(); window.RealotStore.cancelRename(); }
                },
                onBlur: (e) => commitRename(e.target)
            })
            : el('div', { class: 'project-name', title: project.name }, [project.name]);

        const renameBtn = el('button', {
            class: 'btn btn-icon',
            title: 'Rename project',
            'aria-label': 'Rename project',
            onClick: (e) => { e.stopPropagation(); window.RealotStore.startRename(project.id); }
        }, [el('span', { html: '<svg data-lucide="edit-3"></svg>' })]);

        const delBtn = el('button', {
            class: 'btn btn-icon btn-danger-soft',
            title: 'Delete project',
            'aria-label': 'Delete project',
            onClick: (e) => {
                e.stopPropagation();
                if (confirm('Delete "' + project.name + '"? This removes it from your projects.')) {
                    window.RealotStore.deleteProject(project.id);
                }
            }
        }, [el('span', { html: '<svg data-lucide="trash-2"></svg>' })]);

        const openProject = () => window.RealotNav.openEditor(project);
        const common = {
            role: 'button',
            tabindex: '0',
            title: 'Open ' + project.name,
            onClick: () => { if (!isRenaming) openProject(); },
            onKeydown: (e) => {
                if (isRenaming) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProject(); }
            }
        };
        const opened = window.RealotFormat.timeAgo(project.lastOpened);
        const tplName = project.template || (tpl && tpl.name) || 'Blank Canvas';

        let node;
        if (mode === 'list') {
            node = el('div', Object.assign({ class: 'project-row' }, common), [
                window.RealotTemplateGrid.art(tpl, null, project.art),
                el('div', { style: 'min-width:0;' }, [nameNode]),
                el('div', { class: 'project-path' }, [tplName]),
                el('div', { class: 'project-opened' }, [opened]),
                el('div', { class: 'project-row-actions' }, [renameBtn, delBtn])
            ]);
        } else {
            node = el('div', Object.assign({ class: 'project-card' }, common), [
                window.RealotTemplateGrid.art(tpl, null, project.art),
                el('div', { class: 'project-card-actions' }, [renameBtn, delBtn]),
                el('div', { class: 'project-card-body' }, [
                    nameNode,
                    el('div', { class: 'project-path' }, [tplName]),
                    el('div', { class: 'project-opened' }, ['Opened ' + opened])
                ])
            ]);
        }

        if (isRenaming) {
            setTimeout(() => {
                const input = node.querySelector('.project-name-input');
                if (input) { input.focus(); input.select(); }
            }, 0);
        }
        return node;
    }
};
