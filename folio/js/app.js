/* Folio — application shell: sidebar, topbar, routing, command palette, settings, reminders. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const h = U.h
  const S = F.store
  const UI = F.ui
  const P = F.planner
  const K = F.kit

  const app = (F.app = {})
  let editor = null
  let peekEditor = null
  let currentId = null
  let peekId = null
  let sidebarQueued = false
  let view = null
  let viewName = null
  let viewParam = null

  const $ = id => document.getElementById(id)
  const LOGO =
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.6" y="3.2" width="10" height="13.6" rx="2.8" fill="currentColor" opacity=".42"/>' +
    '<rect x="7.2" y="2.4" width="10.2" height="15.2" rx="2.8" fill="currentColor"/><path d="M10.2 7.4h4.2M10.2 10.2h4.2M10.2 13h2.4" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round"/></svg>'
  app.LOGO = LOGO

  // ------------------------------------------------------------------ init
  app.init = function() {
    S.load()
    applyTheme()
    applyAppearance()
    const st = S.state()
    const w = st.settings.sidebarWidth === 248 ? 272 : st.settings.sidebarWidth
    document.documentElement.style.setProperty('--sidebar-w', w + 'px')
    $('app').classList.toggle('sidebar-collapsed', !!st.settings.sidebarCollapsed)
    bindResizer()
    bindGlobalKeys()
    renderSidebar()
    S.on(onStore)
    F.focus.onTick(updateLive)
    window.addEventListener('hashchange', route)
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)
    $('app').addEventListener('mousedown', e => {
      if ($('app').classList.contains('mobile-open') && !e.target.closest('.sidebar')) {
        e.preventDefault()
        setSidebarOpen(false)
      }
    })
    $('scroller').addEventListener('mousedown', e => {
      if (peekId && !e.target.closest('.db, .popover')) app.closePeek()
    })
    startReminders()
    route()
  }

  function onStore(type, id) {
    if (type === 'save-error') {
      if (!app.warned) UI.toast('Couldn’t save: your browser storage is full. Try removing large images.', { duration: 6000 })
      app.warned = true
      return
    }
    if (type === 'reset') {
      teardown()
      app.closePeek()
      applyTheme()
      applyAppearance()
      scheduleSidebar()
      if (location.hash === '#/home') renderView('home', null, true)
      else location.hash = '#/home'
      return
    }
    if (type === 'settings') {
      applyTheme()
      applyAppearance()
      scheduleSidebar()
      renderTopbar()
      return
    }
    if (type !== 'row') scheduleSidebar()
    if (!UI.anyOpen() || type === 'title') renderTopbar()
    const p = S.page(currentId)
    if (p) document.title = (p.icon ? p.icon + ' ' : '') + S.pageTitle(p) + ' · Folio'
    else if (viewName) document.title = viewTitle() + ' · Folio'
    if (type === 'pages' && currentId) {
      const cur = S.page(currentId)
      if (cur && S.isTrashed(currentId) !== app.shownTrashed) renderPage(currentId)
    }
  }

  let appliedTheme = window.__folioTheme || null
  function applyTheme() {
    const root = document.documentElement
    const t = S.state().settings.theme
    const current = root.getAttribute('data-theme')
    // In "system" mode a theme set by an embedding page wins.
    if (t === 'system' && current && current !== appliedTheme) return
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    appliedTheme = dark ? 'dark' : 'light'
    root.setAttribute('data-theme', appliedTheme)
  }

  function applyAppearance() {
    const st = S.state().settings
    const root = document.documentElement
    root.classList.remove('wall-sky', 'wall-meadow', 'wall-dusk', 'wall-mist', 'has-wall')
    const wall = st.wallpaper || 'none'
    if (wall !== 'none') root.classList.add('wall-' + wall, 'has-wall')
    if (st.accent && st.accent !== 'indigo') root.setAttribute('data-accent', st.accent)
    else root.removeAttribute('data-accent')
    U.clock24 = !!st.clock24
  }

  // ------------------------------------------------------------------ routing
  function viewDef(name) {
    if (name === 'docs') return docsView
    return F.views[name] && F.views[name].mount ? F.views[name] : null
  }

  function parseHash() {
    const hs = location.hash.replace(/^#\/?/, '')
    let m = /^p\/([\w-]+)(?:\/([\w-]+))?/.exec(hs)
    if (m) return { page: m[1], block: m[2] || null }
    m = /^([a-z]+)(?:\/([\w-]+))?$/.exec(hs)
    if (m && viewDef(m[1])) return { view: m[1], param: m[2] || null }
    return null
  }

  function route() {
    const r = parseHash()
    if (!r) {
      const st = S.state()
      if (!app.started && st.settings.startPage === 'last' && st.settings.lastRoute && st.settings.lastRoute !== location.hash) {
        app.started = true
        location.replace(st.settings.lastRoute)
        return
      }
      app.started = true
      location.replace('#/home')
      return
    }
    app.started = true
    if (r.page) {
      if (r.page !== currentId || !editor) renderPage(r.page)
      if (r.block && editor) setTimeout(() => editor.scrollToBlock(r.block), 60)
    } else {
      renderView(r.view, r.param)
    }
    if (innerWidth < 760) setSidebarOpen(false)
  }

  app.go = function(path) {
    app.closePeek()
    UI.closeAll()
    const hash = '#/' + path
    if (location.hash === hash) app.refresh()
    else location.hash = hash
  }

  app.refresh = function() {
    if (view && view.refresh) view.refresh()
    else if (viewName) renderView(viewName, viewParam, true)
  }

  app.open = function(id) {
    app.closePeek()
    UI.closeAll()
    const hash = '#/p/' + id
    if (location.hash === hash) renderPage(id)
    else location.hash = hash
  }

  app.home = function() {
    app.go('home')
  }

  app.current = () => ({ view: viewName, param: viewParam, page: currentId })

  function teardown() {
    if (editor) editor.destroy()
    editor = null
    if (view && view.destroy) view.destroy()
    view = null
    viewName = null
    viewParam = null
    currentId = null
  }

  function viewTitle() {
    if (viewName === 'project') {
      const p = P.project(viewParam)
      return p ? p.name : 'Project'
    }
    const d = viewDef(viewName)
    return d ? d.title : 'Folio'
  }

  function renderView(name, param, force) {
    if (!force && view && viewName === name && viewParam === param) return
    if (viewName !== name || viewParam !== param) F.taskDrawer.close()
    teardown()
    viewName = name
    viewParam = param
    const host = $('view')
    host.innerHTML = ''
    host.className = 'view-tool view-' + name
    view = viewDef(name).mount(host, param) || {}
    $('scroller').scrollTop = 0
    const st = S.state()
    st.settings.lastRoute = '#/' + name + (param && param !== 'new' ? '/' + param : '')
    S.save()
    document.title = viewTitle() + ' · Folio'
    renderTopbar()
    scheduleSidebar()
  }

  function renderPage(id) {
    teardown()
    F.taskDrawer.close()
    currentId = id
    const view = $('view')
    view.innerHTML = ''
    view.className = 'view-page'
    const p = S.page(id)
    app.shownTrashed = p ? S.isTrashed(id) : false
    if (p && app.shownTrashed) view.appendChild(trashBanner(p))
    const host = h('div.editor-host')
    view.appendChild(host)
    editor = new F.editor.Editor(host, id)
    if (p) {
      S.visit(id)
      S.state().settings.lastRoute = '#/p/' + id
      document.title = (p.icon ? p.icon + ' ' : '') + S.pageTitle(p) + ' · Folio'
      if (p.parentId && !p.isRow) {
        S.ancestors(id).forEach(a => {
          S.state().settings.expanded[a.id] = true
        })
      }
    } else {
      document.title = 'Page not found · Folio'
    }
    $('scroller').scrollTop = 0
    renderTopbar()
    scheduleSidebar()
    // Focus the title of brand new, empty pages.
    if (p && !p.title && !p.blocks.length && p.type !== 'database' && !app.shownTrashed) {
      setTimeout(() => editor && editor.titleEl && editor.titleEl.focus(), 30)
    }
  }

  function trashBanner(p) {
    const trashedRoot = p.trashed ? p : S.ancestors(p.id).filter(a => a.trashed).pop()
    return h('div.trash-banner', null,
      h('span', { text: 'This page is in Trash.' }),
      h('button.banner-btn', { onClick: () => { S.restorePage(trashedRoot.id); renderPage(p.id) } }, 'Restore page'),
      h('button.banner-btn', {
        onClick: () =>
          UI.confirm('This can’t be undone.', { title: 'Delete this page permanently?', ok: 'Delete', danger: true }).then(ok => {
            if (!ok) return
            S.deletePermanently(trashedRoot.id)
            app.home()
          }),
      }, 'Delete permanently')
    )
  }

  // Today's journal page, created under "Journal" on first use.
  app.dailyNote = function() {
    let journal = S.rootPages().map(S.page).find(p => p.title === 'Journal' && p.type !== 'database')
    if (!journal) journal = S.createPage({ title: 'Journal', icon: '📔' })
    const title = U.formatDate(Date.now())
    let page = S.childPages(journal.id).map(S.page).find(p => p.title === title)
    if (!page) {
      const b = (type, text) => S.newBlock(type, { text: text || '' })
      page = S.createPage({
        title,
        icon: '☀️',
        parentId: journal.id,
        blocks: [b('h3', 'Top three for today'), b('todo'), b('todo'), b('todo'), b('h3', 'Notes'), b('text'), b('h3', 'Wins'), b('bullet')],
      })
    }
    app.open(page.id)
  }

  // ------------------------------------------------------------------ docs
  const docsView = {
    title: 'Docs',
    icon: 'page',
    mount(host) {
      renderDocs(host)
      const unsub = K.watch(['pages', 'page'], () => renderDocs(host))
      return { destroy: unsub }
    },
  }

  function renderDocs(host) {
    const st = S.state()
    host.innerHTML = ''
    const home = h('div.vt.vt-docs')
    const count = Object.keys(st.pages).filter(id => !S.isTrashed(id) && !st.pages[id].isRow).length
    home.appendChild(K.head({
      title: 'Docs',
      sub: count + ' pages of notes, wikis and databases.',
      actions: [
        h('button.btn', { onClick: () => app.importMarkdown() }, U.icon('import', 15), 'Import'),
        h('button.btn', { onClick: () => app.openTemplates() }, U.icon('template', 15), 'Templates'),
        h('button.btn-ink', { onClick: newRootPage }, U.icon('plus', 15), 'New doc'),
      ],
    }))

    // Recently visited first, topped up with recently edited pages so the strip is never empty.
    const recent = st.recent.filter(id => S.page(id) && !S.isTrashed(id) && !S.page(id).isRow).slice(0, 12)
    if (recent.length < 6) {
      Object.keys(st.pages)
        .filter(id => !S.isTrashed(id) && !st.pages[id].isRow && recent.indexOf(id) === -1)
        .sort((a, b) => (st.pages[b].updatedAt || 0) - (st.pages[a].updatedAt || 0))
        .slice(0, 6 - recent.length)
        .forEach(id => recent.push(id))
    }
    home.appendChild(h('div.home-section-title', null, U.icon('clock', 14), 'Jump back in'))
    const strip = h('div.home-cards')
    recent.forEach(id => {
      const p = S.page(id)
      const cover = h('div.hc-cover')
      if (p.cover) {
        if (p.cover.type === 'image') cover.style.backgroundImage = UI.coverCSS(p.cover)
        else cover.style.background = UI.coverCSS(p.cover)
      }
      strip.appendChild(
        h('a.home-card', { href: '#/p/' + id },
          cover,
          h('div.hc-icon', null, p.icon ? h('span', { text: p.icon }) : U.icon(p.type === 'database' ? 'database' : 'page', 22)),
          h('div.hc-title', { text: S.pageTitle(p) }),
          h('div.hc-time', { text: U.timeAgo(p.updatedAt) })
        )
      )
    })
    strip.appendChild(
      h('button.home-card.hc-new', { onClick: newRootPage }, h('div.hc-plus', null, U.icon('plus', 22)), h('div.hc-title', { text: 'New page' }))
    )
    home.appendChild(strip)

    // Every top-level doc, with how much lives under it
    const roots = S.rootPages()
    if (roots.length) {
      home.appendChild(h('div.home-section-title', null, U.icon('layers', 14), 'All docs'))
      const all = h('div.doc-list')
      roots.forEach(id => {
        const p = st.pages[id]
        const kids = S.childPages(id).length
        const rows = p.db ? S.dbRows(id).length : 0
        all.appendChild(
          h('a.doc-item', { href: '#/p/' + id },
            h('span.doc-icon', null, p.icon ? h('span', { text: p.icon }) : U.icon(p.type === 'database' ? 'database' : 'page', 18)),
            h('span.doc-main', null,
              h('span.doc-title', { text: S.pageTitle(p) }),
              h('span.doc-sub', { text: p.db ? rows + (rows === 1 ? ' entry' : ' entries') : kids ? kids + (kids === 1 ? ' sub-page' : ' sub-pages') : 'Page' })
            ),
            h('span.doc-time', { text: 'Edited ' + U.timeAgo(p.updatedAt) }),
            U.icon('chevronRight', 15)
          )
        )
      })
      home.appendChild(all)
    }

    // Upcoming: dated rows from every database in the next two weeks
    const upcoming = []
    const today = U.toISODate(new Date())
    const limitIso = U.addDays(today, 14)
    Object.keys(st.pages).forEach(pid => {
      const dbp = st.pages[pid]
      if (!dbp.db || S.isTrashed(pid)) return
      const dateProps = dbp.db.properties.filter(p => p.type === 'date')
      if (!dateProps.length) return
      S.dbRows(pid).forEach(r => {
        dateProps.forEach(dp => {
          const v = r.props[dp.id]
          if (v && v >= today && v <= limitIso) upcoming.push({ row: r, db: dbp, date: v, prop: dp })
        })
      })
    })
    upcoming.sort((a, b) => (a.date < b.date ? -1 : 1))
    home.appendChild(h('div.home-section-title', null, U.icon('database', 14), 'Coming up in your databases'))
    const up = h('div.home-list')
    if (!upcoming.length) up.appendChild(h('div.home-empty', { text: 'Nothing scheduled in the next two weeks. Pages with dates in any database show up here.' }))
    upcoming.slice(0, 8).forEach(u => {
      const d = U.parseISODate(u.date)
      up.appendChild(
        h('button.home-row', { onClick: () => app.open(u.row.id) },
          h('div.hr-date', null, h('div.hr-day', { text: String(d.getDate()) }), h('div.hr-mon', { text: U.MONTHS[d.getMonth()].slice(0, 3) })),
          h('div.hr-main', null, h('div.hr-title', { text: (u.row.icon ? u.row.icon + ' ' : '') + S.pageTitle(u.row) }), h('div.hr-sub', { text: (u.db.icon ? u.db.icon + ' ' : '') + S.pageTitle(u.db) + ' · ' + u.prop.name }))
        )
      )
    })
    home.appendChild(up)

    home.appendChild(h('div.home-section-title', null, U.icon('template', 14), 'Start from a template'))
    const tpls = h('div.home-templates')
    F.templates.slice(0, 4).forEach(t =>
      tpls.appendChild(
        h('button.home-tpl', { onClick: () => app.open(F.applyTemplate(t).id) },
          h('div.ht-icon', { text: t.icon }),
          h('div.ht-name', { text: t.name }),
          h('div.ht-desc', { text: t.desc })
        )
      )
    )
    tpls.appendChild(h('button.home-tpl.more', { onClick: () => app.openTemplates() }, h('div.ht-icon', null, U.icon('gallery', 22)), h('div.ht-name', { text: 'Browse all templates' })))
    home.appendChild(tpls)
    host.appendChild(home)
  }

  // ------------------------------------------------------------------ sidebar
  function scheduleSidebar() {
    if (sidebarQueued) return
    sidebarQueued = true
    requestAnimationFrame(() => {
      sidebarQueued = false
      renderSidebar()
    })
  }

  function newRootPage() {
    const p = S.createPage({})
    app.open(p.id)
  }
  app.newPage = newRootPage

  function newChildPage(parentId) {
    const p = S.createPage({ parentId })
    S.state().settings.expanded[parentId] = true
    app.open(p.id)
  }

  function renderSidebar() {
    const st = S.state()
    const sb = $('sidebar')
    const prev = sb.querySelector('.sb-scroll')
    const scrollTop = prev ? prev.scrollTop : 0
    sb.innerHTML = ''
    const ws = st.workspace
    const brand = h('button.sb-brand', { onClick: () => workspaceMenu(brand) },
      ws.icon ? h('span.logo-mark.emoji', { text: ws.icon }) : h('span.logo-mark', { html: LOGO }),
      h('span.sb-brand-text', null,
        h('span.sb-brand-name', null, h('span', { text: ws.name }), U.icon('chevronDown', 13)),
        h('span.sb-brand-sub', { text: 'Personal workspace' })
      )
    )
    sb.appendChild(h('div.sb-head', null, brand, h('button.sb-icon-btn', { title: 'Collapse sidebar (' + U.modKey + '\\)', onClick: () => app.toggleSidebar() }, U.icon('panel', 18))))
    sb.appendChild(h('button.sb-search', { onClick: () => app.search() }, U.icon('search', 17), h('span', { text: 'Search' }), h('span.spacer'), h('kbd', { text: U.isMac ? '⌘K' : 'Ctrl K' }), h('kbd', { text: '/' })))

    const scroll = h('div.sb-scroll')
    const t = U.todayISO()
    const open = P.openTasks()
    const due = open.filter(x => x.due && x.due <= t).length
    const late = open.filter(P.isOverdue).length
    const habits = P.habits()
    const habitsDone = habits.filter(hb => hb.days[t]).length
    const secOpen = key => st.settings.sections[key] !== false

    scroll.appendChild(label('Main menu'))
    const nav = h('div.sb-nav')
    nav.appendChild(viewItem('home', 'dashboard', 'Dashboard'))
    nav.appendChild(viewItem('tasks', 'tasks', 'My Tasks', due ? h('span.sb-count', { class: late ? 'alert' : null, title: late ? late + ' overdue' : due + ' due today', text: String(due) }) : null))
    nav.appendChild(viewItem('board', 'board', 'Kanban Board'))
    const evToday = P.eventsOn(t).length
    nav.appendChild(viewItem('calendar', 'calendar', 'Calendar', evToday ? h('span.sb-count', { title: evToday + ' events today', text: String(evToday) }) : null))
    const projOpen = secOpen('projects')
    const chev = h('span.sb-chev', { role: 'button', title: projOpen ? 'Hide projects' : 'Show projects' }, U.icon('chevronRight', 14))
    const projItem = viewItem('projects', 'folder', 'Projects', chev)
    projItem.classList.toggle('open', projOpen)
    chev.addEventListener('click', e => {
      e.stopPropagation()
      st.settings.sections.projects = !projOpen
      S.save()
      renderSidebar()
    })
    nav.appendChild(projItem)
    if (projOpen) {
      const sub = h('div.sb-sub')
      P.activeProjects().forEach(p => sub.appendChild(projectItem(p)))
      sub.appendChild(h('button.sb-item.sb-muted', { onClick: () => F.views.newProject() }, U.icon('plus', 15), h('span.sb-title', { text: 'New project' })))
      nav.appendChild(sub)
    }
    const fs = F.focus.status()
    const live = h('span.sb-live.focus-live', { class: 'tone-' + fs.tone, text: F.focus.fmt(fs.remaining) })
    live.style.display = fs.running || fs.remaining < fs.total - 0.5 ? '' : 'none'
    nav.appendChild(viewItem('focus', 'focus', 'Focus', live))
    nav.appendChild(viewItem('habits', 'habit', 'Habits', habits.length ? h('span.sb-count', { title: 'Done today', text: habitsDone + '/' + habits.length }) : null))
    nav.appendChild(viewItem('timeline', 'timeline', 'Timeline'))
    nav.appendChild(viewItem('docs', 'page', 'Docs'))
    scroll.appendChild(nav)

    // Pinned projects and starred pages
    const pinned = P.projects().filter(p => p.pinned)
    const favs = st.favorites.filter(id => S.page(id) && !S.isTrashed(id))
    scroll.appendChild(h('div.sb-divider'))
    scroll.appendChild(label('Pinned', h('button.sb-icon-btn', { title: 'New project', onClick: () => F.views.newProject() }, U.icon('plus', 15))))
    const pin = h('div.sb-nav')
    pinned.forEach(p => pin.appendChild(projectItem(p, true)))
    favs.forEach(id => pin.appendChild(treeItem(id, 0, 'fav')))
    if (!pinned.length && !favs.length) pin.appendChild(h('div.sb-empty', { text: 'Pin projects or star pages to keep them here.' }))
    scroll.appendChild(pin)

    // Page tree
    const pagesOpen = secOpen('private')
    scroll.appendChild(label(
      h('button.sb-label-toggle', { onClick: () => { st.settings.sections.private = !pagesOpen; S.save(); renderSidebar() } }, 'Pages', U.icon(pagesOpen ? 'chevronDown' : 'chevronRight', 11)),
      h('button.sb-icon-btn', { title: 'New page', onClick: newRootPage }, U.icon('plus', 15))
    ))
    if (pagesOpen) {
      const tree = h('div.sb-nav.sb-tree')
      const roots = S.rootPages()
      roots.forEach(id => tree.appendChild(treeItem(id, 0, 'tree')))
      if (!roots.length) tree.appendChild(h('button.sb-item.sb-muted', { onClick: newRootPage }, U.icon('plus', 15), h('span.sb-title', { text: 'Add a page' })))
      scroll.appendChild(tree)
    }

    scroll.appendChild(h('div.sb-divider'))
    scroll.appendChild(label('Others'))
    const trashBtn = actionItem('trash', 'Trash', () => trashPopover(trashBtn))
    scroll.appendChild(h('div.sb-nav', null,
      actionItem('template', 'Templates', () => app.openTemplates()),
      actionItem('import', 'Import', () => app.importMarkdown()),
      trashBtn,
      actionItem('keyboard', 'Shortcuts', () => app.shortcuts(), '?')
    ))
    sb.appendChild(scroll)
    scroll.scrollTop = scrollTop

    const name = st.settings.userName && st.settings.userName !== 'You' ? st.settings.userName : 'You'
    const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    sb.appendChild(h('div.sb-bottom', null,
      h('div.sb-account-row', null,
        h('button.sb-account', { onClick: () => app.settings('account') },
          h('span.avatar-sm', { text: name.charAt(0).toUpperCase() }),
          h('span.sb-account-text', null, h('span.sb-account-name', { text: name }), h('span.sb-account-sub', { text: 'Saved on this device' }))
        ),
        h('button.sb-icon-btn', { title: dark ? 'Switch to light mode' : 'Switch to dark mode', onClick: () => S.setSetting('theme', dark ? 'light' : 'dark') }, U.icon(dark ? 'sun' : 'moon', 17)),
        h('button.sb-icon-btn', { title: 'Settings', onClick: () => app.settings() }, U.icon('gear', 17))
      )
    ))
    bindTrashDrop(trashBtn)
  }

  function label(content, right) {
    return h('div.sb-label', null, typeof content === 'string' ? h('span', { text: content }) : content, right || null)
  }

  function viewItem(name, icon, text, right) {
    const active = viewName === name || (name === 'projects' && viewName === 'project')
    return h('button.sb-item', { class: active ? 'active' : null, 'aria-current': active ? 'page' : null, onClick: () => app.go(name) }, U.icon(icon, 18), h('span.sb-title', { text }), right || null)
  }

  function actionItem(icon, text, onClick, hint) {
    return h('button.sb-item', { onClick }, U.icon(icon, 18), h('span.sb-title', { text }), hint ? h('kbd', { text: hint }) : null)
  }

  function projectItem(p, pinnedList) {
    const pr = P.projectProgress(p.id)
    const active = viewName === 'project' && viewParam === p.id
    return h('button.sb-item', { class: active ? 'active' : null, onClick: () => app.go('project/' + p.id) },
      K.badge(p, 'sm'),
      h('span.sb-title', { text: p.name }),
      pinnedList
        ? h('span.sb-pin', { title: 'Unpin', role: 'button', onClick: e => { e.stopPropagation(); P.updateProject(p.id, { pinned: false }) } }, U.icon('pin', 15))
        : pr.open
          ? h('span.sb-hint.num', { text: String(pr.open) })
          : null
    )
  }

  function treeItem(id, depth, mode) {
    const st = S.state()
    const p = S.page(id)
    const key = mode === 'fav' ? 'fav:' + id : id
    const expanded = !!st.settings.expanded[key]
    const kids = S.childPages(id)
    const wrap = h('div.sb-node')
    const toggle = h('button.sb-toggle', {
      title: expanded ? 'Collapse' : 'Expand',
      onClick: e => {
        e.stopPropagation()
        st.settings.expanded[key] = !expanded
        S.save()
        renderSidebar()
      },
    }, U.icon(expanded ? 'chevronDown' : 'chevronRight', 12))
    const icon = p.icon ? h('span.sb-emoji', { text: p.icon }) : U.icon(p.type === 'database' ? 'database' : kids.length || p.blocks.length ? 'page' : 'pageBlank', 16)
    const more = h('button.sb-icon-btn', { title: 'Delete, duplicate, and more…' }, U.icon('dots', 14))
    const add = h('button.sb-icon-btn', { title: 'Add a page inside' }, U.icon('plus', 14))
    const item = h('div.sb-item.sb-page', {
      class: id === currentId ? 'active' : null,
      style: { paddingLeft: 12 + depth * 14 + 'px' },
      dataset: { id },
      draggable: 'true',
      role: 'link',
      tabindex: '0',
      onClick: () => app.open(id),
      onKeydown: e => {
        if (e.key === 'Enter') app.open(id)
      },
      onContextmenu: e => {
        e.preventDefault()
        pageMenu({ x: e.clientX, y: e.clientY }, id)
      },
    },
      h('span.sb-ico.sb-ico-swap', null, h('span.sb-ico-page', null, icon), p.type === 'database' ? null : toggle),
      h('span.sb-title', { text: S.pageTitle(p) }),
      h('span.sb-actions', null, more, p.type === 'database' ? null : add)
    )
    more.addEventListener('click', e => {
      e.stopPropagation()
      pageMenu(more, id)
    })
    add.addEventListener('click', e => {
      e.stopPropagation()
      newChildPage(id)
    })
    bindTreeDnD(item, id)
    wrap.appendChild(item)
    if (expanded && p.type !== 'database') {
      const box = h('div.sb-children')
      if (!kids.length) box.appendChild(h('div.sb-empty', { style: { paddingLeft: 42 + depth * 14 + 'px' }, text: 'No pages inside' }))
      kids.forEach(k => box.appendChild(treeItem(k, depth + 1, mode)))
      wrap.appendChild(box)
    }
    return wrap
  }

  function clearDropMarks() {
    U.$$('.sb-page.drop-before, .sb-page.drop-after, .sb-page.drop-inside, .drop-trash').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-inside', 'drop-trash'))
  }

  function bindTreeDnD(item, id) {
    item.addEventListener('dragstart', e => {
      F.dragState = { kind: 'page', id }
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', S.pageTitle(S.page(id)))
    })
    item.addEventListener('dragend', () => {
      F.dragState = null
      clearDropMarks()
    })
    item.addEventListener('dragover', e => {
      const ds = F.dragState
      if (!ds) return
      const target = S.page(id)
      if (ds.kind === 'blocks') {
        if (id === ds.editor.pageId || target.type === 'database') return
        e.preventDefault()
        clearDropMarks()
        item.classList.add('drop-inside')
        return
      }
      if (ds.kind !== 'page' || ds.id === id) return
      if (S.ancestors(id).some(a => a.id === ds.id)) return
      e.preventDefault()
      const r = item.getBoundingClientRect()
      const y = e.clientY - r.top
      let pos = y < r.height * 0.28 ? 'before' : y > r.height * 0.72 ? 'after' : 'inside'
      if (pos === 'inside' && target.type === 'database') pos = 'after'
      clearDropMarks()
      item.classList.add('drop-' + pos)
      item._dropPos = pos
    })
    item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after', 'drop-inside'))
    item.addEventListener('drop', e => {
      const ds = F.dragState
      if (!ds) return
      e.preventDefault()
      clearDropMarks()
      if (ds.kind === 'blocks') {
        ds.editor.moveBlocksToPage(ds.ids, id)
        ds.editor.dragEnd()
        return
      }
      if (ds.kind === 'page') {
        S.movePage(ds.id, id, item._dropPos || 'inside')
        F.dragState = null
      }
    })
  }

  function bindTrashDrop(btn) {
    btn.addEventListener('dragover', e => {
      if (!F.dragState || F.dragState.kind !== 'page') return
      e.preventDefault()
      btn.classList.add('drop-trash')
    })
    btn.addEventListener('dragleave', () => btn.classList.remove('drop-trash'))
    btn.addEventListener('drop', e => {
      if (!F.dragState || F.dragState.kind !== 'page') return
      e.preventDefault()
      const id = F.dragState.id
      F.dragState = null
      trashWithUndo(id)
    })
  }

  function trashWithUndo(id) {
    const p = S.page(id)
    S.trashPage(id)
    UI.toast('Moved “' + S.pageTitle(p) + '” to Trash', { action: { label: 'Undo', onClick: () => S.restorePage(id) } })
    if (currentId === id || (currentId && S.ancestors(currentId).some(a => a.id === id))) renderPage(currentId)
  }

  function pageMenu(anchor, id) {
    const p = S.page(id)
    const fav = S.isFavorite(id)
    UI.menu(anchor, [
      { header: 'Page' },
      { label: fav ? 'Remove from Favorites' : 'Add to Favorites', icon: fav ? 'starFill' : 'star', onClick: () => S.toggleFavorite(id) },
      { divider: true },
      {
        label: 'Copy link',
        icon: 'link',
        onClick: () => {
          U.copyText(location.href.split('#')[0] + '#/p/' + id)
          UI.toast('Copied link to clipboard')
        },
      },
      { label: 'Duplicate', icon: 'duplicate', hint: U.modKey + 'D', onClick: () => app.open(S.duplicatePage(id).id) },
      {
        label: 'Rename',
        icon: 'edit',
        onClick: () => {
          const el = document.querySelector('.sb-page[data-id="' + id + '"]')
          UI.inputPopover(el ? el.getBoundingClientRect() : anchor, {
            value: p.title,
            placeholder: 'Untitled',
            onSubmit: v => S.updatePage(id, { title: v }),
          })
        },
      },
      { label: 'Move to', icon: 'moveTo', onClick: () => moveToPicker(anchor, id) },
      { label: 'Open in new tab', icon: 'open', onClick: () => window.open(location.href.split('#')[0] + '#/p/' + id, '_blank') },
      { divider: true },
      { label: 'Move to Trash', icon: 'trash', danger: true, onClick: () => trashWithUndo(id) },
      { divider: true },
      { render: () => h('div.menu-foot', { text: 'Last edited ' + U.timeAgo(p.updatedAt) }) },
    ], { width: 250, search: true, searchPlaceholder: 'Search actions…' })
  }

  function moveToPicker(anchor, id) {
    UI.pagePicker(anchor, {
      title: 'Move “' + S.pageTitle(S.page(id)) + '” to…',
      filter: p => p.id !== id && p.type !== 'database' && !S.ancestors(p.id).some(a => a.id === id),
      extra: q =>
        !q || 'private top level'.indexOf(q.toLowerCase()) !== -1
          ? [{ label: 'Private (top level)', icon: 'home', onClick: () => S.movePageTo(id, null) }]
          : [],
      onSelect: target => {
        if (S.movePageTo(id, target.id)) UI.toast('Moved to ' + S.pageTitle(target))
      },
    })
  }

  function workspaceMenu(anchor) {
    const st = S.state()
    const theme = st.settings.theme
    UI.menu(anchor, [
      { render: () => h('div.ws-card', null, st.workspace.icon ? h('span.logo-mark.emoji', { text: st.workspace.icon }) : h('span.logo-mark', { html: LOGO }), h('div', null, h('div.ws-card-name', { text: st.workspace.name }), h('div.muted.small', { text: 'Personal workspace · saved on this device' }))) },
      { divider: true },
      { label: 'Settings', icon: 'gear', onClick: () => app.settings() },
      {
        label: 'Appearance',
        icon: theme === 'dark' ? 'moon' : 'sun',
        hint: { system: 'System', light: 'Light', dark: 'Dark' }[theme],
        submenu: () =>
          [['system', 'Use system setting'], ['light', 'Light'], ['dark', 'Dark']].map(t => ({
            label: t[1],
            checked: theme === t[0],
            onClick: () => S.setSetting('theme', t[0]),
          })),
      },
      { label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', onClick: () => app.shortcuts() },
      { divider: true },
      { label: 'Export workspace', icon: 'download', onClick: exportWorkspace },
      { label: 'About Folio', icon: 'help', onClick: () => (location.href = window.FOLIO_LANDING || 'index.html') },
    ], { width: 260 })
  }

  // ------------------------------------------------------------------ sidebar resize / collapse
  function bindResizer() {
    const rz = $('resizer')
    rz.addEventListener('mousedown', e => {
      e.preventDefault()
      document.body.classList.add('resizing')
      const move = ev => {
        const w = U.clamp(ev.clientX, 200, 480)
        document.documentElement.style.setProperty('--sidebar-w', w + 'px')
        S.state().settings.sidebarWidth = w
      }
      const up = () => {
        document.body.classList.remove('resizing')
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        S.save()
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    })
    rz.addEventListener('dblclick', () => {
      document.documentElement.style.setProperty('--sidebar-w', '248px')
      S.state().settings.sidebarWidth = 248
      S.save()
    })
    // Peek the sidebar by hovering the left edge while it's collapsed
    $('app').addEventListener('mousemove', e => {
      const a = $('app')
      if (!a.classList.contains('sidebar-collapsed') || innerWidth < 760) return
      if (e.clientX < 12) a.classList.add('sidebar-peek')
      else if (a.classList.contains('sidebar-peek') && e.clientX > $('sidebar').offsetWidth + 20 && !UI.anyOpen()) a.classList.remove('sidebar-peek')
    })
  }

  function setSidebarOpen(open) {
    const a = $('app')
    if (innerWidth < 760) {
      a.classList.toggle('mobile-open', open)
      return
    }
    a.classList.toggle('sidebar-collapsed', !open)
    a.classList.remove('sidebar-peek')
    S.state().settings.sidebarCollapsed = !open
    S.save()
    renderTopbar()
  }

  app.toggleSidebar = function() {
    const a = $('app')
    if (innerWidth < 760) setSidebarOpen(!a.classList.contains('mobile-open'))
    else setSidebarOpen(a.classList.contains('sidebar-collapsed'))
  }

  // ------------------------------------------------------------------ topbar
  function renderTopbar() {
    const bar = $('topbar')
    bar.innerHTML = ''
    const collapsed = $('app').classList.contains('sidebar-collapsed') || innerWidth < 760
    if (collapsed) bar.appendChild(h('button.top-btn.top-menu', { title: 'Open sidebar', onClick: () => app.toggleSidebar() }, U.icon('menu', 18)))
    const crumbs = h('nav.crumbs', { 'aria-label': 'Breadcrumb' })
    const sep = () => h('span.crumb-sep', null, U.icon('chevronRight', 14))
    const crumb = (text, onClick, current, icon) =>
      h('button.crumb', { class: current ? 'current' : null, onClick: onClick || null, 'aria-current': current ? 'page' : null, title: text }, icon || null, h('span.crumb-title', { text }))
    crumbs.appendChild(h('button.crumb.crumb-home', { title: 'Dashboard', onClick: () => app.go('home') }, U.icon('home', 17)))
    const p = S.page(currentId)
    if (viewName) {
      crumbs.appendChild(sep())
      if (viewName === 'home') crumbs.appendChild(crumb('Dashboard', null, true))
      else {
        crumbs.appendChild(crumb('Dashboard', () => app.go('home')))
        crumbs.appendChild(sep())
        if (viewName === 'project') {
          const pr = P.project(viewParam)
          crumbs.appendChild(crumb('Projects', () => app.go('projects')))
          crumbs.appendChild(sep())
          crumbs.appendChild(crumb(pr ? pr.name : 'Project', null, true, pr ? K.badge(pr, 'xs') : null))
        } else {
          crumbs.appendChild(crumb(viewDef(viewName).title, null, true))
        }
      }
    } else if (p) {
      crumbs.appendChild(sep())
      crumbs.appendChild(crumb('Docs', () => app.go('docs')))
      const chain = S.ancestors(p.id).concat([p])
      let shown = chain
      if (chain.length > 3) shown = [chain[0], null].concat(chain.slice(-2))
      shown.forEach((c, i) => {
        crumbs.appendChild(sep())
        if (!c) {
          const hidden = chain.slice(1, -2)
          const more = h('button.crumb', { text: '…' })
          more.addEventListener('click', () => UI.menu(more, hidden.map(x => ({ label: S.pageTitle(x), icon: x.icon || 'page', onClick: () => app.open(x.id) })), { width: 240 }))
          crumbs.appendChild(more)
          return
        }
        const last = i === shown.length - 1
        crumbs.appendChild(crumb(S.pageTitle(c), last ? null : () => app.open(c.id), last, c.icon ? h('span.crumb-icon', { text: c.icon }) : null))
      })
      if (p.locked) crumbs.appendChild(h('button.lock-badge', { title: 'Unlock page', onClick: () => S.updatePage(p.id, { locked: false }) }, U.icon('lock', 12), 'Locked'))
    } else {
      crumbs.appendChild(sep())
      crumbs.appendChild(crumb(currentId ? 'Not found' : 'Folio', null, true))
    }
    bar.appendChild(crumbs)

    const right = h('div.top-right')
    const nu = nextUpChip()
    if (nu) right.appendChild(nu)
    const fs = F.focus.status()
    const chip = h('button.focus-chip.focus-live-chip', { class: 'tone-' + fs.tone + (fs.running ? '' : ' paused'), title: 'Open focus timer', onClick: () => app.go('focus') }, F.focus.fmt(fs.remaining))
    chip.style.display = fs.running || fs.remaining < fs.total - 0.5 ? '' : 'none'
    right.appendChild(chip)
    if (p) {
      right.appendChild(h('span.top-edited', { text: 'Edited ' + U.timeAgo(p.updatedAt) }))
      const share = h('button.top-btn.top-text', { onClick: () => sharePopover(share, p) }, 'Share')
      right.appendChild(share)
      const fav = S.isFavorite(p.id)
      right.appendChild(h('button.top-btn', { class: fav ? 'fav-on' : null, title: fav ? 'Remove from Favorites' : 'Add to Favorites', onClick: () => S.toggleFavorite(p.id) }, U.icon(fav ? 'starFill' : 'star', 18)))
      const more = h('button.top-btn', { title: 'Style, export, and more…' }, U.icon('dots', 18))
      more.addEventListener('click', () => pageOptions(more, p))
      right.appendChild(more)
    } else {
      right.appendChild(h('button.top-btn', { title: 'Search (' + U.modKey + 'K)', onClick: () => app.search() }, U.icon('search', 17)))
      right.appendChild(h('span.top-sep'))
      right.appendChild(h('button.btn-ink.sm', { title: 'New task (Q)', onClick: () => K.quickAddModal(viewName === 'project' ? { projectId: viewParam } : viewName === 'home' ? { due: U.todayISO() } : {}) }, U.icon('plus', 15), 'New task'))
    }
    bar.appendChild(right)
  }

  function nextUpChip() {
    const t = U.todayISO()
    const now = U.nowMin()
    const items = P.agenda(t).filter(x => !x.allDay && (x.kind === 'event' || x.ref.status !== 'done'))
    const cur = items.find(x => U.toMin(x.start) <= now && U.toMin(x.end) > now)
    const next = items.find(x => U.toMin(x.start) > now)
    const it = cur || next
    if (!it) return null
    const mins = U.toMin(it.start) - now
    const when = cur ? 'Now · until ' + U.fmtTime(it.end) : mins <= 90 ? 'in ' + U.fmtDuration(mins) : 'at ' + U.fmtTime(it.start)
    return h('button.next-up', { class: 'tone-' + it.tone, title: cur ? 'Happening now' : 'Up next', onClick: () => (it.kind === 'task' ? F.taskDrawer.open(it.id) : app.go('calendar')) },
      h('span.dot'), h('b', { text: it.title }), h('span', { text: when }))
  }

  function updateLive(st) {
    const show = st.running || st.remaining < st.total - 0.5
    U.$$('.focus-live').forEach(el => {
      el.textContent = F.focus.fmt(st.remaining)
      el.style.display = show ? '' : 'none'
      el.className = 'sb-live focus-live tone-' + st.tone
    })
    U.$$('.focus-live-chip').forEach(el => {
      el.textContent = F.focus.fmt(st.remaining)
      el.style.display = show ? '' : 'none'
      el.className = 'focus-chip focus-live-chip tone-' + st.tone + (st.running ? '' : ' paused')
    })
  }

  // Toast (and a system notification when the tab is hidden) shortly before events and timed tasks.
  const notified = new Set()
  function startReminders() {
    const keyOf = (t, it) => t + it.id + it.start
    const t0 = U.todayISO()
    P.agenda(t0).forEach(it => {
      if (U.toMin(it.start) < U.nowMin()) notified.add(keyOf(t0, it))
    })
    setInterval(() => {
      const t = U.todayISO()
      const now = U.nowMin()
      P.agenda(t).forEach(it => {
        if (it.allDay || (it.kind === 'task' && it.ref.status === 'done')) return
        const lead = U.toMin(it.start) - now
        const key = keyOf(t, it)
        if (lead <= 10 && lead >= 0 && !notified.has(key)) {
          notified.add(key)
          const msg = (it.kind === 'task' ? 'Reminder: ' : '') + it.title + (lead > 0 ? ' starts in ' + lead + ' min' : ' is starting now')
          UI.toast(msg, { duration: 9000, action: { label: 'Open', onClick: () => (it.kind === 'task' ? F.taskDrawer.open(it.id) : app.go('calendar')) } })
          try {
            if (document.hidden && window.Notification && Notification.permission === 'granted') new Notification('Folio', { body: msg })
          } catch (e) {
            /* optional */
          }
        }
      })
      if (!UI.anyOpen()) renderTopbar()
    }, 30000)
  }

  setInterval(() => {
    const el = document.querySelector('.top-edited')
    const p = S.page(currentId)
    if (el && p) el.textContent = 'Edited ' + U.timeAgo(p.updatedAt)
  }, 30000)

  function sharePopover(anchor, p) {
    const url = location.href.split('#')[0] + '#/p/' + p.id
    const input = h('input.pop-input', { value: url, readonly: true })
    UI.popover(anchor, h('div.share-pop', null,
      h('div.share-title', { text: 'Share this page' }),
      h('div.muted.small', { text: 'Folio keeps everything in this browser, so links open on this device. To send a page to someone else, export it.' }),
      h('div.share-row', null, input, h('button.btn.btn-primary.btn-sm', { onClick: () => { U.copyText(url); UI.toast('Copied link to clipboard') } }, 'Copy link')),
      h('div.menu-divider'),
      h('div.share-actions', null,
        h('button.btn.btn-sm', { onClick: () => U.download(fileName(p) + '.md', F.md.fromPage(p), 'text/markdown') }, U.icon('download', 14), 'Markdown'),
        h('button.btn.btn-sm', { onClick: () => U.download(fileName(p) + '.html', pageHTML(p), 'text/html') }, U.icon('download', 14), 'HTML'),
        window.self === window.top ? h('button.btn.btn-sm', { onClick: () => window.print() }, U.icon('page', 14), 'Print / PDF') : null
      )
    ), { placement: 'bottom-end', width: 400, autofocus: false })
  }

  function fileName(p) {
    return S.pageTitle(p).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'Untitled'
  }

  function pageHTML(p) {
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + U.escapeHTML(S.pageTitle(p)) + '</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 24px;color:#2d2c28}blockquote{border-left:3px solid currentColor;margin:0;padding-left:14px}code{background:#f1f0ec;padding:1px 4px;border-radius:4px}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px}</style></head><body>' + mdToHtml(F.md.fromPage(p)) + '</body></html>'
  }

  // A small Markdown renderer for exports and history previews.
  function mdToHtml(md) {
    const lines = md.split('\n')
    const out = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      let m
      if (/^\s*```/.test(line)) {
        const code = []
        i++
        while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++])
        out.push('<pre><code>' + U.escapeHTML(code.join('\n')) + '</code></pre>')
        continue
      }
      if (/^\|.*\|$/.test(line.trim())) {
        const rows = [line]
        while (i + 1 < lines.length && /^\|.*\|$/.test(lines[i + 1].trim())) rows.push(lines[++i])
        out.push('<table>' + rows.filter(r => !/^\|[\s:|-]+\|$/.test(r.trim())).map(r => '<tr>' + r.trim().slice(1, -1).split('|').map(c => '<td>' + F.md.inlineToHtml(c.trim()) + '</td>').join('') + '</tr>').join('') + '</table>')
        continue
      }
      if ((m = /^(#{1,3}) (.*)$/.exec(line))) out.push('<h' + m[1].length + '>' + F.md.inlineToHtml(m[2]) + '</h' + m[1].length + '>')
      else if ((m = /^(\s*)- \[( |x)\] (.*)$/.exec(line))) out.push('<p style="margin-left:' + m[1].length * 6 + 'px">' + (m[2] === 'x' ? '☑' : '☐') + ' ' + F.md.inlineToHtml(m[3]) + '</p>')
      else if ((m = /^(\s*)[-*] (.*)$/.exec(line))) out.push('<p style="margin-left:' + m[1].length * 6 + 'px">• ' + F.md.inlineToHtml(m[2]) + '</p>')
      else if ((m = /^(\s*)(\d+)\. (.*)$/.exec(line))) out.push('<p style="margin-left:' + m[1].length * 6 + 'px">' + m[2] + '. ' + F.md.inlineToHtml(m[3]) + '</p>')
      else if ((m = /^> (.*)$/.exec(line))) out.push('<blockquote>' + F.md.inlineToHtml(m[1]) + '</blockquote>')
      else if (line === '---') out.push('<hr>')
      else if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line.trim()))) {
        const src = U.safeUrl(m[2])
        if (src) out.push('<p><img alt="' + U.escapeHTML(m[1]) + '" src="' + U.escapeHTML(src) + '" style="max-width:100%"></p>')
      } else if (line.trim()) out.push('<p>' + F.md.inlineToHtml(line) + '</p>')
    }
    return out.join('\n')
  }

  function toggleRow(label, icon, on, onChange) {
    const sw = h('span.switch', { class: on ? 'on' : null })
    return h('div.menu-item', { onClick: () => onChange(!on) }, U.icon(icon, 16), h('span.menu-label', { text: label }), sw)
  }

  function pageOptions(anchor, p) {
    let pop
    const close = () => pop && pop.close()
    const update = patch => {
      S.updatePage(p.id, patch)
      close()
      pageOptions(anchor, S.page(p.id))
    }
    const fontBtn = (key, label, cls) =>
      h('button.font-opt', { class: (p.font || 'default') === key ? 'active' : null, onClick: () => update({ font: key }) }, h('span.font-ag', { class: cls, text: 'Ag' }), h('span', { text: label }))
    const item = (icon, label, fn, hint, danger) =>
      h('div.menu-item', { class: danger ? 'danger' : null, onClick: () => { close(); fn() } }, U.icon(icon, 16), h('span.menu-label', { text: label }), hint ? h('span.menu-hint', { text: hint }) : null)
    const fav = S.isFavorite(p.id)
    const words = S.wordCount(p)
    const content = h('div.menu.page-options', null,
      h('div.menu-header', { text: 'Style' }),
      h('div.font-row', null, fontBtn('default', 'Default', 'f-default'), fontBtn('serif', 'Serif', 'f-serif'), fontBtn('mono', 'Mono', 'f-mono')),
      h('div.menu-list', null,
        toggleRow('Small text', 'textSize', p.smallText, v => update({ smallText: v })),
        toggleRow('Full width', 'width', p.fullWidth, v => update({ fullWidth: v })),
        h('div.menu-divider'),
        toggleRow('Lock page', 'lock', p.locked, v => update({ locked: v })),
        h('div.menu-divider'),
        item(fav ? 'starFill' : 'star', fav ? 'Remove from Favorites' : 'Add to Favorites', () => S.toggleFavorite(p.id)),
        item('link', 'Copy link', () => {
          U.copyText(location.href.split('#')[0] + '#/p/' + p.id)
          UI.toast('Copied link to clipboard')
        }),
        item('duplicate', 'Duplicate', () => app.open(S.duplicatePage(p.id).id)),
        item('moveTo', 'Move to', () => moveToPicker(anchor, p.id)),
        p.type !== 'database' ? item('clock', 'Page history', () => app.history(p.id)) : null,
        item('undo', 'Undo', () => {
          if (!S.undo(p.id)) UI.toast('Nothing to undo')
        }, U.modKey + 'Z'),
        h('div.menu-divider'),
        item('import', 'Import Markdown', () => app.importMarkdown(p.type === 'database' ? null : p.id)),
        item('download', 'Export as Markdown', () => U.download(fileName(p) + '.md', F.md.fromPage(p), 'text/markdown')),
        item('download', 'Export as HTML', () => U.download(fileName(p) + '.html', pageHTML(p), 'text/html')),
        h('div.menu-divider'),
        item('trash', 'Move to Trash', () => trashWithUndo(p.id), null, true)
      ),
      h('div.menu-foot', null,
        h('div', { text: 'Word count: ' + words.toLocaleString() }),
        h('div', { text: 'Created ' + U.formatDate(p.createdAt, true) }),
        h('div', { text: 'Last edited ' + U.formatDate(p.updatedAt, true) })
      )
    )
    pop = UI.popover(anchor, content, { className: 'menu-pop', placement: 'bottom-end', width: 280, autofocus: false })
  }

  // ------------------------------------------------------------------ page history
  app.history = function(pageId) {
    UI.closeAll()
    S.recordVersion(pageId, true)
    const versions = S.versions(pageId)
    const list = h('div.hist-list')
    const preview = h('div.hist-preview')
    let current = 0
    let modal
    function render() {
      list.innerHTML = ''
      list.appendChild(h('div.set-nav-head', { text: 'Versions' }))
      versions.forEach((v, i) => {
        list.appendChild(
          h('button.hist-item', { class: i === current ? 'active' : null, onClick: () => { current = i; render() } },
            h('div.hist-when', { text: i === 0 ? 'Current version' : U.timeAgo(v.t) }),
            h('div.hist-date', { text: U.formatDate(v.t, true) })
          )
        )
      })
      const v = versions[current]
      preview.innerHTML = ''
      if (!v) {
        preview.appendChild(h('div.muted', { text: 'No versions yet. Versions are saved as you edit.' }))
        return
      }
      const doc = h('div.hist-doc')
      doc.innerHTML = mdToHtml(F.md.fromPage({ title: v.title, icon: v.icon, blocks: v.blocks, type: 'page' }))
      preview.appendChild(doc)
    }
    render()
    const restore = h('button.btn.btn-primary.btn-sm', {
      onClick: () => {
        const v = versions[current]
        if (!v || current === 0) return modal.close()
        S.restoreVersion(pageId, v)
        modal.close()
        UI.toast('Restored the version from ' + U.formatDate(v.t, true), { action: { label: 'Undo', onClick: () => S.undo(pageId) } })
      },
    }, 'Restore version')
    modal = UI.modal(
      h('div.history', null,
        list,
        h('div.hist-main', null,
          h('div.tpl-head', null, h('div.tpl-title', { text: 'Page history' }), h('button.btn-icon', { onClick: () => modal.close() }, U.icon('x', 16))),
          preview,
          h('div.hist-foot', null, h('span.muted.small', { text: 'Folio saves a version every couple of minutes while you edit.' }), restore)
        )
      ),
      { width: 900, className: 'history-modal' }
    )
  }

  // ------------------------------------------------------------------ peek
  app.peek = function(id) {
    const st = S.state()
    if (st.settings.peekMode === 'full' || innerWidth < 760) return app.open(id)
    const panel = $('peek')
    if (peekEditor) peekEditor.destroy()
    peekId = id
    panel.innerHTML = ''
    const scroll = h('div.peek-scroll')
    const host = h('div.peek-host')
    scroll.appendChild(host)
    panel.appendChild(
      h('div.peek-bar', null,
        h('button.top-btn', { title: 'Close', onClick: () => app.closePeek() }, U.icon('chevronsRight', 18)),
        h('button.top-btn', { title: 'Open as full page', onClick: () => app.open(id) }, U.icon('open', 16)),
        h('div.spacer'),
        h('button.top-btn', {
          title: 'Delete',
          onClick: () => {
            S.trashPage(id)
            app.closePeek()
            UI.toast('Moved to Trash', { action: { label: 'Undo', onClick: () => S.restorePage(id) } })
          },
        }, U.icon('trash', 16))
      )
    )
    panel.appendChild(scroll)
    $('app').classList.add('peek-open')
    peekEditor = new F.editor.Editor(host, id, { peek: true })
    const p = S.page(id)
    if (p && !p.title) setTimeout(() => peekEditor && peekEditor.titleEl && peekEditor.titleEl.focus(), 60)
  }

  app.closePeek = function() {
    if (!peekId) return
    if (peekEditor) peekEditor.destroy()
    peekEditor = null
    peekId = null
    $('app').classList.remove('peek-open')
    $('peek').innerHTML = ''
  }

  // ------------------------------------------------------------------ command palette
  app.search = function(initial) {
    UI.closeAll()
    const input = h('input.search-input', { placeholder: 'Search, or type a command…', autofocus: true, 'aria-label': 'Search or run a command', id: 'palette-input' })
    if (initial) input.value = initial
    const results = h('div.search-results')
    let rows = []
    let active = 0
    let modal
    const mark = (text, q) => {
      const span = h('span')
      const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
      if (i === -1) {
        span.textContent = text
        return span
      }
      span.appendChild(document.createTextNode(text.slice(0, i)))
      span.appendChild(h('mark', { text: text.slice(i, i + q.length) }))
      span.appendChild(document.createTextNode(text.slice(i + q.length)))
      return span
    }
    const dark = () => document.documentElement.getAttribute('data-theme') === 'dark'
    const actions = () => [
      { label: 'New task', icon: 'plus', hint: 'Q', run: () => K.quickAddModal() },
      { label: 'New event', icon: 'calendar', run: () => app.go('calendar/new') },
      { label: 'New page', icon: 'page', run: newRootPage },
      { label: 'New project', icon: 'folder', run: () => F.views.newProject() },
      { label: F.focus.status().running ? 'Pause the focus timer' : 'Start a focus session', icon: 'focus', run: () => F.focus.toggle() },
      { label: 'Open today’s note', icon: 'note', run: () => app.dailyNote() },
      { label: 'Go to Dashboard', icon: 'dashboard', hint: 'G H', run: () => app.go('home') },
      { label: 'Go to My Tasks', icon: 'tasks', hint: 'G T', run: () => app.go('tasks') },
      { label: 'Go to Kanban Board', icon: 'board', hint: 'G B', run: () => app.go('board') },
      { label: 'Go to Calendar', icon: 'calendar', hint: 'G C', run: () => app.go('calendar') },
      { label: 'Go to Projects', icon: 'folder', hint: 'G P', run: () => app.go('projects') },
      { label: 'Go to Focus', icon: 'focus', hint: 'G F', run: () => app.go('focus') },
      { label: 'Go to Habits', icon: 'habit', hint: 'G A', run: () => app.go('habits') },
      { label: 'Go to Timeline', icon: 'timeline', hint: 'G L', run: () => app.go('timeline') },
      { label: 'Go to Docs', icon: 'page', hint: 'G D', run: () => app.go('docs') },
      { label: dark() ? 'Switch to light mode' : 'Switch to dark mode', icon: dark() ? 'sun' : 'moon', hint: U.modKey + 'Shift+L', run: () => S.setSetting('theme', dark() ? 'light' : 'dark') },
      { label: 'Change wallpaper and accent', icon: 'palette', run: () => app.settings('appearance') },
      { label: 'Open settings', icon: 'gear', run: () => app.settings() },
      { label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', run: () => app.shortcuts() },
    ]
    function render() {
      const q = input.value.trim()
      const ql = q.toLowerCase()
      results.innerHTML = ''
      rows = []
      const section = title => results.appendChild(h('div.search-group', { text: title }))
      const add = (icon, main, sub, right, run) => {
        const row = h('div.search-row', { onClick: () => choose(row), onMousemove: () => setActive(rows.indexOf(row)) },
          h('span.sr-icon', null, icon),
          h('div.sr-main', null, h('div.sr-title', null, main), sub ? h('div.sr-snippet', null, sub) : null),
          right ? h('span.sr-time', null, right) : null,
          h('span.sr-enter', null, U.icon('arrowRight', 14))
        )
        row._run = run
        rows.push(row)
        results.appendChild(row)
      }
      const taskRow = t => {
        const pr = P.project(t.projectId)
        add(pr ? K.badge(pr, 'xs') : U.icon(t.status === 'done' ? 'checkCircle' : 'circle', 17), mark(t.title, q), [pr ? pr.name : 'No project', t.due ? ' · ' + U.relDay(t.due) + (t.time ? ' ' + U.fmtTime(t.time) : '') : ''].join(''), '#' + P.taskKey(t), () => F.taskDrawer.open(t.id))
      }
      const acts = actions().filter(a => !ql || a.label.toLowerCase().indexOf(ql) !== -1)
      if (!q) {
        section('Quick actions')
        acts.slice(0, 6).forEach(a => add(U.icon(a.icon, 17), a.label, null, a.hint ? h('kbd', { text: a.hint }) : null, a.run))
        const today = P.sortTasks(P.openTasks().filter(t => t.due && t.due <= U.todayISO())).slice(0, 4)
        if (today.length) {
          section('Due today')
          today.forEach(taskRow)
        }
        const recent = S.state().recent.filter(id => S.page(id) && !S.isTrashed(id)).slice(0, 4)
        if (recent.length) {
          section('Recent pages')
          recent.forEach(id => {
            const pg = S.page(id)
            add(pg.icon ? h('span', { text: pg.icon }) : U.icon('page', 17), S.pageTitle(pg), S.ancestors(id).map(a => S.pageTitle(a)).join(' / ') || null, U.timeAgo(pg.updatedAt), () => app.open(id))
          })
        }
      } else {
        if (acts.length) {
          section('Actions')
          acts.slice(0, 5).forEach(a => add(U.icon(a.icon, 17), mark(a.label, q), null, a.hint ? h('kbd', { text: a.hint }) : null, a.run))
        }
        const tasks = P.tasks().filter(t => (t.title + ' ' + (t.notes || '') + ' ' + (t.labels || []).join(' ') + ' ' + P.taskKey(t)).toLowerCase().indexOf(ql) !== -1)
        if (tasks.length) {
          section('Tasks')
          P.sortTasks(tasks.filter(t => t.status !== 'done')).concat(tasks.filter(t => t.status === 'done')).slice(0, 6).forEach(taskRow)
        }
        const projects = P.projects().filter(p => (p.name + ' ' + (p.description || '')).toLowerCase().indexOf(ql) !== -1)
        if (projects.length) {
          section('Projects')
          projects.slice(0, 4).forEach(p => add(K.badge(p, 'xs'), mark(p.name, q), p.description || null, P.projectProgress(p.id).pct + '%', () => app.go('project/' + p.id)))
        }
        const events = P.events().filter(e => e.date >= U.addDays(U.todayISO(), -7) && (e.title + ' ' + (e.location || '')).toLowerCase().indexOf(ql) !== -1).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
        if (events.length) {
          section('Events')
          events.slice(0, 4).forEach(e => add(h('span.ev-dot', { class: 'tone-' + P.calendar(e.cal).tone }), mark(e.title, q), U.relDay(e.date) + (e.allDay ? ' · All day' : ' · ' + U.fmtTime(e.start) + ' – ' + U.fmtTime(e.end)), P.calendar(e.cal).name, () => {
            app.go('calendar')
          }))
        }
        const pages = S.search(q, 8)
        if (pages.length) {
          section('Pages')
          pages.forEach(r => {
            const pg = r.page
            add(pg.icon ? h('span', { text: pg.icon }) : U.icon(pg.type === 'database' ? 'database' : 'page', 17), mark(S.pageTitle(pg), q), r.snippet ? mark(r.snippet, q) : S.ancestors(pg.id).map(a => S.pageTitle(a)).join(' / ') || null, U.timeAgo(pg.updatedAt), () => app.open(pg.id))
          })
        }
        section('Create')
        add(U.icon('plus', 17), h('span', null, 'New task: ', h('b', { text: q })), 'Dates, #projects and !priority are understood', null, () => {
          const r = P.parseQuickAdd(q)
          const f = { title: r.title || q }
          ;['due', 'time', 'projectId', 'priority', 'repeat'].forEach(k => {
            if (r[k]) f[k] = r[k]
          })
          if (r.labels.length) f.labels = r.labels
          const t = P.addTask(f)
          UI.toast('Added “' + t.title + '”', { action: { label: 'Open', onClick: () => F.taskDrawer.open(t.id) } })
        })
        add(U.icon('page', 17), h('span', null, 'New page: ', h('b', { text: q })), null, null, () => app.open(S.createPage({ title: q }).id))
      }
      setActive(0)
    }
    function setActive(i) {
      active = i
      rows.forEach((r, j) => r.classList.toggle('active', j === i))
      if (rows[i]) rows[i].scrollIntoView({ block: 'nearest' })
    }
    function choose(row) {
      modal.close()
      row._run()
    }
    input.addEventListener('input', render)
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive(Math.min(rows.length - 1, active + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(Math.max(0, active - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (rows[active]) choose(rows[active])
      }
    })
    render()
    modal = UI.modal(
      h('div.search-box', null,
        h('div.search-head', null, U.icon('search', 18), input, h('kbd', { text: 'esc' })),
        results,
        h('div.search-foot', null, h('span', null, h('kbd', { text: '↑↓' }), ' Navigate'), h('span', null, h('kbd', { text: '↵' }), ' Open'), h('span', null, h('kbd', { text: 'G' }), ' then a letter to jump'), h('span.spacer'), h('span', null, 'Folio'))
      ),
      { className: 'search-modal', width: 680, top: true }
    )
  }

  // ------------------------------------------------------------------ trash
  function trashPopover(anchor) {
    const input = h('input.menu-search', { placeholder: 'Filter by page title…', autofocus: true })
    const list = h('div.trash-list')
    let pop
    function render() {
      list.innerHTML = ''
      const q = input.value.trim().toLowerCase()
      const items = S.trashedPages().filter(p => !q || S.pageTitle(p).toLowerCase().indexOf(q) !== -1)
      if (!items.length) list.appendChild(h('div.trash-empty', null, U.icon('trash', 28), h('div', { text: q ? 'No matches' : 'Trash is empty' })))
      items.forEach(p => {
        const parent = S.page(p.parentId)
        list.appendChild(
          h('div.trash-row', { onClick: () => { pop.close(); app.open(p.id) } },
            h('span.sr-icon', null, p.icon ? h('span', { text: p.icon }) : U.icon('page', 16)),
            h('div.sr-main', null, h('div.sr-title', { text: S.pageTitle(p) }), h('div.sr-snippet', { text: (parent ? 'In ' + S.pageTitle(parent) + ' · ' : '') + 'Deleted ' + U.timeAgo(p.trashedAt || p.updatedAt) })),
            h('button.btn-icon', {
              title: 'Restore',
              onClick: e => {
                e.stopPropagation()
                S.restorePage(p.id)
                UI.toast('Restored “' + S.pageTitle(p) + '”')
                render()
                if (currentId) renderPage(currentId)
              },
            }, U.icon('undo', 16)),
            h('button.btn-icon', {
              title: 'Delete permanently',
              onClick: e => {
                e.stopPropagation()
                UI.confirm('“' + S.pageTitle(p) + '” and everything inside it will be gone for good.', { title: 'Delete permanently?', ok: 'Delete', danger: true }).then(ok => {
                  if (!ok) return
                  S.deletePermanently(p.id)
                  render()
                  if (currentId && !S.page(currentId)) app.home()
                })
              },
            }, U.icon('trash', 16))
          )
        )
      })
    }
    input.addEventListener('input', render)
    input.addEventListener('keydown', e => e.stopPropagation())
    render()
    pop = UI.popover(anchor, h('div.trash-pop', null, input, list,
      h('div.trash-foot', null,
        h('span.muted.small', { text: 'Pages stay here until you delete them.' }),
        h('button.btn-text.danger', {
          onClick: () =>
            UI.confirm('Every page in Trash will be permanently deleted.', { title: 'Empty Trash?', ok: 'Empty Trash', danger: true }).then(ok => {
              if (!ok) return
              S.emptyTrash()
              render()
              if (currentId && !S.page(currentId)) app.home()
            }),
        }, 'Empty Trash')
      )
    ), { placement: innerWidth < 760 ? 'bottom-start' : 'right-start', width: 400 })
  }

  // ------------------------------------------------------------------ templates & import
  app.openTemplates = function(targetId) {
    UI.closeAll()
    let cat = 'All'
    const cats = ['All'].concat(F.templates.map(t => t.category).filter((c, i, a) => a.indexOf(c) === i))
    const nav = h('div.tpl-nav')
    const grid = h('div.tpl-grid')
    let modal
    function render() {
      nav.innerHTML = ''
      nav.appendChild(h('div.tpl-nav-title', { text: 'Templates' }))
      cats.forEach(c => nav.appendChild(h('button.tpl-cat', { class: c === cat ? 'active' : null, text: c, onClick: () => { cat = c; render() } })))
      grid.innerHTML = ''
      F.templates.filter(t => cat === 'All' || t.category === cat).forEach(t => {
        grid.appendChild(
          h('button.tpl-card', {
            onClick: () => {
              modal.close()
              const target = targetId && S.page(targetId) && !S.page(targetId).blocks.length && S.page(targetId).type !== 'database' ? targetId : null
              const p = F.applyTemplate(t, target)
              app.open(p.id)
            },
          },
          h('div.tpl-preview', null, h('span', { text: t.icon })),
          h('div.tpl-name', { text: t.name }),
          h('div.tpl-desc', { text: t.desc })
          )
        )
      })
    }
    render()
    modal = UI.modal(h('div.tpl-modal', null, nav, h('div.tpl-main', null, h('div.tpl-head', null, h('div.tpl-title', { text: 'Start with a template' }), h('button.btn-icon', { onClick: () => modal.close() }, U.icon('x', 16))), grid)), { width: 860, className: 'tpl' })
  }

  app.importMarkdown = function(targetId) {
    const file = h('input', { type: 'file', accept: '.md,.markdown,.txt,text/markdown,text/plain', multiple: true, style: { display: 'none' } })
    document.body.appendChild(file)
    file.addEventListener('change', () => {
      const files = Array.from(file.files || [])
      file.remove()
      if (!files.length) return
      Promise.all(files.map(f => f.text().then(text => ({ name: f.name.replace(/\.(md|markdown|txt)$/i, ''), text })))).then(docs => {
        let last = null
        docs.forEach((d, i) => {
          const parsed = F.md.toPage(d.text, d.name)
          const target = i === 0 && targetId ? S.page(targetId) : null
          if (target) {
            S.checkpoint(target.id)
            if (!target.title) target.title = parsed.title
            target.blocks = target.blocks.concat(parsed.blocks)
            S.commit('page', target.id)
            last = target
          } else {
            last = S.createPage({ title: parsed.title, blocks: parsed.blocks })
          }
        })
        UI.toast('Imported ' + docs.length + (docs.length === 1 ? ' page' : ' pages'))
        if (last) app.open(last.id)
      })
    })
    file.click()
  }

  // ------------------------------------------------------------------ settings
  function exportWorkspace() {
    U.download('folio-workspace-' + U.toISODate(new Date()) + '.json', JSON.stringify(S.state(), null, 2), 'application/json')
  }

  app.settings = function(tab) {
    UI.closeAll()
    const st = S.state()
    let current = tab || 'account'
    const nav = h('div.set-nav')
    const panel = h('div.set-panel')
    let modal
    const TABS = [
      ['account', 'My account', 'person'],
      ['prefs', 'Preferences', 'sun'],
      ['appearance', 'Appearance', 'palette'],
      ['workspace', 'Workspace', 'home'],
      ['data', 'Data & storage', 'database'],
      ['shortcuts', 'Shortcuts', 'keyboard'],
    ]
    const row = (title, desc, control) => h('div.set-row', null, h('div.set-text', null, h('div.set-title', { text: title }), desc ? h('div.set-desc', { text: desc }) : null), control)
    const select = (value, options, onChange) => {
      const s = h('select.set-select', null, options.map(o => h('option', { value: o[0], text: o[1], selected: o[0] === value ? true : null })))
      s.addEventListener('change', () => onChange(s.value))
      return s
    }
    function render() {
      nav.innerHTML = ''
      nav.appendChild(h('div.set-nav-head', { text: 'Settings' }))
      TABS.forEach(t => nav.appendChild(h('button.set-tab', { class: t[0] === current ? 'active' : null, onClick: () => { current = t[0]; render() } }, U.icon(t[2], 16), t[1])))
      panel.innerHTML = ''
      if (current === 'account') {
        const name = h('input.set-input', { value: st.settings.userName === 'You' ? '' : st.settings.userName, placeholder: 'Your name' })
        name.addEventListener('change', () => S.setSetting('userName', name.value.trim() || 'You'))
        panel.appendChild(h('h2.set-h', { text: 'My account' }))
        panel.appendChild(h('div.set-profile', null, h('div.avatar', { text: (st.settings.userName || 'Y').charAt(0).toUpperCase() }), h('div', null, h('div.set-title', { text: 'Preferred name' }), name)))
        panel.appendChild(h('div.set-note', { text: 'Your name is used in greetings on the Home page. Folio has no account system: everything lives in this browser’s local storage.' }))
      } else if (current === 'prefs') {
        panel.appendChild(h('h2.set-h', { text: 'Preferences' }))
        panel.appendChild(row('Appearance', 'Customize how Folio looks on this device.', select(st.settings.theme, [['system', 'Use system setting'], ['light', 'Light'], ['dark', 'Dark']], v => S.setSetting('theme', v))))
        panel.appendChild(row('Open on start', 'Choose what to show when Folio opens.', select(st.settings.startPage === 'last' ? 'last' : 'home', [['home', 'Dashboard'], ['last', 'Where I left off']], v => S.setSetting('startPage', v))))
        panel.appendChild(row('Time format', 'How times appear in tasks and the calendar.', select(st.settings.clock24 ? '24' : '12', [['12', '12-hour (2:30pm)'], ['24', '24-hour (14:30)']], v => S.setSetting('clock24', v === '24'))))
        const perm = window.Notification ? Notification.permission : 'unsupported'
        panel.appendChild(row('Desktop reminders', 'Folio shows reminders in the app 10 minutes before events and timed tasks. Allow notifications to also get them when this tab is in the background.', perm === 'granted'
          ? h('span.muted', { text: 'Allowed' })
          : perm === 'unsupported' || perm === 'denied'
            ? h('span.muted', { text: perm === 'denied' ? 'Blocked by the browser' : 'Not available here' })
            : h('button.btn.btn-sm', { onClick: () => {
                try {
                  Notification.requestPermission().then(() => render())
                } catch (e) {
                  UI.toast('Notifications aren’t available here')
                }
              } }, 'Allow')))
        panel.appendChild(row('Open database pages in', 'How rows open when you click them.', select(st.settings.peekMode, [['side', 'Side peek'], ['full', 'Full page']], v => S.setSetting('peekMode', v))))
      } else if (current === 'appearance') {
        panel.appendChild(h('h2.set-h', { text: 'Appearance' }))
        const themes = [['system', 'System', 'monitor'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']]
        panel.appendChild(row('Theme', 'Light, dark, or follow your device.', h('div.theme-pick', null, themes.map(t => h('button.theme-opt', { class: st.settings.theme === t[0] ? 'active' : null, onClick: () => { S.setSetting('theme', t[0]); render() } }, U.icon(t[2], 15), t[1])))))
        const accents = [['indigo', '#4b5cf0'], ['blue', '#2f7de1'], ['violet', '#8b5cf6'], ['emerald', '#10a36c'], ['amber', '#e38a0b'], ['rose', '#e5486d']]
        panel.appendChild(row('Accent color', 'Used for focus rings, links and highlights.', h('div.accent-pick', null, accents.map(a => h('button.accent-dot', { class: (st.settings.accent || 'indigo') === a[0] ? 'active' : null, style: { background: a[1] }, title: a[0], 'aria-label': a[0], onClick: () => { S.setSetting('accent', a[0]); render() } })))))
        const walls = [['none', 'Plain'], ['sky', 'Sky'], ['meadow', 'Meadow'], ['mist', 'Mist'], ['dusk', 'Dusk']]
        panel.appendChild(h('div.set-row.col', null,
          h('div.set-text', null, h('div.set-title', { text: 'Wallpaper' }), h('div.set-desc', { text: 'Shown behind the sidebar and around your workspace.' })),
          h('div.wall-pick', null, walls.map(w => h('button.wall-opt', { class: (st.settings.wallpaper || 'none') === w[0] ? 'active' : null, onClick: () => { S.setSetting('wallpaper', w[0]); render() } },
            h('span.wall-thumb', { class: 'wall-' + w[0] }, h('span.wallpaper')), h('span', { text: w[1] }))))
        ))
      } else if (current === 'workspace') {
        const name = h('input.set-input', { value: st.workspace.name })
        name.addEventListener('input', () => {
          st.workspace.name = name.value || 'My Workspace'
          S.save()
          scheduleSidebar()
        })
        const iconBtn = h('button.ws-icon.big.set-icon-btn', { text: st.workspace.icon || st.workspace.name.charAt(0).toUpperCase(), title: 'Change icon' })
        iconBtn.addEventListener('click', () =>
          UI.emojiPicker(iconBtn, {
            onSelect: e => {
              st.workspace.icon = e
              S.save()
              scheduleSidebar()
              render()
            },
            onRemove: () => {
              st.workspace.icon = ''
              S.save()
              scheduleSidebar()
              render()
            },
          })
        )
        panel.appendChild(h('h2.set-h', { text: 'Workspace' }))
        panel.appendChild(row('Name', 'Shown at the top of the sidebar.', name))
        panel.appendChild(row('Icon', 'Pick an emoji for your workspace.', iconBtn))
      } else if (current === 'data') {
        let bytes = 0
        try {
          bytes = (localStorage.getItem('folio.workspace.v1') || '').length * 2
        } catch (e) {
          bytes = 0
        }
        const pages = Object.keys(st.pages).length
        const importInput = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } })
        importInput.addEventListener('change', () => {
          const f = importInput.files[0]
          if (!f) return
          f.text().then(t => {
            try {
              const obj = JSON.parse(t)
              UI.confirm('This replaces everything in this workspace with the file’s contents.', { title: 'Import workspace?', ok: 'Replace', danger: true }).then(ok => {
                if (!ok) return
                S.importState(obj)
                modal.close()
                UI.toast('Workspace imported')
              })
            } catch (e) {
              UI.toast('That file isn’t a Folio workspace export')
            }
          })
        })
        panel.appendChild(h('h2.set-h', { text: 'Data & storage' }))
        panel.appendChild(h('div.set-stats', null, h('div.stat', null, h('div.stat-num', { text: String(pages) }), h('div.stat-label', { text: 'Pages' })), h('div.stat', null, h('div.stat-num', { text: (bytes / 1024 / 1024).toFixed(2) + ' MB' }), h('div.stat-label', { text: 'Used in this browser' }))))
        panel.appendChild(row('Export workspace', 'Download every page, database and setting as a JSON file.', h('button.btn.btn-sm', { onClick: exportWorkspace }, U.icon('download', 14), 'Export')))
        panel.appendChild(row('Import workspace', 'Restore from a Folio JSON export. Replaces current content.', h('div', null, importInput, h('button.btn.btn-sm', { onClick: () => importInput.click() }, U.icon('upload', 14), 'Import'))))
        panel.appendChild(row('Reset to sample content', 'Replace everything with the starter pages.', h('button.btn.btn-sm', {
          onClick: () => UI.confirm('All of your pages will be replaced with the sample workspace.', { title: 'Reset workspace?', ok: 'Reset', danger: true }).then(ok => {
            if (!ok) return
            S.reset()
            modal.close()
          }),
        }, 'Reset')))
        panel.appendChild(row('Delete all content', 'Start over with an empty workspace.', h('button.btn.btn-sm.btn-danger', {
          onClick: () => UI.confirm('Every page will be permanently deleted from this browser.', { title: 'Delete everything?', ok: 'Delete everything', danger: true }).then(ok => {
            if (!ok) return
            S.clearAll()
            modal.close()
          }),
        }, 'Delete')))
      } else {
        panel.appendChild(h('h2.set-h', { text: 'Keyboard shortcuts' }))
        panel.appendChild(shortcutList())
      }
    }
    render()
    modal = UI.modal(h('div.settings', null, nav, panel), { width: 880, className: 'settings-modal' })
  }

  function shortcutList() {
    const m = U.modKey
    const groups = [
      ['Everywhere', [
        [m + 'K  or  /', 'Search and run commands'],
        ['Q  or  N', 'New task'],
        ['G then H · T · B · C', 'Dashboard · Tasks · Board · Calendar'],
        ['G then P · F · A · L · D', 'Projects · Focus · Habits · Timeline · Docs'],
        [m + '\\', 'Toggle sidebar'],
        [m + 'Shift+L', 'Toggle dark mode'],
        [m + 'Alt+N', 'New page'],
        [m + '[ / ' + m + ']', 'Go back / forward'],
        ['?', 'Show shortcuts'],
      ]],
      ['Tasks and planning', [
        ['↑ ↓  or  J K', 'Move between tasks'],
        ['Enter', 'Open task details'],
        ['Space  or  X', 'Complete the focused task'],
        ['Esc', 'Close task details'],
        ['Space', 'Start or pause the focus timer (Focus view)'],
        ['← → · T', 'Previous / next period · today (Calendar)'],
        ['D · W · M', 'Day, week or month view (Calendar)'],
      ]],
      ['Quick add understands', [
        ['tomorrow 3pm, fri, next week', 'Due date and time'],
        ['#project', 'Project'],
        ['@label', 'Label'],
        ['!high  !urgent  !!', 'Priority'],
        ['every day, every week', 'Repeat'],
        ['for 45m', 'Duration'],
      ]],
      ['Editing pages', [
        [m + 'Z / ' + m + 'Shift+Z', 'Undo / redo'],
        [m + 'B / I / U', 'Bold, italic, underline'],
        [m + 'E', 'Inline code'],
        [m + 'K', 'Add link (with text selected)'],
        [m + 'D', 'Duplicate block'],
        [m + 'Shift+↑/↓', 'Move block up / down'],
        ['Tab / Shift+Tab', 'Indent / outdent'],
        ['/  @  :', 'Insert a block, mention, emoji'],
      ]],
    ]
    return h('div.shortcuts', null, groups.map(g =>
      h('div.sc-group', null, h('div.sc-head', { text: g[0] }), g[1].map(r => h('div.sc-row', null, h('span.sc-desc', { text: r[1] }), h('kbd', { text: r[0] }))))
    ))
  }

  app.shortcuts = function() {
    UI.closeAll()
    const modal = UI.modal(h('div.sc-modal', null, h('div.tpl-head', null, h('div.tpl-title', { text: 'Keyboard shortcuts' }), h('button.btn-icon', { onClick: () => modal.close() }, U.icon('x', 16))), shortcutList()), { width: 560 })
  }

  // ------------------------------------------------------------------ global keys
  function bindGlobalKeys() {
    let gAt = 0
    const JUMP = { h: 'home', t: 'tasks', b: 'board', c: 'calendar', p: 'projects', f: 'focus', a: 'habits', l: 'timeline', d: 'docs' }
    window.addEventListener('keydown', e => {
      if (e.defaultPrevented) return
      const mod = U.mod(e)
      const key = e.key.toLowerCase()
      const t = e.target
      const editing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      if (mod && (key === 'k' || key === 'p') && !e.shiftKey) {
        e.preventDefault()
        app.search()
      } else if (mod && e.key === '\\') {
        e.preventDefault()
        app.toggleSidebar()
      } else if (mod && e.shiftKey && key === 'l') {
        e.preventDefault()
        const dark = document.documentElement.getAttribute('data-theme') === 'dark'
        S.setSetting('theme', dark ? 'light' : 'dark')
      } else if (mod && e.altKey && e.code === 'KeyN') {
        e.preventDefault()
        newRootPage()
      } else if (mod && !editing && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        if (e.key === '[') history.back()
        else history.forward()
      } else if (!editing && !mod && !e.altKey && !UI.anyOpen()) {
        if (Date.now() - gAt < 1200) {
          gAt = 0
          if (JUMP[key]) {
            e.preventDefault()
            e.stopImmediatePropagation()
            app.go(JUMP[key])
          }
          return
        }
        if (key === 'g') {
          gAt = Date.now()
        } else if (key === 'q' || key === 'n') {
          e.preventDefault()
          K.quickAddModal(viewName === 'project' ? { projectId: viewParam } : {})
        } else if (e.key === '/') {
          e.preventDefault()
          app.search()
        } else if (e.key === '?') {
          e.preventDefault()
          app.shortcuts()
        } else if (e.key === 'Escape' && peekId) {
          const ed = F.editor.active()
          if (!ed || !ed.selected.size) app.closePeek()
        }
      }
    })
    window.addEventListener('resize', U.debounce(renderTopbar, 150))
  }

  document.addEventListener('DOMContentLoaded', app.init)
})(window.Folio)
