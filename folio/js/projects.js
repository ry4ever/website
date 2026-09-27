/* Folio — projects grid and project page. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const h = U.h
  const UI = F.ui
  const P = F.planner
  const K = F.kit
  const V = (F.views = F.views || {})

  const listState = { tab: 'active' }
  const pageState = { tab: 'tasks' }

  function projectCard(p) {
    const pr = P.projectProgress(p.id)
    const health = P.projectHealth(p.id)
    const pin = h('button.pc-pin', {
      class: p.pinned ? 'on' : null,
      title: p.pinned ? 'Unpin from sidebar' : 'Pin to sidebar',
      onClick: e => {
        e.stopPropagation()
        P.updateProject(p.id, { pinned: !p.pinned })
      },
    }, U.icon('pin', 15))
    return h('div.proj-card', { class: 'tone-' + p.tone, role: 'button', tabindex: '0', onClick: () => F.app.go('project/' + p.id),
      onKeydown: e => {
        if (e.key === 'Enter') F.app.go('project/' + p.id)
      },
    },
      h('div.glow-bg'),
      h('div.pc-top', null, K.badge(p, 'lg'), h('div.spacer'), pin),
      h('div.pc-name', { text: p.name }),
      h('div.pc-desc', { text: p.description || 'No description yet.' }),
      h('div.pc-progress', null,
        h('div.meter', null, h('i', { style: { width: pr.pct + '%' } })),
        h('div.pc-meta', null, h('span.num', { text: pr.done + '/' + pr.total + ' tasks' }), h('span.num', { text: pr.pct + '%' }))
      ),
      h('div.pc-foot', null,
        h('span.spill', { class: 'tone-' + health.tone }, h('i'), health.label),
        p.due ? h('span.due', { class: p.due < U.todayISO() && p.status !== 'done' ? 'overdue' : null }, U.icon('flag', 13), 'Due ' + U.relDay(p.due)) : null,
        pr.overdue ? h('span.pc-late', null, U.icon('clock', 13), pr.overdue + ' late') : null
      )
    )
  }

  V.newProject = function() {
    const p = P.addProject({ name: 'Untitled project' })
    F.app.go('project/' + p.id)
    setTimeout(() => {
      const inp = document.querySelector('.ph-name')
      if (inp) {
        inp.focus()
        inp.select()
      }
    }, 60)
  }

  V.projects = {
    title: 'Projects',
    icon: 'folder',
    mount(host) {
      const root = h('div.vt.vt-projects')
      host.appendChild(root)
      function render() {
        root.innerHTML = ''
        const all = P.projects()
        const byTab = {
          active: all.filter(p => p.status === 'active'),
          paused: all.filter(p => p.status === 'paused'),
          done: all.filter(p => p.status === 'done'),
          all,
        }
        const open = P.openTasks().filter(t => t.projectId).length
        root.appendChild(K.head({
          title: 'Projects',
          sub: byTab.active.length + ' active ' + (byTab.active.length === 1 ? 'project' : 'projects') + ' with ' + open + ' open tasks.',
          actions: [h('button.btn-ink', { onClick: V.newProject }, U.icon('plus', 15), 'New project')],
        }))
        root.appendChild(K.toolbar(K.segmented([
          { id: 'active', label: 'Active', count: byTab.active.length },
          { id: 'paused', label: 'Paused', count: byTab.paused.length },
          { id: 'done', label: 'Completed', count: byTab.done.length },
          { id: 'all', label: 'All', count: all.length },
        ], listState.tab, v => { listState.tab = v; render() })))
        const grid = h('div.proj-grid')
        byTab[listState.tab].forEach(p => grid.appendChild(projectCard(p)))
        grid.appendChild(h('button.proj-card.proj-new', { onClick: V.newProject }, h('span.pn-plus', null, U.icon('plus', 22)), h('span', { text: 'New project' }), h('span.muted.small', { text: 'Group tasks, notes and a timeline' })))
        root.appendChild(grid)
      }
      render()
      const unsub = K.watch(['projects', 'tasks'], render)
      return { destroy: unsub }
    },
  }

  // ------------------------------------------------------------------ project page
  V.project = {
    title: 'Project',
    icon: 'folder',
    mount(host, id) {
      const root = h('div.vt.vt-project')
      host.appendChild(root)
      let editor = null
      function crumbTitle() {
        const p = P.project(id)
        return p ? p.name : 'Project'
      }
      function render() {
        const p = P.project(id)
        if (editor) {
          editor.destroy()
          editor = null
        }
        root.innerHTML = ''
        if (!p) {
          root.appendChild(K.empty('folder', 'Project not found', 'It may have been deleted.', h('button.btn', { onClick: () => F.app.go('projects') }, 'All projects')))
          return
        }
        const pr = P.projectProgress(p.id)
        const health = P.projectHealth(p.id)
        const name = h('input.ph-name', { value: p.name, 'aria-label': 'Project name', id: 'project-name' })
        name.addEventListener('change', () => P.updateProject(p.id, { name: name.value.trim() || 'Untitled project' }))
        name.addEventListener('keydown', e => {
          if (e.key === 'Enter') name.blur()
        })
        const desc = h('input.ph-desc', { value: p.description || '', placeholder: 'Add a short description', 'aria-label': 'Description', id: 'project-desc' })
        desc.addEventListener('change', () => P.updateProject(p.id, { description: desc.value.trim() }))
        const badge = K.badge(p, 'xl')
        badge.setAttribute('role', 'button')
        badge.title = 'Change icon'
        badge.addEventListener('click', () => UI.emojiPicker(badge, { onSelect: e => P.updateProject(p.id, { icon: e }), onRemove: () => P.updateProject(p.id, { icon: '' }) }))
        const dueBtn = h('button.pchip', { class: p.due ? null : 'empty', onClick: e => K.pickDue(e.currentTarget, p.due, v => P.updateProject(p.id, { due: v })) }, U.icon('flag', 14), p.due ? 'Due ' + U.formatDate(p.due) : 'Set a deadline')
        const tones = h('div.tone-pick', null, P.TONES.map(t => h('button.tone-dot', { class: 'tone-' + t + (p.tone === t ? ' active' : ''), title: t, onClick: () => P.updateProject(p.id, { tone: t }) })))
        root.appendChild(
          h('section.proj-hero', { class: 'tone-' + p.tone },
            h('div.glow-bg'),
            h('div.ph-row', null,
              badge,
              h('div.ph-text', null, name, desc),
              h('div.ph-actions', null,
                h('button.btn', { class: p.pinned ? 'on' : null, onClick: () => P.updateProject(p.id, { pinned: !p.pinned }) }, U.icon('pin', 15), p.pinned ? 'Pinned' : 'Pin'),
                h('button.btn-icon.outlined', { title: 'More', onClick: e => UI.menu(e.currentTarget, [
                  { label: 'Open notes page', icon: 'page', onClick: () => F.app.open(P.projectPage(p.id).id) },
                  { divider: true },
                  { label: 'Delete project', icon: 'trash', danger: true, onClick: () => UI.confirm('Tasks stay in My Tasks without a project.', { title: 'Delete “' + p.name + '”?', ok: 'Delete', danger: true }).then(ok => {
                    if (!ok) return
                    P.deleteProject(p.id)
                    F.app.go('projects')
                  }) },
                ], { width: 220, placement: 'bottom-end' }) }, U.icon('dots', 16))
              )
            ),
            h('div.ph-meta', null,
              K.segmented([{ id: 'active', label: 'Active' }, { id: 'paused', label: 'Paused' }, { id: 'done', label: 'Completed' }], p.status, v => P.updateProject(p.id, { status: v }), 'seg-sm'),
              dueBtn,
              h('span.spill', { class: 'tone-' + health.tone }, h('i'), health.label),
              h('div.spacer'),
              tones
            ),
            h('div.ph-stats', null,
              h('div.ph-stat', null, K.ring(pr.pct, { size: 54, stroke: 6, label: pr.pct + '%' }), h('div', null, h('b', { text: 'Progress' }), h('span', { text: pr.done + ' of ' + pr.total + ' tasks done' }))),
              h('div.ph-stat', null, h('b.num', { text: String(pr.open) }), h('span', { text: 'open' })),
              h('div.ph-stat', null, h('b.num', { text: String(pr.overdue) }), h('span', { text: 'overdue' })),
              h('div.ph-stat', null, h('b.num', { text: String(P.projectTasks(p.id).filter(t => t.status === 'doing').length) }), h('span', { text: 'in progress' }))
            )
          )
        )
        root.appendChild(K.toolbar(K.segmented([
          { id: 'tasks', label: 'Tasks', icon: 'tasks' },
          { id: 'board', label: 'Board', icon: 'board' },
          { id: 'notes', label: 'Notes', icon: 'page' },
          { id: 'timeline', label: 'Timeline', icon: 'timeline' },
        ], pageState.tab, v => { pageState.tab = v; render() })))
        const body = h('div.ph-body')
        root.appendChild(body)
        if (pageState.tab === 'tasks') {
          body.appendChild(K.quickAdd({ placeholder: 'Add a task to ' + p.name + '…', defaults: { projectId: p.id } }))
          const list = P.sortTasks(P.projectTasks(p.id).filter(t => t.status !== 'done'))
          const done = P.projectTasks(p.id).filter(t => t.status === 'done').sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
          const box = h('div.tgroup-list.flat')
          list.forEach(t => box.appendChild(K.taskRow(t, { hideProject: true })))
          if (!list.length) box.appendChild(K.empty('sparkles', 'No open tasks', 'Add the next step above.'))
          body.appendChild(box)
          if (done.length) {
            body.appendChild(h('div.subhead', null, U.icon('checkCircle', 14), 'Completed · ' + done.length))
            const doneBox = h('div.tgroup-list.flat')
            done.slice(0, 20).forEach(t => doneBox.appendChild(K.taskRow(t, { hideProject: true })))
            body.appendChild(doneBox)
          }
        } else if (pageState.tab === 'board') {
          V.renderBoard(body, { projectId: p.id })
        } else if (pageState.tab === 'notes') {
          const page = P.projectPage(p.id)
          const hostEl = h('div.ph-notes')
          body.appendChild(hostEl)
          editor = new F.editor.Editor(hostEl, page.id, { peek: true })
        } else if (pageState.tab === 'timeline') {
          V.renderTimeline(body, { projectId: p.id })
        }
      }
      render()
      const unsub = K.watch(['projects', 'tasks'], () => {
        const a = document.activeElement
        if (a && (a.id === 'project-name' || a.id === 'project-desc')) return
        if (pageState.tab === 'notes' && P.project(id)) {
          // Keep the notes editor alive; only the header needs fresh numbers.
          return
        }
        render()
      })
      return {
        destroy() {
          unsub()
          if (editor) editor.destroy()
        },
        crumb: crumbTitle,
      }
    },
  }
})(window.Folio)
