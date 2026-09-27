/* Folio — Home dashboard. */
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

  const state = { scheduleDay: 0 }

  // Lay out overlapping timeline items in side-by-side lanes.
  V.layoutLanes = function(items) {
    const sorted = items.slice().sort((a, b) => U.toMin(a.start) - U.toMin(b.start) || U.toMin(b.end) - U.toMin(a.end))
    const clusters = []
    let cur = null
    sorted.forEach(it => {
      const s = U.toMin(it.start)
      const e = Math.max(U.toMin(it.end), s + 15)
      if (!cur || s >= cur.end) {
        cur = { end: e, items: [], lanes: [] }
        clusters.push(cur)
      }
      cur.end = Math.max(cur.end, e)
      let lane = cur.lanes.findIndex(end => end <= s)
      if (lane === -1) {
        lane = cur.lanes.length
        cur.lanes.push(e)
      } else cur.lanes[lane] = e
      it._lane = lane
      cur.items.push(it)
    })
    clusters.forEach(c => c.items.forEach(it => (it._lanes = c.lanes.length)))
    return sorted
  }

  function stat(o) {
    return h('div.stat-card', { class: 'tone-' + o.tone },
      h('div.stat-top', null, h('span.stat-icon', null, U.icon(o.icon, 18)), h('div.stat-label', { text: o.label }), o.aside || null),
      h('div.stat-main', null,
        h('div.stat-num', null, o.value, o.unit ? h('span.stat-unit', { text: o.unit }) : null),
        o.visual || null
      ),
      h('div.stat-foot', null, o.foot)
    )
  }

  function delta(cur, prev) {
    if (!prev) return cur ? h('span.delta.up', null, U.icon('trend', 13), cur + ' more than last week') : h('span.delta', { text: 'Nothing yet this week' })
    const pct = Math.round(((cur - prev) / prev) * 100)
    if (pct === 0) return h('span.delta', { text: 'Same as last week' })
    return h('span.delta', { class: pct > 0 ? 'up' : 'down' }, U.icon('trend', 13), (pct > 0 ? '+' : '') + pct + '%', h('span.muted', { text: ' vs last week' }))
  }

  function scheduleCard() {
    const iso = U.addDays(U.todayISO(), state.scheduleDay)
    const items = V.layoutLanes(P.agenda(iso).filter(x => !x.allDay))
    const allDay = P.eventsOn(iso).filter(e => e.allDay)
    const startH = Math.min(7, ...items.map(x => Math.floor(U.toMin(x.start) / 60)))
    const endH = Math.min(24, Math.max(22, ...items.map(x => Math.ceil(U.toMin(x.end) / 60)), state.scheduleDay === 0 ? Math.ceil(U.nowMin() / 60) + 2 : 0))
    const PX = 0.8
    const grid = h('div.sched-grid', { style: { height: (endH - startH) * 60 * PX + 'px' } })
    for (let hr = startH; hr <= endH; hr++) {
      grid.appendChild(h('div.sched-hour', { style: { top: (hr - startH) * 60 * PX + 'px' } }, h('span', { text: U.fmtTime(U.fromMin(hr * 60)) })))
    }
    items.forEach(it => {
      const s = U.toMin(it.start)
      const e = Math.max(U.toMin(it.end), s + 20)
      const w = 100 / it._lanes
      const block = h('button.sched-item', {
        class: 'tone-' + it.tone + (it.kind === 'task' ? ' is-task' : '') + (it.kind === 'task' && it.ref.status === 'done' ? ' done' : ''),
        style: { top: (s - startH * 60) * PX + 'px', height: Math.max(22, (e - s) * PX - 3) + 'px', left: 'calc(56px + (100% - 60px) * ' + (it._lane * w) / 100 + ')', width: 'calc((100% - 60px) * ' + w / 100 + ' - 4px)' },
        onClick: ev => (it.kind === 'task' ? F.taskDrawer.open(it.id) : F.cal.editEvent(ev.currentTarget, it.id)),
      },
        h('div.si-title', null, it.kind === 'task' ? K.check(it.ref) : null, h('span', { text: it.title })),
        e - s >= 40 ? h('div.si-time', { text: U.fmtTime(it.start) + ' – ' + U.fmtTime(it.end) + (it.kind === 'event' && it.ref.location ? ' · ' + it.ref.location : '') }) : null
      )
      grid.appendChild(block)
    })
    if (state.scheduleDay === 0) {
      const now = U.nowMin()
      if (now >= startH * 60 && now <= endH * 60) {
        grid.appendChild(h('div.now-line', { style: { top: (now - startH * 60) * PX + 'px' } }, h('span.now-pill', { text: U.fmtTime(U.fromMin(now)) })))
      }
    }
    const scroll = h('div.sched-scroll', null, grid)
    requestAnimationFrame(() => {
      const target = state.scheduleDay === 0 ? (U.nowMin() - startH * 60 - 60) * PX : 60 * PX
      scroll.scrollTop = Math.max(0, target)
    })
    const body = h('div.sched', null,
      allDay.length ? h('div.sched-allday', null, allDay.map(e => h('button.allday-chip', { class: 'tone-' + P.calendar(e.cal).tone, onClick: ev => F.cal.editEvent(ev.currentTarget, e.id) }, e.title))) : null,
      items.length ? null : h('div.sched-empty', { text: 'Nothing scheduled. Enjoy the open time.' }),
      scroll
    )
    return K.card({
      cls: 'span-7 sched-card',
      title: state.scheduleDay === 0 ? 'Today’s schedule' : 'Tomorrow',
      icon: 'calendar',
      tone: 'sky',
      actions: [
        K.segmented([{ id: 0, label: 'Today' }, { id: 1, label: 'Tomorrow' }], state.scheduleDay, v => {
          state.scheduleDay = v
          F.app.refresh()
        }, 'seg-sm'),
        K.linkBtn('Calendar', () => F.app.go('calendar')),
      ],
      body,
    })
  }

  function tasksCard() {
    const t = U.todayISO()
    const open = P.openTasks().filter(x => x.due && x.due <= t)
    const list = P.sortTasks(open)
    const doneToday = P.tasks().filter(x => x.status === 'done' && x.due === t)
    const body = h('div.dtasks', null,
      K.quickAdd({ placeholder: 'Add a task for today…', defaults: { due: t } }),
      h('div.dtask-list', null,
        list.length ? list.slice(0, 8).map(x => K.taskRow(x, { compact: true })) : K.empty('sparkles', 'Clear for today', 'Nothing due. Pull something forward or take a breather.'),
        list.length > 8 ? h('button.more-row', { onClick: () => F.app.go('tasks') }, (list.length - 8) + ' more') : null,
        doneToday.slice(0, 3).map(x => K.taskRow(x, { compact: true }))
      )
    )
    return K.card({ cls: 'span-5', title: 'My tasks', icon: 'tasks', tone: 'lavender', count: list.length, actions: [K.linkBtn('View all', () => F.app.go('tasks'))], body })
  }

  function deadlinesCard() {
    const rows = P.sortTasks(P.openTasks().filter(x => x.due)).slice(0, 7)
    const table = h('div.dtable-wrap', null,
      h('table.dtable', null,
        h('thead', null, h('tr', null, h('th', { class: 'c-check' }), h('th', { class: 'c-id', text: 'ID' }), h('th', { class: 'c-task', text: 'Task' }), h('th', { class: 'c-proj', text: 'Project' }), h('th', { text: 'Due' }), h('th', { class: 'c-prio', text: 'Priority' }), h('th', { text: 'Status' }))),
        h('tbody', null, rows.map(t => {
          const pr = P.project(t.projectId)
          return h('tr', { onClick: () => F.taskDrawer.open(t.id), tabindex: '0' },
            h('td.c-check', null, K.check(t)),
            h('td.c-id', { text: '#' + P.taskKey(t) }),
            h('td.c-task', null, h('span', { text: t.title })),
            h('td.c-proj', null, pr ? h('span.trow-proj', null, K.badge(pr, 'xs'), h('span', { text: pr.name })) : h('span.muted', { text: '—' })),
            h('td', null, K.due(t)),
            h('td.c-prio', null, K.prio(t.priority) || h('span.muted', { text: '—' })),
            h('td', null, K.status(t.status))
          )
        }))
      )
    )
    return K.card({ cls: 'span-8', title: 'Upcoming deadlines', icon: 'flag', tone: 'rose', actions: [K.linkBtn('All tasks', () => F.app.go('tasks'))], body: rows.length ? table : K.empty('flag', 'No deadlines', 'Tasks with due dates will line up here.') })
  }

  function projectsCard() {
    const list = P.activeProjects().map(p => ({ p, pr: P.projectProgress(p.id), health: P.projectHealth(p.id) }))
    list.sort((a, b) => b.pr.open - a.pr.open)
    const onTrack = list.filter(x => x.health.label === 'On track').length
    const body = h('div.dprojects', null,
      list.slice(0, 5).map(x =>
        h('button.dproj', { onClick: () => F.app.go('project/' + x.p.id) },
          K.badge(x.p),
          h('div.dproj-main', null,
            h('div.dproj-name', null, h('span', { text: x.p.name }), h('span.num.muted', { text: x.pr.pct + '%' })),
            h('div.meter', { class: 'tone-' + x.p.tone }, h('i', { style: { width: x.pr.pct + '%' } }))
          )
        )
      ),
      list.length
        ? h('div.health-pill', { class: 'tone-' + (onTrack === list.length ? 'mint' : 'butter') }, U.icon('trend', 14), h('b', { text: onTrack + ' of ' + list.length }), ' projects on track')
        : K.empty('folder', 'No projects yet', 'Group related tasks into a project.')
    )
    return K.card({ cls: 'span-4', title: 'Top projects', icon: 'folder', tone: 'peach', actions: [K.linkBtn('All', () => F.app.go('projects'))], body })
  }

  function focusCard() {
    const body = h('div.dfocus')
    function paint() {
      const f = F.focus.status()
      body.innerHTML = ''
      const pct = (1 - f.remaining / f.total) * 100
      const task = P.task(f.taskId)
      body.appendChild(
        h('div.dfocus-row', null,
          K.ring(pct, { size: 112, stroke: 8, tone: f.tone, label: F.focus.fmt(f.remaining) }),
          h('div.dfocus-side', null,
            h('div.dfocus-mode', { class: 'tone-' + f.tone }, U.icon(f.mode === 'focus' ? 'focus' : 'coffee', 14), f.label),
            h('div.dfocus-task', { text: task ? task.title : 'No task selected' }),
            h('div.dfocus-btns', null,
              h('button.btn-ink.sm', { onClick: () => (f.running ? F.focus.pause() : F.focus.start()) }, U.icon(f.running ? 'pause' : 'play', 14), f.running ? 'Pause' : f.remaining < f.total ? 'Resume' : 'Start'),
              h('button.btn.btn-sm', { onClick: () => F.app.go('focus') }, 'Open')
            ),
            h('div.dfocus-today', null, U.icon('clock', 13), U.fmtDuration(P.focusMinutesOn(U.todayISO())) + ' focused today')
          )
        )
      )
    }
    paint()
    const unsub = F.focus.onTick(paint)
    body._cleanup = unsub
    return K.card({ cls: 'span-4', title: 'Focus', icon: 'focus', tone: 'sky', body })
  }

  function habitsCard() {
    const t = U.todayISO()
    const list = P.habits()
    const body = h('div.dhabits', null,
      list.map(hb => {
        const on = !!hb.days[t]
        return h('div.dhabit', { class: 'tone-' + hb.tone },
          h('span.dhabit-icon', { text: hb.icon }),
          h('div.dhabit-main', null,
            h('div.dhabit-name', { text: hb.name }),
            h('div.dhabit-week', null, [6, 5, 4, 3, 2, 1, 0].map(k => h('i', { class: hb.days[U.addDays(t, -k)] ? 'on' : null, title: U.relDay(U.addDays(t, -k)) })))
          ),
          h('span.dhabit-streak', { title: 'Current streak' }, U.icon('flame', 13), String(P.habitStreak(hb))),
          h('button.hcheck', { class: on ? 'on' : null, 'aria-pressed': on ? 'true' : 'false', title: on ? 'Mark as not done today' : 'Done today', onClick: () => {
            if (P.toggleHabit(hb.id)) K.celebrate()
          } }, U.icon('check', 14))
        )
      }),
      list.length ? null : K.empty('habit', 'No habits yet', 'Track small daily routines.')
    )
    return K.card({ cls: 'span-4', title: 'Habits', icon: 'habit', tone: 'mint', actions: [K.linkBtn('Open', () => F.app.go('habits'))], body })
  }

  function noteCard() {
    const ta = h('textarea.dnote', { placeholder: 'Jot something down. It saves as you type.', 'aria-label': 'Scratchpad', id: 'dash-scratchpad' })
    ta.value = S.state().quickNote || ''
    const save = U.debounce(() => {
      S.state().quickNote = ta.value
      S.save()
    }, 400)
    ta.addEventListener('input', save)
    return K.card({ cls: 'span-4', title: 'Scratchpad', icon: 'note', tone: 'butter', body: ta })
  }

  function recentCard() {
    const st = S.state()
    const recent = st.recent.filter(id => S.page(id) && !S.isTrashed(id)).slice(0, 6)
    const row = h('div.drecent', null,
      recent.map(id => {
        const p = S.page(id)
        const cover = h('div.dr-cover')
        if (p.cover) {
          if (p.cover.type === 'image') cover.style.backgroundImage = UI.coverCSS(p.cover)
          else cover.style.background = UI.coverCSS(p.cover)
        }
        return h('a.dr-card', { href: '#/p/' + id },
          cover,
          h('div.dr-icon', null, p.icon ? h('span', { text: p.icon }) : U.icon(p.type === 'database' ? 'database' : 'page', 20)),
          h('div.dr-title', { text: S.pageTitle(p) }),
          h('div.dr-time', { text: U.timeAgo(p.updatedAt) })
        )
      }),
      h('button.dr-card.dr-new', { onClick: () => F.app.newPage() }, h('div.dr-plus', null, U.icon('plus', 20)), h('div.dr-title', { text: 'New doc' }))
    )
    return K.card({ cls: 'span-12', title: 'Jump back in', icon: 'page', tone: 'slate', actions: [K.linkBtn('All docs', () => F.app.go('docs'))], body: row })
  }

  V.home = {
    title: 'Dashboard',
    icon: 'dashboard',
    mount(host) {
      const root = h('div.vt.vt-home')
      host.appendChild(root)
      let cleanups = []
      function render() {
        cleanups.forEach(fn => fn && fn())
        cleanups = []
        root.innerHTML = ''
        const st = S.state()
        const t = U.todayISO()
        const name = st.settings.userName && st.settings.userName !== 'You' ? st.settings.userName : ''
        const dueToday = P.tasks().filter(x => x.due === t)
        const doneToday = dueToday.filter(x => x.status === 'done').length
        const overdue = P.openTasks().filter(P.isOverdue).length
        const events = P.eventsOn(t).length
        root.appendChild(K.head({
          eyebrow: U.DAYS[new Date().getDay()] + ', ' + U.MONTHS[new Date().getMonth()] + ' ' + new Date().getDate(),
          title: [U.greeting(), name ? h('span.vh-name', { text: ', ' + name }) : null],
          sub: 'Here’s what’s happening today: ' + (dueToday.length - doneToday) + (dueToday.length - doneToday === 1 ? ' task' : ' tasks') + ' left, ' + events + (events === 1 ? ' event' : ' events') + (overdue ? ' and ' + overdue + ' overdue' : '') + '.',
          actions: [
            h('button.btn', { onClick: () => F.focus.start() }, U.icon('focus', 15), 'Start focus'),
            h('button.btn-ink', { onClick: () => K.quickAddModal({ due: t }) }, U.icon('plus', 15), 'New task'),
          ],
        }))

        // quick start
        root.appendChild(h('div.glow-row', null,
          K.glow({ tone: 'lavender', icon: 'sunrise', title: 'Plan your day', desc: 'Review what’s due and pick the three things that matter most.', action: 'Plan', onClick: () => F.app.go('tasks') }),
          K.glow({ tone: 'sky', icon: 'focus', title: 'Focus session', desc: 'Work on one thing for 25 minutes. The timer keeps running while you browse.', action: 'Start', onClick: () => F.focus.start() }),
          K.glow({ tone: 'peach', icon: 'note', title: 'Today’s note', desc: 'Capture thoughts and decisions in a dated journal page.', action: 'Write', onClick: () => F.app.dailyNote() }),
          K.glow({ tone: 'mint', icon: 'calendar', title: 'Block time', desc: 'Add an event or time block to your calendar.', action: 'Add', onClick: () => F.app.go('calendar/new') })
        ))

        // stats
        const week = P.lastDays(7, P.completedOn)
        const prevWeek = P.lastDays(14, P.completedOn).slice(0, 7)
        const weekSum = week.reduce((a, x) => a + x.value, 0)
        const prevSum = prevWeek.reduce((a, x) => a + x.value, 0)
        const focusWeek = P.lastDays(7, P.focusMinutesOn)
        const focusToday = focusWeek[6].value
        const sessionsToday = P.focusLog().filter(x => U.toISODate(new Date(x.at)) === t).length
        const habits = P.habits()
        const habitsDone = habits.filter(hb => hb.days[t]).length
        const bestStreak = habits.reduce((a, hb) => Math.max(a, P.habitStreak(hb)), 0)
        root.appendChild(h('div.stat-row', null,
          stat({ tone: 'sky', icon: 'checkCircle', label: 'Due today', value: String(doneToday), unit: '/' + dueToday.length, visual: K.ring(dueToday.length ? (doneToday / dueToday.length) * 100 : 0, { size: 46, stroke: 5, tone: 'sky' }), foot: overdue ? h('span.delta.down', null, U.icon('flag', 13), overdue + ' overdue') : h('span.delta.up', null, U.icon('check', 13), 'Nothing overdue') }),
          stat({ tone: 'lavender', icon: 'trophy', label: 'Completed this week', value: String(weekSum), visual: K.bars(week.map(x => x.value), { width: 96, height: 40, tone: 'lavender' }), foot: delta(weekSum, prevSum) }),
          stat({ tone: 'peach', icon: 'focus', label: 'Focus today', value: U.fmtDuration(focusToday), visual: K.spark(focusWeek.map(x => x.value), { width: 96, height: 40, tone: 'peach' }), foot: h('span.delta', null, sessionsToday + (sessionsToday === 1 ? ' session' : ' sessions') + ' · ' + U.fmtDuration(focusWeek.reduce((a, x) => a + x.value, 0)) + ' this week') }),
          stat({ tone: 'mint', icon: 'habit', label: 'Habits today', value: String(habitsDone), unit: '/' + habits.length, visual: K.ring(habits.length ? (habitsDone / habits.length) * 100 : 0, { size: 46, stroke: 5, tone: 'mint' }), foot: h('span.delta.up', null, U.icon('flame', 13), 'Best streak ' + bestStreak + (bestStreak === 1 ? ' day' : ' days')) })
        ))

        const grid = h('div.dash-grid')
        const cards = [scheduleCard(), tasksCard(), deadlinesCard(), projectsCard(), focusCard(), habitsCard(), noteCard(), recentCard()]
        cards.forEach(c => {
          grid.appendChild(c)
          const inner = c.querySelector('.dfocus')
          if (inner && inner._cleanup) cleanups.push(inner._cleanup)
        })
        root.appendChild(grid)
      }
      render()
      const unsub = K.watch(['tasks', 'projects', 'events', 'habits', 'focus', 'pages', 'settings'], () => {
        const a = document.activeElement
        if (a && a.id === 'dash-scratchpad') return
        if (a && a.classList && a.classList.contains('qa-input') && a.value) return
        render()
      })
      // Keep the now-line honest.
      const clock = setInterval(() => {
        const line = root.querySelector('.now-line')
        if (line) render()
      }, 60000)
      return {
        destroy() {
          unsub()
          clearInterval(clock)
          cleanups.forEach(fn => fn && fn())
        },
        refresh: render,
      }
    },
  }
})(window.Folio)
