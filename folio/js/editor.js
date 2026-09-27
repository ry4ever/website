/* Folio — the block editor: rendering, keyboard, slash menu, formatting, drag and drop. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const h = U.h
  const S = F.store
  const UI = F.ui

  const TEXT_TYPES = { text: 1, h1: 1, h2: 1, h3: 1, todo: 1, bullet: 1, numbered: 1, toggle: 1, quote: 1, callout: 1 }
  const LIST_TYPES = { todo: 1, bullet: 1, numbered: 1, toggle: 1 }
  const NESTABLE = { text: 1, todo: 1, bullet: 1, numbered: 1, toggle: 1, quote: 1, callout: 1 }

  const INFO = {
    text: { label: 'Text', desc: 'Plain paragraph text', glyph: 'Aa', ph: "Type '/' for commands", md: '' },
    h1: { label: 'Heading 1', desc: 'Large section heading', glyph: 'H1', ph: 'Heading 1', md: '#' },
    h2: { label: 'Heading 2', desc: 'Medium section heading', glyph: 'H2', ph: 'Heading 2', md: '##' },
    h3: { label: 'Heading 3', desc: 'Small section heading', glyph: 'H3', ph: 'Heading 3', md: '###' },
    todo: { label: 'To-do list', desc: 'Checkboxes for tasks', glyph: '☑', ph: 'To-do', md: '[]' },
    bullet: { label: 'Bulleted list', desc: 'A simple bulleted list', glyph: '•', ph: 'List', md: '-' },
    numbered: { label: 'Numbered list', desc: 'A list that counts itself', glyph: '1.', ph: 'List', md: '1.' },
    toggle: { label: 'Toggle list', desc: 'Hide details inside a toggle', glyph: '▸', ph: 'Toggle', md: '>' },
    quote: { label: 'Quote', desc: 'Set off a quotation', glyph: '❝', ph: 'Empty quote', md: '"' },
    callout: { label: 'Callout', desc: 'Highlight a note with an icon', glyph: '💡', ph: 'Type something…', md: '' },
    divider: { label: 'Divider', desc: 'A line between sections', glyph: '—', md: '---' },
    code: { label: 'Code', desc: 'A snippet with highlighting', glyph: '</>', md: '```' },
    page: { label: 'Page', desc: 'A new page inside this one', icon: 'page' },
    pagelink: { label: 'Link to page', desc: 'Link to an existing page', icon: 'link' },
    image: { label: 'Image', desc: 'Upload or embed with a link', icon: 'image' },
    toc: { label: 'Table of contents', desc: 'An outline of this page', icon: 'toc' },
    database: { label: 'Database', desc: 'Inline database', icon: 'table' },
  }
  const TURN_INTO = ['text', 'h1', 'h2', 'h3', 'page', 'todo', 'bullet', 'numbered', 'toggle', 'code', 'quote', 'callout']

  function hasText(b) {
    return S.stripTags(b.text || '').replace(/ /g, ' ').trim().length > 0 || /data-(page-id|date)/.test(b.text || '')
  }
  function cleanHTML(html) {
    html = (html || '').replace(/​/g, '')
    if (html === '<br>') return ''
    return html
  }
  function isEditable(t) {
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
  }
  function unwrap(node) {
    const p = node.parentNode
    while (node.firstChild) p.insertBefore(node.firstChild, node)
    p.removeChild(node)
  }
  function toAlpha(n) {
    let s = ''
    while (n > 0) {
      n--
      s = String.fromCharCode(97 + (n % 26)) + s
      n = Math.floor(n / 26)
    }
    return s
  }
  function toRoman(n) {
    const map = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
    let s = ''
    map.forEach(m => {
      while (n >= m[0]) {
        s += m[1]
        n -= m[0]
      }
    })
    return s
  }

  const instances = new Set()
  let activeEditor = null

  class Editor {
    constructor(root, pageId, opts) {
      this.root = root
      this.pageId = pageId
      this.opts = opts || {}
      this.selected = new Set()
      this.mounts = []
      this.lastInput = 0
      this.muted = false
      this.slash = null
      this.mention = null
      root.classList.add('editor')
      root._editor = this
      instances.add(this)
      this.bind()
      this.render()
      this.unsub = S.on((type, id) => this.onStore(type, id))
    }

    get page() {
      return S.page(this.pageId)
    }
    get locked() {
      const p = this.page
      return !!(p && (p.locked || p.trashed))
    }

    destroy() {
      this.closeMenus()
      this.unsub()
      this.mounts.forEach(m => m.destroy && m.destroy())
      this.mounts = []
      instances.delete(this)
      if (activeEditor === this) activeEditor = null
      this.root.innerHTML = ''
      this.root._editor = null
    }

    // ------------------------------------------------------------------ store
    onStore(type, id) {
      if (this.muted || !this.page) return
      if ((type === 'page' || type === 'reset') && id === this.pageId) {
        this.renderKeepCaret()
      } else if (type === 'row' && id === this.pageId) {
        if (this.titleEl && document.activeElement !== this.titleEl) this.titleEl.textContent = this.page.title || ''
      } else if (type === 'pages' || type === 'page' || type === 'title' || type === 'icon') {
        this.refreshLinks()
      }
    }

    changed(structure) {
      const p = this.page
      if (!p) return
      p.updatedAt = Date.now()
      this.muted = true
      try {
        S.commit('page', p.id)
        if (structure) S.reconcileChildren(p.id)
      } finally {
        this.muted = false
      }
    }

    checkpoint() {
      S.checkpoint(this.pageId)
      this.lastInput = 0
    }

    // ------------------------------------------------------------------ render
    render() {
      const p = this.page
      this.mounts.forEach(m => m.destroy && m.destroy())
      this.mounts = []
      this.root.innerHTML = ''
      if (!p) {
        this.root.appendChild(h('div.page-missing', null, h('div.big-emoji', { text: '🫥' }), h('div', { text: 'This page doesn’t exist or was permanently deleted.' })))
        return
      }
      const locked = this.locked
      if (p.cover) this.root.appendChild(this.renderCover(p))
      const content = h('div.page-content', {
        class: [p.fullWidth ? 'full-width' : '', p.smallText ? 'small-text' : '', 'font-' + (p.font || 'default'), p.cover ? 'has-cover' : '', p.icon ? 'has-icon' : '', locked ? 'locked' : '', this.opts.peek ? 'in-peek' : ''].join(' '),
      })
      content.appendChild(this.renderHeader(p))
      const body = h('div.page-body')
      content.appendChild(body)
      this.root.appendChild(content)
      this.bodyEl = body
      if (p.type === 'database') {
        const host = h('div.db-full')
        body.appendChild(host)
        this.mounts.push(F.database.mount(host, p.id, { inline: false }))
        return
      }
      this.blocksEl = h('div.blocks')
      body.appendChild(this.blocksEl)
      this.renderBlocks()
      if (!locked) {
        body.appendChild(
          h('div.page-tail', {
            onMousedown: e => {
              e.preventDefault()
              this.clickTail()
            },
          })
        )
      }
    }

    renderKeepCaret() {
      const active = document.activeElement
      let caret = null
      if (active && this.root.contains(active)) {
        if (active.classList.contains('page-title')) caret = { title: true, offset: U.getCaretOffset(active) }
        else {
          const blk = active.closest('.block')
          if (blk) caret = { id: blk.dataset.id, offset: U.getCaretOffset(active) }
        }
      }
      const scroller = this.root.closest('.scroller, .peek-scroll')
      const top = scroller ? scroller.scrollTop : 0
      this.render()
      if (scroller) scroller.scrollTop = top
      if (caret) {
        if (caret.title) U.setCaret(this.titleEl, caret.offset)
        else if (this.blockEl(caret.id)) this.focus(caret.id, caret.offset)
      }
    }

    renderCover(p) {
      const cover = h('div.page-cover')
      const img = h('div.cover-img')
      img.style.backgroundImage = p.cover.type === 'image' ? UI.coverCSS(p.cover) : ''
      if (p.cover.type !== 'image') img.style.background = UI.coverCSS(p.cover)
      img.style.backgroundPosition = 'center ' + (p.cover.pos == null ? 50 : p.cover.pos) + '%'
      cover.appendChild(img)
      if (!this.locked) {
        const controls = h('div.cover-controls')
        const change = h('button.cover-btn', { text: 'Change cover' })
        change.addEventListener('click', () =>
          UI.coverPicker(change, {
            onSelect: c => S.updatePage(p.id, { cover: c }),
            onRemove: () => S.updatePage(p.id, { cover: null }),
          })
        )
        controls.appendChild(change)
        if (p.cover.type === 'image') {
          controls.appendChild(h('button.cover-btn', { text: 'Reposition', onClick: () => this.repositionCover(cover, img) }))
        }
        cover.appendChild(controls)
      }
      return cover
    }

    repositionCover(cover, img) {
      const p = this.page
      cover.classList.add('repositioning')
      let pos = p.cover.pos == null ? 50 : p.cover.pos
      const startPos = pos
      const hint = h('div.cover-hint', { text: 'Drag image to reposition' })
      const controls = cover.querySelector('.cover-controls')
      controls.style.display = 'none'
      const bar = h(
        'div.cover-controls.visible',
        null,
        h('button.cover-btn', {
          text: 'Save position',
          onClick: () => {
            finish()
            S.updatePage(p.id, { cover: Object.assign({}, p.cover, { pos: Math.round(pos) }) })
          },
        }),
        h('button.cover-btn', {
          text: 'Cancel',
          onClick: () => {
            img.style.backgroundPosition = 'center ' + startPos + '%'
            finish()
          },
        })
      )
      cover.appendChild(hint)
      cover.appendChild(bar)
      function finish() {
        cover.classList.remove('repositioning')
        hint.remove()
        bar.remove()
        controls.style.display = ''
        img.onmousedown = null
      }
      img.onmousedown = e => {
        e.preventDefault()
        const y0 = e.clientY
        const p0 = pos
        const move = ev => {
          pos = U.clamp(p0 - ((ev.clientY - y0) / cover.offsetHeight) * 100, 0, 100)
          img.style.backgroundPosition = 'center ' + pos + '%'
        }
        const up = () => {
          document.removeEventListener('mousemove', move)
          document.removeEventListener('mouseup', up)
        }
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', up)
      }
    }

    renderHeader(p) {
      const locked = this.locked
      const header = h('div.page-header')
      if (p.icon) {
        const icon = h('div.page-icon', { text: p.icon, title: locked ? '' : 'Change icon', role: 'button' })
        if (!locked)
          icon.addEventListener('click', () =>
            UI.emojiPicker(icon, {
              onSelect: e => S.updatePage(p.id, { icon: e }),
              onRemove: () => S.updatePage(p.id, { icon: '' }),
            })
          )
        header.appendChild(icon)
      }
      if (!locked) {
        const controls = h('div.page-controls')
        if (!p.icon)
          controls.appendChild(
            h('button.ctrl-btn', { onClick: () => S.updatePage(p.id, { icon: F.emoji.random() }) }, U.icon('smile', 14), 'Add icon')
          )
        if (!p.cover)
          controls.appendChild(
            h('button.ctrl-btn', { onClick: () => S.updatePage(p.id, { cover: UI.randomCover() }) }, U.icon('image', 14), 'Add cover')
          )
        header.appendChild(controls)
      }
      const title = h('h1.page-title', {
        contenteditable: locked ? 'false' : 'true',
        spellcheck: 'true',
        'data-placeholder': p.isRow ? 'Untitled' : 'New page',
      })
      title.textContent = p.title || ''
      this.titleEl = title
      header.appendChild(title)
      if (p.isRow) {
        const props = h('div.row-props')
        header.appendChild(props)
        this.mounts.push(F.database.rowProps(props, p))
      }
      if (p.type !== 'database' && !p.blocks.length && !locked) header.appendChild(this.renderEmptyState(p))
      return header
    }

    renderEmptyState(p) {
      const opts = [
        { icon: 'page', label: 'Empty page', run: () => this.startWriting() },
        {
          icon: 'smile',
          label: 'Empty with icon',
          run: () => {
            S.updatePage(p.id, { icon: F.emoji.random() })
            this.startWriting()
          },
        },
        { icon: 'template', label: 'Templates', run: () => F.app.openTemplates(p.id) },
        { icon: 'import', label: 'Import Markdown', run: () => F.app.importMarkdown(p.id) },
      ]
      const dbs = ['table', 'board', 'list', 'calendar', 'gallery'].map(v => ({
        icon: v === 'table' ? 'table' : v,
        label: S.VIEW_LABELS[v],
        run: () => {
          this.checkpoint()
          p.type = 'database'
          p.db = S.defaultDb(v)
          p.fullWidth = true
          S.commit('page', p.id)
        },
      }))
      const row = o => h('button.empty-opt', { onClick: o.run }, U.icon(o.icon, 16), h('span', { text: o.label }))
      return h(
        'div.empty-state',
        null,
        h('div.empty-hint', { text: 'Press Enter to start writing, or pick a starting point' }),
        h('div.empty-list', null, opts.map(row)),
        h('div.empty-section', { text: 'Database' }),
        h('div.empty-list', null, dbs.map(row))
      )
    }

    startWriting() {
      const p = this.page
      if (!p.blocks.length) {
        p.blocks.push(S.newBlock('text'))
        this.changed()
        this.render()
      }
      this.focus(p.blocks[0].id, 'start')
    }

    renderBlocks() {
      if (!this.blocksEl) return
      this.mounts.forEach(m => m.inline && m.destroy())
      this.mounts = this.mounts.filter(m => !m.inline)
      this.blocksEl.innerHTML = ''
      this.blocksEl.appendChild(this.renderList(this.page.blocks, 0))
      this.updateSelectionClasses()
      const empty = this.root.querySelector('.empty-state')
      if (empty && this.page.blocks.length) empty.remove()
    }

    renderList(blocks, depth) {
      const frag = document.createDocumentFragment()
      let n = 0
      blocks.forEach(b => {
        n = b.type === 'numbered' ? n + 1 : 0
        frag.appendChild(this.renderBlock(b, depth, n))
      })
      return frag
    }

    renderBlock(b, depth, num) {
      const locked = this.locked
      const el = h('div.block', {
        class: 'bt-' + b.type + (b.color ? ' ' + b.color : '') + (b.type === 'todo' && b.checked ? ' checked' : '') + (b.type === 'toggle' && b.open ? ' open' : ''),
        dataset: { id: b.id },
      })
      const row = h('div.block-row')
      if (!locked) row.appendChild(this.renderHandle(b))
      const content = h('div.block-content')
      row.appendChild(content)
      el.appendChild(row)
      const editable = locked ? 'false' : 'true'
      const text = (tag, extraClass) => {
        const t = h(tag || 'div', {
          class: 'block-text' + (extraClass ? ' ' + extraClass : '') + (b.type === 'text' ? ' ph-focus' : ''),
          contenteditable: editable,
          spellcheck: 'true',
          'data-placeholder': (INFO[b.type] && INFO[b.type].ph) || '',
        })
        t.innerHTML = U.sanitize(b.text)
        this.hydrate(t)
        return t
      }
      let childHost = el
      switch (b.type) {
        case 'todo':
          content.appendChild(h('div.todo-check', { contenteditable: 'false', role: 'checkbox', 'aria-checked': b.checked ? 'true' : 'false' }, U.icon('check', 12)))
          content.appendChild(text())
          break
        case 'bullet':
          content.appendChild(h('div.list-marker.bullet-marker', { contenteditable: 'false', text: ['•', '◦', '▪'][depth % 3] }))
          content.appendChild(text())
          break
        case 'numbered': {
          const d = depth % 3
          const label = d === 0 ? num + '.' : d === 1 ? toAlpha(num) + '.' : toRoman(num) + '.'
          content.appendChild(h('div.list-marker.num-marker', { contenteditable: 'false', text: label }))
          content.appendChild(text())
          break
        }
        case 'toggle':
          content.appendChild(h('div.toggle-arrow', { contenteditable: 'false', role: 'button', title: b.open ? 'Collapse' : 'Expand' }, U.icon('chevronRight', 14)))
          content.appendChild(text())
          break
        case 'quote':
          content.appendChild(text())
          break
        case 'callout': {
          const main = h('div.callout-main')
          const icon = h('div.callout-icon', { contenteditable: 'false', role: 'button', text: b.icon || '💡' })
          main.appendChild(text())
          content.appendChild(h('div.callout', null, icon, main))
          childHost = main
          break
        }
        case 'divider':
          content.appendChild(h('div.divider', { contenteditable: 'false' }, h('hr')))
          break
        case 'code':
          content.appendChild(this.renderCode(b))
          break
        case 'page':
        case 'pagelink':
          content.appendChild(this.renderPageLink(b))
          break
        case 'image':
          content.appendChild(this.renderImage(b, text))
          break
        case 'toc':
          content.appendChild(this.renderToc())
          break
        case 'database': {
          const host = h('div.inline-db', { contenteditable: 'false' })
          content.appendChild(host)
          const m = F.database.mount(host, b.pageId, { inline: true })
          m.inline = true
          this.mounts.push(m)
          break
        }
        default:
          content.appendChild(text())
      }
      if (b.children && b.children.length && (b.type !== 'toggle' || b.open)) {
        const kids = h('div.block-children')
        kids.appendChild(this.renderList(b.children, depth + 1))
        childHost.appendChild(kids)
      } else if (b.type === 'toggle' && b.open && !locked) {
        childHost.appendChild(
          h('div.block-children', null, h('div.toggle-empty', { text: 'Empty toggle. Click to add a block inside.', dataset: { toggle: b.id } }))
        )
      }
      return el
    }

    renderHandle(b) {
      const plus = h('button.bh-btn.bh-add', {
        title: 'Click to add a block below\nAlt-click to add a block above',
        tabindex: '-1',
        onMousedown: e => e.preventDefault(),
        onClick: e => this.plusClick(b.id, e.altKey),
      }, U.icon('plus', 16))
      const grip = h('button.bh-btn.bh-drag', {
        title: 'Drag to move\nClick to open menu',
        draggable: 'true',
        tabindex: '-1',
        onMousedown: e => e.stopPropagation(),
        onClick: e => {
          if (!this.selected.has(b.id)) this.selectBlocks([b.id])
          this.blockMenu(b.id, e.currentTarget)
        },
        onDragstart: e => this.dragStart(e, b.id),
        onDragend: () => this.dragEnd(),
      }, U.icon('grip', 16))
      return h('div.block-handle', { contenteditable: 'false' }, plus, grip)
    }

    renderPageLink(b) {
      const p = S.page(b.pageId)
      const a = h('a.page-link', { href: '#/p/' + b.pageId, dataset: { pageId: b.pageId || '' }, contenteditable: 'false', draggable: 'false' })
      this.fillPageLink(a, p, b.type === 'pagelink')
      return a
    }

    fillPageLink(a, p, isLink) {
      a.innerHTML = ''
      const missing = !p || p.trashed
      a.classList.toggle('missing', missing)
      a.appendChild(
        p && p.icon
          ? h('span.pl-icon.emoji', { text: p.icon })
          : h('span.pl-icon', null, U.icon(p && p.type === 'database' ? 'database' : 'page', 18))
      )
      if (isLink) a.appendChild(h('span.pl-arrow', null, U.icon('arrowUp', 10)))
      a.appendChild(h('span.pl-title', { text: missing ? (p ? S.pageTitle(p) + ' (in Trash)' : 'Deleted page') : S.pageTitle(p) }))
    }

    refreshLinks() {
      U.$$('.page-link', this.root).forEach(a => {
        const blk = a.closest('.block')
        const b = blk && this.find(blk.dataset.id)
        this.fillPageLink(a, S.page(a.dataset.pageId), b && b.block.type === 'pagelink')
      })
      U.$$('.block-text', this.root).forEach(t => this.hydrate(t))
      const toc = U.$$('.toc', this.root)
      toc.forEach(t => t.replaceWith(this.renderToc()))
    }

    hydrate(el) {
      el.querySelectorAll('a[data-page-id]').forEach(a => {
        const p = S.page(a.getAttribute('data-page-id'))
        const label = p ? (p.icon ? p.icon + ' ' : '') + S.pageTitle(p) : 'Deleted page'
        if (a.textContent !== label) a.textContent = label
        a.classList.add('mention', 'mention-page')
        a.classList.toggle('missing', !p || S.isTrashed(p.id))
      })
      el.querySelectorAll('span[data-date]').forEach(s => {
        const label = '@' + U.formatDate(s.getAttribute('data-date'))
        if (s.textContent !== label) s.textContent = label
        s.classList.add('mention', 'mention-date')
      })
    }

    renderCode(b) {
      const locked = this.locked
      const pre = h('pre.block-text.code-text', { contenteditable: locked ? 'false' : 'true', spellcheck: 'false', 'data-placeholder': '' })
      this.paintCode(pre, b)
      const select = h('select.code-lang', { disabled: locked ? true : null, title: 'Language' },
        F.LANGUAGES.map(l => h('option', { value: l[0], text: l[1], selected: (b.language || 'plain') === l[0] ? true : null }))
      )
      select.addEventListener('change', () => {
        this.checkpoint()
        b.language = select.value
        this.paintCode(pre, b)
        this.changed()
      })
      const copy = h('button.code-copy', {
        onClick: () => {
          U.copyText(b.text)
          UI.toast('Copied code to clipboard')
        },
      }, U.icon('copy', 14), 'Copy')
      return h('div.code-wrap', null, h('div.code-bar', { contenteditable: 'false' }, select, h('div.spacer'), copy), pre)
    }

    paintCode(pre, b, keepCaret) {
      const off = keepCaret ? U.getCaretOffset(pre) : -1
      const text = b.text || ''
      pre.innerHTML = F.highlight(text, b.language) + (text === '' || text.slice(-1) === '\n' ? '<br>' : '')
      if (keepCaret && off >= 0) U.setCaret(pre, off)
    }

    renderImage(b, text) {
      const wrap = h('div.image-block')
      if (!b.url) {
        const empty = h('div.image-empty', { role: 'button' }, U.icon('image', 20), h('span', { text: 'Add an image' }))
        if (!this.locked) empty.addEventListener('click', () => this.imagePicker(b, empty))
        wrap.appendChild(empty)
        return wrap
      }
      const frame = h('div.image-frame', { style: { width: (b.width || 100) + '%' } })
      const img = h('img', { src: b.url, alt: S.stripTags(b.text) || 'Image', draggable: 'false', loading: 'lazy' })
      img.addEventListener('error', () => frame.classList.add('broken'))
      frame.appendChild(img)
      if (!this.locked) {
        ;['left', 'right'].forEach(side => {
          const handle = h('div.img-resize.' + side)
          handle.addEventListener('mousedown', e => this.resizeImage(e, b, frame, side))
          frame.appendChild(handle)
        })
        frame.appendChild(
          h('div.img-tools', null,
            h('button.img-tool', { title: 'Replace image', onClick: () => this.imagePicker(b, frame) }, U.icon('refresh', 14)),
            h('button.img-tool', { title: 'Open original', onClick: () => window.open(b.url, '_blank', 'noopener') }, U.icon('open', 14))
          )
        )
      }
      wrap.appendChild(frame)
      const cap = text('div', 'image-caption')
      cap.setAttribute('data-placeholder', 'Write a caption…')
      wrap.appendChild(cap)
      return wrap
    }

    resizeImage(e, b, frame, side) {
      e.preventDefault()
      e.stopPropagation()
      const x0 = e.clientX
      const w0 = frame.offsetWidth
      const total = frame.parentElement.offsetWidth
      let pct = b.width || 100
      const move = ev => {
        const dx = (ev.clientX - x0) * (side === 'left' ? -1 : 1) * 2
        pct = U.clamp(((w0 + dx) / total) * 100, 15, 100)
        frame.style.width = pct + '%'
      }
      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        this.checkpoint()
        b.width = Math.round(pct)
        this.changed()
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    }

    imagePicker(b, anchor) {
      let tab = 'upload'
      const body = h('div.cover-body')
      const tabs = h('div.cover-tabs')
      let pop
      const done = url => {
        pop.close()
        this.checkpoint()
        b.url = url
        this.changed()
        this.renderBlocks()
      }
      const renderTabs = () => {
        tabs.innerHTML = ''
        ;[['upload', 'Upload'], ['link', 'Embed link']].forEach(t =>
          tabs.appendChild(h('button.cover-tab', { class: tab === t[0] ? 'active' : null, text: t[1], onClick: () => { tab = t[0]; renderTabs(); renderBody() } }))
        )
      }
      const renderBody = () => {
        body.innerHTML = ''
        if (tab === 'upload') {
          const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } })
          file.addEventListener('change', () => {
            if (file.files[0]) U.compressImage(file.files[0]).then(done)
          })
          body.appendChild(h('div.upload-zone', null, file, h('button.btn.btn-block', { onClick: () => file.click() }, 'Choose an image'), h('div.muted.small', { text: 'Large images are resized so they fit in your browser storage.' })))
        } else {
          const input = h('input.pop-input', { placeholder: 'Paste the image link…', autofocus: true })
          const submit = () => {
            const url = U.safeUrl(input.value)
            if (url) done(url)
            else UI.toast('Please enter a valid image link')
          }
          input.addEventListener('keydown', e => {
            e.stopPropagation()
            if (e.key === 'Enter') submit()
          })
          body.appendChild(h('div.link-zone', null, input, h('button.btn.btn-primary.btn-block', { onClick: submit }, 'Embed image')))
          setTimeout(() => input.focus(), 0)
        }
      }
      renderTabs()
      renderBody()
      pop = UI.popover(anchor, h('div.cover-picker', null, tabs, body), { width: 420, placement: 'bottom-center' })
    }

    renderToc() {
      const heads = []
      S.walkBlocks(this.page.blocks, b => {
        if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') heads.push(b)
      })
      const box = h('div.toc', { contenteditable: 'false' })
      if (!heads.length) box.appendChild(h('div.toc-empty', { text: 'Add headings to build a table of contents.' }))
      heads.forEach(b => {
        box.appendChild(
          h('a.toc-item.toc-' + b.type, {
            href: '#',
            text: S.stripTags(b.text) || 'Untitled',
            onClick: e => {
              e.preventDefault()
              this.scrollToBlock(b.id)
            },
          })
        )
      })
      return box
    }

    scrollToBlock(id) {
      const el = this.blockEl(id)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 1600)
    }

    // ------------------------------------------------------------------ helpers
    find(id) {
      return S.findBlock(this.page.blocks, id)
    }
    blockEl(id) {
      return this.root.querySelector('.block[data-id="' + id + '"]')
    }
    textEl(id) {
      const el = this.blockEl(id)
      if (!el) return null
      const t = el.querySelector('.block-text')
      return t && t.closest('.block') === el ? t : null
    }
    blockOfEl(el) {
      const blk = el && el.closest('.block')
      if (!blk || !this.root.contains(blk)) return null
      const c = this.find(blk.dataset.id)
      return c ? c.block : null
    }
    flat() {
      const out = []
      const walk = blocks =>
        blocks.forEach(b => {
          out.push(b)
          if (b.children && b.children.length && (b.type !== 'toggle' || b.open)) walk(b.children)
        })
      walk(this.page.blocks)
      return out
    }
    focus(id, pos) {
      const el = this.textEl(id)
      if (!el) {
        if (this.blockEl(id)) this.selectBlocks([id])
        return
      }
      this.clearSelection()
      if (pos === 'start') U.setCaret(el, 0)
      else if (pos === 'end' || pos == null) U.setCaret(el, el.textContent.length)
      else if (typeof pos === 'number') U.setCaret(el, pos)
      else if (pos.x != null) U.caretFromPoint(el, pos.x, pos.atEnd)
      U.scrollIntoViewIfNeeded(el, this.root.closest('.scroller, .peek-scroll'))
    }
    syncText(el) {
      const b = this.blockOfEl(el)
      if (!b) return
      if (b.type === 'code') b.text = el.textContent
      else b.text = cleanHTML(el.innerHTML)
      this.page.updatedAt = Date.now()
      S.save()
    }

    // Insert nb after b, or replace b if it's an empty text block.
    place(b, nb) {
      const c = this.find(b.id)
      if (b.type === 'text' && !hasText(b) && !(b.children && b.children.length)) c.arr.splice(c.index, 1, nb)
      else c.arr.splice(c.index + 1, 0, nb)
      return nb
    }

    // ------------------------------------------------------------------ events
    bind() {
      const r = this.root
      r.addEventListener('input', e => this.onInput(e))
      r.addEventListener('keydown', e => this.onKeyDown(e))
      r.addEventListener('paste', e => this.onPaste(e))
      r.addEventListener('copy', e => this.onCopy(e))
      r.addEventListener('click', e => this.onClick(e))
      r.addEventListener('focusin', e => {
        activeEditor = this
        if (e.target.classList && (e.target.classList.contains('block-text') || e.target.classList.contains('page-title'))) {
          this.clearSelection()
          const b = this.blockOfEl(e.target)
          this.focusedId = b ? b.id : null
        }
      })
      r.addEventListener('focusout', e => {
        if (e.target.classList && e.target.classList.contains('block-text')) {
          if (this.slash && !this.slash.keep) this.closeSlash()
          if (this.mention) this.closeMention()
        }
      })
      r.addEventListener('compositionstart', () => (this.composing = true))
      r.addEventListener('compositionend', e => {
        this.composing = false
        const t = e.target.closest && e.target.closest('.code-text')
        if (t) {
          const b = this.blockOfEl(t)
          if (b) {
            b.text = t.textContent
            this.paintCode(t, b, true)
          }
        }
      })
      r.addEventListener('mousedown', e => this.onMouseDown(e))
      r.addEventListener('dragover', e => this.onDragOver(e))
      r.addEventListener('dragleave', e => {
        if (!r.contains(e.relatedTarget)) this.hideDrop()
      })
      r.addEventListener('drop', e => this.onDrop(e))
    }

    onInput(e) {
      const t = e.target
      if (t === this.titleEl) {
        if (t.innerHTML === '<br>') t.innerHTML = ''
        const now = Date.now()
        if (now - this.lastInput > 1000) S.checkpoint(this.pageId)
        this.lastInput = now
        this.page.title = t.textContent
        this.page.updatedAt = now
        this.muted = true
        S.commit('title', this.pageId)
        this.muted = false
        return
      }
      const el = t.closest && t.closest('.block-text')
      if (!el) return
      const b = this.blockOfEl(el)
      if (!b) return
      const now = Date.now()
      if (now - this.lastInput > 1000) S.checkpoint(this.pageId)
      this.lastInput = now
      if (b.type === 'code') {
        b.text = el.textContent
        if (!this.composing && !e.isComposing) this.paintCode(el, b, true)
        this.page.updatedAt = now
        S.save()
        return
      }
      if (el.innerHTML === '<br>' || (!el.textContent && !el.querySelector('[data-page-id],[data-date],img'))) el.innerHTML = ''
      b.text = cleanHTML(el.innerHTML)
      this.page.updatedAt = now
      S.save()
      if (this.composing || e.isComposing) return
      if (e.inputType === 'insertText' && e.data) {
        if (this.markdownShortcut(el, b, e.data)) return
        if (e.data === '/' && !this.slash) this.maybeOpenSlash(el, b)
        else if (e.data === '@' && !this.mention) this.maybeOpenMention(el, b)
      }
      if (this.slash) this.updateSlash()
      if (this.mention) this.updateMention()
      if (/^h[123]$/.test(b.type)) U.$$('.toc', this.root).forEach(x => x.replaceWith(this.renderToc()))
    }

    // Markdown-style shortcuts typed at the start of a block.
    markdownShortcut(el, b, ch) {
      const off = U.getCaretOffset(el)
      const before = el.textContent.slice(0, off)
      if (ch === ' ' && b.type !== 'code') {
        const prefix = before.slice(0, -1).replace(/ /g, ' ')
        const map = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'bullet', '*': 'bullet', '+': 'bullet', '[]': 'todo', '[ ]': 'todo', '[x]': 'todo', '>': 'toggle', '"': 'quote', '“': 'quote', '1.': 'numbered', 'a.': 'numbered', 'i.': 'numbered' }
        const type = map[prefix]
        if (type && (b.type === 'text' || (LIST_TYPES[b.type] && type !== b.type && off === prefix.length + 1))) {
          if (b.type !== 'text' && !/^h/.test(type) && !LIST_TYPES[type]) return false
          U.rangeFromOffsets(el, 0, off).deleteContents()
          b.text = cleanHTML(el.innerHTML)
          this.checkpoint()
          b.type = type
          if (type === 'todo') b.checked = prefix === '[x]'
          if (type === 'toggle') b.open = true
          this.changed()
          this.renderBlocks()
          this.focus(b.id, 'start')
          return true
        }
      }
      if (b.type === 'text' && before === '---' && el.textContent === '---') {
        this.checkpoint()
        const c = this.find(b.id)
        const next = S.newBlock('text')
        b.type = 'divider'
        b.text = ''
        c.arr.splice(c.index + 1, 0, next)
        this.changed()
        this.renderBlocks()
        this.focus(next.id, 'start')
        return true
      }
      if (b.type === 'text' && before === '```') {
        this.checkpoint()
        b.type = 'code'
        b.text = el.textContent.slice(3)
        b.language = 'plain'
        this.changed()
        this.renderBlocks()
        this.focus(b.id, 'start')
        return true
      }
      // Inline: **bold**, *italic*, `code`, ~strike~
      if (ch === '*' || ch === '`' || ch === '~' || ch === '_') {
        const rules = [
          [/\*\*([^*]+)\*\*$/, 'b'],
          [/__([^_]+)__$/, 'b'],
          [/(?:^|[^*])\*([^*\s][^*]*)\*$/, 'i'],
          [/(?:^|[^_\w])_([^_\s][^_]*)_$/, 'i'],
          [/`([^`]+)`$/, 'code'],
          [/~~?([^~]+)~~?$/, 's'],
        ]
        for (let i = 0; i < rules.length; i++) {
          const m = rules[i][0].exec(before)
          if (!m) continue
          const inner = m[1]
          const full = m[0].slice(m[0].indexOf(ch === '_' ? '_' : ch === '*' ? '*' : ch))
          const start = off - full.length
          if (start < 0) continue
          const range = U.rangeFromOffsets(el, start, off)
          const common = range.commonAncestorContainer
          if ((common.nodeType === 1 ? common : common.parentElement).closest('code')) return false
          this.checkpoint()
          range.deleteContents()
          const node = document.createElement(rules[i][1])
          node.textContent = inner
          range.insertNode(node)
          const zw = document.createTextNode('​')
          node.after(zw)
          const sel = window.getSelection()
          const r = document.createRange()
          r.setStart(zw, 1)
          r.collapse(true)
          sel.removeAllRanges()
          sel.addRange(r)
          b.text = cleanHTML(el.innerHTML)
          this.changed()
          return true
        }
      }
      return false
    }

    onKeyDown(e) {
      const t = e.target
      const mod = U.mod(e)
      if (t === this.titleEl) return this.onTitleKey(e)
      const el = t.closest && t.closest('.block-text')
      if (!el) return
      const b = this.blockOfEl(el)
      if (!b) return
      if (this.slash && this.slash.handleKey(e)) return
      if (this.mention && this.mention.handleKey(e)) return
      const key = e.key

      if (mod && key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) this.redo()
        else this.undo()
        return
      }
      if (mod && key.toLowerCase() === 'y') {
        e.preventDefault()
        this.redo()
        return
      }
      if (b.type !== 'code' && mod && !e.altKey) {
        const k = key.toLowerCase()
        if (k === 'b' || k === 'i' || k === 'u') {
          e.preventDefault()
          document.execCommand(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline')
          this.syncText(el)
          return
        }
        if (k === 'e') {
          e.preventDefault()
          toggleInlineCode(el)
          this.syncText(el)
          return
        }
        if (k === 's' && e.shiftKey) {
          e.preventDefault()
          document.execCommand('strikeThrough')
          this.syncText(el)
          return
        }
        if (k === 'k' && !window.getSelection().isCollapsed) {
          e.preventDefault()
          e.stopPropagation()
          Toolbar.link(this, el)
          return
        }
      }
      if (mod && key.toLowerCase() === 'd') {
        e.preventDefault()
        this.duplicate([b.id])
        return
      }
      if (mod && key === 'Enter') {
        e.preventDefault()
        if (b.type === 'todo') this.toggleCheck(b)
        else if (b.type === 'toggle') this.toggleOpen(b)
        else if (b.type === 'code') this.exitCode(b)
        return
      }
      if (mod && e.altKey && /^Digit[0-9]$/.test(e.code)) {
        e.preventDefault()
        const map = ['text', 'h1', 'h2', 'h3', 'todo', 'bullet', 'numbered', 'toggle', 'code', 'page']
        this.turnInto(b.id, map[+e.code.slice(5)])
        return
      }
      if (mod && e.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
        e.preventDefault()
        this.moveBlockBy(b.id, key === 'ArrowUp' ? -1 : 1)
        return
      }
      if (mod && key.toLowerCase() === 'a') {
        const r = U.getSelectionRange()
        if (r && r.toString().length === el.textContent.length && el.textContent.length) {
          e.preventDefault()
          el.blur()
          this.selectBlocks(this.page.blocks.map(x => x.id))
        } else if (!el.textContent.length) {
          e.preventDefault()
          el.blur()
          this.selectBlocks(this.page.blocks.map(x => x.id))
        }
        return
      }
      if (key === 'Escape') {
        e.preventDefault()
        el.blur()
        window.getSelection().removeAllRanges()
        this.selectBlocks([b.id])
        return
      }
      if (b.type === 'code') return this.onCodeKey(e, b, el)
      if (key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (el.classList.contains('image-caption')) return this.insertAfter(b, S.newBlock('text'))
        return this.onEnter(b, el)
      }
      if (key === 'Backspace' && U.caretAtStart(el) && !this.selectionIsRange()) {
        if (el.classList.contains('image-caption')) return
        e.preventDefault()
        return this.onBackspaceStart(b, el)
      }
      if (key === 'Delete' && U.caretAtEnd(el) && !this.selectionIsRange()) {
        e.preventDefault()
        return this.mergeNext(b, el)
      }
      if (key === 'Tab') {
        e.preventDefault()
        if (e.shiftKey) this.outdent(b.id)
        else this.indent(b.id)
        return
      }
      if (key === 'ArrowUp' && !e.shiftKey && U.caretOnFirstLine(el)) {
        const prev = this.neighbor(b.id, -1)
        if (prev) {
          e.preventDefault()
          const cr = U.caretRect()
          this.focus(prev.id, { x: cr ? cr.left : 0, atEnd: true })
        } else {
          e.preventDefault()
          U.setCaret(this.titleEl, this.titleEl.textContent.length)
        }
        return
      }
      if (key === 'ArrowDown' && !e.shiftKey && U.caretOnLastLine(el)) {
        const next = this.neighbor(b.id, 1)
        if (next) {
          e.preventDefault()
          const cr = U.caretRect()
          this.focus(next.id, { x: cr ? cr.left : 0, atEnd: false })
        }
        return
      }
      if (key === 'ArrowLeft' && !e.shiftKey && U.caretAtStart(el)) {
        const prev = this.neighbor(b.id, -1)
        if (prev) {
          e.preventDefault()
          this.focus(prev.id, 'end')
        }
        return
      }
      if (key === 'ArrowRight' && !e.shiftKey && U.caretAtEnd(el)) {
        const next = this.neighbor(b.id, 1)
        if (next) {
          e.preventDefault()
          this.focus(next.id, 'start')
        }
      }
    }

    selectionIsRange() {
      const r = U.getSelectionRange()
      return r && !r.collapsed
    }

    neighbor(id, dir) {
      const list = this.flat().filter(b => this.textEl(b.id))
      const i = list.findIndex(b => b.id === id)
      return list[i + dir] || null
    }

    onTitleKey(e) {
      const mod = U.mod(e)
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) this.redo()
        else this.undo()
        return
      }
      if (mod && ['b', 'i', 'u', 'e'].indexOf(e.key.toLowerCase()) !== -1) {
        e.preventDefault()
        return
      }
      const p = this.page
      if (e.key === 'Enter') {
        e.preventDefault()
        if (p.type === 'database') return
        const [before, after] = U.splitAtCaret(this.titleEl)
        const beforeText = U.htmlToText(before)
        const afterText = U.htmlToText(after)
        this.checkpoint()
        p.title = beforeText
        this.titleEl.textContent = beforeText
        const nb = S.newBlock('text', { text: U.escapeHTML(afterText) })
        if (!afterText && p.blocks[0] && p.blocks[0].type === 'text' && !hasText(p.blocks[0])) {
          this.changed()
          this.focus(p.blocks[0].id, 'start')
          return
        }
        p.blocks.unshift(nb)
        this.changed()
        S.commit('title', p.id)
        this.renderBlocks()
        this.focus(nb.id, 'start')
        return
      }
      if ((e.key === 'ArrowDown' || e.key === 'Tab') && !e.shiftKey) {
        if (e.key === 'ArrowDown' && !U.caretOnLastLine(this.titleEl)) return
        if (p.type === 'database') return
        e.preventDefault()
        if (!p.blocks.length) return this.startWriting()
        const first = this.flat().find(b => this.textEl(b.id))
        if (first) this.focus(first.id, 'start')
      }
    }

    onCodeKey(e, b, el) {
      const key = e.key
      if (key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const off = U.getSelectionOffsets(el)
        const text = el.textContent
        const lineStart = text.lastIndexOf('\n', off.start - 1) + 1
        const indent = /^[ \t]*/.exec(text.slice(lineStart))[0]
        this.insertCodeText(el, b, '\n' + indent)
        return
      }
      if (key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        this.insertCodeText(el, b, '\n')
        return
      }
      if (key === 'Tab') {
        e.preventDefault()
        if (!e.shiftKey) this.insertCodeText(el, b, '  ')
        return
      }
      if (key === 'Backspace' && U.caretAtStart(el) && !el.textContent.length) {
        e.preventDefault()
        this.turnInto(b.id, 'text')
        return
      }
      if (key === 'ArrowUp' && U.caretOnFirstLine(el)) {
        const prev = this.neighbor(b.id, -1)
        if (prev) {
          e.preventDefault()
          this.focus(prev.id, 'end')
        }
        return
      }
      if (key === 'ArrowDown' && U.caretOnLastLine(el)) {
        const next = this.neighbor(b.id, 1)
        e.preventDefault()
        if (next) this.focus(next.id, 'start')
        else this.exitCode(b)
      }
    }

    insertCodeText(el, b, str) {
      const off = U.getSelectionOffsets(el) || { start: el.textContent.length, end: el.textContent.length }
      const text = el.textContent
      const now = Date.now()
      if (now - this.lastInput > 1000) S.checkpoint(this.pageId)
      this.lastInput = now
      b.text = text.slice(0, off.start) + str + text.slice(off.end)
      this.paintCode(el, b)
      U.setCaret(el, off.start + str.length)
      this.page.updatedAt = now
      S.save()
    }

    exitCode(b) {
      const c = this.find(b.id)
      const next = c.arr[c.index + 1]
      if (next && next.type === 'text' && !hasText(next)) return this.focus(next.id, 'start')
      this.insertAfter(b, S.newBlock('text'))
    }

    insertAfter(b, nb) {
      this.checkpoint()
      const c = this.find(b.id)
      c.arr.splice(c.index + 1, 0, nb)
      this.changed()
      this.renderBlocks()
      this.focus(nb.id, 'start')
      return nb
    }

    onEnter(b, el) {
      const c = this.find(b.id)
      const empty = !el.textContent.replace(/​/g, '').length && !el.querySelector('[data-page-id],[data-date]')
      if (empty && (LIST_TYPES[b.type] || b.type === 'quote')) {
        if (c.parent && LIST_TYPES[b.type]) return this.outdent(b.id)
        return this.turnInto(b.id, 'text')
      }
      this.checkpoint()
      const parts = U.splitAtCaret(el)
      const before = cleanHTML(parts[0])
      const after = cleanHTML(parts[1])
      const nextType = LIST_TYPES[b.type] ? b.type : 'text'
      const beforeEmpty = !S.stripTags(before).replace(/​/g, '').length && !/data-(page-id|date)/.test(before)
      const afterEmpty = !S.stripTags(after).replace(/​/g, '').length && !/data-(page-id|date)/.test(after)
      if (beforeEmpty && !afterEmpty) {
        // Caret at the start: push an empty block above and keep editing this one.
        const nb = S.newBlock(nextType)
        c.arr.splice(c.index, 0, nb)
        this.changed()
        this.renderBlocks()
        this.focus(b.id, 'start')
        return
      }
      b.text = before
      const intoToggle = b.type === 'callout' || (b.type === 'toggle' && b.open)
      const nb = S.newBlock(intoToggle ? 'text' : nextType, { text: after })
      if (b.type === 'todo') nb.checked = false
      if (LIST_TYPES[b.type] && b.color && !intoToggle) nb.color = b.color
      if (intoToggle) {
        b.children.unshift(nb)
      } else if (b.children && b.children.length && NESTABLE[b.type] && b.type !== 'toggle') {
        b.children.unshift(nb)
      } else {
        c.arr.splice(c.index + 1, 0, nb)
      }
      this.changed()
      this.renderBlocks()
      this.focus(nb.id, 'start')
    }

    onBackspaceStart(b, el) {
      const c = this.find(b.id)
      if (b.type !== 'text') {
        this.turnInto(b.id, 'text', 0)
        return
      }
      if (c.parent && c.parent.type !== 'callout') {
        this.outdent(b.id, 0)
        return
      }
      const flat = this.flat()
      const i = flat.findIndex(x => x.id === b.id)
      const prev = flat[i - 1]
      const empty = !hasText(b)
      if (!prev) {
        if (empty && !b.children.length && this.page.blocks.length > 1) {
          this.checkpoint()
          c.arr.splice(c.index, 1)
          this.changed()
          this.renderBlocks()
        }
        U.setCaret(this.titleEl, this.titleEl.textContent.length)
        return
      }
      const prevText = this.textEl(prev.id)
      if (!prevText || prev.type === 'code' || (prevText && prevText.classList.contains('image-caption'))) {
        if (empty) {
          this.checkpoint()
          c.arr.splice(c.index, 1, ...(b.children || []))
          this.changed()
          this.renderBlocks()
        }
        if (prev.type === 'code') this.focus(prev.id, 'end')
        else this.selectBlocks([prev.id])
        return
      }
      this.checkpoint()
      const len = prevText.textContent.length
      prev.text = cleanHTML((prev.text || '') + (b.text || ''))
      c.arr.splice(c.index, 1, ...(b.children || []))
      this.changed()
      this.renderBlocks()
      this.focus(prev.id, len)
    }

    mergeNext(b, el) {
      const flat = this.flat()
      const i = flat.findIndex(x => x.id === b.id)
      const next = flat[i + 1]
      if (!next) return
      if (!TEXT_TYPES[next.type]) {
        this.selectBlocks([next.id])
        return
      }
      this.checkpoint()
      const len = el.textContent.length
      const nc = this.find(next.id)
      b.text = cleanHTML((b.text || '') + (next.text || ''))
      nc.arr.splice(nc.index, 1, ...(next.children || []))
      this.changed()
      this.renderBlocks()
      this.focus(b.id, len)
    }

    indent(id) {
      const c = this.find(id)
      if (!c || c.index === 0) return false
      const prev = c.arr[c.index - 1]
      if (!NESTABLE[prev.type]) return false
      const el = this.textEl(id)
      const off = el ? U.getCaretOffset(el) : -1
      this.checkpoint()
      c.arr.splice(c.index, 1)
      prev.children.push(c.block)
      if (prev.type === 'toggle') prev.open = true
      this.changed()
      this.renderBlocks()
      if (el) this.focus(id, off)
      return true
    }

    outdent(id, caret) {
      const c = this.find(id)
      if (!c || !c.parent) return false
      const pc = this.find(c.parent.id)
      const el = this.textEl(id)
      const off = caret != null ? caret : el ? U.getCaretOffset(el) : -1
      this.checkpoint()
      const following = c.arr.splice(c.index)
      const blk = following.shift()
      blk.children = (blk.children || []).concat(following)
      pc.arr.splice(pc.index + 1, 0, blk)
      this.changed()
      this.renderBlocks()
      if (el) this.focus(id, off)
      return true
    }

    turnInto(id, type, caret) {
      const c = this.find(id)
      if (!c) return
      const b = c.block
      if (b.type === type) return
      const el = this.textEl(id)
      const off = caret != null ? caret : el ? U.getCaretOffset(el) : 0
      this.checkpoint()
      if (type === 'page') {
        const title = b.type === 'code' ? b.text.split('\n')[0] : U.htmlToText(b.text)
        const p = S.createPage({ title, parentId: this.pageId, detached: true, blocks: b.children || [] })
        S.walkBlocks(p.blocks, x => {
          if ((x.type === 'page' || x.type === 'database') && S.page(x.pageId)) S.page(x.pageId).parentId = p.id
        })
        c.arr.splice(c.index, 1, S.newBlock('page', { pageId: p.id }))
        this.changed(true)
        this.renderBlocks()
        return
      }
      if (type === 'code' && b.type !== 'code') {
        b.text = U.htmlToText(b.text)
        b.language = b.language || 'plain'
      } else if (b.type === 'code' && type !== 'code') {
        b.text = U.escapeHTML(b.text).replace(/\n/g, '<br>')
      }
      b.type = type
      if (type === 'todo') b.checked = !!b.checked
      if (type === 'callout' && !b.icon) b.icon = '💡'
      if (type === 'toggle' && b.children.length) b.open = true
      if (!NESTABLE[type] && b.children && b.children.length) {
        const kids = b.children
        b.children = []
        c.arr.splice(c.index + 1, 0, ...kids)
      }
      this.changed()
      this.renderBlocks()
      if (this.textEl(id)) this.focus(id, off)
    }

    toggleCheck(b) {
      this.checkpoint()
      b.checked = !b.checked
      const el = this.blockEl(b.id)
      if (el) {
        el.classList.toggle('checked', b.checked)
        const box = el.querySelector('.todo-check')
        if (box) box.setAttribute('aria-checked', b.checked ? 'true' : 'false')
      }
      this.changed()
    }

    toggleOpen(b) {
      const el = this.textEl(b.id)
      const off = el && document.activeElement === el ? U.getCaretOffset(el) : null
      b.open = !b.open
      this.changed()
      this.renderBlocks()
      if (off != null) this.focus(b.id, off)
    }

    moveBlockBy(id, dir) {
      const c = this.find(id)
      const j = c.index + dir
      if (j < 0 || j >= c.arr.length) return
      const el = this.textEl(id)
      const off = el ? U.getCaretOffset(el) : null
      this.checkpoint()
      c.arr.splice(c.index, 1)
      c.arr.splice(j, 0, c.block)
      this.changed()
      this.renderBlocks()
      if (off != null) this.focus(id, off)
      else this.selectBlocks([id])
    }

    duplicate(ids) {
      ids = this.topLevel(ids)
      if (!ids.length) return
      this.checkpoint()
      let lastCopy = null
      ids.forEach(id => {
        const c = this.find(id)
        const copy = S.cloneBlocks([c.block], this.pageId)[0]
        c.arr.splice(c.index + 1, 0, copy)
        lastCopy = copy
      })
      this.changed(true)
      this.renderBlocks()
      if (lastCopy) {
        if (this.textEl(lastCopy.id) && ids.length === 1) this.focus(lastCopy.id, 'end')
        else this.selectBlocks([lastCopy.id])
      }
    }

    deleteBlocks(ids) {
      ids = this.topLevel(ids)
      if (!ids.length) return
      const flat = this.flat()
      const firstIdx = flat.findIndex(b => b.id === ids[0])
      this.checkpoint()
      ids.forEach(id => {
        const c = this.find(id)
        if (c) c.arr.splice(c.index, 1)
      })
      this.clearSelection()
      this.changed(true)
      this.renderBlocks()
      const rest = this.flat().filter(b => this.textEl(b.id))
      const target = rest.filter(b => flat.indexOf(b) !== -1 && flat.indexOf(b) < firstIdx).pop() || rest[0]
      if (target) this.focus(target.id, 'end')
    }

    // Remove descendants of other ids so operations apply once.
    topLevel(ids) {
      const set = new Set(ids)
      const out = []
      const walk = (blocks, inside) =>
        blocks.forEach(b => {
          const sel = set.has(b.id)
          if (sel && !inside) out.push(b.id)
          if (b.children) walk(b.children, inside || sel)
        })
      walk(this.page.blocks, false)
      return out
    }

    moveBlocksToPage(ids, targetId) {
      ids = this.topLevel(ids)
      const target = S.page(targetId)
      if (!target || targetId === this.pageId || target.type === 'database') return
      this.checkpoint()
      const moved = []
      ids.forEach(id => {
        const c = this.find(id)
        if (!c) return
        c.arr.splice(c.index, 1)
        moved.push(c.block)
      })
      S.walkBlocks(moved, x => {
        if ((x.type === 'page' || x.type === 'database') && S.page(x.pageId)) S.page(x.pageId).parentId = targetId
      })
      target.blocks = target.blocks.concat(moved)
      target.updatedAt = Date.now()
      this.clearSelection()
      this.changed(true)
      S.commit('page', targetId)
      this.renderBlocks()
      UI.toast('Moved to ' + S.pageTitle(target), { action: { label: 'Open', onClick: () => F.app.open(targetId) } })
    }

    undo() {
      this.closeMenus()
      if (!S.undo(this.pageId)) UI.toast('Nothing to undo')
    }
    redo() {
      this.closeMenus()
      S.redo(this.pageId)
    }

    clickTail() {
      const p = this.page
      const last = p.blocks[p.blocks.length - 1]
      if (last && last.type === 'text' && !hasText(last) && !last.children.length) return this.focus(last.id, 'start')
      this.checkpoint()
      const nb = S.newBlock('text')
      p.blocks.push(nb)
      this.changed()
      this.renderBlocks()
      this.focus(nb.id, 'start')
    }

    plusClick(id, above) {
      const c = this.find(id)
      if (!c) return
      const b = c.block
      if (b.type === 'text' && !hasText(b) && !above) {
        this.focus(b.id, 'start')
      } else {
        this.checkpoint()
        const nb = S.newBlock('text')
        c.arr.splice(above ? c.index : c.index + 1, 0, nb)
        this.changed()
        this.renderBlocks()
        this.focus(nb.id, 'start')
        id = nb.id
      }
      const el = this.textEl(id)
      document.execCommand('insertText', false, '/')
      this.syncText(el)
      this.openSlash(el, this.find(id).block, 0)
    }

    onClick(e) {
      const t = e.target
      const check = t.closest('.todo-check')
      if (check && !this.locked) {
        const b = this.blockOfEl(check)
        if (b) this.toggleCheck(b)
        return
      }
      const arrow = t.closest('.toggle-arrow')
      if (arrow) {
        const b = this.blockOfEl(arrow)
        if (b) this.toggleOpen(b)
        return
      }
      const empty = t.closest('.toggle-empty')
      if (empty && !this.locked) {
        const c = this.find(empty.dataset.toggle)
        if (!c) return
        this.checkpoint()
        const nb = S.newBlock('text')
        c.block.children.push(nb)
        this.changed()
        this.renderBlocks()
        this.focus(nb.id, 'start')
        return
      }
      const callIcon = t.closest('.callout-icon')
      if (callIcon && !this.locked) {
        const b = this.blockOfEl(callIcon)
        UI.emojiPicker(callIcon, {
          onSelect: em => {
            this.checkpoint()
            b.icon = em
            callIcon.textContent = em
            this.changed()
          },
        })
        return
      }
      const pageLink = t.closest('a.page-link, a[data-page-id]')
      if (pageLink) {
        e.preventDefault()
        const id = pageLink.dataset.pageId || pageLink.getAttribute('data-page-id')
        if (id && S.page(id)) F.app.open(id)
        return
      }
      const link = t.closest('.block-text a[href]')
      if (link) {
        e.preventDefault()
        if (U.mod(e) || this.locked) window.open(link.href, '_blank', 'noopener')
        else if (window.getSelection().isCollapsed) this.linkPopover(link)
        return
      }
      const date = t.closest('.mention-date')
      if (date && !this.locked) {
        const b = this.blockOfEl(date)
        UI.datePicker(date, date.getAttribute('data-date'), v => {
          if (!v) return
          date.setAttribute('data-date', v)
          this.hydrate(date.parentElement)
          const el = date.closest('.block-text')
          if (b && el) {
            b.text = cleanHTML(el.innerHTML)
            this.changed()
          }
        })
      }
      const divider = t.closest('.divider, .toc, .image-frame')
      if (divider && !t.closest('.toc-item, .img-tool')) {
        const b = this.blockOfEl(divider)
        if (b) this.selectBlocks([b.id])
      }
    }

    linkPopover(a) {
      const el = a.closest('.block-text')
      const href = a.getAttribute('href')
      const pop = UI.popover(
        a,
        h('div.link-pop', null,
          U.icon('link', 14),
          h('a.link-pop-url', { href, target: '_blank', rel: 'noopener', text: href }),
          h('button.btn-icon', { title: 'Copy link', onClick: () => { U.copyText(href); pop.close(); UI.toast('Link copied') } }, U.icon('copy', 14)),
          h('button.btn-icon', {
            title: 'Edit link',
            onClick: () => {
              pop.close()
              UI.inputPopover(a, {
                value: href,
                placeholder: 'Paste a link…',
                onSubmit: v => {
                  const url = U.safeUrl(v)
                  this.checkpoint()
                  if (url) a.setAttribute('href', url)
                  else unwrap(a)
                  this.syncText(el)
                  this.changed()
                },
              })
            },
          }, U.icon('edit', 14)),
          h('button.btn-icon', {
            title: 'Remove link',
            onClick: () => {
              pop.close()
              this.checkpoint()
              unwrap(a)
              this.syncText(el)
              this.changed()
            },
          }, U.icon('x', 14))
        ),
        { autofocus: false, placement: 'bottom-start' }
      )
    }

    onCopy(e) {
      if (!this.selected.size) return
      e.preventDefault()
      this.copySelection(e.clipboardData)
    }

    copySelection(clipboardData) {
      const ids = this.topLevel(Array.from(this.selected))
      const blocks = ids.map(id => this.find(id).block)
      const text = F.md.fromBlocks(blocks).trim()
      F.clipboard = { text, blocks: JSON.parse(JSON.stringify(blocks)) }
      if (clipboardData) clipboardData.setData('text/plain', text)
      else U.copyText(text)
    }

    onPaste(e) {
      const t = e.target
      if (t === this.titleEl) {
        e.preventDefault()
        const text = (e.clipboardData.getData('text/plain') || '').replace(/\s*\n\s*/g, ' ')
        document.execCommand('insertText', false, text)
        return
      }
      const el = t.closest && t.closest('.block-text')
      if (!el) return
      const b = this.blockOfEl(el)
      if (!b) return
      const cd = e.clipboardData
      const files = Array.from(cd.files || []).filter(f => /^image\//.test(f.type))
      if (files.length) {
        e.preventDefault()
        this.insertImages(b, files)
        return
      }
      const text = cd.getData('text/plain') || ''
      e.preventDefault()
      if (b.type === 'code') {
        this.insertCodeText(el, b, text.replace(/\r\n?/g, '\n'))
        return
      }
      if (F.clipboard && F.clipboard.text === text.trim() && F.clipboard.blocks.length) {
        this.insertBlocks(b, el, S.cloneBlocks(F.clipboard.blocks, this.pageId), true)
        return
      }
      if (text.indexOf('\n') === -1 || el.classList.contains('image-caption')) {
        const url = U.safeUrl(text.trim())
        if (url && /^https?:/.test(url) && !window.getSelection().isCollapsed) {
          document.execCommand('createLink', false, url)
        } else {
          document.execCommand('insertText', false, text.replace(/\n/g, ' '))
        }
        this.syncText(el)
        return
      }
      const blocks = F.md.toBlocks(text)
      if (!blocks.length) return
      this.insertBlocks(b, el, blocks, false)
    }

    insertBlocks(b, el, blocks, keepFirst) {
      this.checkpoint()
      const parts = U.splitAtCaret(el)
      const before = cleanHTML(parts[0])
      const after = cleanHTML(parts[1])
      const c = this.find(b.id)
      b.text = before
      let insertIdx = c.index + 1
      if (!keepFirst && blocks[0].type === 'text' && TEXT_TYPES[b.type]) {
        b.text = cleanHTML(before + blocks.shift().text)
      } else if (b.type === 'text' && !hasText(b) && !b.children.length) {
        c.arr.splice(c.index, 1)
        insertIdx = c.index
      }
      c.arr.splice(insertIdx, 0, ...blocks)
      let last = blocks.length ? blocks[blocks.length - 1] : b
      let caret = null
      if (after) {
        if (TEXT_TYPES[last.type]) {
          caret = S.stripTags(last.text).length
          last.text = cleanHTML(last.text + after)
        } else {
          const nb = S.newBlock('text', { text: after })
          const lc = this.find(last.id)
          lc.arr.splice(lc.index + 1, 0, nb)
          last = nb
          caret = 0
        }
      }
      this.changed(true)
      this.renderBlocks()
      if (this.textEl(last.id)) this.focus(last.id, caret == null ? 'end' : caret)
      else this.selectBlocks([last.id])
    }

    insertImages(b, files) {
      Promise.all(files.map(f => U.compressImage(f))).then(urls => {
        this.checkpoint()
        let anchor = b
        urls.forEach(url => {
          const nb = S.newBlock('image', { url })
          if (anchor === b) this.place(b, nb)
          else {
            const c = this.find(anchor.id)
            c.arr.splice(c.index + 1, 0, nb)
          }
          anchor = nb
        })
        this.changed()
        this.renderBlocks()
      })
    }

    // ------------------------------------------------------------------ block selection
    selectBlocks(ids) {
      this.selected = new Set(ids)
      activeEditor = this
      const a = document.activeElement
      if (a && this.root.contains(a) && a.blur) a.blur()
      this.updateSelectionClasses()
      if (ids.length) {
        const el = this.blockEl(ids[ids.length - 1])
        if (el) U.scrollIntoViewIfNeeded(el, this.root.closest('.scroller, .peek-scroll'))
      }
    }
    clearSelection() {
      if (!this.selected.size) return
      this.selected = new Set()
      this.updateSelectionClasses()
    }
    updateSelectionClasses() {
      U.$$('.block.selected', this.root).forEach(el => el.classList.remove('selected'))
      this.selected.forEach(id => {
        const el = this.blockEl(id)
        if (el) el.classList.add('selected')
      })
    }

    onSelectionKey(e) {
      const mod = U.mod(e)
      const ids = this.topLevel(Array.from(this.selected))
      if (!ids.length) {
        this.clearSelection()
        return false
      }
      const key = e.key
      const flat = this.flat()
      const idxs = ids.map(id => flat.findIndex(b => b.id === id)).sort((a, b) => a - b)
      if (key === 'Backspace' || key === 'Delete') {
        if (this.locked) return true
        e.preventDefault()
        this.deleteBlocks(ids)
        return true
      }
      if (key === 'Escape') {
        this.clearSelection()
        return true
      }
      if (key === 'Enter') {
        e.preventDefault()
        const last = flat[idxs[idxs.length - 1]]
        if (last && this.textEl(last.id)) this.focus(last.id, 'end')
        else if (last && (last.type === 'page' || last.type === 'pagelink')) F.app.open(last.pageId)
        return true
      }
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        e.preventDefault()
        if (mod && e.shiftKey && ids.length === 1) {
          this.moveBlockBy(ids[0], key === 'ArrowUp' ? -1 : 1)
          return true
        }
        const edge = key === 'ArrowUp' ? idxs[0] - 1 : idxs[idxs.length - 1] + 1
        const nb = flat[U.clamp(edge, 0, flat.length - 1)]
        if (e.shiftKey) this.selectBlocks(ids.concat([nb.id]))
        else this.selectBlocks([nb.id])
        return true
      }
      if (mod && key.toLowerCase() === 'a') {
        e.preventDefault()
        this.selectBlocks(this.page.blocks.map(b => b.id))
        return true
      }
      if (mod && key.toLowerCase() === 'c') {
        e.preventDefault()
        this.copySelection()
        UI.toast(ids.length === 1 ? 'Copied block' : 'Copied ' + ids.length + ' blocks')
        return true
      }
      if (mod && key.toLowerCase() === 'x' && !this.locked) {
        e.preventDefault()
        this.copySelection()
        this.deleteBlocks(ids)
        return true
      }
      if (mod && key.toLowerCase() === 'd' && !this.locked) {
        e.preventDefault()
        this.duplicate(ids)
        return true
      }
      if (mod && key.toLowerCase() === 'z') {
        e.preventDefault()
        this.clearSelection()
        if (e.shiftKey) this.redo()
        else this.undo()
        return true
      }
      if (key === 'Tab' && !this.locked) {
        e.preventDefault()
        const sel = ids.slice()
        if (e.shiftKey) sel.reverse().forEach(id => this.outdent(id))
        else sel.forEach(id => this.indent(id))
        this.selectBlocks(sel)
        return true
      }
      if (mod && e.altKey && /^Digit[0-9]$/.test(e.code) && !this.locked) {
        e.preventDefault()
        const map = ['text', 'h1', 'h2', 'h3', 'todo', 'bullet', 'numbered', 'toggle', 'code', 'page']
        ids.forEach(id => this.turnInto(id, map[+e.code.slice(5)]))
        this.selectBlocks(ids)
        return true
      }
      return false
    }

    onMouseDown(e) {
      if (e.button !== 0 || this.locked) return
      const t = e.target
      if (t.closest('.block-handle, .popover, input, textarea, select, button, .inline-db, .db-full, .page-header, .page-cover, .image-frame, .code-bar')) return
      const textEl = t.closest('.block-text')
      const scroller = this.root.closest('.scroller, .peek-scroll') || document.documentElement
      if (textEl) {
        const b = this.blockOfEl(textEl)
        if (!b) return
        const startId = b.id
        let converted = false
        const move = ev => {
          const under = document.elementFromPoint(ev.clientX, ev.clientY)
          const blk = under && under.closest('.block')
          if (!blk || !this.root.contains(blk)) return
          const id = blk.dataset.id
          if (id === startId && !converted) return
          const chain = (function(x) {
            const out = []
            let n = x
            while (n && n !== document.body) {
              if (n.classList && n.classList.contains('block')) out.push(n.dataset.id)
              n = n.parentElement
            }
            return out
          })(this.blockEl(startId))
          if (!converted && chain.indexOf(id) !== -1) return
          converted = true
          window.getSelection().removeAllRanges()
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
          this.selectRange(startId, id)
        }
        const up = () => {
          document.removeEventListener('mousemove', move)
          document.removeEventListener('mouseup', up)
        }
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', up)
        return
      }
      // Rectangle selection starting in empty space around blocks
      if (!t.closest('.page-body, .page-content') && t !== this.root) return
      if (t.closest('.page-tail')) return
      const x0 = e.clientX
      const y0 = e.clientY + scroller.scrollTop
      let rect = null
      let moved = false
      const move = ev => {
        const dx = ev.clientX - x0
        const dy = ev.clientY + scroller.scrollTop - y0
        if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return
        if (!moved) {
          moved = true
          rect = h('div.select-rect')
          document.body.appendChild(rect)
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
          window.getSelection().removeAllRanges()
        }
        const top0 = y0 - scroller.scrollTop
        const l = Math.min(x0, ev.clientX)
        const tp = Math.min(top0, ev.clientY)
        const w = Math.abs(ev.clientX - x0)
        const hh = Math.abs(ev.clientY - top0)
        Object.assign(rect.style, { left: l + 'px', top: tp + 'px', width: w + 'px', height: hh + 'px' })
        const hits = []
        U.$$('.block', this.root).forEach(blk => {
          if (blk.closest('.inline-db')) return
          const row = blk.querySelector('.block-row')
          const r = row.getBoundingClientRect()
          if (r.bottom > tp && r.top < tp + hh && r.right > l && r.left < l + w) hits.push(blk.dataset.id)
        })
        this.selectBlocks(this.topLevel(hits))
      }
      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        if (rect) rect.remove()
        if (!moved) this.clearSelection()
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    }

    selectRange(aId, bId) {
      const flat = this.flat()
      let i = flat.findIndex(x => x.id === aId)
      let j = flat.findIndex(x => x.id === bId)
      if (i === -1 || j === -1) return
      if (i > j) {
        const t = i
        i = j
        j = t
      }
      this.selectBlocks(this.topLevel(flat.slice(i, j + 1).map(x => x.id)))
    }

    // ------------------------------------------------------------------ drag and drop
    dragStart(e, id) {
      const ids = this.selected.has(id) ? this.topLevel(Array.from(this.selected)) : [id]
      this.dragIds = ids
      F.dragState = { kind: 'blocks', editor: this, ids }
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', ids.join(','))
      const row = this.blockEl(id)
      if (row) {
        e.dataTransfer.setDragImage(row, 0, 0)
        setTimeout(() => ids.forEach(x => this.blockEl(x) && this.blockEl(x).classList.add('dragging')), 0)
      }
    }
    dragEnd() {
      U.$$('.block.dragging', this.root).forEach(el => el.classList.remove('dragging'))
      this.dragIds = null
      F.dragState = null
      this.hideDrop()
    }
    hideDrop() {
      if (this.dropLine) this.dropLine.style.display = 'none'
      this.dropTarget = null
    }
    onDragOver(e) {
      const files = e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') !== -1
      if (!this.dragIds && !files) return
      if (this.locked || !this.blocksEl) return
      const blk = e.target.closest && e.target.closest('.block')
      let target = null
      let pos = 'after'
      if (blk && this.blocksEl.contains(blk) && !blk.closest('.inline-db')) {
        const r = blk.querySelector('.block-row').getBoundingClientRect()
        pos = e.clientY < r.top + r.height / 2 ? 'before' : 'after'
        target = blk.dataset.id
      } else if (e.target.closest && e.target.closest('.page-tail')) {
        const last = this.page.blocks[this.page.blocks.length - 1]
        if (last) target = last.id
      }
      if (!target) return
      if (this.dragIds && this.dragIds.some(id => id === target || this.isInside(target, id))) {
        this.hideDrop()
        return
      }
      e.preventDefault()
      e.dataTransfer.dropEffect = files ? 'copy' : 'move'
      this.dropTarget = { id: target, pos }
      if (!this.dropLine) {
        this.dropLine = h('div.drop-line')
        this.root.appendChild(this.dropLine)
      }
      const tEl = this.blockEl(target)
      const row = tEl.querySelector('.block-row')
      const content = row.querySelector('.block-content') || row
      const rr = pos === 'before' ? row.getBoundingClientRect() : tEl.getBoundingClientRect()
      const base = this.root.getBoundingClientRect()
      const cr = content.getBoundingClientRect()
      Object.assign(this.dropLine.style, {
        display: 'block',
        top: (pos === 'before' ? rr.top : rr.bottom) - base.top - 2 + 'px',
        left: cr.left - base.left + 'px',
        width: cr.width + 'px',
      })
    }
    isInside(id, ancestorId) {
      const c = this.find(ancestorId)
      return !!(c && S.findBlock(c.block.children || [], id))
    }
    onDrop(e) {
      const dt = this.dropTarget
      this.hideDrop()
      if (!dt) return
      e.preventDefault()
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(f => /^image\//.test(f.type))
      if (!this.dragIds && files.length) {
        const c = this.find(dt.id)
        Promise.all(files.map(f => U.compressImage(f))).then(urls => {
          this.checkpoint()
          const idx = dt.pos === 'before' ? this.find(dt.id).index : this.find(dt.id).index + 1
          c.arr.splice(idx, 0, ...urls.map(url => S.newBlock('image', { url })))
          this.changed()
          this.renderBlocks()
        })
        return
      }
      const ids = this.dragIds
      if (!ids) return
      this.checkpoint()
      const moving = []
      ids.forEach(id => {
        const c = this.find(id)
        if (c) {
          c.arr.splice(c.index, 1)
          moving.push(c.block)
        }
      })
      const tc = this.find(dt.id)
      if (!tc) return
      tc.arr.splice(dt.pos === 'before' ? tc.index : tc.index + 1, 0, ...moving)
      this.dragEnd()
      this.changed()
      this.renderBlocks()
      this.selectBlocks(moving.map(b => b.id))
    }

    // ------------------------------------------------------------------ block menu
    blockMenu(id, anchor) {
      const c = this.find(id)
      if (!c) return
      const b = c.block
      const ids = this.selected.has(id) ? this.topLevel(Array.from(this.selected)) : [id]
      const multi = ids.length > 1
      const items = [
        { header: multi ? ids.length + ' blocks' : (INFO[b.type] && INFO[b.type].label) || 'Block' },
        { label: 'Delete', icon: 'trash', hint: 'Del', onClick: () => this.deleteBlocks(ids) },
        { label: 'Duplicate', icon: 'duplicate', hint: U.modKey + 'D', onClick: () => this.duplicate(ids) },
        TEXT_TYPES[b.type] || b.type === 'code'
          ? {
              label: 'Turn into',
              icon: 'turnInto',
              submenu: () =>
                TURN_INTO.map(t => ({
                  label: INFO[t].label,
                  icon: glyphIcon(t),
                  checked: b.type === t,
                  onClick: () => {
                    ids.forEach(x => this.turnInto(x, t))
                  },
                })),
            }
          : null,
        b.type === 'page' || b.type === 'pagelink' ? { label: 'Open page', icon: 'open', onClick: () => F.app.open(b.pageId) } : null,
        {
          label: 'Copy link to block',
          icon: 'link',
          onClick: () => {
            U.copyText(location.href.split('#')[0] + '#/p/' + this.pageId + '/' + id)
            UI.toast('Copied link to block')
          },
        },
        {
          label: 'Move to',
          icon: 'moveTo',
          onClick: () =>
            UI.pagePicker(anchor, {
              title: 'Move ' + (multi ? ids.length + ' blocks' : 'block') + ' to…',
              filter: p => p.id !== this.pageId && p.type !== 'database',
              onSelect: p => this.moveBlocksToPage(ids, p.id),
            }),
        },
        { divider: true },
        TEXT_TYPES[b.type]
          ? {
              label: 'Color',
              icon: 'palette',
              subWidth: 220,
              submenu: () =>
                UI.colorItems(b.color || '', col => {
                  this.checkpoint()
                  ids.forEach(x => {
                    const cc = this.find(x)
                    if (cc) cc.block.color = col
                  })
                  this.changed()
                  this.renderBlocks()
                }),
            }
          : null,
        { divider: true },
        { render: () => h('div.menu-foot', { text: 'Last edited ' + U.timeAgo(this.page.updatedAt) }) },
      ]
      UI.menu(anchor, items, { placement: 'left-start', width: 250, search: true, searchPlaceholder: 'Search actions…' })
    }

    // ------------------------------------------------------------------ slash menu
    maybeOpenSlash(el, b) {
      const off = U.getCaretOffset(el)
      const txt = el.textContent
      const prev = txt.charAt(off - 2)
      if (off === 1 || /\s/.test(prev) || prev === '​') this.openSlash(el, b, off - 1)
    }

    openSlash(el, b, start) {
      this.closeMenus()
      const menu = new CommandMenu(this, el, b, start, slashCommands(this, b), { width: 320 })
      this.slash = menu
      menu.onClose = () => {
        if (this.slash === menu) this.slash = null
      }
    }
    updateSlash() {
      if (this.slash) this.slash.update()
    }
    closeSlash() {
      if (this.slash) this.slash.close()
      this.slash = null
    }

    maybeOpenMention(el, b) {
      const off = U.getCaretOffset(el)
      const prev = el.textContent.charAt(off - 2)
      if (off === 1 || /\s/.test(prev)) {
        this.closeMenus()
        const menu = new CommandMenu(this, el, b, off - 1, q => mentionItems(this, q), { width: 300, mention: true })
        this.mention = menu
        menu.onClose = () => {
          if (this.mention === menu) this.mention = null
        }
      }
    }
    updateMention() {
      if (this.mention) this.mention.update()
    }
    closeMention() {
      if (this.mention) this.mention.close()
      this.mention = null
    }
    closeMenus() {
      this.closeSlash()
      this.closeMention()
    }

    // Insert an inline node at the caret inside el.
    insertInline(el, node) {
      const sel = window.getSelection()
      if (!sel.rangeCount) return
      const r = sel.getRangeAt(0)
      r.deleteContents()
      r.insertNode(node)
      const space = document.createTextNode(' ')
      node.after(space)
      const nr = document.createRange()
      nr.setStart(space, 1)
      nr.collapse(true)
      sel.removeAllRanges()
      sel.addRange(nr)
      this.hydrate(el)
      this.syncText(el)
      this.changed()
    }

    // Run a slash command for block b (the "/query" text has been removed).
    runCommand(cmd, b, el) {
      const type = cmd.type
      if (cmd.run) return cmd.run(b, el)
      if (TEXT_TYPES[type] || type === 'code') {
        if (b.type === 'text' && !hasText(b)) {
          this.turnInto(b.id, type, 0)
          if (type === 'toggle') {
            b.open = true
            this.renderBlocks()
            this.focus(b.id, 'start')
          }
        } else {
          const nb = S.newBlock(type, type === 'code' ? { language: 'plain' } : type === 'callout' ? { icon: '💡' } : type === 'toggle' ? { open: true } : null)
          this.insertAfter(b, nb)
        }
        return
      }
      this.checkpoint()
      if (type === 'divider') {
        const d = S.newBlock('divider')
        this.place(b, d)
        const c = this.find(d.id)
        let next = c.arr[c.index + 1]
        if (!next || next.type !== 'text' || hasText(next)) {
          next = S.newBlock('text')
          c.arr.splice(c.index + 1, 0, next)
        }
        this.changed()
        this.renderBlocks()
        this.focus(next.id, 'start')
      } else if (type === 'page') {
        const p = S.createPage({ parentId: this.pageId, detached: true })
        this.place(b, S.newBlock('page', { pageId: p.id }))
        this.changed(true)
        this.renderBlocks()
        F.app.open(p.id)
      } else if (type === 'image') {
        const nb = this.place(b, S.newBlock('image', { url: '' }))
        this.changed()
        this.renderBlocks()
        const el2 = this.blockEl(nb.id)
        if (el2) this.imagePicker(nb, el2.querySelector('.image-empty'))
      } else if (type === 'toc') {
        this.place(b, S.newBlock('toc'))
        this.changed()
        this.renderBlocks()
      } else if (type === 'database') {
        const db = S.createPage({ type: 'database', view: cmd.view, parentId: this.pageId, detached: true, fullWidth: false })
        const nb = this.place(b, S.newBlock('database', { pageId: db.id }))
        this.changed(true)
        this.renderBlocks()
        const el = this.blockEl(nb.id)
        const t = el && el.querySelector('.db-title')
        if (t) t.focus()
      } else if (type === 'pagelink') {
        const anchor = this.blockEl(b.id) || this.root
        UI.pagePicker(anchor, {
          title: 'Link to page',
          filter: p => p.id !== this.pageId,
          onSelect: p => {
            this.place(b, S.newBlock('pagelink', { pageId: p.id }))
            this.changed()
            this.renderBlocks()
          },
        })
      }
    }
  }

  function glyphIcon(type) {
    const info = INFO[type]
    if (info.icon) return U.icon(info.icon, 16)
    return h('span.glyph', { text: info.glyph })
  }

  // ------------------------------------------------------------------ command menu (slash + mention)
  class CommandMenu {
    constructor(editor, el, block, start, source, opts) {
      this.editor = editor
      this.el = el
      this.block = block
      this.start = start
      this.source = source
      this.opts = opts || {}
      this.active = 0
      this.misses = 0
      this.list = h('div.cmd-list')
      this.root = h('div.cmd-menu', { onMousedown: e => e.preventDefault() }, this.list)
      const rect = U.caretRect()
      this.pop = UI.popover(rect && rect.height ? rect : el, this.root, {
        className: 'cmd-pop' + (this.opts.mention ? ' compact' : ''),
        width: this.opts.width || 320,
        autofocus: false,
        placement: 'bottom-start',
        onClose: () => {
          this.closed = true
          if (this.onClose) this.onClose()
        },
      })
      this.update()
    }
    query() {
      const off = U.getCaretOffset(this.el)
      if (off <= this.start) return null
      const txt = this.el.textContent
      if (txt.charAt(this.start) !== (this.opts.mention ? '@' : '/')) return null
      return txt.slice(this.start + 1, off)
    }
    update() {
      if (this.closed) return
      const q = this.query()
      if (q == null || /^\s/.test(q) || q.length > 40) return this.close()
      const items = typeof this.source === 'function' ? this.source(q) : filterCommands(this.source, q)
      const count = items.filter(i => !i.header).length
      if (!count) {
        this.misses++
        if (this.misses > 2 || /\s$/.test(q)) return this.close()
      } else this.misses = 0
      this.items = items.filter(i => !i.header)
      this.active = Math.min(this.active, Math.max(0, this.items.length - 1))
      if (q !== this.lastQ) this.active = 0
      this.lastQ = q
      this.list.innerHTML = ''
      if (!count) this.list.appendChild(h('div.menu-empty', { text: 'No results' }))
      items.forEach(it => {
        if (it.header) {
          this.list.appendChild(h('div.menu-header', { text: it.header }))
          return
        }
        const idx = this.items.indexOf(it)
        const row = h(
          'div.cmd-item',
          {
            class: idx === this.active ? 'active' : null,
            onMousemove: () => {
              if (this.active !== idx) this.setActive(idx)
            },
            onClick: () => this.choose(idx),
          },
          h('div.cmd-icon', null, it.iconEl ? it.iconEl() : null),
          h('div.cmd-text', null, h('div.cmd-label', { text: it.label }), it.desc ? h('div.cmd-desc', { text: it.desc }) : null),
          it.hint ? h('div.cmd-hint', { text: it.hint }) : null
        )
        it._row = row
        this.list.appendChild(row)
      })
      if (this.pop) this.pop.reposition()
      const a = this.items[this.active]
      if (a && a._row) a._row.scrollIntoView({ block: 'nearest' })
    }
    setActive(i) {
      if (!this.items || !this.items.length) return
      this.active = (i + this.items.length) % this.items.length
      this.items.forEach((it, j) => it._row && it._row.classList.toggle('active', j === this.active))
      const a = this.items[this.active]
      if (a && a._row) a._row.scrollIntoView({ block: 'nearest' })
    }
    handleKey(e) {
      if (this.closed) return false
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.setActive(this.active + 1)
        return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.setActive(this.active - 1)
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (!this.items || !this.items.length) {
          this.close()
          return false
        }
        e.preventDefault()
        this.choose(this.active)
        return true
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        this.close()
        return true
      }
      return false
    }
    choose(i) {
      const it = this.items && this.items[i]
      if (!it) return
      const ed = this.editor
      const el = this.el
      const b = this.block
      const off = U.getCaretOffset(el)
      this.close()
      // Remove the "/query" text
      ed.checkpoint()
      U.rangeFromOffsets(el, this.start, Math.max(off, this.start + 1)).deleteContents()
      if (el.innerHTML === '<br>') el.innerHTML = ''
      b.text = cleanHTML(el.innerHTML)
      U.setCaret(el, this.start)
      it.action(b, el)
    }
    close() {
      if (this.closed) return
      this.closed = true
      if (this.pop) this.pop.close()
      if (this.onClose) this.onClose()
    }
  }

  function filterCommands(cmds, q) {
    q = q.toLowerCase().trim()
    const out = []
    let group = null
    cmds.forEach(c => {
      if (c.header) {
        group = c
        return
      }
      if (!q && c.hidden) return
      const hay = (c.label + ' ' + (c.keywords || '')).toLowerCase()
      const words = q.split(/\s+/)
      if (q && !words.every(w => hay.indexOf(w) !== -1)) return
      if (!q && group) {
        out.push(group)
        group = null
      } else if (q && group && out.indexOf(group) === -1) {
        group = null
      }
      out.push(c)
    })
    if (q) {
      out.sort((a, b) => {
        const as = a.label.toLowerCase().indexOf(q) === 0 ? 0 : 1
        const bs = b.label.toLowerCase().indexOf(q) === 0 ? 0 : 1
        return as - bs
      })
    }
    return out
  }

  function slashCommands(ed) {
    const cmds = []
    const add = (type, extra) => {
      const info = INFO[type] || {}
      cmds.push(
        Object.assign(
          {
            label: info.label,
            desc: info.desc,
            hint: info.md || '',
            type,
            iconEl: () => glyphIcon(type),
            action: (b, el) => ed.runCommand(cmdFor(type, extra), b, el),
          },
          extra || {}
        )
      )
    }
    const cmdFor = (type, extra) => Object.assign({ type }, extra || {})
    cmds.push({ header: 'Basic blocks' })
    add('text', { keywords: 'plain paragraph' })
    add('page', { keywords: 'subpage new' })
    add('todo', { keywords: 'checkbox task check' })
    add('h1', { keywords: 'title heading big #' })
    add('h2', { keywords: 'subtitle heading ##' })
    add('h3', { keywords: 'heading small ###' })
    add('bullet', { keywords: 'unordered ul list' })
    add('numbered', { keywords: 'ordered ol list' })
    add('toggle', { keywords: 'collapse expand details' })
    add('quote', { keywords: 'blockquote citation' })
    add('divider', { keywords: 'hr line separator rule' })
    add('callout', { keywords: 'note tip info warning' })
    add('pagelink', { keywords: 'link reference existing' })
    cmds.push({ header: 'Media' })
    add('image', { keywords: 'picture photo upload embed' })
    add('code', { keywords: 'snippet programming pre' })
    cmds.push({ header: 'Database' })
    ;['table', 'board', 'gallery', 'list', 'calendar'].forEach(v => {
      cmds.push({
        label: S.VIEW_LABELS[v] + ' view',
        desc: {
          table: 'Rows and columns of pages',
          board: 'Cards grouped into columns',
          gallery: 'A grid of visual cards',
          list: 'A clean list of pages',
          calendar: 'Pages placed on dates',
        }[v],
        keywords: 'database inline db ' + v,
        iconEl: () => U.icon(v, 16),
        action: (b, el) => ed.runCommand({ type: 'database', view: v }, b, el),
      })
    })
    cmds.push({ header: 'Advanced' })
    add('toc', { keywords: 'outline contents headings' })
    cmds.push({ header: 'Inline' })
    cmds.push({
      label: 'Mention a page',
      desc: 'Link another page inline',
      keywords: 'mention page link @',
      hint: '@',
      iconEl: () => U.icon('at', 16),
      action: (b, el) => {
        document.execCommand('insertText', false, '@')
        ed.syncText(el)
        ed.maybeOpenMention(el, b)
      },
    })
    cmds.push({
      label: 'Date',
      desc: 'Insert today’s date',
      keywords: 'date today reminder time',
      iconEl: () => U.icon('calendar', 16),
      action: (b, el) => ed.insertInline(el, dateNode(U.toISODate(new Date()))),
    })
    cmds.push({
      label: 'Emoji',
      desc: 'Pick an emoji to insert',
      keywords: 'emoji icon smiley',
      iconEl: () => U.icon('smile', 16),
      action: (b, el) => {
        const r = U.getSelectionRange()
        const saved = r && r.cloneRange()
        UI.emojiPicker(U.caretRect() || el, {
          onSelect: em => {
            el.focus()
            if (saved) {
              const sel = window.getSelection()
              sel.removeAllRanges()
              sel.addRange(saved)
            }
            document.execCommand('insertText', false, em)
            ed.syncText(el)
          },
        })
      },
    })
    cmds.push({ header: 'Actions' })
    cmds.push({
      label: 'Delete',
      desc: 'Remove this block',
      keywords: 'remove delete trash',
      hidden: true,
      iconEl: () => U.icon('trash', 16),
      action: b => ed.deleteBlocks([b.id]),
    })
    cmds.push({
      label: 'Duplicate',
      desc: 'Copy this block below',
      keywords: 'duplicate copy',
      hidden: true,
      iconEl: () => U.icon('duplicate', 16),
      action: b => ed.duplicate([b.id]),
    })
    cmds.push({
      label: 'Move to',
      desc: 'Send this block to another page',
      keywords: 'move send',
      hidden: true,
      iconEl: () => U.icon('moveTo', 16),
      action: b =>
        UI.pagePicker(ed.blockEl(b.id), {
          title: 'Move block to…',
          filter: p => p.id !== ed.pageId && p.type !== 'database',
          onSelect: p => ed.moveBlocksToPage([b.id], p.id),
        }),
    })
    UI.COLORS.forEach(c => {
      if (c === 'default') return
      ;[['c-', ''], ['bg-', ' background']].forEach(pair => {
        cmds.push({
          label: UI.colorLabel(c) + pair[1],
          desc: pair[1] ? 'Highlight the block' : 'Color the text',
          keywords: 'color colour ' + c + (pair[1] ? ' background highlight' : ' text'),
          hidden: true,
          iconEl: () => h('span.color-swatch', { class: pair[0] + c, text: 'A' }),
          action: b => {
            b.color = pair[0] + c
            ed.changed()
            ed.renderBlocks()
            ed.focus(b.id, 'end')
          },
        })
      })
    })
    return cmds
  }

  function dateNode(iso) {
    const s = document.createElement('span')
    s.className = 'mention mention-date'
    s.setAttribute('data-date', iso)
    s.setAttribute('contenteditable', 'false')
    s.textContent = '@' + U.formatDate(iso)
    return s
  }

  function mentionItems(ed, q) {
    const items = []
    const insertPage = p => (b, el) => {
      const a = document.createElement('a')
      a.className = 'mention mention-page'
      a.setAttribute('data-page-id', p.id)
      a.setAttribute('href', '#/p/' + p.id)
      a.setAttribute('contenteditable', 'false')
      a.textContent = (p.icon ? p.icon + ' ' : '') + S.pageTitle(p)
      ed.insertInline(el, a)
    }
    const res = S.search(q, 6).filter(r => !r.page.isRow || q)
    items.push({ header: 'Link to page' })
    res.forEach(r => {
      items.push({
        label: S.pageTitle(r.page),
        desc: S.ancestors(r.page.id).map(a => S.pageTitle(a)).join(' / '),
        iconEl: () => (r.page.icon ? h('span.menu-emoji', { text: r.page.icon }) : U.icon(r.page.type === 'database' ? 'database' : 'page', 16)),
        action: insertPage(r.page),
      })
    })
    if (q.trim()) {
      items.push({
        label: '+ New “' + q.trim() + '” sub-page',
        iconEl: () => U.icon('plus', 16),
        action: (b, el) => {
          const p = S.createPage({ title: q.trim(), parentId: ed.pageId, detached: true })
          ed.page.blocks.push(S.newBlock('page', { pageId: p.id }))
          insertPage(p)(b, el)
          ed.changed(true)
          ed.renderBlocks()
        },
      })
    }
    items.push({ header: 'Date' })
    const d = new Date()
    const dates = [['Today', 0], ['Tomorrow', 1], ['Yesterday', -1]]
    dates
      .filter(x => !q || x[0].toLowerCase().indexOf(q.toLowerCase()) === 0)
      .forEach(x => {
        const dd = new Date(d)
        dd.setDate(d.getDate() + x[1])
        const iso = U.toISODate(dd)
        items.push({
          label: x[0],
          desc: U.formatDate(iso),
          iconEl: () => U.icon('calendar', 16),
          action: (b, el) => ed.insertInline(el, dateNode(iso)),
        })
      })
    if (items[items.length - 1].header) items.pop()
    return items
  }

  // ------------------------------------------------------------------ inline code
  function toggleInlineCode(textEl) {
    const sel = window.getSelection()
    if (!sel.rangeCount) return
    const r = sel.getRangeAt(0)
    const common = r.commonAncestorContainer
    const anc = (common.nodeType === 1 ? common : common.parentElement).closest('code')
    if (anc && textEl.contains(anc)) {
      unwrap(anc)
      return
    }
    if (r.collapsed) return
    const text = r.toString()
    r.deleteContents()
    const code = document.createElement('code')
    code.textContent = text
    r.insertNode(code)
    const nr = document.createRange()
    nr.selectNodeContents(code)
    sel.removeAllRanges()
    sel.addRange(nr)
  }

  function applyColor(range, cls) {
    const frag = range.extractContents()
    frag.querySelectorAll('span').forEach(s => {
      if (/(^|\s)(c|bg)-/.test(s.className)) unwrap(s)
    })
    let node = frag
    let span = null
    if (cls) {
      span = document.createElement('span')
      span.className = cls
      span.appendChild(frag)
      node = span
    }
    const first = node.firstChild
    const last = node.lastChild
    range.insertNode(node)
    const sel = window.getSelection()
    const nr = document.createRange()
    if (span) nr.selectNodeContents(span)
    else if (first && last) {
      nr.setStartBefore(first)
      nr.setEndAfter(last)
    }
    sel.removeAllRanges()
    sel.addRange(nr)
  }

  // ------------------------------------------------------------------ formatting toolbar
  const Toolbar = {
    el: null,
    lock: false,
    mouseDown: false,
    build() {
      const btn = (icon, title, fn, cls) =>
        h('button.tb-btn', { class: cls || null, title, onMousedown: e => e.preventDefault(), onClick: e => fn(e.currentTarget) }, icon)
      const txt = (s, style) => h('span.tb-txt', { text: s, style: style || null })
      this.typeBtn = btn(h('span.tb-type', null, h('span.tb-type-label', { text: 'Text' }), U.icon('chevronDown', 12)), 'Turn into', b => this.turnInto(b), 'tb-wide')
      this.boldBtn = btn(txt('B', { fontWeight: '700' }), 'Bold · ' + U.modKey + 'B', () => this.exec('bold'))
      this.italicBtn = btn(txt('i', { fontStyle: 'italic', fontFamily: 'Georgia, serif' }), 'Italic · ' + U.modKey + 'I', () => this.exec('italic'))
      this.underlineBtn = btn(txt('U', { textDecoration: 'underline' }), 'Underline · ' + U.modKey + 'U', () => this.exec('underline'))
      this.strikeBtn = btn(txt('S', { textDecoration: 'line-through' }), 'Strikethrough · ' + U.modKey + 'Shift+S', () => this.exec('strikeThrough'))
      this.codeBtn = btn(U.icon('code', 15), 'Inline code · ' + U.modKey + 'E', () => this.code())
      this.linkBtn = btn(h('span.tb-type', null, U.icon('link', 15), txt('Link')), 'Link · ' + U.modKey + 'K', b => this.link(this.editor, this.textEl, b), 'tb-wide')
      this.colorBtn = btn(h('span.tb-type', null, txt('A', { textDecoration: 'underline', fontWeight: '600' }), U.icon('chevronDown', 12)), 'Text color', b => this.color(b), 'tb-wide')
      this.el = h(
        'div.format-bar',
        { onMousedown: e => e.preventDefault() },
        this.typeBtn,
        h('span.tb-sep'),
        this.linkBtn,
        h('span.tb-sep'),
        this.boldBtn,
        this.italicBtn,
        this.underlineBtn,
        this.strikeBtn,
        this.codeBtn,
        h('span.tb-sep'),
        this.colorBtn
      )
      document.body.appendChild(this.el)
    },
    update() {
      if (this.lock) return
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount || sel.isCollapsed || this.mouseDown) return this.hide()
      const r = sel.getRangeAt(0)
      const node = r.commonAncestorContainer
      const elNode = node.nodeType === 1 ? node : node.parentElement
      const textEl = elNode && elNode.closest('.block-text')
      if (!textEl || textEl.classList.contains('code-text') || !textEl.isContentEditable) return this.hide()
      const edRoot = textEl.closest('.editor')
      if (!edRoot || !edRoot._editor) return this.hide()
      if (!r.toString().trim()) return this.hide()
      this.editor = edRoot._editor
      this.textEl = textEl
      if (!this.el) this.build()
      const b = this.editor.blockOfEl(textEl)
      this.typeBtn.querySelector('.tb-type-label').textContent = (b && INFO[b.type] && INFO[b.type].label) || 'Text'
      this.typeBtn.style.display = textEl.classList.contains('image-caption') ? 'none' : ''
      const st = c => {
        try {
          return document.queryCommandState(c)
        } catch (e) {
          return false
        }
      }
      this.boldBtn.classList.toggle('on', st('bold'))
      this.italicBtn.classList.toggle('on', st('italic'))
      this.underlineBtn.classList.toggle('on', st('underline'))
      this.strikeBtn.classList.toggle('on', st('strikeThrough'))
      this.codeBtn.classList.toggle('on', !!elNode.closest('code'))
      this.el.style.display = 'flex'
      const rect = r.getBoundingClientRect()
      const w = this.el.offsetWidth
      const left = U.clamp(rect.left, 8, innerWidth - w - 8)
      let top = rect.top - this.el.offsetHeight - 8
      if (top < 8) top = rect.bottom + 8
      this.el.style.left = left + 'px'
      this.el.style.top = top + 'px'
    },
    hide() {
      if (this.el) this.el.style.display = 'none'
    },
    sync() {
      if (this.editor && this.textEl) {
        const now = Date.now()
        this.editor.checkpoint()
        this.editor.lastInput = now
        this.editor.syncText(this.textEl)
      }
    },
    exec(cmd) {
      document.execCommand(cmd)
      this.sync()
      this.update()
    },
    code() {
      toggleInlineCode(this.textEl)
      this.sync()
      this.update()
    },
    saveRange() {
      const r = U.getSelectionRange()
      return r ? r.cloneRange() : null
    },
    restore(textEl, range) {
      textEl.focus({ preventScroll: true })
      if (range) {
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
      }
    },
    link(editor, textEl, anchor) {
      this.editor = editor
      this.textEl = textEl
      const range = this.saveRange()
      if (!range) return
      const rect = range.getBoundingClientRect()
      const existing = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement).closest('a')
      this.lock = true
      UI.inputPopover(anchor || rect, {
        value: existing ? existing.getAttribute('href') : '',
        placeholder: 'Paste a link, or search pages…',
        button: 'Link',
        onSubmit: v => {
          this.lock = false
          this.restore(textEl, range)
          const found = !U.safeUrl(v) && v.trim() ? S.search(v, 1)[0] : null
          if (found) {
            document.execCommand('createLink', false, '#/p/' + found.page.id)
          } else {
            const url = U.safeUrl(v)
            if (url) document.execCommand('createLink', false, url)
            else document.execCommand('unlink')
          }
          this.sync()
        },
        onClose: () => {
          this.lock = false
        },
      })
    },
    color(anchor) {
      const range = this.saveRange()
      const textEl = this.textEl
      if (!range) return
      this.lock = true
      UI.menu(anchor, UI.colorItems('', cls => {
        this.lock = false
        this.restore(textEl, range)
        applyColor(range, cls)
        this.sync()
      }), {
        width: 220,
        onClose: () => {
          setTimeout(() => {
            this.lock = false
          }, 0)
        },
      })
    },
    turnInto(anchor) {
      const ed = this.editor
      const b = ed.blockOfEl(this.textEl)
      if (!b) return
      this.lock = true
      UI.menu(anchor, [{ header: 'Turn into' }].concat(
        TURN_INTO.map(t => ({
          label: INFO[t].label,
          icon: glyphIcon(t),
          checked: b.type === t,
          onClick: () => {
            this.lock = false
            this.hide()
            ed.turnInto(b.id, t)
          },
        }))
      ), {
        width: 240,
        onClose: () => {
          setTimeout(() => {
            this.lock = false
          }, 0)
        },
      })
    },
  }

  document.addEventListener('selectionchange', () => requestAnimationFrame(() => Toolbar.update()))
  document.addEventListener('mousedown', e => {
    if (!Toolbar.el || !Toolbar.el.contains(e.target)) {
      Toolbar.mouseDown = true
      if (!Toolbar.lock) Toolbar.hide()
    }
  })
  document.addEventListener('mouseup', () => {
    Toolbar.mouseDown = false
    setTimeout(() => Toolbar.update(), 0)
  })

  // Keyboard handling while blocks are selected (focus is outside any editable).
  document.addEventListener('keydown', e => {
    const ed = activeEditor
    if (!ed || !ed.selected.size || isEditable(e.target) || UI.anyOpen()) return
    if (ed.onSelectionKey(e)) e.stopPropagation()
  })
  document.addEventListener('mousedown', e => {
    instances.forEach(ed => {
      if (ed.selected.size && !ed.root.contains(e.target) && !e.target.closest('.popover, .format-bar')) ed.clearSelection()
    })
  })

  F.editor = {
    Editor,
    INFO,
    active: () => activeEditor,
    instances,
    hasText,
  }
})(window.Folio)
