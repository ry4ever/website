/* Folio — starter workspace content. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util

  function b(type, text, extra) {
    return F.store.newBlock(type, Object.assign({ text: text || '' }, extra || {}))
  }
  function withKids(block, kids) {
    block.children = kids
    return block
  }
  function daysFromNow(n) {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return U.toISODate(d)
  }

  F.seed = {
    populate() {
      const S = F.store
      const st = S.state()

      // ---------- Getting started ----------
      const welcome = S.createPage({ title: 'Getting Started', icon: '👋', cover: { type: 'gradient', value: 'dawn', pos: 50 } })
      const example = S.createPage({
        title: 'Example sub-page',
        icon: '🧩',
        parentId: welcome.id,
        detached: true,
        blocks: [
          b('text', 'Pages can live inside other pages, as deep as you like. This one sits inside <b>Getting Started</b> — look at the breadcrumb at the top.'),
          b('text', 'Use the arrow next to a page in the sidebar to expand its sub-pages.'),
        ],
      })
      welcome.blocks = [
        b('text', 'Folio is one place for your notes, docs, tasks and small databases. Everything on this page is editable — click anywhere and start typing.'),
        b('callout', 'Your work saves automatically in this browser. Press <b>' + U.modKey + 'K</b> to search, or type <code>/</code> on an empty line to see every block you can add.', { icon: '💡', color: 'bg-gray' }),
        b('h2', 'The basics'),
        b('todo', 'Click anywhere on this page and start typing'),
        b('todo', 'Type <code>/</code> to add headings, lists, toggles, code, images and databases'),
        b('todo', 'Select some text to make it <b>bold</b>, <i>italic</i>, <span class="c-red">colorful</span> or a link'),
        b('todo', 'Hover over a block and drag the <b>⋮⋮</b> handle to move it'),
        b('todo', 'Press <code>Tab</code> to nest a block under the one above it'),
        b('todo', 'Create a page of your own with <b>New page</b> in the sidebar', { checked: false }),
        b('todo', 'Open this page', { checked: true }),
        b('h2', 'Things to try'),
        withKids(b('toggle', 'Markdown shortcuts'), [
          b('bullet', '<code>#</code>, <code>##</code> or <code>###</code> then space for a heading'),
          b('bullet', '<code>-</code> or <code>*</code> then space for a bulleted list'),
          b('bullet', '<code>1.</code> then space for a numbered list'),
          b('bullet', '<code>[]</code> then space for a to-do'),
          b('bullet', '<code>&gt;</code> then space for a toggle, <code>"</code> then space for a quote'),
          b('bullet', '<code>```</code> for a code block and <code>---</code> for a divider'),
          b('bullet', 'Wrap text in <code>**</code>, <code>*</code>, <code>`</code> or <code>~</code> for bold, italic, code or strikethrough'),
        ]),
        withKids(b('toggle', 'Keyboard shortcuts'), [
          b('bullet', '<b>' + U.modKey + 'K</b> — search and jump to any page'),
          b('bullet', '<b>' + U.modKey + '\\</b> — show or hide the sidebar'),
          b('bullet', '<b>' + U.modKey + 'Z</b> / <b>' + U.modKey + 'Shift+Z</b> — undo and redo'),
          b('bullet', '<b>' + U.modKey + 'D</b> — duplicate the current block'),
          b('bullet', '<b>' + U.modKey + 'Enter</b> — check a to-do or open a toggle'),
          b('bullet', '<b>Esc</b> — select the current block, then use the arrows, Backspace or ' + U.modKey + 'C'),
          b('bullet', '<b>@</b> — mention another page or a date'),
          b('bullet', 'Press <b>?</b> anywhere outside the editor to see the full list'),
        ]),
        withKids(b('toggle', 'Databases'), [
          b('text', 'A database is a collection of pages with properties such as status, dates and tags. You can look at the same data as a table, a board, a gallery, a list or a calendar.'),
          b('text', 'Open <b>Task Board</b> or <b>Reading List</b> in the sidebar to see some in action.'),
        ]),
        b('h2', 'Block examples'),
        b('quote', 'Write it down. A plan you can see is a plan you can change.'),
        withKids(b('bullet', 'Bulleted lists can be nested'), [
          withKids(b('bullet', 'Press Tab to indent'), [b('bullet', 'and Shift+Tab to outdent')]),
        ]),
        b('numbered', 'Numbered lists count for you'),
        b('numbered', 'Even when you reorder them'),
        b('code', "function greet(name) {\n  // Code blocks are highlighted as you type\n  return `Hello, ${name}!`\n}\n\nconsole.log(greet('Folio'))", { language: 'javascript' }),
        b('divider'),
        b('page', '', { pageId: example.id }),
        b('text', 'When you are done exploring, delete this page from the <b>•••</b> menu at the top right. It will stay in Trash in case you change your mind.', { color: 'c-gray' }),
      ]

      // ---------- Quick note ----------
      S.createPage({
        title: 'Quick Note',
        icon: '📝',
        blocks: [
          b('text', 'A scratch pad for anything on your mind.'),
          b('h3', 'Ideas'),
          b('bullet', 'Reorganize the bookshelf by color'),
          b('bullet', 'Try the new bakery on the corner'),
          b('bullet', 'Plan a weekend hike'),
          b('h3', 'Groceries'),
          b('todo', 'Oat milk'),
          b('todo', 'Coffee beans', { checked: true }),
          b('todo', 'Basil and tomatoes'),
        ],
      })

      // ---------- Task board ----------
      const tasks = S.createPage({ title: 'Task Board', icon: '✅', type: 'database', view: 'board' })
      const tdb = tasks.db
      const status = tdb.properties.find(p => p.type === 'status')
      const tags = tdb.properties.find(p => p.type === 'multi_select')
      tags.name = 'Tags'
      tags.options = [
        { id: U.uid(), name: 'Design', color: 'purple' },
        { id: U.uid(), name: 'Writing', color: 'orange' },
        { id: U.uid(), name: 'Planning', color: 'blue' },
        { id: U.uid(), name: 'Team', color: 'pink' },
      ]
      const priority = {
        id: U.uid(),
        name: 'Priority',
        type: 'select',
        options: [
          { id: U.uid(), name: 'High', color: 'red' },
          { id: U.uid(), name: 'Medium', color: 'yellow' },
          { id: U.uid(), name: 'Low', color: 'gray' },
        ],
      }
      const due = { id: U.uid(), name: 'Due', type: 'date' }
      const done = { id: U.uid(), name: 'Reviewed', type: 'checkbox' }
      tdb.properties.splice(1, 0, priority, due)
      tdb.properties.push(done)
      tdb.views[0].name = 'Board'
      tdb.views[0].groupBy = status.id
      const tv = S.newView('table', tdb)
      tv.name = 'All tasks'
      const cv = S.newView('calendar', tdb)
      cv.dateProp = due.id
      tdb.views.push(tv, cv)
      const st3 = status.options
      const pr = priority.options
      const tg = tags.options
      ;[
        ['Draft project brief', st3[1], pr[0], 2, [tg[1], tg[2]], false],
        ['Review design mockups', st3[0], pr[1], 4, [tg[0]], false],
        ['Set up weekly check-in', st3[2], pr[2], -3, [tg[3]], true],
        ['Write release notes', st3[0], pr[0], 6, [tg[1]], false],
        ['Plan team offsite', st3[1], pr[1], 12, [tg[2], tg[3]], false],
        ['Update onboarding guide', st3[2], pr[2], -6, [tg[1]], true],
      ].forEach(r => {
        const row = S.addRow(tasks.id, {}, null, r[0])
        row.props[status.id] = r[1].id
        row.props[priority.id] = r[2].id
        row.props[due.id] = daysFromNow(r[3])
        row.props[tags.id] = r[4].map(o => o.id)
        row.props[done.id] = r[5]
        row.blocks = [
          b('h3', 'Details'),
          b('text', 'Add notes, checklists and links for this task here.'),
          b('todo', 'First step'),
          b('todo', 'Second step'),
        ]
      })

      // ---------- Reading list ----------
      const reading = S.createPage({ title: 'Reading List', icon: '📚', type: 'database', view: 'gallery' })
      const rdb = reading.db
      rdb.properties = [
        { id: 'title', name: 'Name', type: 'title' },
        { id: U.uid(), name: 'Author', type: 'text' },
        {
          id: U.uid(),
          name: 'Status',
          type: 'select',
          options: [
            { id: U.uid(), name: 'To read', color: 'gray' },
            { id: U.uid(), name: 'Reading', color: 'yellow' },
            { id: U.uid(), name: 'Finished', color: 'green' },
          ],
        },
        {
          id: U.uid(),
          name: 'Genre',
          type: 'multi_select',
          options: [
            { id: U.uid(), name: 'Classic', color: 'brown' },
            { id: U.uid(), name: 'Adventure', color: 'blue' },
            { id: U.uid(), name: 'Philosophy', color: 'purple' },
            { id: U.uid(), name: 'Nature', color: 'green' },
            { id: U.uid(), name: 'Romance', color: 'pink' },
            { id: U.uid(), name: 'Horror', color: 'red' },
          ],
        },
        { id: U.uid(), name: 'Pages', type: 'number' },
      ]
      const [, author, rstatus, genre, pages] = rdb.properties
      rdb.views = [S.newView('gallery', rdb), S.newView('table', rdb), S.newView('board', rdb)]
      rdb.views[2].groupBy = rstatus.id
      rdb.activeView = rdb.views[0].id
      const rs = rstatus.options
      const g = genre.options
      const covers = ['ocean', 'forest', 'dusk', 'sand', 'berry', 'mint']
      ;[
        ['Pride and Prejudice', 'Jane Austen', rs[2], [g[0], g[4]], 432],
        ['Moby-Dick', 'Herman Melville', rs[1], [g[0], g[1]], 635],
        ['Walden', 'Henry David Thoreau', rs[0], [g[3], g[2]], 352],
        ['Meditations', 'Marcus Aurelius', rs[2], [g[2]], 254],
        ['Frankenstein', 'Mary Shelley', rs[0], [g[0], g[5]], 280],
        ['The Odyssey', 'Homer', rs[1], [g[0], g[1]], 541],
      ].forEach((r, i) => {
        const row = S.addRow(reading.id, {}, null, r[0])
        row.cover = { type: 'gradient', value: covers[i], pos: 50 }
        row.props[author.id] = r[1]
        row.props[rstatus.id] = r[2].id
        row.props[genre.id] = r[3].map(o => o.id)
        row.props[pages.id] = r[4]
        row.blocks = [b('h3', 'Notes'), b('text', ''), b('h3', 'Favorite passages'), b('quote', '')]
      })

      // ---------- Journal ----------
      const journal = S.createPage({ title: 'Journal', icon: '📔' })
      const today = S.createPage({
        title: U.formatDate(Date.now()),
        icon: '☀️',
        parentId: journal.id,
        detached: true,
        blocks: [
          b('h3', 'Three good things'),
          b('numbered', ''),
          b('numbered', ''),
          b('numbered', ''),
          b('h3', 'What I am working on'),
          b('text', ''),
        ],
      })
      journal.blocks = [
        b('text', 'One page per day. Duplicate yesterday’s entry or type <code>/page</code> to start a new one.', { color: 'c-gray' }),
        b('page', '', { pageId: today.id }),
      ]

      st.favorites = [welcome.id, tasks.id]
      st.settings.expanded[welcome.id] = true
      st.settings.lastPage = welcome.id
    },

    // Sample planner data: projects, tasks, a week of events, habits and focus history.
    populateTools() {
      const P = F.planner
      const st = F.store.state()
      const today = U.todayISO()
      const day = n => U.addDays(today, n)
      const rnd = U.rng(20260927)
      const hoursAgo = n => Date.now() - n * 3600000

      const proj = {}
      ;[
        ['web', 'Website Relaunch', 'lavender', '', 'Refresh the personal site and publish the new portfolio.', true, 10],
        ['q4', 'Q4 Planning', 'sky', '', 'Goals, budget and the roadmap for the last quarter.', true, 7],
        ['fit', 'Fitness Plan', 'mint', '', 'Build up to the 10k race in November.', true, 45],
        ['app', 'Mobile App MVP', 'peach', '', 'Ship the first version of the habit app.', false, 21],
        ['home', 'Home & Admin', 'butter', '', 'Bills, errands and paperwork.', false, null],
      ].forEach((r, i) => {
        proj[r[0]] = P.addProject({ name: r[1], tone: r[2], icon: r[3], description: r[4], pinned: r[5], due: r[6] == null ? null : day(r[6]), order: i }, true)
      })

      const sub = list => list.map(x => ({ id: U.uid(), title: x[0], done: !!x[1] }))
      const task = (title, o) => {
        o = o || {}
        const f = {
          title,
          projectId: o.p ? proj[o.p].id : null,
          due: o.d == null ? null : day(o.d),
          time: o.time || null,
          duration: o.dur || 30,
          priority: o.pr || 0,
          status: o.st || 'todo',
          labels: o.labels || [],
          subtasks: o.sub ? sub(o.sub) : [],
          repeat: o.repeat || null,
          notes: o.notes || '',
          start: o.start == null ? null : day(o.start),
          createdAt: hoursAgo(24 * (4 + Math.floor(rnd() * 10))),
        }
        if (o.st === 'done') f.completedAt = hoursAgo(o.doneAgo == null ? 30 : o.doneAgo)
        return P.addTask(f, true)
      }

      task('Write the About page copy', { p: 'web', d: -2, pr: 3, st: 'doing', labels: ['writing'], start: -6, notes: 'Keep it under 200 words. Mention the move to product design.' })
      task('Pick a new color palette', { p: 'web', d: -4, pr: 2, st: 'done', doneAgo: 70, start: -8 })
      task('Export case study images', { p: 'web', d: 0, time: '11:00', dur: 45, pr: 2, start: -1 })
      task('Set up analytics', { p: 'web', d: 3, pr: 1, labels: ['setup'], start: 1 })
      task('Launch announcement post', { p: 'web', d: 9, pr: 3, sub: [['Draft', 1], ['Proofread'], ['Schedule']], start: 5 })
      task('Draft Q4 goals doc', { p: 'q4', d: 0, time: '09:30', dur: 60, pr: 4, st: 'doing', sub: [['Revenue targets', 1], ['Hiring plan'], ['Top three bets']], start: -3 })
      task('Review budget with finance', { p: 'q4', d: 1, time: '14:00', dur: 60, pr: 3, st: 'review', start: -2 })
      task('Collect feedback from the team', { p: 'q4', d: 4, pr: 2, labels: ['people'], start: 1 })
      task('Finalize roadmap slides', { p: 'q4', d: 6, pr: 3, start: 3 })
      task('Book the offsite venue', { p: 'q4', d: -1, pr: 2, st: 'done', doneAgo: 26, start: -5 })
      task('Long run, 8 km', { p: 'fit', d: 0, time: '18:30', dur: 50, pr: 2, repeat: 'weekly', labels: ['health'] })
      task('Buy new running shoes', { p: 'fit', d: 2, pr: 1, labels: ['errand'] })
      task('Meal prep for the week', { p: 'fit', d: -1, pr: 2, repeat: 'weekly', labels: ['health'] })
      task('Design onboarding screens', { p: 'app', d: 1, pr: 3, st: 'review', sub: [['Welcome', 1], ['Permissions', 1], ['First habit']], start: -4 })
      task('Fix sync bug on Android', { p: 'app', d: 0, pr: 4, st: 'doing', labels: ['bug'], start: -1 })
      task('Write the App Store description', { p: 'app', d: 12, pr: 1, labels: ['writing'], start: 8 })
      task('Run three user interviews', { p: 'app', d: -2, pr: 3, st: 'done', doneAgo: 50, start: -9 })
      task('Pay the electricity bill', { p: 'home', d: 0, pr: 3, labels: ['bills'] })
      task('Renew passport', { p: 'home', d: 20, pr: 2 })
      task('Clean out the garage', { p: 'home', pr: 0 })
      task('Call mom', { d: 0, time: '20:00', dur: 20 })
      task('Read chapter 3 of the design book', { labels: ['reading'] })
      task('Plan weekend trip', { d: 5, pr: 1, labels: ['personal'] })
      // Recent completions so the weekly chart has history.
      ;['Reply to client emails', 'Update project tracker', 'Send invoice', 'Water the plants', 'Review pull request', 'Back up laptop', 'Order groceries', 'Schedule dentist', 'Clean inbox', 'Prepare standup notes', 'Tidy desk', 'Renew gym pass'].forEach((t, i) => {
        task(t, { st: 'done', doneAgo: 8 + i * 13 + Math.floor(rnd() * 6), p: ['web', 'q4', 'app', 'home'][i % 4], d: -Math.floor((8 + i * 13) / 24) })
      })

      // Events around this week
      const ev = (d, title, start, end, cal, o) =>
        P.addEvent(Object.assign({ date: day(d), title, start, end, cal, status: 'none' }, o || {}), true)
      for (let d = -3; d <= 6; d++) {
        const wd = U.parseISODate(day(d)).getDay()
        if (wd > 0 && wd < 6) ev(d, 'Team standup', '09:00', '09:20', 'work', { status: 'confirmed', location: 'Video call' })
      }
      ev(0, 'Morning workout', '07:00', '08:00', 'health')
      ev(0, 'Design review', '13:00', '14:00', 'work', { status: 'confirmed', notes: 'Walk through the new onboarding flow.' })
      ev(0, 'Dinner with Alex', '19:30', '21:00', 'social', { location: 'Luna Kitchen' })
      ev(1, 'Budget meeting', '14:00', '15:00', 'work', { status: 'confirmed' })
      ev(1, 'Spanish class', '17:00', '18:00', 'learning')
      ev(2, 'Deep work block', '10:00', '12:00', 'personal')
      ev(2, 'Yoga', '18:00', '19:00', 'health')
      ev(3, '1:1 with manager', '11:00', '11:30', 'work', { status: 'confirmed' })
      ev(3, 'Dentist', '15:00', '15:45', 'personal', { location: 'Smile Dental' })
      ev(4, 'Sprint demo', '16:00', '17:00', 'work')
      ev(4, 'Movie night', '20:00', '22:00', 'social')
      ev(-1, 'Workshop: prototyping tips', '10:00', '11:30', 'learning')
      ev(-2, 'Lunch with Priya', '12:30', '14:00', 'social')
      ev(5, 'Farmers market', '10:00', '11:00', 'personal')
      ev(6, 'Weekend hike', '08:00', '12:00', 'health', { allDay: true })

      // Habits with ten weeks of history
      ;[
        ['Drink 2L of water', '💧', 'sky', 7, 0.86, true],
        ['Read 20 minutes', '📖', 'butter', 7, 0.7, true],
        ['Move for 30 minutes', '🏃', 'mint', 5, 0.62, false],
        ['Meditate', '🧘', 'lavender', 7, 0.5, false],
        ['No screens after 10pm', '🌙', 'peach', 5, 0.45, false],
      ].forEach((r, i) => {
        const days = {}
        for (let k = 1; k <= 70; k++) if (rnd() < r[4]) days[day(-k)] = 1
        if (r[5]) days[today] = 1
        P.addHabit({ name: r[0], icon: r[1], tone: r[2], goal: r[3], days, order: i, createdAt: Date.now() - 80 * 86400000 }, true)
      })

      // Focus sessions over the last ten days
      const open = P.openTasks()
      for (let k = 9; k >= 0; k--) {
        const n = k === 0 ? 2 : 1 + Math.floor(rnd() * 4)
        for (let j = 0; j < n; j++) {
          const at = new Date(U.parseISODate(day(-k)).getTime() + (9 + j * 2) * 3600000 + 25 * 60000)
          if (at.getTime() > Date.now()) continue
          st.focusLog.push({ id: U.uid(), at: at.getTime(), minutes: 25, mode: 'focus', taskId: open[Math.floor(rnd() * open.length)].id })
        }
      }
      st.quickNote = 'Send the invoice by Friday.\nBlog ideas: morning routine, tools I use, what I learned shipping the app.'
    },
  }
})(window.Folio)
