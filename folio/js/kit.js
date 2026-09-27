/* Folio — shared building blocks for the planner views. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const h = U.h
  const UI = F.ui
  const P = F.planner
  const K = (F.kit = {})

  K.icon = (name, size) => U.icon(name, size || 16)

  // Page header: title, subtitle and an actions row.
  K.head = function(o) {
    return h(
      'header.vh',
      null,
      h('div.vh-text', null, o.eyebrow ? h('div.vh-eyebrow', null, o.eyebrow) : null, h('h1.vh-title', null, o.title), o.sub ? h('p.vh-sub', null, o.sub) : null),
      o.actions ? h('div.vh-actions', null, o.actions) : null
    )
  }

  K.toolbar = function() {
    return h('div.vt-bar', null, Array.prototype.slice.call(arguments))
  }

  K.segmented = function(opts, value, onChange, cls) {
    const wrap = h('div.seg', { class: cls || null, role: 'tablist' })
    opts.forEach(o => {
      wrap.appendChild(
        h('button.seg-btn', {
          class: o.id === value ? 'active' : null,
          role: 'tab',
          'aria-selected': o.id === value ? 'true' : 'false',
          title: o.title || null,
          onClick: () => onChange(o.id),
        }, o.icon ? U.icon(o.icon, 15) : null, o.label ? h('span', { text: o.label }) : null, o.count != null ? h('span.seg-count', { text: String(o.count) }) : null)
      )
    })
    return wrap
  }

  // Filter pills like "All · Work · Personal"; the active one is filled.
  K.pills = function(opts, value, onChange) {
    const row = h('div.fpills')
    opts.forEach(o => {
      const on = o.id === value
      row.appendChild(
        h('button.fpill', { class: (on ? 'active ' : '') + (o.tone ? 'tone-' + o.tone : ''), onClick: () => onChange(o.id) },
          on ? U.icon('checkCircle', 14) : o.tone ? h('span.fpill-dot') : null,
          h('span', { text: o.label }),
          o.count != null ? h('span.fpill-count', { text: String(o.count) }) : null
        )
      )
    })
    return row
  }

  K.divider = () => h('span.vt-sep')

  K.badge = function(project, size) {
    if (!project) return h('span.badge.tone-slate', { class: size || null, text: '·' })
    return h('span.badge', {
      class: 'tone-' + project.tone + (size ? ' ' + size : '') + (project.icon ? ' emoji' : ''),
      text: project.icon || project.name.trim().charAt(0).toUpperCase(),
      title: project.name,
    })
  }

  K.toggleTask = function(id) {
    const before = P.task(id)
    const prev = before && before.status !== 'done' ? before.status : 'todo'
    const t = P.toggleTask(id)
    if (t && t.status === 'done') {
      K.celebrate()
      UI.toast('Completed “' + (t.title || 'task') + '”', { action: { label: 'Undo', onClick: () => P.updateTask(id, { status: prev }) } })
    }
    return t
  }

  K.check = function(task, onToggle) {
    const done = task.status === 'done'
    return h('button.tcheck', {
      class: (done ? 'done ' : '') + 'pr-' + (task.priority || 0),
      role: 'checkbox',
      'aria-checked': done ? 'true' : 'false',
      title: done ? 'Mark as not done' : 'Complete task',
      onClick: e => {
        e.stopPropagation()
        if (onToggle) onToggle()
        else K.toggleTask(task.id)
      },
    }, U.icon('check', 12))
  }

  K.prio = function(p, withText) {
    if (!p) return null
    const pr = P.PRIORITIES[p]
    return h('span.prio', { class: 'tone-' + pr.tone, title: pr.name + ' priority' }, U.icon('flagFill', 13), withText === false ? null : pr.short)
  }

  K.due = function(t) {
    if (!t.due) return null
    const overdue = P.isOverdue(t)
    const today = t.due === U.todayISO()
    return h('span.due', { class: overdue ? 'overdue' : today ? 'today' : null, title: U.formatDate(t.due) },
      U.icon(t.repeat ? 'repeat' : 'calendar', 13),
      U.relDay(t.due) + (t.time ? ' · ' + U.fmtTime(t.time) : '')
    )
  }

  K.status = function(id) {
    const s = P.STATUSES.find(x => x.id === id) || P.STATUSES[0]
    return h('span.spill', { class: 'tone-' + s.tone }, h('i'), s.name)
  }

  K.label = l => h('span.label', null, U.icon('tag', 11), l)

  // Progress ring drawn in SVG; color comes from the tone class.
  K.ring = function(pct, o) {
    o = o || {}
    const size = o.size || 44
    const sw = o.stroke || 5
    const r = (size - sw) / 2
    const c = 2 * Math.PI * r
    const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100)
    const svg =
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--ring-track)" stroke-width="' + sw + '"/>' +
      '<circle class="ring-arc" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + (o.gradient ? 'url(#' + o.gradient + ')' : 'var(--t-fg, var(--accent))') + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      (o.defs || '') +
      '</svg>'
    const el = h('span.ring', { class: o.tone ? 'tone-' + o.tone : null, html: svg, style: { width: size + 'px', height: size + 'px' } })
    if (o.label != null) el.appendChild(h('span.ring-label', { text: o.label }))
    return el
  }

  // Tiny bar chart; the last bar (today) is emphasized.
  K.bars = function(values, o) {
    o = o || {}
    const w = o.width || 120
    const ht = o.height || 40
    const n = values.length
    const gap = o.gap == null ? 4 : o.gap
    const bw = (w - gap * (n - 1)) / n
    const max = Math.max(1, Math.max.apply(null, values))
    let rects = ''
    values.forEach((v, i) => {
      const bh = Math.max(3, (v / max) * (ht - 2))
      rects += '<rect x="' + (i * (bw + gap)).toFixed(1) + '" y="' + (ht - bh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="' + Math.min(4, bw / 2).toFixed(1) + '" fill="' + (i === n - 1 ? 'var(--t-fg)' : 'var(--t-mid)') + '"><title>' + v + '</title></rect>'
    })
    return h('span.bars', { class: 'tone-' + (o.tone || 'sky'), html: '<svg width="' + w + '" height="' + ht + '" viewBox="0 0 ' + w + ' ' + ht + '" aria-hidden="true">' + rects + '</svg>' })
  }

  // Area sparkline with an emphasized endpoint.
  K.spark = function(values, o) {
    o = o || {}
    const w = o.width || 120
    const ht = o.height || 40
    const n = values.length
    const max = Math.max(1, Math.max.apply(null, values))
    const pts = values.map((v, i) => [(i / (n - 1)) * (w - 6) + 3, ht - 4 - (v / max) * (ht - 10)])
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
    const area = line + ' L' + pts[n - 1][0].toFixed(1) + ' ' + ht + ' L' + pts[0][0].toFixed(1) + ' ' + ht + ' Z'
    const id = 'sg' + U.uid()
    const last = pts[n - 1]
    const svg =
      '<svg width="' + w + '" height="' + ht + '" viewBox="0 0 ' + w + ' ' + ht + '" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--t-fg)" stop-opacity="0.28"/><stop offset="1" stop-color="var(--t-fg)" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#' + id + ')"/><path d="' + line + '" fill="none" stroke="var(--t-fg)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.5" fill="var(--panel)" stroke="var(--t-fg)" stroke-width="2"/></svg>'
    return h('span.spark', { class: 'tone-' + (o.tone || 'lavender'), html: svg })
  }

  // Labeled bar chart for larger panels.
  K.barChart = function(data, o) {
    o = o || {}
    const max = Math.max(1, Math.max.apply(null, data.map(d => d.value)))
    const wrap = h('div.bchart', { class: 'tone-' + (o.tone || 'lavender') })
    data.forEach((d, i) => {
      const pct = (d.value / max) * 100
      wrap.appendChild(
        h('div.bcol', { title: d.label + ': ' + (o.format ? o.format(d.value) : d.value), class: i === data.length - 1 ? 'now' : null },
          h('div.bval', { text: d.value ? (o.format ? o.format(d.value) : String(d.value)) : '' }),
          h('div.btrack', null, h('div.bfill', { style: { height: Math.max(d.value ? 4 : 0, pct) + '%' } })),
          h('div.blabel', { text: d.label })
        )
      )
    })
    return wrap
  }

  const STARS =
    '<svg viewBox="0 0 120 80" aria-hidden="true"><g fill="#fff">' +
    '<path d="M86 14l2.2 6 6 2.2-6 2.2L86 30.4l-2.2-6-6-2.2 6-2.2z" opacity=".95"/>' +
    '<path d="M104 36l1.4 3.8 3.8 1.4-3.8 1.4-1.4 3.8-1.4-3.8-3.8-1.4 3.8-1.4z" opacity=".85"/>' +
    '<path d="M68 42l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z" opacity=".75"/>' +
    '<circle cx="58" cy="18" r="1.4" opacity=".8"/><circle cx="112" cy="16" r="1.2" opacity=".8"/><circle cx="94" cy="56" r="1.1" opacity=".6"/></g></svg>'

  // Card with a soft colored glow and sparkles in the corner.
  K.glow = function(o) {
    const el = h('div.glow', { class: 'tone-' + o.tone + (o.cls ? ' ' + o.cls : ''), role: 'button', tabindex: '0', onClick: o.onClick,
      onKeydown: e => {
        if (e.key === 'Enter' && o.onClick) o.onClick(e)
      },
    },
      h('div.glow-bg'),
      h('div.glow-stars', { html: STARS }),
      h('div.glow-top', null, h('span.glow-icon', null, typeof o.icon === 'string' ? U.icon(o.icon, 22) : o.icon), o.action ? h('span.glow-btn', { text: o.action }) : null),
      h('div.glow-title', null, o.title),
      o.desc ? h('div.glow-desc', null, o.desc) : null,
      o.extra || null
    )
    return el
  }

  K.card = function(o) {
    return h('section.tile', { class: o.cls || null },
      o.title
        ? h('div.tile-head', null,
            h('div.tile-title', null, o.icon ? h('span.tile-icon', { class: o.tone ? 'tone-' + o.tone : null }, U.icon(o.icon, 15)) : null, h('span', null, o.title), o.count != null ? h('span.tile-count', { text: String(o.count) }) : null),
            o.actions ? h('div.tile-actions', null, o.actions) : null
          )
        : null,
      o.body
    )
  }

  K.linkBtn = (label, onClick, icon) => h('button.link-btn', { onClick }, label, U.icon(icon || 'arrowUpRight', 13))

  K.empty = function(icon, title, desc, action) {
    return h('div.empty', null, h('div.empty-icon', null, U.icon(icon, 22)), h('div.empty-title', { text: title }), desc ? h('div.empty-desc', { text: desc }) : null, action || null)
  }

  K.taskRow = function(t, o) {
    o = o || {}
    const pr = P.project(t.projectId)
    const subDone = (t.subtasks || []).filter(s => s.done).length
    return h('div.trow', {
      class: (t.status === 'done' ? 'done ' : '') + (o.compact ? 'compact ' : '') + (P.isOverdue(t) ? 'late' : ''),
      dataset: { id: t.id },
      tabindex: '0',
      onClick: () => F.taskDrawer.open(t.id),
      onKeydown: e => {
        if (e.key === 'Enter') F.taskDrawer.open(t.id)
        else if (e.key === ' ') {
          e.preventDefault()
          K.toggleTask(t.id)
        }
      },
    },
      K.check(t),
      h('div.trow-main', null,
        h('div.trow-title', null,
          h('span.trow-text', { text: t.title || 'Untitled task' }),
          t.notes ? h('span.trow-ico', { title: 'Has notes' }, U.icon('note', 13)) : null,
          t.subtasks && t.subtasks.length ? h('span.trow-sub', { title: 'Subtasks' }, U.icon('tasks', 13), subDone + '/' + t.subtasks.length) : null
        ),
        o.compact && (pr || t.due)
          ? h('div.trow-meta', null, K.due(t), pr && !o.hideProject ? h('span.trow-proj', null, K.badge(pr, 'xs'), h('span', { text: pr.name })) : null)
          : null
      ),
      o.compact
        ? h('div.trow-right', null, K.prio(t.priority, false))
        : h('div.trow-right', null,
            (t.labels || []).slice(0, 2).map(K.label),
            pr && !o.hideProject ? h('span.trow-proj', null, K.badge(pr, 'xs'), h('span', { text: pr.name })) : null,
            t.status === 'doing' || t.status === 'review' ? K.status(t.status) : null,
            K.due(t),
            K.prio(t.priority)
          )
    )
  }

  const TOKEN_ICONS = { date: 'calendar', project: 'folder', label: 'tag', priority: 'flagFill', repeat: 'repeat', duration: 'clock' }

  // Natural-language task input with live previews of what was understood.
  K.quickAdd = function(o) {
    o = o || {}
    const input = h('input.qa-input', {
      placeholder: o.placeholder || 'Add a task… try “Email Sam tomorrow 3pm #Q4 !high”',
      'aria-label': 'New task',
      autocomplete: 'off',
      id: o.id || null,
    })
    const chips = h('div.qa-chips')
    const form = h('form.qa', { class: o.big ? 'big' : null },
      h('span.qa-plus', null, U.icon('plus', 16)),
      input,
      chips,
      h('button.qa-submit', { type: 'submit', title: 'Add task (Enter)' }, U.icon('arrowUp', 14))
    )
    function update() {
      const r = P.parseQuickAdd(input.value)
      chips.innerHTML = ''
      r.tokens.forEach(tk => chips.appendChild(h('span.qa-chip', { class: 'k-' + tk.type + (tk.tone ? ' tone-' + tk.tone : '') }, U.icon(TOKEN_ICONS[tk.type], 12), tk.text)))
      form.classList.toggle('has-text', !!input.value.trim())
    }
    input.addEventListener('input', update)
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') input.blur()
    })
    form.addEventListener('submit', e => {
      e.preventDefault()
      const r = P.parseQuickAdd(input.value)
      if (!r.title) return
      const f = Object.assign({}, o.defaults || {})
      ;['due', 'time', 'projectId', 'priority', 'repeat'].forEach(k => {
        if (r[k]) f[k] = r[k]
      })
      if (r.duration) f.duration = r.duration
      if (r.labels.length) f.labels = r.labels
      f.title = r.title
      const t = P.addTask(f)
      input.value = ''
      update()
      if (o.onAdd) o.onAdd(t)
      UI.toast('Added “' + t.title + '”' + (t.due ? ' · ' + U.relDay(t.due) : ''), { action: { label: 'Open', onClick: () => F.taskDrawer.open(t.id) } })
    })
    form.focusInput = () => input.focus()
    return form
  }

  K.quickAddModal = function(defaults) {
    UI.closeAll()
    let m
    const qa = K.quickAdd({ big: true, defaults, onAdd: () => m.close() })
    const tip = code => h('code', { text: code })
    m = UI.modal(
      h('div.qa-modal', null,
        h('div.qa-modal-head', null, h('span.qa-modal-title', { text: 'New task' }), h('span.muted.small', null, 'Press ', h('kbd', { text: 'Enter' }), ' to add')),
        qa,
        h('div.qa-help', null, 'Type naturally: ', tip('tomorrow 3pm'), tip('fri'), tip('#project'), tip('@label'), tip('!high'), tip('every week'), tip('for 45m'))
      ),
      { width: 640, top: true, className: 'qa-shell' }
    )
    setTimeout(() => qa.focusInput(), 20)
  }

  // Menus for picking task fields.
  K.pickProject = function(anchor, current, onPick) {
    UI.menu(anchor, [{ header: 'Project' }, { label: 'No project', icon: 'circle', checked: !current, onClick: () => onPick(null) }].concat(
      P.projects().map(p => ({ label: p.name, icon: K.badge(p, 'xs'), checked: current === p.id, onClick: () => onPick(p.id) }))
    ), { width: 240, search: P.projects().length > 6 })
  }

  K.pickDue = function(anchor, current, onPick) {
    const t = U.todayISO()
    const nextMon = U.addDays(t, ((8 - new Date().getDay()) % 7) || 7)
    const sat = U.addDays(t, (6 - new Date().getDay() + 7) % 7 || 7)
    UI.menu(anchor, [
      { header: 'Due date' },
      { label: 'Today', icon: 'sun', hint: U.DAYS[new Date().getDay()].slice(0, 3), checked: current === t, onClick: () => onPick(t) },
      { label: 'Tomorrow', icon: 'sunrise', hint: U.DAYS[U.parseISODate(U.addDays(t, 1)).getDay()].slice(0, 3), checked: current === U.addDays(t, 1), onClick: () => onPick(U.addDays(t, 1)) },
      { label: 'This weekend', icon: 'coffee', hint: U.relDay(sat), onClick: () => onPick(sat) },
      { label: 'Next week', icon: 'arrowRight', hint: U.formatDate(nextMon).replace(/, \d{4}$/, ''), onClick: () => onPick(nextMon) },
      { divider: true },
      { label: 'Pick a date…', icon: 'calendar', onClick: () => UI.datePicker(anchor, current || '', v => onPick(v || null)) },
      current ? { label: 'Remove date', icon: 'x', onClick: () => onPick(null) } : null,
    ], { width: 230 })
  }

  K.pickPriority = function(anchor, current, onPick) {
    UI.menu(anchor, [{ header: 'Priority' }].concat(
      P.PRIORITIES.slice().reverse().map(p => ({ label: p.name, icon: h('span.prio.icon-only', { class: 'tone-' + p.tone }, U.icon(p.id ? 'flagFill' : 'flag', 14)), checked: current === p.id, onClick: () => onPick(p.id) }))
    ), { width: 200 })
  }

  // A small burst of confetti from the pointer when a task is completed.
  let lastPointer = { x: innerWidth / 2, y: innerHeight / 2 }
  document.addEventListener('pointerdown', e => (lastPointer = { x: e.clientX, y: e.clientY }), true)
  K.celebrate = function() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const colors = ['#6b4ee6', '#2f6feb', '#15885a', '#dc6a18', '#d93a44', '#e6a21a']
    const layer = h('div.confetti')
    document.body.appendChild(layer)
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2
      const d = 30 + Math.random() * 50
      const p = h('i', { style: { left: lastPointer.x + 'px', top: lastPointer.y + 'px', background: colors[i % colors.length] } })
      p.style.setProperty('--dx', Math.cos(a) * d + 'px')
      p.style.setProperty('--dy', Math.sin(a) * d - 20 + 'px')
      p.style.setProperty('--r', Math.random() * 360 + 'deg')
      layer.appendChild(p)
    }
    setTimeout(() => layer.remove(), 800)
  }

  // Re-render helper: calls fn at most once per frame.
  K.throttle = function(fn) {
    let queued = false
    return function() {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        queued = false
        fn()
      })
    }
  }

  // Subscribe to store events of the given types; returns an unsubscribe function.
  K.watch = function(types, fn) {
    const run = K.throttle(fn)
    return F.store.on(type => {
      if (types.indexOf(type) !== -1 || type === 'reset') run()
    })
  }
})(window.Folio)
