/* Folio — workspace state: pages, blocks, trash, favorites, history, persistence. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const KEY = 'folio.workspace.v1'
  const S = (F.store = {})
  let state = null
  const listeners = []

  S.state = () => state

  S.on = function(fn) {
    listeners.push(fn)
    return () => {
      const i = listeners.indexOf(fn)
      if (i >= 0) listeners.splice(i, 1)
    }
  }
  S.emit = function(type, id) {
    listeners.slice().forEach(fn => {
      try {
        fn(type, id)
      } catch (e) {
        console.error(e)
      }
    })
  }

  const DEFAULT_SETTINGS = {
    theme: 'system',
    sidebarWidth: 248,
    sidebarCollapsed: false,
    expanded: {},
    userName: 'You',
    startPage: 'last',
    peekMode: 'side',
    lastPage: null,
    sections: { favorites: true, private: true },
  }

  function normalize() {
    state.version = 1
    state.workspace = Object.assign({ name: 'My Workspace', icon: '' }, state.workspace)
    state.settings = Object.assign({}, DEFAULT_SETTINGS, state.settings)
    state.settings.expanded = state.settings.expanded || {}
    state.settings.sections = Object.assign({ favorites: true, private: true }, state.settings.sections)
    state.pages = state.pages || {}
    state.rootOrder = (state.rootOrder || []).filter(id => state.pages[id])
    state.favorites = (state.favorites || []).filter(id => state.pages[id])
    state.recent = (state.recent || []).filter(id => state.pages[id])
    Object.keys(state.pages).forEach(id => {
      const p = state.pages[id]
      p.blocks = p.blocks || []
      p.props = p.props || {}
      if (p.type === 'database' && !p.db) p.db = S.defaultDb('table')
    })
  }

  S.load = function() {
    let raw = null
    try {
      raw = localStorage.getItem(KEY)
    } catch (e) {
      raw = null
    }
    if (raw) {
      try {
        state = JSON.parse(raw)
      } catch (e) {
        state = null
      }
    }
    if (!state || !state.pages) {
      state = { pages: {}, rootOrder: [], favorites: [], recent: [] }
      normalize()
      F.seed.populate()
    }
    normalize()
    persist()
  }

  S.reset = function() {
    state = { pages: {}, rootOrder: [], favorites: [], recent: [], settings: state && state.settings }
    normalize()
    F.seed.populate()
    persist()
    S.emit('reset')
  }

  S.clearAll = function() {
    const settings = state.settings
    state = { pages: {}, rootOrder: [], favorites: [], recent: [], settings }
    normalize()
    persist()
    S.emit('reset')
  }

  S.importState = function(obj) {
    if (!obj || typeof obj !== 'object' || !obj.pages) throw new Error('Not a workspace file')
    state = obj
    normalize()
    persist()
    S.emit('reset')
  }

  const persist = U.debounce(function() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
      if (S.saveError) {
        S.saveError = null
        S.emit('save-ok')
      }
    } catch (e) {
      S.saveError = e
      S.emit('save-error')
    }
  }, 250)
  S.save = persist
  window.addEventListener('beforeunload', () => persist.flush())

  // Persist and notify listeners.
  S.commit = function(type, id) {
    persist()
    S.emit(type || 'change', id)
  }

  // ---------------- Blocks ----------------
  S.newBlock = function(type, extra) {
    return Object.assign({ id: U.uid(), type: type || 'text', text: '', children: [] }, extra || {})
  }

  S.walkBlocks = function(blocks, fn, parent) {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      if (fn(b, blocks, i, parent) === false) return false
      if (b.children && b.children.length) {
        if (S.walkBlocks(b.children, fn, b) === false) return false
      }
    }
    return true
  }

  S.findBlock = function(blocks, id) {
    let found = null
    S.walkBlocks(blocks, (b, arr, index, parent) => {
      if (b.id === id) {
        found = { block: b, arr, index, parent: parent || null }
        return false
      }
    })
    return found
  }

  S.cloneBlocks = function(blocks, newPageParentId) {
    return blocks.map(b => {
      const c = Object.assign({}, b, { id: U.uid() })
      if ((b.type === 'page' || b.type === 'database') && b.pageId && state.pages[b.pageId]) {
        const dup = S.duplicatePage(b.pageId, { detached: true, parentId: newPageParentId, keepTitle: true })
        c.pageId = dup.id
      }
      c.children = S.cloneBlocks(b.children || [], newPageParentId)
      return c
    })
  }

  // ---------------- Pages ----------------
  S.page = id => (id ? state.pages[id] : null)

  S.pageTitle = function(p) {
    if (!p) return 'Untitled'
    return p.title && p.title.trim() ? p.title : 'Untitled'
  }

  S.defaultDb = function(viewType) {
    const props = [{ id: 'title', name: 'Name', type: 'title' }]
    const db = { properties: props, views: [], rowOrder: [] }
    if (viewType === 'board') {
      props.push({
        id: U.uid(),
        name: 'Status',
        type: 'status',
        options: [
          { id: U.uid(), name: 'Not started', color: 'gray' },
          { id: U.uid(), name: 'In progress', color: 'blue' },
          { id: U.uid(), name: 'Done', color: 'green' },
        ],
      })
    }
    if (viewType === 'calendar') {
      props.push({ id: U.uid(), name: 'Date', type: 'date' })
    }
    props.push({ id: U.uid(), name: 'Tags', type: 'multi_select', options: [] })
    db.views.push(S.newView(viewType || 'table', db))
    db.activeView = db.views[0].id
    return db
  }

  const VIEW_LABELS = {
    table: 'Table',
    board: 'Board',
    gallery: 'Gallery',
    list: 'List',
    calendar: 'Calendar',
  }
  S.VIEW_LABELS = VIEW_LABELS

  S.newView = function(type, db) {
    const group = db.properties.find(p => p.type === 'status' || p.type === 'select')
    const date = db.properties.find(p => p.type === 'date')
    return {
      id: U.uid(),
      name: VIEW_LABELS[type] || 'Table',
      type: type,
      sorts: [],
      filters: [],
      hidden: [],
      widths: {},
      groupBy: group ? group.id : null,
      dateProp: date ? date.id : null,
      search: '',
    }
  }

  S.createPage = function(opts) {
    opts = opts || {}
    const now = Date.now()
    const p = {
      id: U.uid(),
      type: opts.type || 'page',
      title: opts.title || '',
      icon: opts.icon || '',
      cover: opts.cover || null,
      parentId: opts.parentId || null,
      isRow: !!opts.isRow,
      blocks: opts.blocks || [],
      props: opts.props || {},
      createdAt: now,
      updatedAt: now,
      trashed: false,
      fullWidth: !!opts.fullWidth,
      smallText: false,
      font: 'default',
      locked: false,
    }
    if (p.type === 'database') {
      p.db = opts.db || S.defaultDb(opts.view || 'table')
      if (opts.fullWidth == null) p.fullWidth = true
    }
    state.pages[p.id] = p
    if (!opts.detached) {
      if (p.isRow) {
        const db = state.pages[p.parentId].db
        if (opts.rowIndex != null) db.rowOrder.splice(opts.rowIndex, 0, p.id)
        else db.rowOrder.push(p.id)
      } else if (p.parentId) {
        const parent = state.pages[p.parentId]
        const blk = S.newBlock(opts.inline ? 'database' : 'page', { pageId: p.id })
        parent.blocks.push(blk)
        parent.updatedAt = now
      } else if (opts.rootIndex != null) {
        state.rootOrder.splice(opts.rootIndex, 0, p.id)
      } else {
        state.rootOrder.push(p.id)
      }
    }
    S.commit('pages', p.id)
    return p
  }

  S.updatePage = function(id, patch, quiet) {
    const p = state.pages[id]
    if (!p) return
    Object.assign(p, patch)
    p.updatedAt = Date.now()
    if (quiet) persist()
    else S.commit('page', id)
  }

  S.touch = function(id) {
    const p = state.pages[id]
    if (!p) return
    p.updatedAt = Date.now()
    persist()
  }

  // Pages nested under a page, in the order their blocks appear.
  S.childPages = function(id) {
    const p = state.pages[id]
    if (!p || p.type === 'database') return []
    const out = []
    S.walkBlocks(p.blocks, b => {
      if ((b.type === 'page' || b.type === 'database') && b.pageId) {
        const c = state.pages[b.pageId]
        if (c && !c.trashed && out.indexOf(c.id) === -1) out.push(c.id)
      }
    })
    return out
  }

  S.rootPages = function() {
    return state.rootOrder.filter(id => {
      const p = state.pages[id]
      return p && !p.trashed
    })
  }

  S.ancestors = function(id) {
    const out = []
    const seen = {}
    let p = state.pages[id]
    while (p && p.parentId && !seen[p.parentId]) {
      seen[p.parentId] = true
      const parent = state.pages[p.parentId]
      if (!parent) break
      out.unshift(parent)
      p = parent
    }
    return out
  }

  S.isTrashed = function(id) {
    const p = state.pages[id]
    if (!p) return true
    if (p.trashed) return true
    return S.ancestors(id).some(a => a.trashed)
  }

  S.descendants = function(id) {
    return Object.keys(state.pages).filter(
      pid => pid !== id && S.ancestors(pid).some(a => a.id === id)
    )
  }

  function removePageRef(p) {
    if (p.isRow) {
      const parent = state.pages[p.parentId]
      if (parent && parent.db) parent.db.rowOrder = parent.db.rowOrder.filter(r => r !== p.id)
    } else if (p.parentId && state.pages[p.parentId]) {
      const parent = state.pages[p.parentId]
      const strip = blocks => {
        for (let i = blocks.length - 1; i >= 0; i--) {
          const b = blocks[i]
          if ((b.type === 'page' || b.type === 'database') && b.pageId === p.id) blocks.splice(i, 1)
          else if (b.children && b.children.length) strip(b.children)
        }
      }
      strip(parent.blocks)
    } else {
      state.rootOrder = state.rootOrder.filter(r => r !== p.id)
    }
  }

  S.trashPage = function(id) {
    const p = state.pages[id]
    if (!p || p.trashed) return
    removePageRef(p)
    p.trashed = true
    p.trashedAt = Date.now()
    S.commit('pages', id)
  }

  S.restorePage = function(id) {
    const p = state.pages[id]
    if (!p) return
    p.trashed = false
    delete p.trashedAt
    const parent = p.parentId && state.pages[p.parentId]
    if (parent && !S.isTrashed(parent.id)) {
      if (p.isRow && parent.db) {
        if (parent.db.rowOrder.indexOf(p.id) === -1) parent.db.rowOrder.push(p.id)
      } else if (!S.childPages(parent.id).includes(p.id)) {
        parent.blocks.push(S.newBlock('page', { pageId: p.id }))
      }
    } else {
      p.parentId = null
      p.isRow = false
      if (state.rootOrder.indexOf(p.id) === -1) state.rootOrder.push(p.id)
    }
    S.commit('pages', id)
  }

  S.deletePermanently = function(id) {
    const p = state.pages[id]
    if (!p) return
    const ids = [id].concat(S.descendants(id))
    removePageRef(p)
    ids.forEach(pid => {
      delete state.pages[pid]
      delete history[pid]
      if (loadVersions()[pid]) {
        delete versions[pid]
        saveVersions()
      }
    })
    state.favorites = state.favorites.filter(f => state.pages[f])
    state.recent = state.recent.filter(f => state.pages[f])
    S.commit('pages', id)
  }

  S.trashedPages = function() {
    return Object.keys(state.pages)
      .map(id => state.pages[id])
      .filter(p => p.trashed)
      .sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0))
  }

  S.emptyTrash = function() {
    S.trashedPages().forEach(p => {
      if (state.pages[p.id]) S.deletePermanently(p.id)
    })
  }

  // Keep sub-pages in sync with the page blocks that reference them
  // (deleting a page block trashes the page; undo restores it).
  S.reconcileChildren = function(pageId) {
    const p = state.pages[pageId]
    if (!p || p.type === 'database') return
    const referenced = {}
    S.walkBlocks(p.blocks, b => {
      if ((b.type === 'page' || b.type === 'database') && b.pageId) referenced[b.pageId] = true
    })
    let changed = false
    Object.keys(state.pages).forEach(cid => {
      const c = state.pages[cid]
      if (c.parentId !== pageId || c.isRow) return
      if (referenced[cid] && c.trashed) {
        c.trashed = false
        delete c.trashedAt
        changed = true
      } else if (!referenced[cid] && !c.trashed) {
        c.trashed = true
        c.trashedAt = Date.now()
        changed = true
      }
    })
    if (changed) S.commit('pages', pageId)
  }

  S.duplicatePage = function(id, opts) {
    opts = opts || {}
    const src = state.pages[id]
    const copy = JSON.parse(JSON.stringify(src))
    const now = Date.now()
    copy.id = U.uid()
    copy.createdAt = now
    copy.updatedAt = now
    copy.trashed = false
    delete copy.trashedAt
    if (!opts.keepTitle) copy.title = (src.title || 'Untitled') + ' (copy)'
    if (opts.parentId !== undefined) copy.parentId = opts.parentId
    state.pages[copy.id] = copy
    copy.blocks = S.cloneBlocks(src.blocks || [], copy.id)
    if (copy.type === 'database' && src.db) {
      copy.db.rowOrder = src.db.rowOrder
        .filter(rid => state.pages[rid] && !state.pages[rid].trashed)
        .map(rid => S.duplicatePage(rid, { detached: true, parentId: copy.id, keepTitle: true }).id)
    }
    if (!opts.detached) {
      if (copy.isRow) {
        const db = state.pages[copy.parentId].db
        db.rowOrder.splice(db.rowOrder.indexOf(id) + 1, 0, copy.id)
      } else if (copy.parentId && state.pages[copy.parentId]) {
        const parent = state.pages[copy.parentId]
        let placed = false
        S.walkBlocks(parent.blocks, (b, arr, i) => {
          if ((b.type === 'page' || b.type === 'database') && b.pageId === id) {
            arr.splice(i + 1, 0, S.newBlock(b.type, { pageId: copy.id }))
            placed = true
            return false
          }
        })
        if (!placed) parent.blocks.push(S.newBlock('page', { pageId: copy.id }))
      } else {
        const i = state.rootOrder.indexOf(id)
        state.rootOrder.splice(i === -1 ? state.rootOrder.length : i + 1, 0, copy.id)
      }
      S.commit('pages', copy.id)
    }
    return copy
  }

  // Drag-and-drop in the sidebar: position is 'before' | 'after' | 'inside'
  S.movePage = function(id, targetId, position) {
    const p = state.pages[id]
    const target = state.pages[targetId]
    if (!p || !target || id === targetId) return false
    if (S.ancestors(targetId).some(a => a.id === id)) return false
    if (position === 'inside' && target.type === 'database') return false
    const oldParent = p.parentId
    removePageRef(p)
    p.isRow = false
    if (position === 'inside') {
      p.parentId = targetId
      target.blocks.push(S.newBlock('page', { pageId: id }))
      state.settings.expanded[targetId] = true
    } else if (!target.parentId || target.isRow) {
      p.parentId = null
      const i = state.rootOrder.indexOf(targetId)
      state.rootOrder.splice(position === 'after' ? i + 1 : i, 0, id)
    } else {
      p.parentId = target.parentId
      const parent = state.pages[target.parentId]
      let placed = false
      S.walkBlocks(parent.blocks, (b, arr, i) => {
        if ((b.type === 'page' || b.type === 'database') && b.pageId === targetId) {
          arr.splice(position === 'after' ? i + 1 : i, 0, S.newBlock('page', { pageId: id }))
          placed = true
          return false
        }
      })
      if (!placed) parent.blocks.push(S.newBlock('page', { pageId: id }))
    }
    p.updatedAt = Date.now()
    if (oldParent) S.touch(oldParent)
    S.commit('pages', id)
    return true
  }

  // Move a page under another page (or to the top level when parentId is null).
  S.movePageTo = function(id, parentId) {
    const p = state.pages[id]
    if (!p) return false
    if (parentId && (parentId === id || S.ancestors(parentId).some(a => a.id === id))) return false
    removePageRef(p)
    p.isRow = false
    p.parentId = parentId || null
    if (parentId) state.pages[parentId].blocks.push(S.newBlock('page', { pageId: id }))
    else state.rootOrder.push(id)
    S.commit('pages', id)
    return true
  }

  S.toggleFavorite = function(id) {
    const i = state.favorites.indexOf(id)
    if (i === -1) state.favorites.push(id)
    else state.favorites.splice(i, 1)
    S.commit('favorites', id)
  }
  S.isFavorite = id => state.favorites.indexOf(id) !== -1

  S.visit = function(id) {
    state.recent = [id].concat(state.recent.filter(r => r !== id)).slice(0, 24)
    state.settings.lastPage = id
    persist()
  }

  S.setSetting = function(key, value) {
    state.settings[key] = value
    S.commit('settings', key)
  }

  // ---------------- Search ----------------
  function stripTags(html) {
    return String(html || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/​/g, '')
  }
  S.stripTags = stripTags

  S.pageText = function(p) {
    const parts = []
    S.walkBlocks(p.blocks || [], b => {
      if (b.text) parts.push(b.type === 'code' ? b.text : stripTags(b.text))
      if (b.rows) b.rows.forEach(r => parts.push(r.map(stripTags).join(' ')))
    })
    if (p.isRow && p.props) {
      Object.keys(p.props).forEach(k => {
        const v = p.props[k]
        if (typeof v === 'string' || typeof v === 'number') parts.push(String(v))
      })
    }
    return parts.join('\n')
  }

  S.search = function(q, limit) {
    q = (q || '').trim().toLowerCase()
    const out = []
    Object.keys(state.pages).forEach(id => {
      const p = state.pages[id]
      if (S.isTrashed(id)) return
      const title = S.pageTitle(p).toLowerCase()
      let score = 0
      let snippet = ''
      if (!q) score = 1
      else if (title.indexOf(q) === 0) score = 4
      else if (title.indexOf(q) !== -1) score = 3
      else {
        const text = S.pageText(p)
        const i = text.toLowerCase().indexOf(q)
        if (i !== -1) {
          score = 1
          const start = Math.max(0, i - 30)
          snippet = (start ? '…' : '') + text.slice(start, i + q.length + 60).replace(/\n/g, ' ')
        }
      }
      if (score) out.push({ page: p, score, snippet })
    })
    out.sort((a, b) => b.score - a.score || b.page.updatedAt - a.page.updatedAt)
    return out.slice(0, limit || 50)
  }

  // ---------------- Undo / redo (per page snapshots) ----------------
  const history = {}
  function snapshot(p) {
    return JSON.stringify({ blocks: p.blocks, title: p.title })
  }
  S.checkpoint = function(pageId) {
    const p = state.pages[pageId]
    if (!p) return
    const h = history[pageId] || (history[pageId] = { undo: [], redo: [] })
    const snap = snapshot(p)
    if (h.undo[h.undo.length - 1] === snap) return
    h.undo.push(snap)
    if (h.undo.length > 200) h.undo.shift()
    h.redo = []
  }
  function applySnap(p, snap) {
    const s = JSON.parse(snap)
    p.blocks = s.blocks
    p.title = s.title
    p.updatedAt = Date.now()
    S.reconcileChildren(p.id)
    S.commit('page', p.id)
  }
  S.undo = function(pageId) {
    const p = state.pages[pageId]
    const h = history[pageId]
    if (!p || !h || !h.undo.length) return false
    const cur = snapshot(p)
    let snap = h.undo.pop()
    while (snap === cur && h.undo.length) snap = h.undo.pop()
    if (snap === cur) return false
    h.redo.push(cur)
    applySnap(p, snap)
    return true
  }
  S.redo = function(pageId) {
    const p = state.pages[pageId]
    const h = history[pageId]
    if (!p || !h || !h.redo.length) return false
    h.undo.push(snapshot(p))
    applySnap(p, h.redo.pop())
    return true
  }
  S.canUndo = pageId => !!(history[pageId] && history[pageId].undo.length)

  // ---------------- Backlinks ----------------
  S.backlinks = function(id) {
    const needle = 'data-page-id="' + id + '"'
    const out = []
    Object.keys(state.pages).forEach(pid => {
      if (pid === id || S.isTrashed(pid)) return
      const p = state.pages[pid]
      let hit = false
      S.walkBlocks(p.blocks || [], b => {
        if ((b.type === 'pagelink' && b.pageId === id) || (b.text && b.text.indexOf(needle) !== -1) || (b.rows && JSON.stringify(b.rows).indexOf(needle.replace(/"/g, '\\"')) !== -1)) {
          hit = true
          return false
        }
      })
      if (hit) out.push(p)
    })
    return out
  }

  // ---------------- Page history (versions) ----------------
  const VKEY = 'folio.versions.v1'
  const VERSION_GAP = 2 * 60 * 1000
  let versions = null
  function loadVersions() {
    if (!versions) {
      try {
        versions = JSON.parse(localStorage.getItem(VKEY) || '{}') || {}
      } catch (e) {
        versions = {}
      }
    }
    return versions
  }
  const saveVersions = U.debounce(function() {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        localStorage.setItem(VKEY, JSON.stringify(versions))
        return
      } catch (e) {
        // Out of space: drop the oldest version across all pages and retry.
        let oldest = null
        Object.keys(versions).forEach(pid => {
          const v = versions[pid][0]
          if (v && (!oldest || v.at < oldest.v.at)) oldest = { pid, v }
        })
        if (!oldest) return
        versions[oldest.pid].shift()
        if (!versions[oldest.pid].length) delete versions[oldest.pid]
      }
    }
  }, 800)
  window.addEventListener('beforeunload', () => saveVersions.flush())

  // Large inline images are not duplicated into history; restores reuse the live copy.
  function slimBlocks(blocks) {
    return blocks.map(b => {
      const c = Object.assign({}, b)
      if (c.type === 'image' && c.url && c.url.length > 20000) c.url = '@live'
      c.children = slimBlocks(b.children || [])
      return c
    })
  }

  S.recordVersion = function(pageId, force) {
    const p = state && state.pages[pageId]
    if (!p || p.type === 'database' || p.trashed) return
    const v = loadVersions()
    const list = v[pageId] || []
    const snap = { t: p.updatedAt, at: Date.now(), title: p.title, icon: p.icon, blocks: slimBlocks(p.blocks) }
    const key = JSON.stringify([snap.title, snap.icon, snap.blocks])
    const last = list[list.length - 1]
    if (last && JSON.stringify([last.title, last.icon, last.blocks]) === key) return
    if (last && !force && snap.at - last.at < VERSION_GAP) return
    if (!p.blocks.length && !p.title && !list.length) return
    list.push(snap)
    while (list.length > 30) list.shift()
    v[pageId] = list
    saveVersions()
  }

  S.versions = function(pageId) {
    return (loadVersions()[pageId] || []).slice().reverse()
  }

  S.restoreVersion = function(pageId, snap) {
    const p = state.pages[pageId]
    if (!p) return
    S.recordVersion(pageId, true)
    S.checkpoint(pageId)
    const live = {}
    S.walkBlocks(p.blocks, b => {
      if (b.type === 'image') live[b.id] = b.url
    })
    const restore = blocks =>
      blocks.map(b => {
        const c = Object.assign({}, b)
        if (c.url === '@live') c.url = live[c.id] || ''
        c.children = restore(b.children || [])
        return c
      })
    p.title = snap.title
    p.icon = snap.icon
    p.blocks = restore(JSON.parse(JSON.stringify(snap.blocks)))
    p.updatedAt = Date.now()
    S.reconcileChildren(pageId)
    S.commit('page', pageId)
  }

  // ---------------- Database helpers ----------------
  S.dbRows = function(dbId) {
    const db = state.pages[dbId] && state.pages[dbId].db
    if (!db) return []
    return db.rowOrder.map(id => state.pages[id]).filter(p => p && !p.trashed)
  }

  S.addRow = function(dbId, props, index, title) {
    return S.createPage({
      parentId: dbId,
      isRow: true,
      props: props || {},
      title: title || '',
      rowIndex: index,
    })
  }

  S.wordCount = function(p) {
    const t = S.pageText(p).trim()
    return t ? t.split(/\s+/).length : 0
  }
})(window.Folio)
