/* Folio — task drawer, My Tasks list and the Kanban board. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const h = U.h
  const S = F.store
  const UI = F.ui
  const P = F.planner
  const K = F.kit
  const V = (F.views = F.views || {})

  // ------------------------------------------------------------------ task drawer
  const Drawer = (F.taskDrawer = {
    id: null,
    el: null,
    muted: false,
    open(id) {
      if (!P.task(id)) return
      this.id = id
      if (!this.el) {
        this.el = h('aside.drawer', { 'aria-label': 'Task details' })
        document.querySelector('.main').appendChild(this.el)
        this.unsub = S.on(type => {
          if (!this.id || this.muted) return
          if (type === 'tasks' || type === 'projects' || type === 'reset') {
            if (!P.task(this.id)) return this.close()
            this.render()
          }
        })
      }
      this.render()
      requestAnimationFrame(() => this.el && this.el.classList.add('open'))
    },
    close() {
      if (!this.el) return
      const el = this.el
      el.classList.remove('open')
      this.el = null
      this.id = null
      if (this.unsub) this.unsub()
      setTimeout(() => el.remove(), 220)
    },
    isOpen() {
      return !!this.el
    },
    // Text fields save quietly so typing never loses focus; pickers repaint.
    set(patch) {
      this.muted = true
      P.updateTask(this.id, patch)
      this.muted = false
    },
    change(patch) {
      this.set(patch)
      this.render()
    },
    render() {
      const t = P.task(this.id)
      const el = this.el
      if (!t || !el) return
      const scroll = el.querySelector('.drawer-body')
      const top = scroll ? scroll.scrollTop : 0
      el.innerHTML = ''
      const pr = P.project(t.projectId)
      const done = t.status === 'done'

      const head = h('div.drawer-head', null,
        h('span.drawer-key', { text: P.taskKey(t) }),
        pr ? h('button.drawer-proj', { onClick: () => F.app.go('project/' + pr.id) }, K.badge(pr, 'xs'), h('span', { text: pr.name })) : null,
        h('div.spacer'),
        h('button.top-btn', { title: 'Start a focus session on this task', onClick: () => F.focus.start(t.id) }, U.icon('focus', 16), 'Focus'),
        h('button.top-btn', {
          title: 'More',
          onClick: e => UI.menu(e.currentTarget, [
            { label: 'Duplicate', icon: 'duplicate', onClick: () => {
              const c = JSON.parse(JSON.stringify(t))
              delete c.id
              delete c.num
              c.title = t.title + ' (copy)'
              c.status = 'todo'
              c.completedAt = null
              Drawer.open(P.addTask(c).id)
            } },
            { label: 'Add to calendar as event', icon: 'calendar', onClick: () => {
              const start = t.time || '09:00'
              P.addEvent({ title: t.title, date: t.due || U.todayISO(), start, end: U.fromMin(U.toMin(start) + (t.duration || 30)), cal: 'work' })
              UI.toast('Added to your calendar', { action: { label: 'Open', onClick: () => F.app.go('calendar') } })
            } },
            { divider: true },
            { label: 'Delete task', icon: 'trash', danger: true, onClick: () => V.deleteTask(t.id) },
          ], { width: 240, placement: 'bottom-end' }),
        }, U.icon('dots', 16)),
        h('button.top-btn', { title: 'Close (Esc)', onClick: () => this.close() }, U.icon('x', 16))
      )

      const title = h('textarea.drawer-title', { rows: '1', placeholder: 'Task name', 'aria-label': 'Task name' })
      title.value = t.title
      const grow = el2 => {
        el2.style.height = 'auto'
        el2.style.height = el2.scrollHeight + 'px'
      }
      title.addEventListener('input', () => {
        grow(title)
        this.set({ title: title.value.replace(/\n/g, ' ') })
      })
      title.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          title.blur()
        }
      })

      const row = (icon, label, value) => h('div.prop', null, h('div.prop-k', null, U.icon(icon, 15), label), h('div.prop-v', null, value))
      const chip = (content, onClick, empty) => h('button.pchip', { class: empty ? 'empty' : null, onClick: e => onClick(e.currentTarget) }, content)

      const statusSeg = K.segmented(P.STATUSES.map(s => ({ id: s.id, label: s.name })), t.status, v => this.change({ status: v }), 'seg-sm seg-status')
      const prioSeg = h('div.prio-pick', null, P.PRIORITIES.map(p =>
        h('button.prio-opt', { class: (t.priority === p.id ? 'active ' : '') + 'tone-' + p.tone, title: p.name, onClick: () => this.change({ priority: p.id }) }, U.icon(p.id ? 'flagFill' : 'flag', 14), p.id ? p.short : 'None')
      ))
      const timeInput = h('input.pinput', { type: 'time', value: t.time || '', 'aria-label': 'Time' })
      timeInput.addEventListener('change', () => this.change({ time: timeInput.value || null, due: t.due || (timeInput.value ? U.todayISO() : t.due) }))
      const durSel = h('select.pinput', { 'aria-label': 'Duration' }, [15, 30, 45, 60, 90, 120, 180, 240].map(m => h('option', { value: String(m), text: U.fmtDuration(m), selected: (t.duration || 30) === m ? true : null })))
      durSel.addEventListener('change', () => this.change({ duration: +durSel.value }))
      const repSel = h('select.pinput', { 'aria-label': 'Repeat' }, P.REPEATS.map(r => h('option', { value: r.id || '', text: r.name, selected: (t.repeat || null) === r.id ? true : null })))
      repSel.addEventListener('change', () => this.change({ repeat: repSel.value || null }))

      const labels = h('div.plabels', null,
        (t.labels || []).map(l => h('span.label.removable', null, U.icon('tag', 11), l, h('button', { title: 'Remove label', onClick: () => this.set({ labels: t.labels.filter(x => x !== l) }) }, U.icon('x', 10)))),
        (() => {
          const inp = h('input.plabel-input', { placeholder: t.labels && t.labels.length ? '+' : 'Add a label', list: 'folio-labels' })
          inp.addEventListener('keydown', e => {
            if (e.key === 'Enter' && inp.value.trim()) {
              e.preventDefault()
              const v = inp.value.trim().replace(/^[@#]/, '')
              if ((t.labels || []).indexOf(v) === -1) this.set({ labels: (t.labels || []).concat([v]) })
              this.render()
              const again = this.el && this.el.querySelector('.plabel-input')
              if (again) again.focus()
            }
          })
          return inp
        })(),
        h('datalist', { id: 'folio-labels' }, P.labels().map(l => h('option', { value: l })))
      )

      const props = h('div.props', null,
        row('checkCircle', 'Status', statusSeg),
        row('calendar', 'Due', h('div.prow', null,
          chip(t.due ? [U.icon('calendar', 14), h('span', { text: U.relDay(t.due) + ' · ' + U.formatDate(t.due) })] : [U.icon('calendar', 14), 'Set a date'], a => K.pickDue(a, t.due, v => this.change({ due: v })), !t.due),
          timeInput
        )),
        row('clock', 'Duration', durSel),
        row('flag', 'Priority', prioSeg),
        row('folder', 'Project', chip(pr ? [K.badge(pr, 'xs'), h('span', { text: pr.name })] : [U.icon('folder', 14), 'No project'], a => K.pickProject(a, t.projectId, v => this.change({ projectId: v })), !pr)),
        row('repeat', 'Repeat', repSel),
        row('tag', 'Labels', labels)
      )

      // Subtasks
      const subs = t.subtasks || []
      const subDone = subs.filter(s => s.done).length
      const subList = h('div.subs')
      subs.forEach((s, i) => {
        const inp = h('input.sub-input', { value: s.title, 'aria-label': 'Subtask' })
        inp.addEventListener('change', () => {
          const next = subs.slice()
          next[i] = Object.assign({}, s, { title: inp.value })
          this.set({ subtasks: next })
        })
        inp.addEventListener('keydown', e => {
          if (e.key === 'Backspace' && !inp.value) {
            e.preventDefault()
            this.set({ subtasks: subs.filter((_, j) => j !== i) })
            this.render()
          }
        })
        subList.appendChild(
          h('div.sub', { class: s.done ? 'done' : null },
            h('button.tcheck.sm', { class: s.done ? 'done' : null, role: 'checkbox', 'aria-checked': s.done ? 'true' : 'false', onClick: () => {
              const next = subs.slice()
              next[i] = Object.assign({}, s, { done: !s.done })
              this.set({ subtasks: next })
              this.render()
            } }, U.icon('check', 10)),
            inp,
            h('button.sub-del', { title: 'Remove', onClick: () => {
              this.set({ subtasks: subs.filter((_, j) => j !== i) })
              this.render()
            } }, U.icon('x', 12))
          )
        )
      })
      const addSub = h('input.sub-add', { placeholder: 'Add a subtask and press Enter', 'aria-label': 'New subtask' })
      addSub.addEventListener('keydown', e => {
        if (e.key === 'Enter' && addSub.value.trim()) {
          e.preventDefault()
          this.set({ subtasks: subs.concat([{ id: U.uid(), title: addSub.value.trim(), done: false }]) })
          this.render()
          const again = this.el && this.el.querySelector('.sub-add')
          if (again) again.focus()
        }
      })

      const notes = h('textarea.drawer-notes', { placeholder: 'Add notes, links or context…', 'aria-label': 'Notes' })
      notes.value = t.notes || ''
      notes.addEventListener('input', () => {
        grow(notes)
        this.set({ notes: notes.value })
      })

      const body = h('div.drawer-body', null,
        h('div.drawer-title-row', null, K.check(t, () => {
          K.toggleTask(t.id)
          this.render()
        }), title),
        done ? h('div.drawer-done', null, U.icon('checkCircle', 15), 'Completed ' + U.timeAgo(t.completedAt || Date.now())) : null,
        props,
        h('div.drawer-sec', null,
          h('div.drawer-sec-head', null, h('span', { text: 'Subtasks' }), subs.length ? h('span.muted.num', { text: subDone + ' of ' + subs.length }) : null),
          subs.length ? h('div.meter', null, h('i', { style: { width: (subDone / subs.length) * 100 + '%' } })) : null,
          subList,
          addSub
        ),
        h('div.drawer-sec', null, h('div.drawer-sec-head', null, h('span', { text: 'Notes' })), notes),
        h('div.drawer-foot', { text: 'Created ' + U.timeAgo(t.createdAt) + (t.updatedAt !== t.createdAt ? ' · Updated ' + U.timeAgo(t.updatedAt) : '') })
      )
      el.appendChild(head)
      el.appendChild(body)
      body.scrollTop = top
      requestAnimationFrame(() => {
        grow(title)
        grow(notes)
      })
      if (!t.title) setTimeout(() => title.focus(), 30)
    },
  })

  V.deleteTask = function(id) {
    const t = P.deleteTask(id)
    if (!t) return
    if (Drawer.id === id) Drawer.close()
    UI.toast('Deleted “' + (t.title || 'task') + '”', { action: { label: 'Undo', onClick: () => P.restoreTask(t) } })
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && Drawer.isOpen() && !UI.anyOpen()) {
      const t = e.target
      if (t && t.closest && t.closest('.drawer') && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
        t.blur()
        return
      }
      Drawer.close()
    }
  })

  // ------------------------------------------------------------------ grouping
  const today = () => U.todayISO()

  function dateGroups(list) {
    const t = today()
    const groups = [
      { id: 'overdue', name: 'Overdue', tone: 'rose', items: [], due: null },
      { id: 'today', name: 'Today', tone: 'sky', items: [], due: t },
      { id: 'tomorrow', name: 'Tomorrow', tone: 'lavender', items: [], due: U.addDays(t, 1) },
      { id: 'week', name: 'Next 7 days', tone: 'mint', items: [], due: U.addDays(t, 2) },
      { id: 'later', name: 'Later', tone: 'slate', items: [], due: null },
      { id: 'none', name: 'No date', tone: 'slate', items: [], due: null },
    ]
    const g = id => groups.find(x => x.id === id)
    P.sortTasks(list).forEach(task => {
      if (!task.due) g('none').items.push(task)
      else {
        const d = U.diffDays(task.due, t)
        if (d < 0) g('overdue').items.push(task)
        else if (d === 0) g('today').items.push(task)
        else if (d === 1) g('tomorrow').items.push(task)
        else if (d <= 7) g('week').items.push(task)
        else g('later').items.push(task)
      }
    })
    return groups
  }

  function projectGroups(list) {
    const out = P.projects().map(p => ({ id: p.id, name: p.name, project: p, tone: p.tone, items: [], defaults: { projectId: p.id } }))
    const none = { id: 'none', name: 'No project', tone: 'slate', items: [] }
    P.sortTasks(list).forEach(t => {
      const g = out.find(x => x.id === t.projectId)
      ;(g || none).items.push(t)
    })
    return out.concat([none])
  }

  function priorityGroups(list) {
    const out = P.PRIORITIES.slice().reverse().map(p => ({ id: 'p' + p.id, name: p.id ? p.name : 'No priority', tone: p.tone, items: [], defaults: { priority: p.id } }))
    P.sortTasks(list).forEach(t => out[4 - (t.priority || 0)].items.push(t))
    return out
  }

  // ------------------------------------------------------------------ My Tasks
  const listState = { filter: 'all', group: 'date', project: null, collapsed: { none: false } }

  V.tasks = {
    title: 'My Tasks',
    icon: 'tasks',
    mount(host) {
      const root = h('div.vt.vt-tasks')
      host.appendChild(root)
      const headEl = h('div')
      const bar = h('div')
      const qa = K.quickAdd({ id: 'tasks-quick-add', defaults: {} })
      const listEl = h('div.tgroups')
      root.appendChild(headEl)
      root.appendChild(bar)
      root.appendChild(qa)
      root.appendChild(listEl)

      function openTasks() {
        let list = P.tasks()
        if (listState.project) list = list.filter(t => (listState.project === 'none' ? !t.projectId : t.projectId === listState.project))
        return list
      }

      function render() {
        const all = openTasks()
        const open = all.filter(t => t.status !== 'done')
        const t = today()
        const dueToday = open.filter(x => x.due === t).length
        const overdue = open.filter(P.isOverdue).length
        headEl.innerHTML = ''
        headEl.appendChild(K.head({
          title: 'My Tasks',
          sub: open.length + ' open · ' + dueToday + ' due today' + (overdue ? ' · ' + overdue + ' overdue' : ''),
          actions: [
            h('button.btn', { onClick: () => F.app.go('board') }, U.icon('board', 15), 'Board'),
            h('button.btn-ink', { onClick: () => K.quickAddModal(listState.project && listState.project !== 'none' ? { projectId: listState.project } : {}) }, U.icon('plus', 15), 'New task'),
          ],
        }))
        bar.innerHTML = ''
        const counts = {
          all: open.length,
          today: open.filter(x => x.due && x.due <= t).length,
          upcoming: open.filter(x => x.due && x.due > t && U.diffDays(x.due, t) <= 7).length,
          someday: open.filter(x => !x.due).length,
          done: all.filter(x => x.status === 'done').length,
        }
        const proj = P.project(listState.project)
        const projBtn = h('button.btn', { onClick: () => UI.menu(projBtn, [
          { label: 'All projects', icon: 'layers', checked: !listState.project, onClick: () => { listState.project = null; render() } },
          { label: 'No project', icon: 'circle', checked: listState.project === 'none', onClick: () => { listState.project = 'none'; render() } },
          { divider: true },
        ].concat(P.projects().map(p => ({ label: p.name, icon: K.badge(p, 'xs'), checked: listState.project === p.id, onClick: () => { listState.project = p.id; render() } }))), { width: 230 }) },
        proj ? K.badge(proj, 'xs') : U.icon('layers', 15), proj ? proj.name : listState.project === 'none' ? 'No project' : 'All projects', U.icon('chevronDown', 12))
        const groupBtn = h('button.btn', { onClick: () => UI.menu(groupBtn, [
          { header: 'Group by' },
          { label: 'Date', icon: 'calendar', checked: listState.group === 'date', onClick: () => { listState.group = 'date'; render() } },
          { label: 'Project', icon: 'folder', checked: listState.group === 'project', onClick: () => { listState.group = 'project'; render() } },
          { label: 'Priority', icon: 'flag', checked: listState.group === 'priority', onClick: () => { listState.group = 'priority'; render() } },
        ], { width: 200, placement: 'bottom-end' }) }, U.icon('list2', 15), 'Group: ' + { date: 'Date', project: 'Project', priority: 'Priority' }[listState.group], U.icon('chevronDown', 12))
        bar.appendChild(K.toolbar(
          K.pills([
            { id: 'all', label: 'All', count: counts.all },
            { id: 'today', label: 'Today', count: counts.today },
            { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
            { id: 'someday', label: 'No date', count: counts.someday },
            { id: 'done', label: 'Completed', count: counts.done },
          ], listState.filter, v => { listState.filter = v; render() }),
          h('div.spacer'),
          projBtn,
          groupBtn
        ))

        // list
        let list = all
        if (listState.filter === 'done') {
          list = all.filter(x => x.status === 'done').sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
        } else {
          list = open
          if (listState.filter === 'today') list = open.filter(x => x.due && x.due <= t)
          if (listState.filter === 'upcoming') list = open.filter(x => x.due && x.due > t && U.diffDays(x.due, t) <= 7)
          if (listState.filter === 'someday') list = open.filter(x => !x.due)
        }
        listEl.innerHTML = ''
        if (!list.length) {
          listEl.appendChild(K.empty(listState.filter === 'done' ? 'checkCircle' : 'sparkles',
            listState.filter === 'done' ? 'Nothing completed yet' : 'You’re all caught up',
            listState.filter === 'done' ? 'Finished tasks will show up here.' : 'Add a task above, or enjoy the free time.'))
          return
        }
        if (listState.filter === 'done') {
          const byDay = {}
          list.forEach(x => {
            const d = U.toISODate(new Date(x.completedAt || x.updatedAt))
            ;(byDay[d] = byDay[d] || []).push(x)
          })
          Object.keys(byDay).sort().reverse().forEach(d => listEl.appendChild(groupEl({ id: 'done-' + d, name: U.relDay(d), tone: 'mint', items: byDay[d] }, true)))
          return
        }
        const groups = listState.group === 'project' ? projectGroups(list) : listState.group === 'priority' ? priorityGroups(list) : dateGroups(list)
        groups.forEach(g => {
          if (!g.items.length && !(listState.group === 'date' && g.id === 'today')) return
          listEl.appendChild(groupEl(g))
        })
        const doneToday = all.filter(x => x.status === 'done' && x.completedAt && U.toISODate(new Date(x.completedAt)) === t)
        if (doneToday.length && listState.filter !== 'done') {
          listEl.appendChild(groupEl({ id: 'donetoday', name: 'Completed today', tone: 'mint', items: doneToday }, true, true))
        }
      }

      function groupEl(g, noAdd, defaultCollapsed) {
        const collapsed = listState.collapsed[g.id] == null ? !!defaultCollapsed : listState.collapsed[g.id]
        const sec = h('section.tgroup', { class: (collapsed ? 'collapsed ' : '') + 'tone-' + g.tone })
        sec.appendChild(
          h('div.tgroup-head', null,
            h('button.tgroup-toggle', { onClick: () => { listState.collapsed[g.id] = !collapsed; render() }, 'aria-expanded': collapsed ? 'false' : 'true' },
              U.icon('chevronRight', 13),
              g.project ? K.badge(g.project, 'xs') : h('span.tgroup-dot'),
              h('span.tgroup-name', { text: g.name }),
              h('span.tgroup-count', { text: String(g.items.length) })
            ),
            g.id === 'today' ? h('span.tgroup-date', { text: U.DAYS[new Date().getDay()] + ', ' + U.formatDate(today()).replace(/, \d{4}$/, '') }) : null,
            h('div.spacer'),
            noAdd ? null : h('button.btn-icon', { title: 'Add a task here', onClick: () => K.quickAddModal(Object.assign(g.due ? { due: g.due } : {}, g.defaults || {}, listState.project && listState.project !== 'none' ? { projectId: listState.project } : {})) }, U.icon('plus', 15))
          )
        )
        if (!collapsed) {
          const box = h('div.tgroup-list')
          if (!g.items.length) box.appendChild(h('div.tgroup-empty', { text: g.id === 'today' ? 'Nothing due today. Add something above or pull a task forward.' : 'No tasks' }))
          g.items.forEach(x => box.appendChild(K.taskRow(x)))
          sec.appendChild(box)
        }
        return sec
      }

      // Arrow keys move between rows; x or space completes.
      listEl.addEventListener('keydown', e => {
        const rows = U.$$('.trow', listEl)
        const i = rows.indexOf(document.activeElement)
        if (i === -1) return
        if (e.key === 'ArrowDown' || e.key === 'j') {
          e.preventDefault()
          if (rows[i + 1]) rows[i + 1].focus()
        } else if (e.key === 'ArrowUp' || e.key === 'k') {
          e.preventDefault()
          if (rows[i - 1]) rows[i - 1].focus()
        } else if (e.key === 'x') {
          K.toggleTask(rows[i].dataset.id)
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          V.deleteTask(rows[i].dataset.id)
        }
      })

      render()
      const unsub = K.watch(['tasks', 'projects'], render)
      return {
        destroy() {
          unsub()
        },
        focusAdd() {
          qa.focusInput()
        },
      }
    },
  }

  // ------------------------------------------------------------------ Board
  const boardState = { project: null }

  V.renderBoard = function(container, opts) {
    opts = opts || {}
    const board = h('div.kboard')
    let list = P.tasks()
    const pid = opts.projectId || boardState.project
    if (pid) list = list.filter(t => t.projectId === pid)
    P.STATUSES.forEach(s => {
      let items = list.filter(t => t.status === s.id)
      items = s.id === 'done'
        ? items.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, 12)
        : items.sort((a, b) => (a.order || 0) - (b.order || 0))
      const col = h('div.kcol', { class: 'tone-' + s.tone, dataset: { status: s.id } })
      col.appendChild(
        h('div.kcol-head', null,
          h('span.kcol-pill', null, h('i'), s.name),
          h('span.kcol-count', { text: String(list.filter(t => t.status === s.id).length) }),
          h('div.spacer'),
          h('button.btn-icon', { title: 'Add a task to ' + s.name, onClick: () => K.quickAddModal(Object.assign({ status: s.id }, pid ? { projectId: pid } : {})) }, U.icon('plus', 15))
        )
      )
      const cards = h('div.kcards', { dataset: { status: s.id } })
      items.forEach(t => cards.appendChild(kcard(t, !!opts.projectId)))
      if (!items.length) cards.appendChild(h('div.kempty', { text: s.id === 'done' ? 'Drop finished work here' : 'No tasks' }))
      col.appendChild(cards)
      bindColumn(cards, s.id)
      board.appendChild(col)
    })
    container.appendChild(board)
  }

  function kcard(t, hideProject) {
    const pr = P.project(t.projectId)
    const subs = t.subtasks || []
    const subDone = subs.filter(s => s.done).length
    const card = h('div.kcard', { draggable: 'true', dataset: { id: t.id }, tabindex: '0', class: t.status === 'done' ? 'done' : null,
      onClick: () => F.taskDrawer.open(t.id),
      onKeydown: e => {
        if (e.key === 'Enter') F.taskDrawer.open(t.id)
      },
    },
      h('div.kcard-top', null,
        pr && !hideProject ? h('span.kcard-proj', null, K.badge(pr, 'xs'), h('span', { text: pr.name })) : h('span.kcard-key', { text: P.taskKey(t) }),
        h('div.spacer'),
        K.prio(t.priority, false)
      ),
      h('div.kcard-title', null, K.check(t), h('span', { text: t.title || 'Untitled task' })),
      subs.length ? h('div.kcard-sub', null, h('div.meter.sm', null, h('i', { style: { width: (subDone / subs.length) * 100 + '%' } })), h('span.num', { text: subDone + '/' + subs.length })) : null,
      t.due || (t.labels && t.labels.length)
        ? h('div.kcard-foot', null, K.due(t), (t.labels || []).slice(0, 2).map(K.label))
        : null
    )
    card.addEventListener('dragstart', e => {
      F.dragTask = t.id
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', t.title)
      setTimeout(() => card.classList.add('dragging'), 0)
    })
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging')
      F.dragTask = null
      U.$$('.kdrop').forEach(x => x.remove())
      U.$$('.kcol.over').forEach(x => x.classList.remove('over'))
    })
    return card
  }

  function bindColumn(cards, status) {
    cards.addEventListener('dragover', e => {
      if (!F.dragTask) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const list = U.$$('.kcard', cards).filter(c => c.dataset.id !== F.dragTask)
      let before = null
      for (let i = 0; i < list.length; i++) {
        const r = list[i].getBoundingClientRect()
        if (e.clientY < r.top + r.height / 2) {
          before = list[i]
          break
        }
      }
      U.$$('.kdrop').forEach(x => x.remove())
      U.$$('.kcol.over').forEach(x => x.classList.remove('over'))
      cards.closest('.kcol').classList.add('over')
      const marker = h('div.kdrop')
      if (before) cards.insertBefore(marker, before)
      else cards.appendChild(marker)
      cards._before = before ? before.dataset.id : null
    })
    cards.addEventListener('drop', e => {
      if (!F.dragTask) return
      e.preventDefault()
      const id = F.dragTask
      const siblings = U.$$('.kcard', cards).map(c => c.dataset.id).filter(x => x !== id)
      const idx = cards._before ? siblings.indexOf(cards._before) : siblings.length
      const prev = P.task(siblings[idx - 1])
      const next = P.task(siblings[idx])
      let order
      if (prev && next) order = ((prev.order || 0) + (next.order || 0)) / 2
      else if (prev) order = (prev.order || 0) + 1000
      else if (next) order = (next.order || 0) - 1000
      else order = Date.now()
      const t = P.task(id)
      const wasDone = t.status === 'done'
      P.updateTask(id, { status, order })
      if (status === 'done' && !wasDone) K.celebrate()
      F.dragTask = null
    })
  }

  V.board = {
    title: 'Board',
    icon: 'board',
    mount(host) {
      const root = h('div.vt.vt-board')
      host.appendChild(root)
      function render() {
        root.innerHTML = ''
        const open = P.openTasks()
        root.appendChild(K.head({
          title: 'Board',
          sub: 'Drag cards between columns to update their status. ' + open.filter(t => t.status === 'doing').length + ' in progress, ' + open.filter(t => t.status === 'review').length + ' in review.',
          actions: [
            h('button.btn', { onClick: () => F.app.go('tasks') }, U.icon('list2', 15), 'List'),
            h('button.btn-ink', { onClick: () => K.quickAddModal(boardState.project ? { projectId: boardState.project } : {}) }, U.icon('plus', 15), 'New task'),
          ],
        }))
        root.appendChild(K.toolbar(
          K.pills([{ id: null, label: 'All projects' }].concat(P.projects().map(p => ({ id: p.id, label: p.name, tone: p.tone }))), boardState.project, v => {
            boardState.project = v
            render()
          })
        ))
        V.renderBoard(root, {})
      }
      render()
      const unsub = K.watch(['tasks', 'projects'], render)
      return { destroy: unsub }
    },
  }
})(window.Folio)
