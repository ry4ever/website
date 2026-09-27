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
  }
})(window.Folio)
