/* Folio — application shell: sidebar, topbar, routing, search, settings, trash, peek and home. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const h = U.h
  const S = F.store
  const UI = F.ui

  const app = (F.app = {})
  let editor = null
  let peekEditor = null
  let currentId = null
  let peekId = null
  let sidebarQueued = false

  const $ = id => document.getElementById(id)

  // ------------------------------------------------------------------ init
  app.init = function() {
    S.load()
    applyTheme()
    const st = S.state()
    document.documentElement.style.setProperty('--sidebar-w', st.settings.sidebarWidth + 'px')
    $('app').classList.toggle('sidebar-collapsed', !!st.settings.sidebarCollapsed)
    bindResizer()
    bindGlobalKeys()
    renderSidebar()
    S.on(onStore)
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
    route()
  }

  function onStore(type, id) {
    if (type === 'save-error') {
      if (!app.warned) UI.toast('Couldn’t save: your browser storage is full. Try removing large images.', { duration: 6000 })
      app.warned = true
      return
    }
    if (type === 'reset') {
      if (editor) editor.destroy()
      editor = null
      app.closePeek()
      applyTheme()
      scheduleSidebar()
      location.hash = '#/'
      route()
      return
    }
    if (type === 'settings') {
      applyTheme()
      return
    }
    if (type !== 'row') scheduleSidebar()
    renderTopbar()
    const p = S.page(currentId)
    if (p) document.title = (p.icon ? p.icon + ' ' : '') + S.pageTitle(p) + ' · Folio'
    if (type === 'pages' && currentId) {
      const cur = S.page(currentId)
      if (cur && S.isTrashed(currentId) !== app.shownTrashed) renderPage(currentId)
    }
  }

  function applyTheme() {
    const t = S.state().settings.theme
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }

  // ------------------------------------------------------------------ routing
  function parseHash() {
    const m = /^#\/p\/([\w-]+)(?:\/([\w-]+))?/.exec(location.hash)
    return m ? { page: m[1], block: m[2] || null } : null
  }

  function route() {
    const r = parseHash()
    if (!r) {
      const st = S.state()
      if (!location.hash || location.hash === '#' || location.hash === '#/') {
        if (!app.started && st.settings.startPage === 'last' && st.settings.lastPage && S.page(st.settings.lastPage) && !S.isTrashed(st.settings.lastPage)) {
          app.started = true
          location.replace('#/p/' + st.settings.lastPage)
          return
        }
      }
      app.started = true
      renderHome()
      return
    }
    app.started = true
    if (r.page !== currentId || !editor) renderPage(r.page)
    if (r.block && editor) setTimeout(() => editor.scrollToBlock(r.block), 60)
    if (innerWidth < 760) setSidebarOpen(false)
  }

  app.open = function(id) {
    app.closePeek()
    UI.closeAll()
    const hash = '#/p/' + id
    if (location.hash === hash) renderPage(id)
    else location.hash = hash
  }

  app.home = function() {
    app.closePeek()
    location.hash = '#/home'
  }

  function renderPage(id) {
    if (editor) editor.destroy()
    editor = null
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
      document.title = (p.icon ? p.icon + ' ' : '') + S.pageTitle(p) + ' · Folio'
      if (!p.parentId || p.isRow) {
        /* nothing to expand */
      } else {
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

  // ------------------------------------------------------------------ home
  function greeting() {
    const hr = new Date().getHours()
    return hr < 5 ? 'Good evening' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'
  }

  function renderHome() {
    if (editor) editor.destroy()
    editor = null
    currentId = null
    document.title = 'Home · Folio'
    const st = S.state()
    const view = $('view')
    view.innerHTML = ''
    view.className = 'view-home'
    const name = st.settings.userName && st.settings.userName !== 'You' ? ', ' + st.settings.userName : ''
    const home = h('div.home')
    home.appendChild(h('h1.home-greeting', { text: greeting() + name }))

    const recent = st.recent.filter(id => S.page(id) && !S.isTrashed(id)).slice(0, 12)
    home.appendChild(h('div.home-section-title', null, U.icon('clock', 14), 'Recently visited'))
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

    // Upcoming: dated rows from every database in the next two weeks
    const upcoming = []
    const today = U.toISODate(new Date())
    const limit = new Date()
    limit.setDate(limit.getDate() + 14)
    const limitIso = U.toISODate(limit)
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
    home.appendChild(h('div.home-section-title', null, U.icon('calendar', 14), 'Upcoming'))
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
    view.appendChild(home)
    $('scroller').scrollTop = 0
    renderTopbar()
    scheduleSidebar()
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

  function newChildPage(parentId) {
    const p = S.createPage({ parentId })
    S.state().settings.expanded[parentId] = true
    app.open(p.id)
  }

  function renderSidebar() {
    const st = S.state()
    const sb = $('sidebar')
    const scrollTop = sb.querySelector('.sb-scroll') ? sb.querySelector('.sb-scroll').scrollTop : 0
    sb.innerHTML = ''
    const ws = st.workspace
    const wsBtn = h('button.sb-workspace', { onClick: () => workspaceMenu(wsBtn) },
      h('span.ws-icon', { text: ws.icon || (ws.name || 'W').trim().charAt(0).toUpperCase() }),
      h('span.ws-name', { text: ws.name }),
      U.icon('chevronDown', 12)
    )
    const top = h('div.sb-top', null,
      wsBtn,
      h('div.sb-top-actions', null,
        h('button.sb-icon-btn', { title: 'Close sidebar (' + U.modKey + '\\)', onClick: () => app.toggleSidebar() }, U.icon('chevronsLeft', 16)),
        h('button.sb-icon-btn', { title: 'New page', onClick: newRootPage }, U.icon('edit', 16))
      )
    )
    sb.appendChild(top)
    const nav = h('div.sb-nav', null,
      navItem('search', 'Search', () => app.search(), U.modKey + 'K'),
      navItem('home', 'Home', () => app.home(), null, !currentId),
      navItem('gear', 'Settings', () => app.settings()),
      navItem('plus', 'New page', newRootPage)
    )
    sb.appendChild(nav)

    const scroll = h('div.sb-scroll')
    const favs = st.favorites.filter(id => S.page(id) && !S.isTrashed(id))
    if (favs.length) {
      scroll.appendChild(sectionHead('favorites', 'Favorites'))
      if (st.settings.sections.favorites) {
        const wrap = h('div.sb-tree')
        favs.forEach(id => wrap.appendChild(treeItem(id, 0, 'fav')))
        scroll.appendChild(wrap)
      }
    }
    scroll.appendChild(sectionHead('private', 'Private', () => newRootPage()))
    if (st.settings.sections.private) {
      const wrap = h('div.sb-tree')
      const roots = S.rootPages()
      roots.forEach(id => wrap.appendChild(treeItem(id, 0, 'tree')))
      if (!roots.length) wrap.appendChild(h('button.sb-item.sb-muted', { onClick: newRootPage }, h('span.sb-ico', null, U.icon('plus', 14)), h('span.sb-title', { text: 'Add a page' })))
      scroll.appendChild(wrap)
    }
    scroll.appendChild(h('div.sb-gap'))
    const trashBtn = navItem('trash', 'Trash', () => trashPopover(trashBtn))
    scroll.appendChild(
      h('div.sb-nav', null,
        navItem('template', 'Templates', () => app.openTemplates()),
        navItem('import', 'Import', () => app.importMarkdown()),
        trashBtn
      )
    )
    sb.appendChild(scroll)
    scroll.scrollTop = scrollTop
    sb.appendChild(
      h('div.sb-bottom', null,
        h('button.sb-new', { onClick: newRootPage }, U.icon('plus', 16), 'New page'),
        h('button.sb-icon-btn', { title: 'Keyboard shortcuts (?)', onClick: () => app.shortcuts() }, U.icon('help', 16))
      )
    )
    bindTrashDrop(trashBtn)
  }

  function navItem(icon, label, onClick, hint, active) {
    return h('button.sb-item.sb-navitem', { class: active ? 'active' : null, onClick }, h('span.sb-ico', null, U.icon(icon, 16)), h('span.sb-title', { text: label }), hint ? h('span.sb-hint', { text: hint }) : null)
  }

  function sectionHead(key, label, onAdd) {
    const st = S.state()
    const open = st.settings.sections[key]
    return h('div.sb-section', null,
      h('button.sb-section-label', {
        onClick: () => {
          st.settings.sections[key] = !open
          S.save()
          renderSidebar()
        },
      }, label, U.icon(open ? 'chevronDown' : 'chevronRight', 10)),
      onAdd ? h('button.sb-icon-btn.sb-section-add', { title: 'Add a page', onClick: onAdd }, U.icon('plus', 14)) : null
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
      style: { paddingLeft: 8 + depth * 12 + 'px' },
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
      if (!kids.length) box.appendChild(h('div.sb-empty', { style: { paddingLeft: 30 + depth * 12 + 'px' }, text: 'No pages inside' }))
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
      { render: () => h('div.ws-card', null, h('span.ws-icon.big', { text: st.workspace.icon || st.workspace.name.charAt(0).toUpperCase() }), h('div', null, h('div.ws-card-name', { text: st.workspace.name }), h('div.muted.small', { text: 'Stored in this browser' }))) },
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
      { label: 'About Folio', icon: 'help', onClick: () => window.open('index.html', '_blank') },
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
    const crumbs = h('nav.crumbs')
    const p = S.page(currentId)
    if (!p) {
      crumbs.appendChild(h('span.crumb.static', null, U.icon('home', 14), h('span', { text: currentId ? 'Not found' : 'Home' })))
      bar.appendChild(crumbs)
      return
    }
    const chain = S.ancestors(p.id).concat([p])
    let shown = chain
    if (chain.length > 4) shown = [chain[0], null].concat(chain.slice(-2))
    shown.forEach((c, i) => {
      if (i) crumbs.appendChild(h('span.crumb-sep', { text: '/' }))
      if (!c) {
        const hidden = chain.slice(1, -2)
        const more = h('button.crumb', { text: '…' })
        more.addEventListener('click', () => UI.menu(more, hidden.map(x => ({ label: S.pageTitle(x), icon: x.icon || 'page', onClick: () => app.open(x.id) })), { width: 240 }))
        crumbs.appendChild(more)
        return
      }
      crumbs.appendChild(
        h('button.crumb', { onClick: () => app.open(c.id), title: S.pageTitle(c) },
          c.icon ? h('span.crumb-icon', { text: c.icon }) : null,
          h('span.crumb-title', { text: S.pageTitle(c) })
        )
      )
    })
    if (p.locked) crumbs.appendChild(h('button.lock-badge', { title: 'Unlock page', onClick: () => S.updatePage(p.id, { locked: false }) }, U.icon('lock', 12), 'Locked'))
    bar.appendChild(crumbs)
    const right = h('div.top-right')
    right.appendChild(h('span.top-edited', { text: 'Edited ' + U.timeAgo(p.updatedAt) }))
    const share = h('button.top-btn.top-text', { onClick: () => sharePopover(share, p) }, 'Share')
    right.appendChild(share)
    const fav = S.isFavorite(p.id)
    right.appendChild(h('button.top-btn', { class: fav ? 'fav-on' : null, title: fav ? 'Remove from Favorites' : 'Add to Favorites', onClick: () => S.toggleFavorite(p.id) }, U.icon(fav ? 'starFill' : 'star', 18)))
    const more = h('button.top-btn', { title: 'Style, export, and more…' }, U.icon('dots', 18))
    more.addEventListener('click', () => pageOptions(more, p))
    right.appendChild(more)
    bar.appendChild(right)
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
        h('button.btn.btn-sm', { onClick: () => window.print() }, U.icon('page', 14), 'Print / PDF')
      )
    ), { placement: 'bottom-end', width: 400, autofocus: false })
  }

  function fileName(p) {
    return S.pageTitle(p).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'Untitled'
  }

  function pageHTML(p) {
    const md = F.md.fromPage(p)
    const body = md
      .split('\n')
      .map(line => {
        let m
        if ((m = /^(#{1,3}) (.*)$/.exec(line))) return '<h' + m[1].length + '>' + F.md.inlineToHtml(m[2]) + '</h' + m[1].length + '>'
        if ((m = /^\s*- \[( |x)\] (.*)$/.exec(line))) return '<p>' + (m[1] === 'x' ? '☑' : '☐') + ' ' + F.md.inlineToHtml(m[2]) + '</p>'
        if ((m = /^\s*[-*] (.*)$/.exec(line))) return '<li>' + F.md.inlineToHtml(m[1]) + '</li>'
        if ((m = /^\s*\d+\. (.*)$/.exec(line))) return '<li>' + F.md.inlineToHtml(m[1]) + '</li>'
        if ((m = /^> (.*)$/.exec(line))) return '<blockquote>' + F.md.inlineToHtml(m[1]) + '</blockquote>'
        if (line === '---') return '<hr>'
        if (!line.trim()) return ''
        return '<p>' + F.md.inlineToHtml(line) + '</p>'
      })
      .join('\n')
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + U.escapeHTML(S.pageTitle(p)) + '</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 24px;color:#2d2c28}blockquote{border-left:3px solid currentColor;margin:0;padding-left:14px}code{background:#f1f0ec;padding:1px 4px;border-radius:4px}</style></head><body>' + body + '</body></html>'
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

  // ------------------------------------------------------------------ search
  app.search = function() {
    UI.closeAll()
    const input = h('input.search-input', { placeholder: 'Search ' + S.state().workspace.name + '…', autofocus: true })
    const results = h('div.search-results')
    let rows = []
    let active = 0
    let modal
    const mark = (text, q) => {
      const span = h('span')
      if (!q) {
        span.textContent = text
        return span
      }
      const i = text.toLowerCase().indexOf(q.toLowerCase())
      if (i === -1) {
        span.textContent = text
        return span
      }
      span.appendChild(document.createTextNode(text.slice(0, i)))
      span.appendChild(h('mark', { text: text.slice(i, i + q.length) }))
      span.appendChild(document.createTextNode(text.slice(i + q.length)))
      return span
    }
    function render() {
      const q = input.value.trim()
      results.innerHTML = ''
      rows = []
      let list
      if (!q) {
        const st = S.state()
        list = st.recent.filter(id => S.page(id) && !S.isTrashed(id)).slice(0, 10).map(id => ({ page: S.page(id) }))
        if (!list.length) list = S.search('', 10)
        results.appendChild(h('div.search-group', { text: 'Recent' }))
      } else {
        list = S.search(q, 30)
        results.appendChild(h('div.search-group', { text: list.length ? 'Best matches' : '' }))
        if (!list.length) results.appendChild(h('div.search-empty', null, h('div', { text: 'No results for “' + q + '”' }), h('button.btn.btn-sm', { onClick: () => { modal.close(); const p = S.createPage({ title: q }); app.open(p.id) } }, U.icon('plus', 14), 'Create page “' + q + '”')))
      }
      list.forEach(r => {
        const p = r.page
        const crumbs = S.ancestors(p.id).map(a => S.pageTitle(a)).join(' / ')
        const row = h('div.search-row', { onClick: () => choose(p), onMousemove: () => setActive(rows.indexOf(row)) },
          h('span.sr-icon', null, p.icon ? h('span', { text: p.icon }) : U.icon(p.type === 'database' ? 'database' : 'page', 18)),
          h('div.sr-main', null,
            h('div.sr-title', null, mark(S.pageTitle(p), q), crumbs ? h('span.sr-crumbs', { text: ' — ' + crumbs }) : null),
            r.snippet ? h('div.sr-snippet', null, mark(r.snippet, q)) : null
          ),
          h('span.sr-time', { text: U.timeAgo(p.updatedAt) }),
          h('span.sr-enter', null, U.icon('arrowRight', 14))
        )
        row._page = p
        rows.push(row)
        results.appendChild(row)
      })
      setActive(0)
    }
    function setActive(i) {
      active = i
      rows.forEach((r, j) => r.classList.toggle('active', j === i))
      if (rows[i]) rows[i].scrollIntoView({ block: 'nearest' })
    }
    function choose(p) {
      modal.close()
      app.open(p.id)
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
        if (rows[active]) {
          if (U.mod(e) && rows[active]._page.isRow) {
            modal.close()
            app.peek(rows[active]._page.id)
          } else choose(rows[active]._page)
        }
      }
    })
    render()
    modal = UI.modal(
      h('div.search-box', null,
        h('div.search-head', null, U.icon('search', 18), input),
        results,
        h('div.search-foot', null, h('span', null, h('kbd', { text: '↑↓' }), ' Select'), h('span', null, h('kbd', { text: '↵' }), ' Open'), h('span', null, h('kbd', { text: 'esc' }), ' Close'))
      ),
      { className: 'search-modal', width: 640, top: true }
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
        panel.appendChild(row('Open on start', 'Choose what to show when Folio opens.', select(st.settings.startPage, [['last', 'Last visited page'], ['home', 'Home']], v => S.setSetting('startPage', v))))
        panel.appendChild(row('Open database pages in', 'How rows open when you click them.', select(st.settings.peekMode, [['side', 'Side peek'], ['full', 'Full page']], v => S.setSetting('peekMode', v))))
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
      ['General', [
        [m + 'K', 'Search'],
        [m + '\\', 'Toggle sidebar'],
        [m + 'Shift+L', 'Toggle dark mode'],
        [m + 'Alt+N', 'New page'],
        [m + '[ / ' + m + ']', 'Go back / forward'],
        ['?', 'Show shortcuts'],
      ]],
      ['Editing', [
        [m + 'Z / ' + m + 'Shift+Z', 'Undo / redo'],
        [m + 'B / I / U', 'Bold, italic, underline'],
        [m + 'Shift+S', 'Strikethrough'],
        [m + 'E', 'Inline code'],
        [m + 'K', 'Add link (with text selected)'],
        [m + 'D', 'Duplicate block'],
        [m + 'Enter', 'Check to-do / open toggle'],
        [m + 'Shift+↑/↓', 'Move block up / down'],
        [m + 'Alt+0…9', 'Turn into text, headings, lists, code, page'],
        ['Tab / Shift+Tab', 'Indent / outdent'],
        ['Esc', 'Select block'],
        ['/', 'Insert a block'],
        ['@', 'Mention a page or date'],
      ]],
      ['Markdown', [
        ['# ## ###', 'Headings'],
        ['- or *', 'Bulleted list'],
        ['1.', 'Numbered list'],
        ['[]', 'To-do'],
        ['>', 'Toggle'],
        ['"', 'Quote'],
        ['```', 'Code block'],
        ['---', 'Divider'],
        ['**text**  *text*  `text`  ~text~', 'Bold, italic, code, strike'],
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
      } else if (!editing && e.key === '?' && !UI.anyOpen()) {
        e.preventDefault()
        app.shortcuts()
      } else if (e.key === 'Escape' && peekId && !editing && !UI.anyOpen()) {
        const ed = F.editor.active()
        if (!ed || !ed.selected.size) app.closePeek()
      }
    })
    window.addEventListener('resize', U.debounce(renderTopbar, 150))
  }

  document.addEventListener('DOMContentLoaded', app.init)
})(window.Folio)
