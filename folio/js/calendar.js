/* Folio — calendar: week, day and month views plus the event editor. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const h = U.h
  const UI = F.ui
  const P = F.planner
  const K = F.kit
  const V = (F.views = F.views || {})

  const HOUR = 56 // pixels per hour in week/day views
  const SNAP = 15
  const cal = { mode: 'week', date: null, filter: 'all' }
  const Cal = (F.cal = {})

  const visible = e => cal.filter === 'all' || e.cal === cal.filter

  // ---------------------------------------------------------------- event editor
  Cal.editEvent = function(anchor, id, isNew) {
    const e = P.event(id)
    if (!e) return
    let pop
    const title = h('input.ev-title', { value: isNew ? '' : e.title, placeholder: 'Event title', 'aria-label': 'Event title', id: 'ev-title' })
    const date = h('input.pinput', { type: 'date', value: e.date, 'aria-label': 'Date', id: 'ev-date' })
    const start = h('input.pinput', { type: 'time', value: e.start, 'aria-label': 'Start', id: 'ev-start' })
    const end = h('input.pinput', { type: 'time', value: e.end, 'aria-label': 'End', id: 'ev-end' })
    const allDay = h('button.switch', { class: e.allDay ? 'on' : null, role: 'switch', 'aria-checked': e.allDay ? 'true' : 'false' })
    const loc = h('input.pinput.wide', { value: e.location || '', placeholder: 'Add a location', 'aria-label': 'Location', id: 'ev-loc' })
    const notes = h('textarea.pinput.wide', { rows: '2', placeholder: 'Notes', 'aria-label': 'Notes', id: 'ev-notes' })
    notes.value = e.notes || ''
    let calId = e.cal
    let status = e.status || 'none'
    const cals = h('div.ev-cals')
    const statuses = h('div.ev-status')
    function paintPicks() {
      cals.innerHTML = ''
      P.calendars().forEach(c =>
        cals.appendChild(h('button.fpill', { class: 'tone-' + c.tone + (c.id === calId ? ' active' : ''), onClick: () => { calId = c.id; paintPicks(); save() } }, h('span.fpill-dot'), c.name))
      )
      statuses.innerHTML = ''
      ;[['none', 'No status'], ['tentative', 'Tentative'], ['confirmed', 'Confirmed']].forEach(s =>
        statuses.appendChild(h('button.seg-btn', { class: s[0] === status ? 'active' : null, onClick: () => { status = s[0]; paintPicks(); save() } }, s[1]))
      )
      start.disabled = end.disabled = allDay.classList.contains('on')
    }
    function save() {
      let s = start.value || e.start
      let en = end.value || e.end
      if (U.toMin(en) <= U.toMin(s)) en = U.fromMin(U.toMin(s) + 30)
      P.updateEvent(id, {
        title: title.value.trim() || (isNew ? 'New event' : e.title),
        date: date.value || e.date,
        start: s,
        end: en,
        allDay: allDay.classList.contains('on'),
        location: loc.value.trim(),
        notes: notes.value,
        cal: calId,
        status,
      })
    }
    ;[date, start, end, loc, notes].forEach(x => x.addEventListener('change', save))
    title.addEventListener('input', save)
    title.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') {
        ev.preventDefault()
        pop.close()
      }
    })
    allDay.addEventListener('click', () => {
      allDay.classList.toggle('on')
      paintPicks()
      save()
    })
    paintPicks()
    const body = h('div.ev-pop', null,
      h('div.ev-row.top', null, h('span.ev-swatch', { class: 'tone-' + P.calendar(calId).tone }), title),
      h('div.ev-row', null, U.icon('calendar', 15), date, h('label.ev-allday', null, allDay, 'All day')),
      h('div.ev-row', null, U.icon('clock', 15), start, h('span.muted', { text: 'to' }), end),
      h('div.ev-row', null, U.icon('layers', 15), cals),
      h('div.ev-row', null, U.icon('checkCircle', 15), h('div.seg.seg-sm', null, statuses)),
      h('div.ev-row', null, U.icon('mapPin', 15), loc),
      h('div.ev-row', null, U.icon('note', 15), notes),
      h('div.ev-foot', null,
        h('button.btn-text.danger', { onClick: () => {
          pop.close()
          const gone = P.deleteEvent(id)
          UI.toast('Deleted “' + gone.title + '”', { action: { label: 'Undo', onClick: () => P.restoreEvent(gone) } })
        } }, U.icon('trash', 14), 'Delete'),
        h('button.btn-text', { onClick: () => {
          pop.close()
          const copy = Object.assign({}, P.event(id))
          delete copy.id
          P.addEvent(copy)
        } }, U.icon('duplicate', 14), 'Duplicate'),
        h('div.spacer'),
        h('button.btn-ink.sm', { onClick: () => pop.close() }, 'Done')
      )
    )
    pop = UI.popover(anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor, body, {
      width: 380,
      placement: 'right-start',
      className: 'ev-popover',
      onClose: () => {
        if (isNew && !title.value.trim()) P.deleteEvent(id)
        else save()
      },
    })
    if (pop) setTimeout(() => (isNew ? title.focus() : null), 20)
    return pop
  }

  Cal.newEvent = function(anchor, date, start, end) {
    const e = P.addEvent({ title: 'New event', date: date || U.todayISO(), start: start || '09:00', end: end || U.fromMin(U.toMin(start || '09:00') + 60), cal: cal.filter !== 'all' ? cal.filter : 'work' })
    requestAnimationFrame(() => {
      const el = document.querySelector('.cal-ev[data-id="' + e.id + '"]')
      Cal.editEvent(el || anchor, e.id, true)
    })
    return e
  }

  // ---------------------------------------------------------------- helpers
  function rangeDays() {
    const mondayFirst = true
    if (cal.mode === 'day') return [cal.date]
    if (cal.mode === 'week') {
      const s = U.weekStart(cal.date, mondayFirst)
      return [0, 1, 2, 3, 4, 5, 6].map(i => U.addDays(s, i))
    }
    const first = U.parseISODate(cal.date)
    first.setDate(1)
    const s = U.weekStart(U.toISODate(first), mondayFirst)
    const out = []
    for (let i = 0; i < 42; i++) out.push(U.addDays(s, i))
    return out
  }

  function titleFor(days) {
    const a = U.parseISODate(days[0])
    const b = U.parseISODate(days[days.length - 1])
    const M = d => U.MONTHS[d.getMonth()]
    if (cal.mode === 'day') return U.DAYS[a.getDay()] + ', ' + M(a) + ' ' + a.getDate()
    if (cal.mode === 'month') {
      const mid = U.parseISODate(cal.date)
      return M(mid) + ' ' + mid.getFullYear()
    }
    if (a.getMonth() === b.getMonth()) return a.getDate() + ' – ' + b.getDate() + ' ' + M(a) + ' ' + a.getFullYear()
    return a.getDate() + ' ' + M(a).slice(0, 3) + ' – ' + b.getDate() + ' ' + M(b).slice(0, 3) + ' ' + b.getFullYear()
  }

  function shift(n) {
    if (cal.mode === 'day') cal.date = U.addDays(cal.date, n)
    else if (cal.mode === 'week') cal.date = U.addDays(cal.date, 7 * n)
    else {
      const d = U.parseISODate(cal.date)
      d.setDate(1)
      d.setMonth(d.getMonth() + n)
      cal.date = U.toISODate(d)
    }
  }

  // ---------------------------------------------------------------- time grid (day/week)
  function timeGrid(days, rerender) {
    const today = U.todayISO()
    const wrap = h('div.cal-wrap', { class: 'cols-' + days.length })
    const headRow = h('div.cal-headrow', null, h('div.cal-gutter'))
    days.forEach(d => {
      const dt = U.parseISODate(d)
      headRow.appendChild(
        h('button.cal-dayhead', { class: (d === today ? 'today ' : '') + ([0, 6].indexOf(dt.getDay()) !== -1 ? 'weekend' : ''), onClick: () => { cal.mode = 'day'; cal.date = d; rerender() } },
          h('span.cdh-num', { text: String(dt.getDate()) }), h('span.cdh-day', { text: U.DAYS[dt.getDay()].slice(0, 3) })
        )
      )
    })
    wrap.appendChild(headRow)
    // all-day row: all-day events and dated tasks without a time
    const allRow = h('div.cal-allrow', null, h('div.cal-gutter', null, h('span', { text: 'All day' })))
    let anyAll = false
    days.forEach(d => {
      const cell = h('div.cal-allcell', { dataset: { date: d } })
      P.eventsOn(d).filter(e => e.allDay && visible(e)).forEach(e => {
        anyAll = true
        cell.appendChild(h('button.allday-chip', { class: 'tone-' + P.calendar(e.cal).tone, onClick: ev => Cal.editEvent(ev.currentTarget, e.id) }, e.title))
      })
      P.tasks().filter(t => t.due === d && !t.time && t.status !== 'done').slice(0, 4).forEach(t => {
        anyAll = true
        const pr = P.project(t.projectId)
        cell.appendChild(h('button.task-chip', { class: 'tone-' + (pr ? pr.tone : 'slate'), onClick: () => F.taskDrawer.open(t.id) }, K.check(t), h('span', { text: t.title })))
      })
      allRow.appendChild(cell)
    })
    if (anyAll) wrap.appendChild(allRow)

    const body = h('div.cal-body')
    const inner = h('div.cal-inner', { style: { height: 24 * HOUR + 'px' } })
    const gutter = h('div.cal-times')
    for (let hr = 1; hr < 24; hr++) gutter.appendChild(h('span', { style: { top: hr * HOUR + 'px' }, text: U.fmtTime(U.fromMin(hr * 60)) }))
    inner.appendChild(gutter)
    const cols = h('div.cal-cols')
    days.forEach(d => {
      const col = h('div.cal-col', { class: (d === today ? 'today ' : '') + ([0, 6].indexOf(U.parseISODate(d).getDay()) !== -1 ? 'weekend' : ''), dataset: { date: d } })
      const items = V.layoutLanes(P.agenda(d).filter(x => !x.allDay && (x.kind === 'task' || visible(x.ref))))
      items.forEach(it => {
        const s = U.toMin(it.start)
        const e = Math.max(U.toMin(it.end), s + 15)
        const w = 100 / it._lanes
        const short = e - s < 45
        const el = h('div.cal-ev', {
          class: 'tone-' + it.tone + (it.kind === 'task' ? ' is-task' : '') + (it.kind === 'task' && it.ref.status === 'done' ? ' done' : '') + (short ? ' short' : ''),
          dataset: { id: it.id, kind: it.kind },
          style: { top: (s / 60) * HOUR + 1 + 'px', height: Math.max(20, ((e - s) / 60) * HOUR - 3) + 'px', left: it._lane * w + '%', width: 'calc(' + w + '% - 4px)' },
          tabindex: '0',
        },
          h('div.ce-title', null, it.kind === 'task' ? K.check(it.ref) : null, h('span', { text: it.title }), h('span.ce-more', null, U.icon('dots', 13))),
          short ? null : h('div.ce-time', { text: U.fmtTime(it.start) + ' – ' + U.fmtTime(it.end) }),
          !short && it.kind === 'event' && it.ref.status === 'confirmed' ? h('span.ce-status', null, U.icon('checkCircle', 12), 'Confirmed') : null,
          !short && it.kind === 'event' && it.ref.status === 'tentative' ? h('span.ce-status.tent', null, U.icon('help', 12), 'Tentative') : null,
          h('div.ce-resize')
        )
        bindEventDrag(el, it)
        col.appendChild(el)
      })
      if (d === today) {
        const now = U.nowMin()
        col.appendChild(h('div.cal-now', { style: { top: (now / 60) * HOUR + 'px' } }))
      }
      bindCreate(col, d)
      cols.appendChild(col)
    })
    inner.appendChild(cols)
    if (days.indexOf(today) !== -1) {
      const now = U.nowMin()
      inner.appendChild(h('div.cal-nowpill', { style: { top: (now / 60) * HOUR + 'px' }, text: U.fmtTime(U.fromMin(now)) }))
    }
    body.appendChild(inner)
    wrap.appendChild(body)
    requestAnimationFrame(() => {
      const focusMin = days.indexOf(today) !== -1 ? U.nowMin() - 90 : 7 * 60
      body.scrollTop = Math.max(0, (focusMin / 60) * HOUR)
    })
    return wrap
  }

  function minuteAt(col, clientY) {
    const r = col.getBoundingClientRect()
    return U.clamp(Math.round((((clientY - r.top) / HOUR) * 60) / SNAP) * SNAP, 0, 24 * 60 - SNAP)
  }

  // Drag on empty space to create an event.
  function bindCreate(col, date) {
    col.addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target !== col) return
      e.preventDefault()
      const startMin = minuteAt(col, e.clientY)
      let endMin = startMin + 60
      const ghost = h('div.cal-ghost', { style: { top: (startMin / 60) * HOUR + 'px', height: HOUR - 2 + 'px' } })
      col.appendChild(ghost)
      let moved = false
      const move = ev => {
        moved = true
        endMin = Math.max(startMin + SNAP, minuteAt(col, ev.clientY) + SNAP)
        ghost.style.height = ((endMin - startMin) / 60) * HOUR - 2 + 'px'
        ghost.textContent = U.fmtTime(U.fromMin(startMin)) + ' – ' + U.fmtTime(U.fromMin(endMin))
      }
      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        ghost.remove()
        Cal.newEvent(col, date, U.fromMin(startMin), U.fromMin(moved ? endMin : startMin + 60))
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    })
  }

  // Drag an event to move it (across days too); drag its bottom edge to resize.
  function bindEventDrag(el, it) {
    el.addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target.closest('.tcheck')) return
      e.preventDefault()
      const resizing = !!e.target.closest('.ce-resize')
      const col0 = el.parentElement
      const s0 = U.toMin(it.start)
      const e0 = Math.max(U.toMin(it.end), s0 + 15)
      const y0 = e.clientY
      let date = col0.dataset.date
      let ns = s0
      let ne = e0
      let moved = false
      const move = ev => {
        const dy = Math.round((((ev.clientY - y0) / HOUR) * 60) / SNAP) * SNAP
        if (Math.abs(ev.clientY - y0) > 3) moved = true
        if (!moved) return
        el.classList.add('dragging')
        if (resizing) {
          ne = Math.max(s0 + SNAP, Math.min(24 * 60, e0 + dy))
          el.style.height = ((ne - s0) / 60) * HOUR - 3 + 'px'
        } else {
          ns = U.clamp(s0 + dy, 0, 24 * 60 - (e0 - s0))
          ne = ns + (e0 - s0)
          el.style.top = (ns / 60) * HOUR + 1 + 'px'
          const under = document.elementFromPoint(ev.clientX, ev.clientY)
          const col = under && under.closest('.cal-col')
          if (col && col !== el.parentElement) {
            col.appendChild(el)
            el.style.left = '0'
            el.style.width = 'calc(100% - 4px)'
          }
          date = el.parentElement.dataset.date
        }
        el.querySelector('.ce-time') && (el.querySelector('.ce-time').textContent = U.fmtTime(U.fromMin(ns)) + ' – ' + U.fmtTime(U.fromMin(ne)))
      }
      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        if (!moved) {
          if (it.kind === 'task') F.taskDrawer.open(it.id)
          else Cal.editEvent(el, it.id)
          return
        }
        if (it.kind === 'task') P.updateTask(it.id, { due: date, time: U.fromMin(ns), duration: ne - ns })
        else P.updateEvent(it.id, { date, start: U.fromMin(ns), end: U.fromMin(ne) })
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    })
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (it.kind === 'task') F.taskDrawer.open(it.id)
        else Cal.editEvent(el, it.id)
      }
    })
  }

  // ---------------------------------------------------------------- month grid
  function monthGrid(days, rerender) {
    const today = U.todayISO()
    const month = U.parseISODate(cal.date).getMonth()
    const wrap = h('div.cal-month')
    ;['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(d => wrap.appendChild(h('div.cm-dow', { text: d })))
    days.forEach(d => {
      const dt = U.parseISODate(d)
      const items = P.eventsOn(d).filter(visible).map(e => ({ kind: 'event', e }))
        .concat(P.tasks().filter(t => t.due === d && t.status !== 'done').map(t => ({ kind: 'task', t })))
      const cell = h('div.cm-cell', { class: (dt.getMonth() !== month ? 'other ' : '') + (d === today ? 'today' : ''), dataset: { date: d } },
        h('div.cm-head', null, h('button.cm-num', { text: dt.getDate() === 1 ? U.MONTHS[dt.getMonth()].slice(0, 3) + ' 1' : String(dt.getDate()), onClick: () => { cal.mode = 'day'; cal.date = d; rerender() } }))
      )
      items.slice(0, 3).forEach(x => {
        if (x.kind === 'event') {
          cell.appendChild(h('button.cm-item', { class: 'tone-' + P.calendar(x.e.cal).tone, onClick: ev => { ev.stopPropagation(); Cal.editEvent(ev.currentTarget, x.e.id) } }, h('i'), h('span.cm-time', { text: x.e.allDay ? '' : U.fmtTime(x.e.start) }), h('span', { text: x.e.title })))
        } else {
          const pr = P.project(x.t.projectId)
          cell.appendChild(h('button.cm-item.task', { class: 'tone-' + (pr ? pr.tone : 'slate'), onClick: ev => { ev.stopPropagation(); F.taskDrawer.open(x.t.id) } }, U.icon('checkCircle', 12), h('span', { text: x.t.title })))
        }
      })
      if (items.length > 3) cell.appendChild(h('button.cm-more', { text: '+' + (items.length - 3) + ' more', onClick: e => { e.stopPropagation(); cal.mode = 'day'; cal.date = d; rerender() } }))
      cell.addEventListener('click', e => {
        if (e.target === cell || e.target.classList.contains('cm-head')) Cal.newEvent(cell, d, '09:00', '10:00')
      })
      wrap.appendChild(cell)
    })
    return wrap
  }

  // ---------------------------------------------------------------- view
  V.calendar = {
    title: 'Calendar',
    icon: 'calendar',
    mount(host, params) {
      if (!cal.date) cal.date = U.todayISO()
      // Seven columns don't fit a phone; start narrow screens on the day view.
      if (!cal.picked && innerWidth < 700 && cal.mode === 'week') cal.mode = 'day'
      const root = h('div.vt.vt-calendar')
      host.appendChild(root)
      function render() {
        const scrollBody = root.querySelector('.cal-body')
        const keep = scrollBody ? scrollBody.scrollTop : null
        root.innerHTML = ''
        const days = rangeDays()
        const inRange = e => days.indexOf(e.date) !== -1
        const evCount = P.events().filter(e => inRange(e) && visible(e)).length
        const taskCount = P.tasks().filter(t => t.due && days.indexOf(t.due) !== -1 && t.status !== 'done').length
        root.appendChild(K.head({
          title: titleFor(days),
          sub: evCount + (evCount === 1 ? ' event' : ' events') + ' and ' + taskCount + (taskCount === 1 ? ' task' : ' tasks') + (cal.mode === 'day' ? ' on this day' : cal.mode === 'week' ? ' this week' : ' this month'),
          actions: [
            h('div.cal-nav', null,
              h('button.btn-icon.outlined', { title: 'Previous', onClick: () => { shift(-1); render() } }, U.icon('chevronLeft', 16)),
              h('button.btn', { onClick: () => { cal.date = U.todayISO(); render() } }, 'Today'),
              h('button.btn-icon.outlined', { title: 'Next', onClick: () => { shift(1); render() } }, U.icon('chevronRight', 16))
            ),
            h('button.btn-ink', { onClick: e => Cal.newEvent(e.currentTarget, cal.mode === 'day' ? cal.date : U.todayISO(), U.fromMin(Math.min(22 * 60, (Math.floor(U.nowMin() / 60) + 1) * 60))) }, U.icon('plus', 15), 'Add event'),
          ],
        }))
        root.appendChild(K.toolbar(
          K.pills([{ id: 'all', label: 'All' }].concat(P.calendars().map(c => ({ id: c.id, label: c.name, tone: c.tone }))), cal.filter, v => { cal.filter = v; render() }),
          h('div.spacer'),
          K.segmented([{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }], cal.mode, v => { cal.mode = v; cal.picked = true; render() })
        ))
        root.appendChild(cal.mode === 'month' ? monthGrid(days, render) : timeGrid(days, render))
        if (keep != null) {
          const b = root.querySelector('.cal-body')
          if (b) requestAnimationFrame(() => (b.scrollTop = keep))
        }
      }
      render()
      if (params === 'new') {
        setTimeout(() => {
          const btn = root.querySelector('.vh-actions .btn-ink')
          if (btn) btn.click()
        }, 60)
      }
      const unsub = K.watch(['events', 'tasks', 'projects'], () => {
        if (document.querySelector('.ev-popover')) return
        render()
      })
      const clock = setInterval(render, 60000)
      let gAt = 0
      const onKey = e => {
        const t = e.target
        if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || UI.anyOpen() || e.metaKey || e.ctrlKey || e.altKey) return
        // Leave "g then letter" jumps to the global handler.
        if (e.key === 'g') return void (gAt = Date.now())
        if (Date.now() - gAt < 1200) return void (gAt = 0)
        if (e.key === 'ArrowLeft') { shift(-1); render() }
        else if (e.key === 'ArrowRight') { shift(1); render() }
        else if (e.key === 't') { cal.date = U.todayISO(); render() }
        else if (e.key === 'd' || e.key === 'w' || e.key === 'm') { cal.mode = { d: 'day', w: 'week', m: 'month' }[e.key]; cal.picked = true; render() }
      }
      document.addEventListener('keydown', onKey)
      return {
        destroy() {
          unsub()
          clearInterval(clock)
          document.removeEventListener('keydown', onKey)
        },
        refresh: render,
      }
    },
  }
})(window.Folio)
