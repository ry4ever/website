/* Folio — planner data: tasks, projects, events, habits and focus sessions. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const S = F.store
  const P = (F.planner = {})

  P.TONES = ['lavender', 'sky', 'mint', 'peach', 'rose', 'butter', 'cyan', 'slate']
  P.STATUSES = [
    { id: 'todo', name: 'To do', tone: 'slate' },
    { id: 'doing', name: 'In progress', tone: 'sky' },
    { id: 'review', name: 'Review', tone: 'lavender' },
    { id: 'done', name: 'Done', tone: 'mint' },
  ]
  P.PRIORITIES = [
    { id: 0, name: 'No priority', short: '', tone: 'slate' },
    { id: 1, name: 'Low', short: 'Low', tone: 'slate' },
    { id: 2, name: 'Medium', short: 'Med', tone: 'butter' },
    { id: 3, name: 'High', short: 'High', tone: 'peach' },
    { id: 4, name: 'Urgent', short: 'Urgent', tone: 'rose' },
  ]
  P.REPEATS = [
    { id: null, name: 'Does not repeat' },
    { id: 'daily', name: 'Every day' },
    { id: 'weekdays', name: 'Every weekday' },
    { id: 'weekly', name: 'Every week' },
    { id: 'monthly', name: 'Every month' },
  ]

  const st = () => S.state()

  // Called from store normalize: make sure every planner collection exists.
  P.normalize = function(state) {
    state.tasks = state.tasks || {}
    state.projects = state.projects || {}
    state.events = state.events || {}
    state.habits = state.habits || {}
    state.focusLog = state.focusLog || []
    state.quickNote = state.quickNote || ''
    state.seq = Object.assign({ task: 100 }, state.seq)
    state.calendars = state.calendars && state.calendars.length ? state.calendars : P.defaultCalendars()
    state.focus = Object.assign(
      { mode: 'focus', running: false, endsAt: 0, remaining: 25 * 60, taskId: null, round: 0 },
      state.focus
    )
    state.focus.settings = Object.assign({ focus: 25, short: 5, long: 15, rounds: 4, sound: true }, state.focus.settings)
  }

  P.defaultCalendars = () => [
    { id: 'work', name: 'Work', tone: 'sky' },
    { id: 'personal', name: 'Personal', tone: 'lavender' },
    { id: 'health', name: 'Health', tone: 'mint' },
    { id: 'learning', name: 'Learning', tone: 'butter' },
    { id: 'social', name: 'Social', tone: 'peach' },
  ]

  function commit(type, id) {
    S.commit(type, id)
  }
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt

  // ---------------------------------------------------------------- tasks
  P.tasks = () => Object.values(st().tasks)
  P.task = id => st().tasks[id]
  P.openTasks = () => P.tasks().filter(t => t.status !== 'done')

  P.addTask = function(f, silent) {
    const now = Date.now()
    const s = st()
    const t = Object.assign(
      {
        id: U.uid(),
        num: ++s.seq.task,
        title: '',
        notes: '',
        status: 'todo',
        priority: 0,
        due: null,
        time: null,
        duration: 30,
        projectId: null,
        labels: [],
        subtasks: [],
        repeat: null,
        start: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        order: now,
      },
      f || {}
    )
    if (t.status === 'done' && !t.completedAt) t.completedAt = now
    s.tasks[t.id] = t
    if (!silent) commit('tasks', t.id)
    return t
  }

  P.updateTask = function(id, patch) {
    const t = P.task(id)
    if (!t) return
    const wasDone = t.status === 'done'
    Object.assign(t, patch)
    t.updatedAt = Date.now()
    if (t.status === 'done' && !wasDone) {
      t.completedAt = Date.now()
      if (t.repeat) {
        const next = JSON.parse(JSON.stringify(t))
        delete next.id
        delete next.num
        next.status = 'todo'
        next.completedAt = null
        next.due = P.nextDate(t.due || U.todayISO(), t.repeat)
        next.subtasks = (next.subtasks || []).map(x => Object.assign({}, x, { id: U.uid(), done: false }))
        delete next.spawnedId
        delete next.repeatWas
        t.repeatWas = t.repeat
        t.repeat = null
        t.spawnedId = P.addTask(next, true).id
      }
    } else if (t.status !== 'done' && wasDone) {
      t.completedAt = null
      // Undoing a repeating task removes the next occurrence it created.
      const spawned = t.spawnedId && st().tasks[t.spawnedId]
      if (spawned && spawned.status !== 'done') {
        delete st().tasks[t.spawnedId]
        t.repeat = t.repeatWas || t.repeat
      }
      delete t.spawnedId
      delete t.repeatWas
    }
    commit('tasks', id)
    return t
  }

  P.toggleTask = function(id) {
    const t = P.task(id)
    if (!t) return
    return P.updateTask(id, { status: t.status === 'done' ? 'todo' : 'done' })
  }

  P.deleteTask = function(id) {
    const t = P.task(id)
    if (!t) return null
    delete st().tasks[id]
    if (st().focus.taskId === id) st().focus.taskId = null
    commit('tasks', id)
    return t
  }

  P.restoreTask = function(t) {
    st().tasks[t.id] = t
    commit('tasks', t.id)
  }

  P.nextDate = function(iso, repeat) {
    if (repeat === 'daily') return U.addDays(iso, 1)
    if (repeat === 'weekly') return U.addDays(iso, 7)
    if (repeat === 'weekdays') {
      let d = U.addDays(iso, 1)
      while ([0, 6].indexOf(U.parseISODate(d).getDay()) !== -1) d = U.addDays(d, 1)
      return d
    }
    if (repeat === 'monthly') {
      const d = U.parseISODate(iso)
      const day = d.getDate()
      d.setDate(1)
      d.setMonth(d.getMonth() + 1)
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
      return U.toISODate(d)
    }
    return iso
  }

  P.isOverdue = function(t) {
    return t.status !== 'done' && t.due && t.due < U.todayISO()
  }

  P.taskKey = t => 'T-' + t.num

  // Sort open tasks: overdue first, then by date, time, priority.
  P.sortTasks = function(list) {
    return list.slice().sort((a, b) => {
      const ad = a.due || '9999-99-99'
      const bd = b.due || '9999-99-99'
      if (ad !== bd) return ad < bd ? -1 : 1
      const at = a.time || '99:99'
      const bt = b.time || '99:99'
      if (at !== bt) return at < bt ? -1 : 1
      if (a.priority !== b.priority) return b.priority - a.priority
      return byOrder(a, b)
    })
  }

  P.labels = function() {
    const set = {}
    P.tasks().forEach(t => (t.labels || []).forEach(l => (set[l] = (set[l] || 0) + 1)))
    return Object.keys(set).sort()
  }

  // ---------------------------------------------------------------- projects
  P.projects = () => Object.values(st().projects).sort(byOrder)
  P.project = id => (id ? st().projects[id] : null)
  P.activeProjects = () => P.projects().filter(p => p.status !== 'done')

  P.addProject = function(f, silent) {
    const now = Date.now()
    const p = Object.assign(
      {
        id: U.uid(),
        name: 'New project',
        tone: P.TONES[Object.keys(st().projects).length % P.TONES.length],
        icon: '',
        description: '',
        status: 'active',
        pinned: false,
        due: null,
        pageId: null,
        createdAt: now,
        order: now,
      },
      f || {}
    )
    st().projects[p.id] = p
    if (!silent) commit('projects', p.id)
    return p
  }

  P.updateProject = function(id, patch) {
    const p = P.project(id)
    if (!p) return
    Object.assign(p, patch)
    commit('projects', id)
    return p
  }

  P.deleteProject = function(id) {
    const p = P.project(id)
    if (!p) return
    P.tasks().forEach(t => {
      if (t.projectId === id) t.projectId = null
    })
    delete st().projects[id]
    commit('projects', id)
    commit('tasks')
  }

  P.projectTasks = id => P.tasks().filter(t => t.projectId === id)

  P.projectProgress = function(id) {
    const list = P.projectTasks(id)
    const done = list.filter(t => t.status === 'done').length
    const overdue = list.filter(P.isOverdue).length
    return { total: list.length, done, open: list.length - done, overdue, pct: list.length ? Math.round((done / list.length) * 100) : 0 }
  }

  P.projectHealth = function(id) {
    const pr = P.projectProgress(id)
    const p = P.project(id)
    if (p && p.status === 'done') return { label: 'Complete', tone: 'mint' }
    if (p && p.status === 'paused') return { label: 'Paused', tone: 'slate' }
    if (pr.overdue >= 2) return { label: 'At risk', tone: 'rose' }
    if (pr.overdue === 1) return { label: 'Needs attention', tone: 'butter' }
    return { label: 'On track', tone: 'mint' }
  }

  // Notes page for a project, created on first use.
  P.projectPage = function(id) {
    const p = P.project(id)
    if (!p) return null
    let page = p.pageId && S.page(p.pageId)
    if (!page || page.trashed) {
      page = S.createPage({ title: p.name + ' notes', icon: p.icon || '🗂️', detached: true })
      p.pageId = page.id
      S.commit('projects', id)
    }
    return page
  }

  // ---------------------------------------------------------------- calendars & events
  P.calendars = () => st().calendars
  P.calendar = id => st().calendars.find(c => c.id === id) || st().calendars[0]

  P.events = () => Object.values(st().events)
  P.event = id => st().events[id]
  P.eventsOn = iso =>
    P.events()
      .filter(e => e.date === iso)
      .sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || (a.start || '').localeCompare(b.start || ''))

  P.addEvent = function(f, silent) {
    const e = Object.assign(
      { id: U.uid(), title: 'New event', date: U.todayISO(), start: '09:00', end: '10:00', allDay: false, cal: st().calendars[0].id, notes: '', location: '', status: 'none', createdAt: Date.now() },
      f || {}
    )
    st().events[e.id] = e
    if (!silent) commit('events', e.id)
    return e
  }

  P.updateEvent = function(id, patch) {
    const e = P.event(id)
    if (!e) return
    Object.assign(e, patch)
    commit('events', id)
    return e
  }

  P.deleteEvent = function(id) {
    const e = P.event(id)
    delete st().events[id]
    commit('events', id)
    return e
  }

  P.restoreEvent = function(e) {
    st().events[e.id] = e
    commit('events', e.id)
  }

  // Items that fill a day's timeline: events plus tasks with a time.
  P.agenda = function(iso) {
    const items = P.eventsOn(iso).map(e => ({ kind: 'event', id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, tone: P.calendar(e.cal).tone, ref: e }))
    P.tasks()
      .filter(t => t.due === iso && t.time)
      .forEach(t => {
        const s = U.toMin(t.time)
        items.push({ kind: 'task', id: t.id, title: t.title, start: t.time, end: U.fromMin(s + (t.duration || 30)), tone: (P.project(t.projectId) || {}).tone || 'slate', ref: t })
      })
    return items.sort((a, b) => (a.start || '').localeCompare(b.start || ''))
  }

  // ---------------------------------------------------------------- habits
  P.habits = () => Object.values(st().habits).sort(byOrder)
  P.habit = id => st().habits[id]

  P.addHabit = function(f, silent) {
    const now = Date.now()
    const hb = Object.assign({ id: U.uid(), name: 'New habit', icon: '✨', tone: 'lavender', goal: 7, days: {}, createdAt: now, order: now }, f || {})
    st().habits[hb.id] = hb
    if (!silent) commit('habits', hb.id)
    return hb
  }

  P.updateHabit = function(id, patch) {
    const hb = P.habit(id)
    if (!hb) return
    Object.assign(hb, patch)
    commit('habits', id)
  }

  P.deleteHabit = function(id) {
    const hb = P.habit(id)
    delete st().habits[id]
    commit('habits', id)
    return hb
  }

  P.toggleHabit = function(id, iso) {
    const hb = P.habit(id)
    if (!hb) return
    iso = iso || U.todayISO()
    if (hb.days[iso]) delete hb.days[iso]
    else hb.days[iso] = 1
    commit('habits', id)
    return !!hb.days[iso]
  }

  P.habitStreak = function(hb) {
    let d = U.todayISO()
    if (!hb.days[d]) d = U.addDays(d, -1)
    let n = 0
    while (hb.days[d]) {
      n++
      d = U.addDays(d, -1)
    }
    return n
  }

  P.habitBest = function(hb) {
    const days = Object.keys(hb.days).sort()
    let best = 0
    let run = 0
    let prev = null
    days.forEach(d => {
      run = prev && U.diffDays(d, prev) === 1 ? run + 1 : 1
      best = Math.max(best, run)
      prev = d
    })
    return best
  }

  P.habitRate = function(hb, days) {
    let n = 0
    for (let i = 0; i < days; i++) if (hb.days[U.addDays(U.todayISO(), -i)]) n++
    return Math.round((n / days) * 100)
  }

  // ---------------------------------------------------------------- focus log
  P.focusLog = () => st().focusLog
  P.logFocus = function(entry) {
    st().focusLog.push(Object.assign({ id: U.uid(), at: Date.now() }, entry))
    if (st().focusLog.length > 1000) st().focusLog.shift()
    commit('focus')
  }
  P.focusMinutesOn = function(iso) {
    return P.focusLog()
      .filter(x => U.toISODate(new Date(x.at)) === iso)
      .reduce((a, x) => a + (x.minutes || 0), 0)
  }

  // ---------------------------------------------------------------- stats
  P.completedOn = iso => P.tasks().filter(t => t.completedAt && U.toISODate(new Date(t.completedAt)) === iso).length
  P.dueOn = iso => P.tasks().filter(t => t.due === iso)

  P.lastDays = function(n, fn) {
    const out = []
    for (let i = n - 1; i >= 0; i--) {
      const iso = U.addDays(U.todayISO(), -i)
      out.push({ iso, value: fn(iso) })
    }
    return out
  }

  // ---------------------------------------------------------------- quick add parser
  const MONTHS3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

  // The next given weekday after today. With "next", skip a day that still falls in this week.
  function nextWeekday(dow, forceNext) {
    const cur = new Date().getDay()
    let delta = (dow - cur + 7) % 7 || 7
    if (forceNext && delta < 7 - cur) delta += 7
    return U.addDays(U.todayISO(), delta)
  }

  function fmtClock(h, m, ap) {
    h = +h
    m = +(m || 0)
    if (ap) {
      ap = ap.toLowerCase()
      if (ap === 'pm' && h < 12) h += 12
      if (ap === 'am' && h === 12) h = 0
    }
    if (h > 23 || m > 59) return null
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
  }

  // Turn "Call Sam tomorrow 3pm #Work !high @phone every week for 30m" into task fields.
  P.parseQuickAdd = function(text) {
    let s = ' ' + (text || '') + ' '
    const out = { title: '', due: null, time: null, duration: null, projectId: null, labels: [], priority: 0, repeat: null, tokens: [] }
    const take = (re, fn) => {
      const m = re.exec(s)
      if (!m) return false
      const res = fn(m)
      if (res === false) return false
      s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)
      return true
    }
    // project
    take(/\s#([\w-]+)/i, m => {
      const q = m[1].toLowerCase()
      const pr = P.projects().find(p => p.name.toLowerCase().replace(/\s+/g, '').indexOf(q) === 0) || P.projects().find(p => p.name.toLowerCase().replace(/\s+/g, '').indexOf(q) !== -1)
      if (pr) {
        out.projectId = pr.id
        out.tokens.push({ type: 'project', text: pr.name, tone: pr.tone })
      } else {
        out.labels.push(m[1])
        out.tokens.push({ type: 'label', text: m[1] })
      }
    })
    // labels
    let guard = 0
    while (guard++ < 6 && take(/\s@([\w-]+)/i, m => {
      out.labels.push(m[1])
      out.tokens.push({ type: 'label', text: m[1] })
    }));
    // priority
    take(/\s(!{1,3}|!(urgent|high|med|medium|low|[1-4])|p([1-4]))(?=\s)/i, m => {
      let p = 0
      const v = (m[2] || m[3] || '').toLowerCase()
      if (m[1] === '!!!' || v === 'urgent' || v === '1') p = 4
      else if (m[1] === '!!' || v === 'high' || v === '2') p = 3
      else if (m[1] === '!' || v === 'med' || v === 'medium' || v === '3') p = 2
      else if (v === 'low' || v === '4') p = 1
      out.priority = p
      out.tokens.push({ type: 'priority', text: P.PRIORITIES[p].name, tone: P.PRIORITIES[p].tone })
    })
    // repeat
    take(/\s(every\s+(day|weekday|week|month)|daily|weekly|monthly|weekdays)(?=\s)/i, m => {
      const v = m[1].toLowerCase()
      out.repeat = /day$|daily/.test(v) && !/weekday/.test(v) ? 'daily' : /weekday/.test(v) ? 'weekdays' : /week/.test(v) ? 'weekly' : 'monthly'
      out.tokens.push({ type: 'repeat', text: P.REPEATS.find(r => r.id === out.repeat).name })
    })
    // duration
    take(/\sfor\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|h|hr|hrs|hours)(?=\s)/i, m => {
      const n = parseFloat(m[1])
      out.duration = Math.round(/^h/i.test(m[2]) ? n * 60 : n)
      out.tokens.push({ type: 'duration', text: U.fmtDuration(out.duration) })
    })
    // time
    take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s)/i, m => {
      const t = fmtClock(m[1], m[2], m[3])
      if (!t) return false
      out.time = t
    }) ||
      take(/\s(?:at\s+)?(\d{1,2}):(\d{2})(?=\s)/i, m => {
        const t = fmtClock(m[1], m[2])
        if (!t) return false
        out.time = t
      }) ||
      take(/\s(noon|midday)(?=\s)/i, () => {
        out.time = '12:00'
      })
    // dates
    const today = U.todayISO()
    take(/\s(today|tod)(?=\s)/i, () => {
      out.due = today
    }) ||
      take(/\s(tonight)(?=\s)/i, () => {
        out.due = today
        if (!out.time) out.time = '20:00'
      }) ||
      take(/\s(tomorrow|tmrw|tmr)(?=\s)/i, () => {
        out.due = U.addDays(today, 1)
      }) ||
      take(/\s(next week)(?=\s)/i, () => {
        out.due = nextWeekday(1, true)
      }) ||
      take(/\s(this weekend|weekend)(?=\s)/i, () => {
        out.due = nextWeekday(6)
      }) ||
      take(/\sin\s+(\d+)\s*(day|days|week|weeks)(?=\s)/i, m => {
        out.due = U.addDays(today, +m[1] * (/week/i.test(m[2]) ? 7 : 1))
      }) ||
      take(/\s(?:on\s+)?(next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?(?=\s)/i, m => {
        out.due = nextWeekday(WEEKDAYS.indexOf(m[2].slice(0, 3).toLowerCase()), !!m[1])
      }) ||
      take(/\s(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?=\s)/i, m => {
        out.due = monthDay(MONTHS3.indexOf(m[1].slice(0, 3).toLowerCase()), +m[2])
        if (!out.due) return false
      }) ||
      take(/\s(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?=\s)/i, m => {
        out.due = monthDay(MONTHS3.indexOf(m[2].slice(0, 3).toLowerCase()), +m[1])
        if (!out.due) return false
      }) ||
      take(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})(?=\s)/, m => {
        out.due = monthDay(+m[1] - 1, +m[2])
        if (!out.due) return false
      })
    if (out.time && !out.due) out.due = today
    if (out.due) out.tokens.unshift({ type: 'date', text: U.relDay(out.due) + (out.time ? ' · ' + U.fmtTime(out.time) : '') })
    else if (out.time) out.tokens.unshift({ type: 'date', text: U.fmtTime(out.time) })
    out.title = s
      .replace(/\s+/g, ' ')
      .replace(/\s+(on|at|by|due)\s*$/i, '')
      .trim()
    return out
  }

  function monthDay(month, day) {
    if (month < 0 || month > 11 || day < 1 || day > 31) return null
    const now = new Date()
    let d = new Date(now.getFullYear(), month, day)
    if (d.getMonth() !== month) return null
    if (U.toISODate(d) < U.todayISO()) d = new Date(now.getFullYear() + 1, month, day)
    return U.toISODate(d)
  }
})(window.Folio)
