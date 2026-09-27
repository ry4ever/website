/* Folio — focus timer (runs across views and reloads) and the Focus view. */
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

  const MODES = {
    focus: { label: 'Focus', tone: 'lavender', icon: 'focus' },
    short: { label: 'Short break', tone: 'mint', icon: 'coffee' },
    long: { label: 'Long break', tone: 'sky', icon: 'coffee' },
  }
  const tickers = new Set()
  const Focus = (F.focus = {})
  const f = () => S.state().focus
  const minutesFor = mode => f().settings[mode === 'focus' ? 'focus' : mode === 'short' ? 'short' : 'long']

  Focus.fmt = function(sec) {
    sec = Math.max(0, Math.round(sec))
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0')
  }

  Focus.status = function() {
    const s = f()
    const total = minutesFor(s.mode) * 60
    const remaining = s.running ? Math.max(0, (s.endsAt - Date.now()) / 1000) : Math.min(s.remaining, total)
    return Object.assign({ mode: s.mode, running: s.running, remaining, total, taskId: s.taskId, round: s.round }, MODES[s.mode])
  }

  function save(emit) {
    S.save()
    if (emit) S.commit('focus')
  }

  Focus.start = function(taskId) {
    const s = f()
    if (taskId !== undefined && taskId !== null) {
      if (s.mode !== 'focus') {
        s.mode = 'focus'
        s.remaining = minutesFor('focus') * 60
      }
      s.taskId = taskId
    }
    if (!s.running) {
      if (s.remaining <= 0) s.remaining = minutesFor(s.mode) * 60
      s.endsAt = Date.now() + s.remaining * 1000
      s.running = true
      unlockAudio()
      const task = P.task(s.taskId)
      UI.toast(MODES[s.mode].label + ' started' + (task ? ' · ' + task.title : ''), { action: { label: 'Open', onClick: () => F.app.go('focus') } })
    }
    save(true)
    tick()
  }

  Focus.pause = function() {
    const s = f()
    if (!s.running) return
    s.remaining = Math.max(0, (s.endsAt - Date.now()) / 1000)
    s.running = false
    save(true)
    tick()
  }

  Focus.toggle = function() {
    if (f().running) Focus.pause()
    else Focus.start()
  }

  Focus.reset = function() {
    const s = f()
    s.running = false
    s.remaining = minutesFor(s.mode) * 60
    save(true)
    tick()
  }

  Focus.setMode = function(mode) {
    const s = f()
    s.mode = mode
    s.running = false
    s.remaining = minutesFor(mode) * 60
    save(true)
    tick()
  }

  Focus.setTask = function(id) {
    f().taskId = id
    save(true)
  }

  Focus.skip = function() {
    advance(false)
  }

  function advance(completed) {
    const s = f()
    if (s.mode === 'focus') {
      if (completed) {
        const task = P.task(s.taskId)
        P.logFocus({ minutes: minutesFor('focus'), taskId: s.taskId, mode: 'focus' })
        notify('Focus session complete', task ? 'Nice work on “' + task.title + '”. Time for a break.' : 'Time for a short break.')
      }
      s.round = (s.round || 0) + 1
      s.mode = s.round % s.settings.rounds === 0 ? 'long' : 'short'
    } else {
      if (completed) notify('Break’s over', 'Ready for the next focus session?')
      s.mode = 'focus'
    }
    s.running = false
    s.remaining = minutesFor(s.mode) * 60
    save(true)
    tick()
  }

  Focus.onTick = function(fn) {
    tickers.add(fn)
    return () => tickers.delete(fn)
  }

  function tick() {
    const s = f()
    if (s.running && Date.now() >= s.endsAt) return advance(true)
    const st = Focus.status()
    tickers.forEach(fn => {
      try {
        fn(st)
      } catch (e) {
        console.error(e)
      }
    })
    // Live timer in the tab title while it runs.
    const base = document.title.replace(/^\(\d\d:\d\d\) /, '')
    document.title = st.running ? '(' + Focus.fmt(st.remaining) + ') ' + base : base
  }
  setInterval(() => {
    if (S.state()) tick()
  }, 1000)

  // ---------------------------------------------------------------- sound and notifications
  let audio = null
  function unlockAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)()
      if (audio.state === 'suspended') audio.resume()
    } catch (e) {
      audio = null
    }
  }
  function chime() {
    if (!audio || !f().settings.sound) return
    const now = audio.currentTime
    ;[660, 880, 1175].forEach((freq, i) => {
      const o = audio.createOscillator()
      const g = audio.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, now + i * 0.16)
      g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.16 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.5)
      o.connect(g)
      g.connect(audio.destination)
      o.start(now + i * 0.16)
      o.stop(now + i * 0.16 + 0.55)
    })
  }
  function notify(title, body) {
    chime()
    UI.toast(title + ' · ' + body, { duration: 6000, action: { label: 'Open', onClick: () => F.app.go('focus') } })
    try {
      if (document.hidden && window.Notification && Notification.permission === 'granted') new Notification(title, { body })
    } catch (e) {
      /* notifications are optional */
    }
  }

  // ---------------------------------------------------------------- view
  V.focus = {
    title: 'Focus',
    icon: 'focus',
    mount(host) {
      const root = h('div.vt.vt-focus')
      host.appendChild(root)
      let stage = null
      function render() {
        root.innerHTML = ''
        const st = Focus.status()
        const t = U.todayISO()
        const todayLog = P.focusLog().filter(x => U.toISODate(new Date(x.at)) === t)
        root.appendChild(K.head({
          title: 'Focus',
          sub: 'One thing at a time. ' + todayLog.length + (todayLog.length === 1 ? ' session' : ' sessions') + ' and ' + U.fmtDuration(P.focusMinutesOn(t)) + ' of focus today.',
        }))
        const grid = h('div.focus-grid')
        stage = h('section.focus-stage', { class: 'tone-' + st.tone + (st.running ? ' running' : '') })
        paintStage(st)
        grid.appendChild(stage)
        grid.appendChild(sideColumn())
        root.appendChild(grid)
      }

      function paintStage(st) {
        stage.className = 'focus-stage tone-' + st.tone + (st.running ? ' running' : '')
        stage.innerHTML = ''
        const s = f()
        const pct = (1 - st.remaining / st.total) * 100
        const task = P.task(st.taskId)
        const gid = 'fg-' + st.mode
        const defs = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--t-fg)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient></defs>'
        const taskBtn = h('button.focus-task', {
          onClick: () => UI.menu(taskBtn, [{ header: 'What are you working on?' }, { label: 'No task', icon: 'circle', checked: !s.taskId, onClick: () => Focus.setTask(null) }].concat(
            P.sortTasks(P.openTasks()).slice(0, 30).map(x => ({ label: x.title, icon: K.badge(P.project(x.projectId), 'xs'), hint: x.due ? U.relDay(x.due) : '', checked: s.taskId === x.id, onClick: () => Focus.setTask(x.id) }))
          ), { width: 320, search: true, searchPlaceholder: 'Find a task…' }),
        }, U.icon('target', 16), h('span', { text: task ? task.title : 'Choose a task to focus on' }), U.icon('chevronDown', 13))
        stage.appendChild(h('div.focus-blob.b1'))
        stage.appendChild(h('div.focus-blob.b2'))
        stage.appendChild(K.segmented(Object.keys(MODES).map(m => ({ id: m, label: MODES[m].label + ' · ' + minutesFor(m) + 'm' })), s.mode, m => Focus.setMode(m), 'seg-glass'))
        const ring = K.ring(pct, { size: 280, stroke: 12, gradient: gid, defs })
        ring.classList.add('focus-ring')
        ring.appendChild(h('div.focus-time', null, h('div.focus-clock.num', { text: Focus.fmt(st.remaining) }), h('div.focus-sub', { text: st.label + ' · Round ' + (((s.round || 0) % s.settings.rounds) + 1) + ' of ' + s.settings.rounds })))
        stage.appendChild(ring)
        stage.appendChild(taskBtn)
        stage.appendChild(
          h('div.focus-ctrls', null,
            h('button.fc-btn', { title: 'Reset', onClick: Focus.reset }, U.icon('refresh', 18)),
            h('button.fc-main', { title: st.running ? 'Pause (Space)' : 'Start (Space)', onClick: Focus.toggle }, U.icon(st.running ? 'pause' : 'play', 26)),
            h('button.fc-btn', { title: 'Skip to next', onClick: Focus.skip }, U.icon('skip', 18))
          )
        )
        const dots = h('div.focus-dots')
        for (let i = 0; i < s.settings.rounds; i++) dots.appendChild(h('i', { class: i < (s.round || 0) % s.settings.rounds ? 'on' : null }))
        stage.appendChild(dots)
      }

      function sideColumn() {
        const s = f()
        const t = U.todayISO()
        const week = P.lastDays(7, P.focusMinutesOn)
        let streak = 0
        for (let d = t; P.focusMinutesOn(d) > 0 || (d === t && streak === 0 && P.focusMinutesOn(U.addDays(t, -1)) > 0); d = U.addDays(d, -1)) {
          if (P.focusMinutesOn(d) > 0) streak++
          if (streak > 365) break
        }
        const col = h('div.focus-side')
        col.appendChild(K.card({
          title: 'This week',
          icon: 'chart',
          tone: 'lavender',
          body: h('div', null,
            h('div.fstats', null,
              h('div.fstat', null, h('b.num', { text: U.fmtDuration(week.reduce((a, x) => a + x.value, 0)) }), h('span', { text: 'focused' })),
              h('div.fstat', null, h('b.num', { text: String(P.focusLog().filter(x => Date.now() - x.at < 7 * 86400000).length) }), h('span', { text: 'sessions' })),
              h('div.fstat', null, h('b.num', { text: streak + 'd' }), h('span', { text: 'streak' }))
            ),
            K.barChart(week.map(x => ({ label: U.DAYS[U.parseISODate(x.iso).getDay()].slice(0, 3), value: x.value })), { tone: 'lavender', format: v => U.fmtDuration(v) })
          ),
        }))
        const num = (key, label, min, max) => {
          const inp = h('input.pinput.num-input', { type: 'number', min: String(min), max: String(max), value: String(s.settings[key]), id: 'focus-' + key, 'aria-label': label })
          inp.addEventListener('change', () => {
            const v = U.clamp(Math.round(+inp.value || s.settings[key]), min, max)
            s.settings[key] = v
            if (!s.running) s.remaining = minutesFor(s.mode) * 60
            save(true)
          })
          return h('label.fset', null, h('span', { text: label }), inp)
        }
        const sound = h('button.switch', { class: s.settings.sound ? 'on' : null, role: 'switch', 'aria-checked': s.settings.sound ? 'true' : 'false', onClick: () => {
          s.settings.sound = !s.settings.sound
          if (s.settings.sound) unlockAudio()
          save(true)
        } })
        col.appendChild(K.card({
          title: 'Timer settings',
          icon: 'gear',
          tone: 'slate',
          body: h('div.fsets', null, num('focus', 'Focus (min)', 5, 120), num('short', 'Short break', 1, 30), num('long', 'Long break', 5, 60), num('rounds', 'Rounds', 2, 8),
            h('label.fset', null, h('span', { text: 'Chime at the end' }), sound)),
        }))
        const recent = P.focusLog().slice(-6).reverse()
        col.appendChild(K.card({
          title: 'Recent sessions',
          icon: 'clock',
          tone: 'sky',
          body: recent.length
            ? h('div.flog', null, recent.map(x => {
                const task = P.task(x.taskId)
                return h('div.flog-row', null,
                  h('span.flog-dot'),
                  h('div.flog-main', null, h('div.flog-task', { text: task ? task.title : 'Unlabeled session' }), h('div.flog-when', { text: U.relDay(U.toISODate(new Date(x.at))) + ' · ' + U.fmtTime(U.fromMin(new Date(x.at).getHours() * 60 + new Date(x.at).getMinutes())) })),
                  h('span.flog-min.num', { text: x.minutes + 'm' })
                )
              }))
            : K.empty('focus', 'No sessions yet', 'Finished sessions are logged here.'),
        }))
        return col
      }

      render()
      const offTick = Focus.onTick(st => {
        if (!stage) return
        const clock = stage.querySelector('.focus-clock')
        if (clock) clock.textContent = Focus.fmt(st.remaining)
        const arc = stage.querySelector('.ring-arc')
        if (arc) {
          const c = parseFloat(arc.getAttribute('stroke-dasharray'))
          arc.setAttribute('stroke-dashoffset', (c * (st.remaining / st.total)).toFixed(2))
        }
      })
      const unsub = K.watch(['focus', 'tasks'], render)
      const onKey = e => {
        const t = e.target
        if (e.code === 'Space' && !(t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName)) && !UI.anyOpen()) {
          e.preventDefault()
          Focus.toggle()
        }
      }
      document.addEventListener('keydown', onKey)
      return {
        destroy() {
          offTick()
          unsub()
          document.removeEventListener('keydown', onKey)
        },
      }
    },
  }
})(window.Folio)
