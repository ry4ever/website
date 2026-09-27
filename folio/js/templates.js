/* Folio — starter templates. Each build() returns fields for a new page. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util

  const b = (type, text, extra) => F.store.newBlock(type, Object.assign({ text: text || '' }, extra || {}))
  const kids = (block, children) => {
    block.children = children
    return block
  }
  const opt = (name, color) => ({ id: U.uid(), name, color })

  function db(view, properties, extraViews) {
    const d = { properties: [{ id: 'title', name: 'Name', type: 'title' }].concat(properties), views: [], rowOrder: [] }
    d.views.push(F.store.newView(view, d))
    ;(extraViews || []).forEach(v => d.views.push(F.store.newView(v, d)))
    d.activeView = d.views[0].id
    return d
  }

  F.templates = [
    {
      id: 'meeting',
      name: 'Meeting notes',
      icon: '🗓️',
      category: 'Work',
      desc: 'Agenda, notes and action items in one place.',
      build: () => ({
        title: 'Meeting notes',
        icon: '🗓️',
        blocks: [
          b('callout', '<b>Date:</b> ' + U.formatDate(Date.now()) + ' · <b>Attendees:</b> ', { icon: '📍' }),
          b('h2', 'Agenda'),
          b('numbered', 'Updates since last time'),
          b('numbered', 'Open questions'),
          b('numbered', 'Next steps'),
          b('h2', 'Notes'),
          b('bullet', ''),
          b('h2', 'Action items'),
          b('todo', ''),
          b('todo', ''),
        ],
      }),
    },
    {
      id: 'weekly',
      name: 'Weekly planner',
      icon: '🗂️',
      category: 'Personal',
      desc: 'A to-do list for each day of the week.',
      build: () => ({
        title: 'Weekly planner',
        icon: '🗂️',
        cover: { type: 'gradient', value: 'mint', pos: 50 },
        blocks: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Weekend']
          .map(d => [b('h3', d), b('todo', '')])
          .reduce((a, x) => a.concat(x), [b('quote', 'Pick the three things that would make this week a good one.')]),
      }),
    },
    {
      id: 'roadmap',
      name: 'Project roadmap',
      icon: '🚀',
      category: 'Work',
      desc: 'Track projects on a board by stage.',
      build: () => {
        const stage = { id: U.uid(), name: 'Stage', type: 'status', options: [opt('Backlog', 'gray'), opt('Planned', 'yellow'), opt('Building', 'blue'), opt('Shipped', 'green')] }
        const owner = { id: U.uid(), name: 'Owner', type: 'text' }
        const quarter = { id: U.uid(), name: 'Quarter', type: 'select', options: [opt('Q1', 'purple'), opt('Q2', 'blue'), opt('Q3', 'orange'), opt('Q4', 'pink')] }
        const d = db('board', [stage, owner, quarter], ['table'])
        return {
          title: 'Project roadmap',
          icon: '🚀',
          type: 'database',
          db: d,
          rows: [
            ['Mobile layout polish', stage.options[2], 'Sam', quarter.options[2]],
            ['Search improvements', stage.options[1], 'Riley', quarter.options[3]],
            ['Onboarding checklist', stage.options[3], 'Alex', quarter.options[1]],
            ['Offline mode', stage.options[0], '', null],
          ].map(r => ({ title: r[0], props: { [stage.id]: r[1].id, [owner.id]: r[2], [quarter.id]: r[3] ? r[3].id : null } })),
        }
      },
    },
    {
      id: 'habits',
      name: 'Habit tracker',
      icon: '🌱',
      category: 'Personal',
      desc: 'Check off daily habits in a table.',
      build: () => {
        const date = { id: U.uid(), name: 'Date', type: 'date' }
        const habits = ['Read', 'Exercise', 'Water', 'Journal'].map(n => ({ id: U.uid(), name: n, type: 'checkbox' }))
        const d = db('table', [date].concat(habits), ['calendar'])
        const rows = []
        for (let i = 6; i >= 0; i--) {
          const dt = new Date()
          dt.setDate(dt.getDate() - i)
          const props = { [date.id]: U.toISODate(dt) }
          habits.forEach(hb => {
            props[hb.id] = Math.random() > 0.45
          })
          rows.push({ title: dt.toLocaleDateString(undefined, { weekday: 'long' }), props })
        }
        return { title: 'Habit tracker', icon: '🌱', type: 'database', db: d, rows }
      },
    },
    {
      id: 'journal',
      name: 'Daily journal',
      icon: '📓',
      category: 'Personal',
      desc: 'Prompts for a few mindful minutes a day.',
      build: () => ({
        title: U.formatDate(Date.now()),
        icon: '📓',
        cover: { type: 'gradient', value: 'peach', pos: 50 },
        blocks: [
          b('h3', 'Today I’m grateful for'),
          b('bullet', ''),
          b('h3', 'What would make today great?'),
          b('todo', ''),
          b('h3', 'Reflection'),
          b('text', ''),
        ],
      }),
    },
    {
      id: 'reading',
      name: 'Reading list',
      icon: '📖',
      category: 'Personal',
      desc: 'Books and articles in a gallery.',
      build: () => {
        const author = { id: U.uid(), name: 'Author', type: 'text' }
        const status = { id: U.uid(), name: 'Status', type: 'select', options: [opt('Want to read', 'gray'), opt('Reading', 'yellow'), opt('Done', 'green')] }
        const link = { id: U.uid(), name: 'Link', type: 'url' }
        const d = db('gallery', [author, status, link], ['table'])
        return { title: 'Reading list', icon: '📖', type: 'database', db: d, rows: [{ title: 'My next book', props: { [status.id]: status.options[0].id } }] }
      },
    },
    {
      id: 'travel',
      name: 'Trip planner',
      icon: '🧳',
      category: 'Personal',
      desc: 'Itinerary, packing list and bookings.',
      build: () => ({
        title: 'Trip planner',
        icon: '🧳',
        cover: { type: 'gradient', value: 'lagoon', pos: 50 },
        blocks: [
          b('callout', 'Dates, destination and confirmation numbers go here.', { icon: '✈️' }),
          b('h2', 'Itinerary'),
          kids(b('toggle', 'Day 1', { open: true }), [b('bullet', 'Morning'), b('bullet', 'Afternoon'), b('bullet', 'Evening')]),
          kids(b('toggle', 'Day 2'), [b('bullet', '')]),
          b('h2', 'Packing list'),
          b('todo', 'Passport / ID'),
          b('todo', 'Chargers'),
          b('todo', 'Toiletries'),
          b('todo', 'Comfortable shoes'),
          b('h2', 'Budget'),
          b('text', ''),
        ],
      }),
    },
    {
      id: 'doc',
      name: 'Project brief',
      icon: '📐',
      category: 'Work',
      desc: 'A one-page plan for a new project.',
      build: () => ({
        title: 'Project brief',
        icon: '📐',
        blocks: [
          b('toc'),
          b('h2', 'Summary'),
          b('text', 'One or two sentences on what this project is and why it matters.', { color: 'c-gray' }),
          b('h2', 'Goals'),
          b('bullet', ''),
          b('h2', 'Non-goals'),
          b('bullet', ''),
          b('h2', 'Plan'),
          b('numbered', ''),
          b('h2', 'Open questions'),
          b('todo', ''),
        ],
      }),
    },
  ]

  // Create a page from a template, or fill an existing empty page.
  F.applyTemplate = function(tpl, targetId) {
    const S = F.store
    const t = tpl.build()
    let page
    if (targetId && S.page(targetId)) {
      page = S.page(targetId)
      S.checkpoint(page.id)
      page.title = page.title || t.title
      page.icon = page.icon || t.icon || ''
      if (t.cover && !page.cover) page.cover = t.cover
      if (t.type === 'database') {
        page.type = 'database'
        page.db = t.db
        page.fullWidth = true
      } else {
        page.blocks = t.blocks
      }
    } else {
      page = S.createPage({ title: t.title, icon: t.icon, cover: t.cover, type: t.type, db: t.db, blocks: t.blocks })
    }
    ;(t.rows || []).forEach(r => {
      const row = S.addRow(page.id, r.props, null, r.title)
      row.blocks = []
    })
    S.commit('page', page.id)
    return page
  }
})(window.Folio)
