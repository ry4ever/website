/* Folio landing page: live demos, scroll effects and small niceties. */
;(function() {
  'use strict'

  const root = document.documentElement
  root.classList.add('js')
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const $ = (sel, from) => (from || document).querySelector(sel)
  const $$ = (sel, from) => Array.prototype.slice.call((from || document).querySelectorAll(sel))
  const el = (tag, cls, text) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const pad = n => String(n).padStart(2, '0')

  const ICONS = {
    date: '<rect x="3.5" y="4.5" width="13" height="12" rx="2.5"/><path d="M3.5 8.5h13M7 3v3M13 3v3"/>',
    project: '<path d="M3.5 6.5a2 2 0 0 1 2-2h3l1.5 1.8h4.5a2 2 0 0 1 2 2v5.7a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z"/>',
    prio: '<path d="M5.5 16.5v-12M5.5 4.5h8.5l-1.8 3 1.8 3H5.5"/>',
    label: '<path d="M3.8 9.6V4.8a1 1 0 0 1 1-1h4.8l6.6 6.6-5.8 5.8z"/><circle cx="7.3" cy="7.3" r="1"/>',
    repeat: '<path d="M4 9V8a3 3 0 0 1 3-3h8.5M13.5 3l2 2-2 2M16 11v1a3 3 0 0 1-3 3H4.5M6.5 17l-2-2 2-2"/>',
    duration: '<circle cx="10" cy="10.5" r="6"/><path d="M10 7.5v3l2 1.3M8 3h4"/>',
    check: '<path d="m5 10.5 3.2 3.2L15 6.5"/>',
    flag: '<path d="M5.5 16.5v-12M5.5 4.5h8.5l-1.8 3 1.8 3H5.5"/>',
  }
  const icon = (name, width) =>
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="' + (width || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>'

  // Demos only run while they're on screen and the tab is visible.
  const seen = new WeakMap()
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => entries.forEach(e => seen.set(e.target, e.isIntersecting)), { threshold: 0.12 })
    : null
  function watch(node) {
    if (io) io.observe(node)
    else seen.set(node, true)
  }
  const onScreen = node => !document.hidden && seen.get(node) === true
  async function untilOnScreen(node) {
    while (!onScreen(node)) await sleep(350)
  }

  // ------------------------------------------------------------------ small things
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
  if (!isMac) $$('kbd[data-mod]').forEach(k => (k.textContent = 'Ctrl'))
  $$('[data-year]').forEach(n => (n.textContent = String(new Date().getFullYear())))

  // Nav gets more solid once you scroll; the hero shot straightens out as it comes into view.
  const nav = $('#nav')
  const shot = $('.shot')
  let queued = false
  function onScroll() {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      const y = window.scrollY || 0
      if (nav) nav.classList.toggle('scrolled', y > 8)
      if (shot && !reduce) shot.style.setProperty('--tilt', (Math.max(0, 1 - y / 440) * 11).toFixed(2) + 'deg')
    })
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  // The viewer's theme wins over the OS setting when it names one, for the screenshot too.
  const shotImg = $('.shot img')
  const shotSource = $('.shot source')
  function syncShot() {
    const forced = root.getAttribute('data-theme')
    if (!shotImg || !shotSource) return
    shotSource.media = forced ? 'not all' : '(prefers-color-scheme: dark)'
    if (forced) shotImg.src = forced === 'dark' ? 'img/shot-dashboard-dark.jpg' : 'img/shot-dashboard.jpg'
  }
  syncShot()
  if ('MutationObserver' in window) new MutationObserver(syncShot).observe(root, { attributes: true, attributeFilter: ['data-theme'] })

  // ------------------------------------------------------------------ quick add
  // Each phrase mirrors what the real parser in the app understands.
  const PHRASES = [
    {
      parts: [['Email Sam about the budget '], ['tomorrow', 'date', 'Tomorrow'], [' '], ['3pm', 'date', 'Tomorrow · 3pm'], [' '], ['#q4', 'project', 'Q4 Planning'], [' '], ['!high', 'prio', 'High']],
      title: 'Email Sam about the budget',
      meta: 'Tomorrow · 3:00pm · Q4 Planning',
      flag: 'High',
      tone: 'k-prio',
    },
    {
      parts: [['Long run '], ['sunday', 'date', 'Sunday'], [' '], ['7am', 'date', 'Sunday · 7am'], [' '], ['#fitness', 'project', 'Fitness Plan'], [' '], ['every week', 'repeat', 'Every week'], [' '], ['for 1h', 'duration', '1h']],
      title: 'Long run',
      meta: 'Sunday · 7:00am · 1h · Fitness Plan · every week',
      flag: '',
      tone: 'k-repeat',
    },
    {
      parts: [['Call mom '], ['fri', 'date', 'Friday'], [' '], ['6pm', 'date', 'Friday · 6pm'], [' '], ['@family', 'label', 'family'], [' '], ['!!!', 'prio', 'Urgent', 'urgent']],
      title: 'Call mom',
      meta: 'Friday · 6:00pm · #family',
      flag: 'Urgent',
      tone: 'k-prio urgent',
    },
  ]

  const EARLIER = [
    { title: 'Pay the electricity bill', meta: 'Today · Home & Admin', flag: 'High', tone: 'k-prio' },
    { title: 'Review budget with finance', meta: 'Tomorrow · 10:00am · Q4 Planning', flag: '', tone: 'k-project' },
  ]

  function quickAddDemo() {
    const card = $('.demo-qa')
    if (!card) return
    const box = $('.qa-box', card)
    const text = $('[data-qa-text]', card)
    const chips = $('[data-qa-chips]', card)
    const list = $('[data-qa-list]', card)
    watch(card)

    function chipFor(kind, label, extra) {
      let chip = chips.querySelector('[data-kind="' + kind + '"]')
      if (!chip) {
        chip = el('span', 'qchip k-' + kind + (extra ? ' ' + extra : ''))
        chip.dataset.kind = kind
        chips.appendChild(chip)
      } else {
        // Re-trigger the pop when a chip gains more detail (a time joins the date).
        chip.style.animation = 'none'
        void chip.offsetWidth
        chip.style.animation = ''
      }
      chip.innerHTML = icon(kind, 1.9) + '<span></span>'
      chip.lastChild.textContent = label
    }

    function item(p) {
      const n = el('div', 'qa-item ' + p.tone)
      n.appendChild(el('span', 'qr-check'))
      const main = el('span', 'qr-main')
      main.appendChild(el('b', null, p.title))
      main.appendChild(el('small', null, p.meta))
      n.appendChild(main)
      n.appendChild(el('span', 'qr-flag', p.flag))
      return n
    }

    function add(p) {
      const n = item(p)
      n.classList.add('enter', 'fresh')
      list.insertBefore(n, list.firstChild)
      void n.offsetWidth
      n.classList.remove('enter')
      setTimeout(() => {
        while (list.children.length > 2) list.removeChild(list.lastChild)
      }, 500)
      setTimeout(() => n.classList.remove('fresh'), 1600)
    }

    EARLIER.forEach(p => list.appendChild(item(p)))

    if (reduce) {
      const p = PHRASES[0]
      p.parts.forEach(part => {
        text.appendChild(el('span', part[1] ? 'tk k-' + part[1] + (part[3] ? ' ' + part[3] : '') : null, part[0]))
        if (part[1]) chipFor(part[1], part[2], part[3])
      })
      return
    }

    ;(async function loop() {
      let i = 0
      for (;;) {
        const p = PHRASES[i++ % PHRASES.length]
        await untilOnScreen(card)
        text.textContent = ''
        chips.innerHTML = ''
        chips.classList.remove('qchips-out')
        for (const part of p.parts) {
          const span = el('span')
          text.appendChild(span)
          for (const ch of part[0]) {
            span.textContent += ch
            text.scrollLeft = text.scrollWidth
            await sleep(38 + Math.random() * 52)
          }
          if (part[1]) {
            span.className = 'tk k-' + part[1] + (part[3] ? ' ' + part[3] : '')
            chipFor(part[1], part[2], part[3])
            await sleep(160)
          }
        }
        await sleep(900)
        box.classList.add('sent')
        await sleep(150)
        box.classList.remove('sent')
        text.textContent = ''
        chips.classList.add('qchips-out')
        add(p)
        await sleep(2600)
      }
    })()
  }

  // ------------------------------------------------------------------ focus timer
  function focusDemo() {
    const TOTAL = 25 * 60
    const state = { left: 18 * 60 + 24, running: true }
    const clocks = $$('[data-focus-clock]')
    const big = $('.fx-arc')
    const small = $('.ff-arc')
    const btn = $('[data-focus-toggle]')
    if (!clocks.length) return

    function paint() {
      const txt = pad(Math.floor(state.left / 60)) + ':' + pad(state.left % 60)
      clocks.forEach(c => (c.textContent = txt))
      const frac = state.left / TOTAL
      if (big) big.style.strokeDashoffset = (326.73 * (1 - frac)).toFixed(2)
      if (small) small.style.strokeDashoffset = (113.1 * (1 - frac)).toFixed(2)
    }
    paint()
    setInterval(() => {
      if (!state.running || document.hidden) return
      state.left -= 1
      if (state.left < 0) state.left = TOTAL
      paint()
    }, 1000)
    if (btn) {
      btn.addEventListener('click', () => {
        state.running = !state.running
        btn.classList.toggle('paused', !state.running)
        btn.setAttribute('aria-label', state.running ? 'Pause the demo timer' : 'Resume the demo timer')
      })
    }
  }

  // ------------------------------------------------------------------ calendar
  // [day (0 = Monday), start hour, end hour, title, calendar]
  const EVENTS = [
    [0, 9, 9.5, 'Team standup', 'work'], [0, 10, 12, 'Deep work', 'work'], [0, 17, 18, 'Gym', 'health'],
    [1, 9, 9.5, 'Team standup', 'work'], [1, 12, 13, 'Lunch with Priya', 'personal'], [1, 14, 15, 'Design review', 'work'],
    [2, 9, 9.5, 'Team standup', 'work'], [2, 10.5, 12, 'Q4 goals', 'work'], [2, 16.5, 17.5, 'Yoga', 'health'],
    [3, 9, 9.5, 'Team standup', 'work'], [3, 11, 11.5, '1:1 with Alex', 'work'], [3, 15, 16, 'Dentist', 'personal'],
    [4, 9, 9.5, 'Team standup', 'work'], [4, 13.5, 14.5, 'Sprint demo', 'work'], [4, 16.5, 18, 'Dinner with Sam', 'personal'],
    [5, 8, 9, 'Morning run', 'health'], [5, 10, 11.5, 'Farmers market', 'personal'],
    [6, 9, 12, 'Weekend hike', 'health'], [6, 16, 17, 'Plan the week', 'work'],
  ]
  const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const START = 8
  const END = 18
  const PX = 28

  const fmtHour = h => {
    const hr = Math.floor(h)
    const min = Math.round((h - hr) * 60)
    const ap = hr >= 12 ? 'pm' : 'am'
    const h12 = hr % 12 || 12
    return h12 + (min ? ':' + pad(min) : '') + ap
  }

  function calendarDemo() {
    const host = $('.demo-cal')
    if (!host) return
    const now = new Date()
    const todayIdx = (now.getDay() + 6) % 7
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIdx)

    const head = el('div', 'mc-head')
    head.appendChild(el('div'))
    DAY.forEach((d, i) => {
      const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
      const cell = el('div', 'mc-day' + (i === todayIdx ? ' today' : ''))
      cell.appendChild(el('b', null, String(date.getDate())))
      cell.appendChild(document.createTextNode(d))
      head.appendChild(cell)
    })

    const body = el('div', 'mc-body')
    body.style.height = (END - START) * PX + 'px'
    const times = el('div', 'mc-times')
    for (let h = START + 1; h < END; h++) {
      const t = el('span', null, fmtHour(h))
      t.style.top = (h - START) * PX + 'px'
      times.appendChild(t)
    }
    body.appendChild(times)
    const cols = DAY.map((d, i) => {
      const col = el('div', 'mc-col' + (i >= 5 ? ' weekend' : '') + (i === todayIdx ? ' today' : ''))
      body.appendChild(col)
      return col
    })
    EVENTS.forEach(e => {
      const ev = el('div', 'ev ' + e[4] + (e[2] - e[1] < 0.75 ? ' short' : ''))
      ev.dataset.cal = e[4]
      ev.style.top = (e[1] - START) * PX + 1 + 'px'
      ev.style.height = (e[2] - e[1]) * PX - 3 + 'px'
      ev.appendChild(el('b', null, e[3]))
      ev.appendChild(el('span', null, fmtHour(e[1]) + ' – ' + fmtHour(e[2])))
      cols[e[0]].appendChild(ev)
    })

    const line = el('div', 'mc-now')
    const pill = el('div', 'mc-nowpill')
    function placeNow() {
      const d = new Date()
      const h = d.getHours() + d.getMinutes() / 60
      const inside = h >= START && h <= END
      line.style.display = pill.style.display = inside ? '' : 'none'
      if (!inside) return
      line.style.top = (h - START) * PX + 'px'
      pill.style.top = (h - START) * PX + 'px'
      pill.textContent = fmtHour(Math.floor(h * 60) / 60).replace(/(am|pm)$/, '')
    }
    cols[todayIdx].appendChild(line)
    times.appendChild(pill)
    placeNow()
    setInterval(placeNow, 60 * 1000)

    host.appendChild(head)
    host.appendChild(body)

    const pills = $$('[data-cal-filters] button')
    pills.forEach(b =>
      b.addEventListener('click', () => {
        pills.forEach(x => x.classList.toggle('on', x === b))
        const want = b.dataset.cal
        $$('.ev', host).forEach(ev => ev.classList.toggle('dim', want !== 'all' && ev.dataset.cal !== want))
      })
    )
  }

  // ------------------------------------------------------------------ habits
  const HABITS = [
    { icon: '🏃', name: 'Morning run', tone: 'tone-peach', streak: 7, done: false, week: [1, 1, 0, 1, 1, 1] },
    { icon: '💧', name: 'Drink 2L of water', tone: 'tone-sky', streak: 12, done: true, week: [1, 1, 1, 1, 1, 1] },
    { icon: '📚', name: 'Read 20 pages', tone: 'tone-lavender', streak: 3, done: false, week: [0, 1, 0, 1, 1, 1] },
  ]

  // Deterministic "random" so the heatmap looks the same on every visit.
  function rng(seed) {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function habitsDemo() {
    const host = $('[data-habits]')
    if (!host) return
    const todayIdx = (new Date().getDay() + 6) % 7
    const WEEKS = 14
    const rand = rng(42)
    const heat = el('div', 'hb-heat')
    heat.setAttribute('aria-label', 'Morning run, last ' + WEEKS + ' weeks')
    heat.setAttribute('role', 'img')
    heat.style.gridTemplateColumns = 'repeat(' + WEEKS + ', minmax(0, 1fr))'
    let todayCell = null
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const cell = el('i')
        const isThisWeek = w === WEEKS - 1
        if (isThisWeek && d > todayIdx) cell.className = 'future'
        else if (isThisWeek && d === todayIdx) {
          cell.className = 'today'
          todayCell = cell
        } else {
          const r = rand() * (0.55 + (w / WEEKS) * 0.6)
          cell.className = r > 0.72 ? 'l3' : r > 0.5 ? 'l2' : r > 0.3 ? 'l1' : ''
        }
        heat.appendChild(cell)
      }
    }

    HABITS.forEach((hb, idx) => {
      const row = el('div', 'hb-row ' + hb.tone)
      row.appendChild(el('span', 'hb-ic', hb.icon))
      const main = el('span', 'hb-main')
      main.appendChild(el('b', null, hb.name))
      const week = el('span', 'hb-week')
      const bars = []
      for (let d = 0; d < 7; d++) {
        const bar = el('i')
        // hb.week holds the six days before today, oldest first.
        if (d < todayIdx && hb.week[6 - (todayIdx - d)]) bar.classList.add('on')
        bars.push(bar)
        week.appendChild(bar)
      }
      main.appendChild(week)
      row.appendChild(main)
      const streak = el('span', 'hb-streak')
      row.appendChild(streak)
      const btn = el('button', 'hb-check')
      btn.type = 'button'
      btn.innerHTML = icon('check', 2.6)
      row.appendChild(btn)

      function paint(bump) {
        streak.textContent = '🔥 ' + hb.streak
        btn.setAttribute('aria-pressed', hb.done ? 'true' : 'false')
        btn.setAttribute('aria-label', (hb.done ? 'Undo ' : 'Complete ') + hb.name + ' for today')
        bars[todayIdx].classList.toggle('on', hb.done)
        if (idx === 0 && todayCell) todayCell.className = 'today' + (hb.done ? ' l3' : '')
        if (bump) {
          streak.classList.remove('bump')
          void streak.offsetWidth
          streak.classList.add('bump')
        }
      }
      btn.addEventListener('click', () => {
        hb.done = !hb.done
        hb.streak += hb.done ? 1 : -1
        paint(true)
      })
      paint(false)
      host.appendChild(row)
    })
    host.appendChild(heat)
  }

  // ------------------------------------------------------------------ board
  const CARDS = {
    a: { title: 'Write release notes', badge: 'M', tone: 'tone-peach', due: 'Oct 3' },
    b: { title: 'Plan team offsite', badge: 'Q', tone: 'tone-sky', due: 'Oct 9', prio: 'tone-butter' },
    c: { title: 'Buy new running shoes', badge: 'F', tone: 'tone-mint', due: 'Sat' },
    d: { title: 'Draft Q4 goals doc', badge: 'Q', tone: 'tone-sky', due: 'Today', prio: 'tone-rose' },
    e: { title: 'Fix sync bug on Android', badge: 'M', tone: 'tone-peach', due: 'Today', prio: 'tone-rose' },
    f: { title: 'Export case study images', badge: 'W', tone: 'tone-lavender', due: 'Mon' },
  }
  const START_COLS = { todo: ['a', 'b', 'c'], doing: ['d', 'e'], done: ['f'] }

  function boardDemo() {
    const host = $('[data-board]')
    if (!host) return
    const lists = {}
    $$('.kc-list', host).forEach(l => (lists[l.dataset.col] = l))
    const nodes = {}
    let cols = JSON.parse(JSON.stringify(START_COLS))

    Object.keys(CARDS).forEach(id => {
      const c = CARDS[id]
      const n = el('div', 'kcard')
      n.appendChild(el('b', null, c.title))
      const meta = el('div', 'kmeta')
      meta.appendChild(el('span', 'kbadge ' + c.tone, c.badge))
      meta.appendChild(el('span', null, c.due))
      if (c.prio) {
        const flag = el('span', 'kprio ' + c.prio)
        flag.innerHTML = icon('flag', 2.4)
        meta.appendChild(flag)
      }
      n.appendChild(meta)
      nodes[id] = n
    })

    function place() {
      Object.keys(cols).forEach(col =>
        cols[col].forEach(id => {
          nodes[id].classList.toggle('done', col === 'done')
          lists[col].appendChild(nodes[id])
        })
      )
    }

    // FLIP: remember where cards were, move them, then animate from old to new.
    function animate(change) {
      const before = {}
      Object.keys(nodes).forEach(id => (before[id] = nodes[id].getBoundingClientRect()))
      change()
      place()
      Object.keys(nodes).forEach(id => {
        const n = nodes[id]
        const a = before[id]
        const b = n.getBoundingClientRect()
        const dx = a.left - b.left
        const dy = a.top - b.top
        if (!dx && !dy) return
        n.style.transition = 'none'
        n.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'
        void n.offsetWidth
        n.style.transition = 'transform 0.65s cubic-bezier(0.2, 0.8, 0.2, 1)'
        n.style.transform = ''
      })
    }

    place()
    if (reduce) return
    watch(host)
    setInterval(() => {
      if (!onScreen(host)) return
      animate(() => {
        if (!cols.todo.length && !cols.doing.length) {
          cols = JSON.parse(JSON.stringify(START_COLS))
          return
        }
        // Finished work lands on top of Done; the next task joins the bottom of Doing.
        if (cols.doing.length) cols.done.unshift(cols.doing.shift())
        if (cols.todo.length) cols.doing.push(cols.todo.shift())
      })
    }, 2800)
  }

  // ------------------------------------------------------------------ slash menu
  function slashDemo() {
    const menu = $('[data-slash]')
    if (!menu || reduce) return
    const items = $$('.sm-item', menu)
    let i = 0
    watch(menu)
    setInterval(() => {
      if (!onScreen(menu)) return
      i = (i + 1) % items.length
      items.forEach((it, j) => it.classList.toggle('on', j === i))
    }, 1500)
  }

  quickAddDemo()
  focusDemo()
  calendarDemo()
  habitsDemo()
  boardDemo()
  slashDemo()
})()
