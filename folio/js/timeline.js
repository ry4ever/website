/* Folio — timeline (Gantt) of projects and dated tasks. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const h = U.h
  const P = F.planner
  const K = F.kit
  const V = (F.views = F.views || {})

  const tl = { span: 42, offset: -7 }
  const DAY = 34

  function taskRange(t) {
    const end = t.due
    let start = t.start && t.start <= end ? t.start : end
    return { start, end }
  }

  // Render a Gantt chart into container. opts.projectId limits it to one project.
  V.renderTimeline = function(container, opts) {
    opts = opts || {}
    const today = U.todayISO()
    const start = U.addDays(U.weekStart(today, true), tl.offset)
    const days = []
    for (let i = 0; i < tl.span; i++) days.push(U.addDays(start, i))
    const endIso = days[days.length - 1]
    const x = iso => U.diffDays(iso, start) * DAY

    const projects = opts.projectId ? [P.project(opts.projectId)].filter(Boolean) : P.activeProjects()
    const groups = projects.map(p => ({ p, tasks: P.sortTasks(P.projectTasks(p.id).filter(t => t.due)) }))
    if (!opts.projectId) {
      const loose = P.sortTasks(P.tasks().filter(t => !t.projectId && t.due))
      if (loose.length) groups.push({ p: null, tasks: loose })
    }

    const wrap = h('div.tl')
    const names = h('div.tl-names')
    const scroll = h('div.tl-scroll')
    const canvas = h('div.tl-canvas', { style: { width: tl.span * DAY + 'px' } })

    // header: months and days
    const head = h('div.tl-head')
    const months = h('div.tl-months')
    let curMonth = null
    days.forEach((d, i) => {
      const dt = U.parseISODate(d)
      if (dt.getMonth() !== curMonth) {
        curMonth = dt.getMonth()
        months.appendChild(h('span', { style: { left: i * DAY + 'px' }, text: U.MONTHS[curMonth] + ' ' + dt.getFullYear() }))
      }
    })
    const dayRow = h('div.tl-days')
    days.forEach(d => {
      const dt = U.parseISODate(d)
      dayRow.appendChild(h('span', { class: (d === today ? 'today ' : '') + ([0, 6].indexOf(dt.getDay()) !== -1 ? 'weekend' : ''), style: { width: DAY + 'px' } }, h('b', { text: String(dt.getDate()) }), h('i', { text: U.DAYS[dt.getDay()].charAt(0) })))
    })
    head.appendChild(months)
    head.appendChild(dayRow)
    canvas.appendChild(head)
    names.appendChild(h('div.tl-names-head', { text: opts.projectId ? 'Tasks' : 'Projects and tasks' }))

    const rows = h('div.tl-rows')
    // background columns
    const bg = h('div.tl-bg')
    days.forEach(d => {
      const dt = U.parseISODate(d)
      bg.appendChild(h('i', { class: (d === today ? 'today ' : '') + ([0, 6].indexOf(dt.getDay()) !== -1 ? 'weekend' : ''), style: { width: DAY + 'px' } }))
    })
    rows.appendChild(bg)
    let rowCount = 0
    const addRow = (label, bar, cls) => {
      names.appendChild(h('div.tl-name', { class: cls || null }, label))
      const r = h('div.tl-row', { class: cls || null })
      if (bar) r.appendChild(bar)
      rows.appendChild(r)
      rowCount++
    }

    groups.forEach(g => {
      const tone = g.p ? g.p.tone : 'slate'
      if (!opts.projectId) {
        let bar = null
        if (g.tasks.length) {
          const s = g.tasks.reduce((a, t) => (taskRange(t).start < a ? taskRange(t).start : a), '9999')
          const e = g.tasks.reduce((a, t) => (t.due > a ? t.due : a), '0000')
          const pr = g.p ? P.projectProgress(g.p.id) : null
          if (e >= start && s <= endIso) {
            bar = h('div.tl-sum', { class: 'tone-' + tone, style: { left: x(s < start ? start : s) + 'px', width: (U.diffDays(e > endIso ? endIso : e, s < start ? start : s) + 1) * DAY - 4 + 'px' } },
              h('i', { style: { width: (pr ? pr.pct : 0) + '%' } }))
          }
        }
        addRow(
          h('button.tl-group', { onClick: () => g.p && F.app.go('project/' + g.p.id) }, g.p ? K.badge(g.p, 'xs') : h('span.badge.xs.tone-slate', { text: '·' }), h('span', { text: g.p ? g.p.name : 'No project' }), h('span.tl-count', { text: String(g.tasks.length) })),
          bar,
          'group'
        )
      }
      g.tasks.forEach(t => {
        const r = taskRange(t)
        let bar = null
        if (r.end >= start && r.start <= endIso) {
          const s = r.start < start ? start : r.start
          const e = r.end > endIso ? endIso : r.end
          const single = r.start === r.end
          bar = h('div.tl-bar', {
            class: 'tone-' + tone + (t.status === 'done' ? ' done' : '') + (single ? ' single' : '') + (P.isOverdue(t) ? ' late' : ''),
            style: { left: x(s) + 2 + 'px', width: Math.max(DAY - 4, (U.diffDays(e, s) + 1) * DAY - 4) + 'px' },
            title: t.title + ' · ' + (single ? U.formatDate(r.end) : U.formatDate(r.start) + ' → ' + U.formatDate(r.end)),
            tabindex: '0',
          }, h('span', { text: t.title }), h('div.tl-grip'))
          bindBarDrag(bar, t)
        }
        addRow(h('button.tl-task', { class: t.status === 'done' ? 'done' : null, onClick: () => F.taskDrawer.open(t.id) }, K.check(t), h('span', { text: t.title })), bar)
      })
    })
    if (!rowCount) {
      container.appendChild(K.empty('timeline', 'Nothing on the timeline', 'Give tasks a due date (and optionally a start date) to see them here.'))
      return
    }
    // today line
    if (today >= start && today <= endIso) rows.appendChild(h('div.tl-today', { style: { left: x(today) + DAY / 2 + 'px' } }))
    canvas.appendChild(rows)
    scroll.appendChild(canvas)
    wrap.appendChild(names)
    wrap.appendChild(scroll)
    container.appendChild(wrap)
    requestAnimationFrame(() => (scroll.scrollLeft = Math.max(0, x(today) - 3 * DAY)))
    // keep the name column aligned with vertical scroll of rows
    scroll.addEventListener('scroll', () => (names.scrollTop = scroll.scrollTop))
  }

  // Drag a bar to move its dates; drag the right edge to change the due date.
  function bindBarDrag(bar, t) {
    bar.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      e.preventDefault()
      const resizing = !!e.target.closest('.tl-grip')
      const x0 = e.clientX
      const left0 = parseFloat(bar.style.left)
      const w0 = parseFloat(bar.style.width)
      let delta = 0
      let moved = false
      const move = ev => {
        delta = Math.round((ev.clientX - x0) / DAY)
        if (Math.abs(ev.clientX - x0) > 3) moved = true
        bar.classList.add('dragging')
        if (resizing) bar.style.width = Math.max(DAY - 4, w0 + delta * DAY) + 'px'
        else bar.style.left = left0 + delta * DAY + 'px'
      }
      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        bar.classList.remove('dragging')
        if (!moved) return F.taskDrawer.open(t.id)
        if (!delta) return
        const r = taskRange(t)
        if (resizing) {
          const due = U.addDays(t.due, delta)
          P.updateTask(t.id, { due: due < r.start ? r.start : due, start: r.start })
        } else {
          P.updateTask(t.id, { due: U.addDays(t.due, delta), start: U.addDays(r.start, delta) })
        }
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    })
    bar.addEventListener('keydown', e => {
      if (e.key === 'Enter') F.taskDrawer.open(t.id)
    })
  }

  V.timeline = {
    title: 'Timeline',
    icon: 'timeline',
    mount(host) {
      const root = h('div.vt.vt-timeline')
      host.appendChild(root)
      function render() {
        root.innerHTML = ''
        const dated = P.openTasks().filter(t => t.due).length
        root.appendChild(K.head({
          title: 'Timeline',
          sub: dated + ' scheduled tasks across ' + P.activeProjects().length + ' active projects. Drag bars to reschedule.',
          actions: [
            h('div.cal-nav', null,
              h('button.btn-icon.outlined', { title: 'Earlier', onClick: () => { tl.offset -= 7; render() } }, U.icon('chevronLeft', 16)),
              h('button.btn', { onClick: () => { tl.offset = -7; render() } }, 'Today'),
              h('button.btn-icon.outlined', { title: 'Later', onClick: () => { tl.offset += 7; render() } }, U.icon('chevronRight', 16))
            ),
          ],
        }))
        root.appendChild(K.toolbar(K.segmented([{ id: 21, label: '3 weeks' }, { id: 42, label: '6 weeks' }, { id: 84, label: '12 weeks' }], tl.span, v => { tl.span = v; render() })))
        V.renderTimeline(root, {})
      }
      render()
      const unsub = K.watch(['tasks', 'projects'], render)
      return { destroy: unsub }
    },
  }
})(window.Folio)
