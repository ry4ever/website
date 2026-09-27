/* Folio — UI primitives: popovers, menus, modals, toasts, pickers. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const h = U.h
  const UI = (F.ui = {})

  UI.COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']
  UI.colorLabel = c => (c === 'default' ? 'Default' : c[0].toUpperCase() + c.slice(1))

  UI.COVERS = [
    { id: 'dawn', css: 'linear-gradient(120deg, #f6d5c3 0%, #f3a683 45%, #e97b73 100%)' },
    { id: 'ocean', css: 'linear-gradient(135deg, #1f4e79 0%, #2e86ab 50%, #7cc6de 100%)' },
    { id: 'forest', css: 'linear-gradient(135deg, #1d3b2a 0%, #3f7d4e 55%, #a5c882 100%)' },
    { id: 'dusk', css: 'linear-gradient(135deg, #2b2253 0%, #6b3f8c 50%, #e0859a 100%)' },
    { id: 'sand', css: 'linear-gradient(135deg, #efe3c8 0%, #d9b98c 60%, #b98b5e 100%)' },
    { id: 'berry', css: 'linear-gradient(135deg, #5b1a3a 0%, #b23a6f 55%, #f4a3b8 100%)' },
    { id: 'mint', css: 'linear-gradient(135deg, #d8f3e8 0%, #88d8b8 50%, #3aa58a 100%)' },
    { id: 'slate', css: 'linear-gradient(135deg, #2f3542 0%, #57606f 50%, #a4b0be 100%)' },
    { id: 'sunset', css: 'linear-gradient(180deg, #ffb88c 0%, #de6262 100%)' },
    { id: 'lagoon', css: 'linear-gradient(90deg, #43cea2 0%, #185a9d 100%)' },
    { id: 'peach', css: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
    { id: 'night', css: 'radial-gradient(circle at 20% 30%, #3a4a8a 0%, #141a33 60%, #07091a 100%)' },
    { id: 'solid-red', css: '#e16259' },
    { id: 'solid-yellow', css: '#f5c451' },
    { id: 'solid-blue', css: '#4a8fd9' },
    { id: 'solid-green', css: '#5aa872' },
    { id: 'solid-purple', css: '#9a6dd7' },
    { id: 'solid-gray', css: '#b8b5ad' },
  ]
  UI.coverCSS = function(cover) {
    if (!cover) return ''
    if (cover.type === 'image') return 'url("' + String(cover.value).replace(/"/g, '%22') + '")'
    const c = UI.COVERS.find(x => x.id === cover.value)
    return c ? c.css : UI.COVERS[0].css
  }
  UI.randomCover = function() {
    const c = UI.COVERS[Math.floor(Math.random() * 12)]
    return { type: 'gradient', value: c.id, pos: 50 }
  }

  function layer() {
    return document.getElementById('overlay-root') || document.body
  }

  // ---------------- Popover stack ----------------
  const stack = []
  UI.stack = stack
  let lastClosed = { anchor: null, t: 0 }

  document.addEventListener(
    'mousedown',
    e => {
      for (let i = stack.length - 1; i >= 0; i--) {
        const p = stack[i]
        if (p.el.contains(e.target)) break
        if (p.modal) break
        if (p.anchorEl && p.anchorEl.contains(e.target)) lastClosed = { anchor: p.anchorEl, t: Date.now() }
        p.close()
      }
    },
    true
  )

  document.addEventListener(
    'keydown',
    e => {
      if (e.key === 'Escape' && stack.length) {
        const top = stack[stack.length - 1]
        if (top.noEscape) return
        e.preventDefault()
        e.stopPropagation()
        top.close()
      }
    },
    true
  )

  window.addEventListener('resize', () => stack.forEach(p => p.reposition && p.reposition()))

  UI.closeAll = function() {
    for (let i = stack.length - 1; i >= 0; i--) stack[i].close()
  }
  UI.anyOpen = () => stack.length > 0

  function anchorRect(anchor) {
    if (!anchor) return { left: innerWidth / 2, top: innerHeight / 3, right: innerWidth / 2, bottom: innerHeight / 3, width: 0, height: 0 }
    if (anchor.getBoundingClientRect) return anchor.getBoundingClientRect()
    if (anchor.x != null && anchor.width == null)
      return { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 }
    return anchor
  }

  UI.popover = function(anchor, content, opts) {
    opts = opts || {}
    const anchorEl = anchor && anchor.nodeType === 1 ? anchor : null
    if (anchorEl && lastClosed.anchor === anchorEl && Date.now() - lastClosed.t < 400) {
      lastClosed = { anchor: null, t: 0 }
      return null
    }
    const el = h('div.popover', { class: opts.className || null, role: 'dialog' }, content)
    if (opts.width) el.style.width = opts.width + 'px'
    layer().appendChild(el)
    const api = {
      el,
      anchorEl,
      closed: false,
      noEscape: !!opts.noEscape,
      close() {
        if (api.closed) return
        api.closed = true
        const i = stack.indexOf(api)
        if (i >= 0) stack.splice(i, 1)
        el.remove()
        if (opts.onClose) opts.onClose()
      },
      reposition() {
        const r = anchorRect(anchor)
        const pw = el.offsetWidth
        const ph = el.offsetHeight
        const gap = opts.offset == null ? 4 : opts.offset
        const place = opts.placement || 'bottom-start'
        let left
        let top
        if (place.indexOf('right') === 0) {
          left = r.right + gap
          top = r.top - 6
          if (left + pw > innerWidth - 8) left = r.left - pw - gap
        } else if (place.indexOf('left') === 0) {
          left = r.left - pw - gap
          top = r.top
        } else {
          left = place.indexOf('end') !== -1 ? r.right - pw : place.indexOf('center') !== -1 ? r.left + r.width / 2 - pw / 2 : r.left
          top = place.indexOf('top') === 0 ? r.top - ph - gap : r.bottom + gap
          if (place.indexOf('top') !== 0 && top + ph > innerHeight - 8 && r.top - ph - gap > 8) top = r.top - ph - gap
          if (place.indexOf('top') === 0 && top < 8) top = r.bottom + gap
        }
        left = U.clamp(left, 8, Math.max(8, innerWidth - pw - 8))
        top = U.clamp(top, 8, Math.max(8, innerHeight - ph - 8))
        el.style.left = Math.round(left) + 'px'
        el.style.top = Math.round(top) + 'px'
      },
    }
    stack.push(api)
    api.reposition()
    requestAnimationFrame(() => {
      if (!api.closed) api.reposition()
    })
    if (opts.autofocus !== false) {
      const f = el.querySelector('[autofocus], input, textarea')
      if (f) setTimeout(() => f.focus(), 0)
      else if (opts.focusSelf) {
        el.tabIndex = -1
        setTimeout(() => el.focus({ preventScroll: true }), 0)
      }
    }
    return api
  }

  // ---------------- Menus ----------------
  function iconNode(icon) {
    if (!icon) return null
    if (icon.nodeType) return icon
    if (U.icons[icon]) return U.icon(icon, 16)
    return h('span.menu-emoji', { text: icon })
  }

  UI.menu = function(anchor, items, opts) {
    opts = opts || {}
    let active = -1
    let sub = null
    let subTimer = null
    const list = h('div.menu-list')
    const search = opts.search
      ? h('input.menu-search', { placeholder: opts.searchPlaceholder || 'Search…', autofocus: true })
      : null
    const root = h('div.menu', null, search, list)
    let rows = []

    function build() {
      list.innerHTML = ''
      rows = []
      const q = search ? search.value.trim().toLowerCase() : ''
      const all = typeof items === 'function' ? items() : items
      let lastWasHeader = false
      all.forEach(it => {
        if (!it) return
        if (it.divider) {
          if (!q && list.lastChild && !lastWasHeader) list.appendChild(h('div.menu-divider'))
          return
        }
        if (it.header) {
          if (!q) {
            list.appendChild(h('div.menu-header', { text: it.header }))
            lastWasHeader = true
          }
          return
        }
        if (it.render) {
          list.appendChild(it.render())
          return
        }
        if (q && (it.label + ' ' + (it.keywords || '')).toLowerCase().indexOf(q) === -1) return
        lastWasHeader = false
        const row = h(
          'div.menu-item',
          {
            class: (it.danger ? 'danger ' : '') + (it.disabled ? 'disabled' : ''),
            role: 'menuitem',
            onMouseenter() {
              setActive(rows.indexOf(row), true)
            },
            onClick(e) {
              e.stopPropagation()
              activate(row)
            },
          },
          iconNode(it.icon),
          h('span.menu-label', { text: it.label }),
          it.hint ? h('span.menu-hint', { text: it.hint }) : null,
          it.checked ? U.icon('check', 14) : null,
          it.submenu ? U.icon('chevronRight', 14) : null
        )
        row._item = it
        rows.push(row)
        list.appendChild(row)
      })
      if (!rows.length) list.appendChild(h('div.menu-empty', { text: 'No results' }))
      if (list.lastChild && list.lastChild.className === 'menu-divider') list.lastChild.remove()
      setActive(opts.search || opts.keyboard ? 0 : -1)
    }

    function setActive(i, fromHover) {
      rows.forEach(r => r.classList.remove('active'))
      active = i
      const row = rows[i]
      if (!row) return
      row.classList.add('active')
      if (!fromHover) row.scrollIntoView({ block: 'nearest' })
      clearTimeout(subTimer)
      if (fromHover) {
        if (row._item.submenu) subTimer = setTimeout(() => openSub(row), 120)
        else if (sub) {
          sub.close()
          sub = null
        }
      }
    }

    function openSub(row) {
      if (sub && sub.row === row) return
      if (sub) sub.close()
      const s = UI.menu(row, row._item.submenu(), {
        placement: 'right-start',
        keyboard: true,
        width: row._item.subWidth,
        onClose() {
          if (sub === s) sub = null
          if (!api.closed) api.el.focus({ preventScroll: true })
        },
      })
      if (s) s.row = row
      sub = s
    }

    function activate(row) {
      if (!row) return
      const it = row._item
      if (it.disabled) return
      if (it.submenu) return openSub(row)
      if (!it.keepOpen) closeAll()
      if (it.onClick) it.onClick()
      if (it.keepOpen) build()
    }

    function closeAll() {
      if (sub) sub.close()
      api.close()
      if (opts.parentClose) opts.parentClose()
    }

    function onKey(e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive(active < rows.length - 1 ? active + 1 : 0)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(active > 0 ? active - 1 : rows.length - 1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        activate(rows[active])
      } else if (e.key === 'ArrowRight' && rows[active] && rows[active]._item.submenu) {
        e.preventDefault()
        openSub(rows[active])
      } else if (e.key === 'ArrowLeft' && opts.placement === 'right-start') {
        e.preventDefault()
        api.close()
      }
      e.stopPropagation()
    }
    if (search) search.addEventListener('input', build)

    build()
    const api = UI.popover(anchor, root, {
      placement: opts.placement,
      className: 'menu-pop ' + (opts.className || ''),
      width: opts.width || 260,
      onClose: () => {
        if (sub) sub.close()
        if (opts.onClose) opts.onClose()
      },
      focusSelf: true,
    })
    if (!api) return null
    api.el.addEventListener('keydown', onKey)
    api.rebuild = build
    return api
  }

  UI.contextMenu = function(e, items, opts) {
    e.preventDefault()
    return UI.menu({ x: e.clientX, y: e.clientY }, items, opts)
  }

  // ---------------- Modal ----------------
  UI.modal = function(content, opts) {
    opts = opts || {}
    const box = h('div.modal', { class: opts.className || null, role: 'dialog', 'aria-modal': 'true' }, content)
    if (opts.width) box.style.width = opts.width + 'px'
    const backdrop = h('div.modal-backdrop', {
      class: opts.top ? 'top' : null,
      onMousedown(e) {
        if (e.target === backdrop) api.close()
      },
    }, box)
    layer().appendChild(backdrop)
    const api = {
      el: box,
      modal: true,
      closed: false,
      close() {
        if (api.closed) return
        api.closed = true
        const i = stack.indexOf(api)
        if (i >= 0) stack.splice(i, 1)
        backdrop.classList.add('closing')
        setTimeout(() => backdrop.remove(), 120)
        if (opts.onClose) opts.onClose()
      },
    }
    stack.push(api)
    setTimeout(() => {
      const f = box.querySelector('[autofocus]') || box.querySelector('input')
      if (f) f.focus()
      else {
        box.tabIndex = -1
        box.focus({ preventScroll: true })
      }
    }, 0)
    return api
  }

  UI.confirm = function(message, opts) {
    opts = opts || {}
    return new Promise(resolve => {
      let done = false
      const finish = v => {
        if (done) return
        done = true
        m.close()
        resolve(v)
      }
      const m = UI.modal(
        h(
          'div.confirm',
          null,
          h('div.confirm-title', { text: opts.title || 'Are you sure?' }),
          message ? h('div.confirm-body', { text: message }) : null,
          h(
            'div.confirm-actions',
            null,
            h('button.btn', { onClick: () => finish(false) }, opts.cancel || 'Cancel'),
            h(
              'button.btn',
              { class: opts.danger ? 'btn-danger' : 'btn-primary', autofocus: true, onClick: () => finish(true) },
              opts.ok || 'Confirm'
            )
          )
        ),
        { width: 380, onClose: () => finish(false), top: true }
      )
    })
  }

  // ---------------- Toast ----------------
  UI.toast = function(message, opts) {
    opts = opts || {}
    let wrap = document.getElementById('toasts')
    if (!wrap) {
      wrap = h('div.toasts')
      wrap.id = 'toasts'
      document.body.appendChild(wrap)
    }
    const t = h(
      'div.toast',
      null,
      h('span', { text: message }),
      opts.action
        ? h('button.toast-action', {
            text: opts.action.label,
            onClick() {
              opts.action.onClick()
              t.remove()
            },
          })
        : null
    )
    wrap.appendChild(t)
    setTimeout(() => t.classList.add('out'), opts.duration || 3200)
    setTimeout(() => t.remove(), (opts.duration || 3200) + 300)
  }

  // ---------------- Small inputs ----------------
  UI.inputPopover = function(anchor, opts) {
    const input = h('input.pop-input', {
      value: opts.value || '',
      placeholder: opts.placeholder || '',
      autofocus: true,
    })
    const extra = opts.extra ? opts.extra() : null
    const btn = opts.button ? h('button.btn.btn-primary.btn-sm', { text: opts.button, onClick: submit }) : null
    function submit() {
      p.close()
      opts.onSubmit(input.value)
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
      e.stopPropagation()
    })
    const p = UI.popover(anchor, h('div.input-pop', null, opts.label ? h('div.pop-label', { text: opts.label }) : null, h('div.input-pop-row', null, input, btn), extra), {
      placement: opts.placement || 'bottom-start',
      width: opts.width || 320,
      onClose: opts.onClose,
    })
    if (p) setTimeout(() => input.select(), 10)
    return p
  }

  // ---------------- Emoji picker ----------------
  function recentEmojis() {
    try {
      return JSON.parse(localStorage.getItem('folio.recentEmoji') || '[]')
    } catch (e) {
      return []
    }
  }
  function pushRecentEmoji(e) {
    const r = [e].concat(recentEmojis().filter(x => x !== e)).slice(0, 16)
    try {
      localStorage.setItem('folio.recentEmoji', JSON.stringify(r))
    } catch (err) {
      /* ignore */
    }
  }

  UI.emojiPicker = function(anchor, opts) {
    const input = h('input.emoji-search', { placeholder: 'Filter…', autofocus: true })
    const grid = h('div.emoji-scroll')
    let p
    function pick(e) {
      pushRecentEmoji(e)
      p.close()
      opts.onSelect(e)
    }
    function cell(it) {
      return h('button.emoji-cell', { title: it.n, text: it.e, onClick: () => pick(it.e) })
    }
    function render() {
      grid.innerHTML = ''
      const q = input.value.trim()
      if (q) {
        const res = F.emoji.search(q)
        grid.appendChild(h('div.emoji-cat', { text: res.length ? 'Results' : 'No emoji found' }))
        grid.appendChild(h('div.emoji-grid', null, res.slice(0, 400).map(cell)))
        return
      }
      const rec = recentEmojis()
      if (rec.length) {
        grid.appendChild(h('div.emoji-cat', { text: 'Recent' }))
        grid.appendChild(h('div.emoji-grid', null, rec.map(e => cell({ e, n: e }))))
      }
      F.emoji.categories.forEach(c => {
        grid.appendChild(h('div.emoji-cat', { text: c.name }))
        grid.appendChild(h('div.emoji-grid', null, c.items.map(cell)))
      })
    }
    input.addEventListener('input', render)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const first = grid.querySelector('.emoji-cell')
        if (first) pick(first.textContent)
      }
      e.stopPropagation()
    })
    render()
    const header = h(
      'div.emoji-head',
      null,
      h('div.emoji-tabs', null, h('span.emoji-tab.active', { text: 'Emoji' })),
      h(
        'div.emoji-actions',
        null,
        h('button.btn-ghost', {
          title: 'Random',
          onClick() {
            pick(F.emoji.random())
          },
        }, U.icon('refresh', 14), ' Random'),
        opts.onRemove
          ? h('button.btn-ghost', {
              onClick() {
                p.close()
                opts.onRemove()
              },
            }, 'Remove')
          : null
      )
    )
    p = UI.popover(anchor, h('div.emoji-picker', null, header, h('div.emoji-search-row', null, input), grid), {
      placement: opts.placement || 'bottom-start',
      width: 408,
    })
    return p
  }

  // ---------------- Cover picker ----------------
  UI.coverPicker = function(anchor, opts) {
    let tab = 'gallery'
    const body = h('div.cover-body')
    const tabs = h('div.cover-tabs')
    let p
    function done(cover) {
      p.close()
      opts.onSelect(cover)
    }
    function renderTabs() {
      tabs.innerHTML = ''
      ;[['gallery', 'Gallery'], ['upload', 'Upload'], ['link', 'Link']].forEach(t => {
        tabs.appendChild(
          h('button.cover-tab', {
            class: tab === t[0] ? 'active' : null,
            text: t[1],
            onClick() {
              tab = t[0]
              renderTabs()
              renderBody()
            },
          })
        )
      })
      tabs.appendChild(h('div.spacer'))
      if (opts.onRemove)
        tabs.appendChild(
          h('button.btn-ghost', {
            text: 'Remove',
            onClick() {
              p.close()
              opts.onRemove()
            },
          })
        )
    }
    function renderBody() {
      body.innerHTML = ''
      if (tab === 'gallery') {
        body.appendChild(h('div.cover-section', { text: 'Gradients' }))
        body.appendChild(
          h('div.cover-grid', null, UI.COVERS.slice(0, 12).map(c =>
            h('button.cover-swatch', { style: { background: c.css }, title: c.id, onClick: () => done({ type: 'gradient', value: c.id, pos: 50 }) })
          ))
        )
        body.appendChild(h('div.cover-section', { text: 'Colors' }))
        body.appendChild(
          h('div.cover-grid', null, UI.COVERS.slice(12).map(c =>
            h('button.cover-swatch', { style: { background: c.css }, title: c.id, onClick: () => done({ type: 'gradient', value: c.id, pos: 50 }) })
          ))
        )
      } else if (tab === 'upload') {
        const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } })
        file.addEventListener('change', () => {
          const f = file.files[0]
          if (!f) return
          U.compressImage(f, 1800).then(url => done({ type: 'image', value: url, pos: 50 }))
        })
        body.appendChild(
          h('div.upload-zone', null, file,
            h('button.btn.btn-block', { onClick: () => file.click() }, 'Upload file'),
            h('div.muted.small', { text: 'Images wider than 1500 pixels work best.' })
          )
        )
      } else {
        const input = h('input.pop-input', { placeholder: 'Paste an image link…', autofocus: true })
        const submit = () => {
          const url = U.safeUrl(input.value)
          if (url) done({ type: 'image', value: url, pos: 50 })
          else UI.toast('That doesn’t look like a valid link')
        }
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') submit()
          e.stopPropagation()
        })
        body.appendChild(h('div.link-zone', null, input, h('button.btn.btn-primary.btn-block', { onClick: submit }, 'Submit'), h('div.muted.small', { text: 'Works with any image from the web.' })))
        setTimeout(() => input.focus(), 0)
      }
    }
    renderTabs()
    renderBody()
    p = UI.popover(anchor, h('div.cover-picker', null, tabs, body), { placement: opts.placement || 'bottom-end', width: 480 })
    return p
  }

  // ---------------- Date picker ----------------
  UI.datePicker = function(anchor, value, onChange) {
    const sel = U.parseISODate(value)
    let view = sel ? new Date(sel.getFullYear(), sel.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const input = h('input.pop-input', { value: value ? U.formatDate(value) : '', placeholder: 'Type a date…' })
    const cal = h('div.dp-cal')
    let p
    function set(v) {
      onChange(v)
      p.close()
    }
    input.addEventListener('keydown', e => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        const d = new Date(input.value)
        if (!isNaN(d)) set(U.toISODate(d))
      }
    })
    function render() {
      cal.innerHTML = ''
      const head = h(
        'div.dp-head',
        null,
        h('span.dp-title', { text: U.MONTHS[view.getMonth()].slice(0, 3) + ' ' + view.getFullYear() }),
        h('div.spacer'),
        h('button.btn-icon', { title: 'Today', onClick: () => { view = new Date(new Date().getFullYear(), new Date().getMonth(), 1); render() } }, h('span.small', { text: 'Today' })),
        h('button.btn-icon', { onClick: () => { view.setMonth(view.getMonth() - 1); render() } }, U.icon('chevronLeft', 14)),
        h('button.btn-icon', { onClick: () => { view.setMonth(view.getMonth() + 1); render() } }, U.icon('chevronRight', 14))
      )
      cal.appendChild(head)
      const grid = h('div.dp-grid')
      ;['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => grid.appendChild(h('div.dp-dow', { text: d })))
      const first = new Date(view)
      first.setDate(1 - first.getDay())
      const todayIso = U.toISODate(new Date())
      for (let i = 0; i < 42; i++) {
        const d = new Date(first)
        d.setDate(first.getDate() + i)
        const iso = U.toISODate(d)
        grid.appendChild(
          h('button.dp-day', {
            class: [d.getMonth() !== view.getMonth() ? 'other' : '', iso === todayIso ? 'today' : '', iso === value ? 'selected' : ''].join(' '),
            text: d.getDate(),
            onClick: () => set(iso),
          })
        )
      }
      cal.appendChild(grid)
    }
    render()
    p = UI.popover(
      anchor,
      h('div.date-picker', null, h('div.dp-input', null, input), cal, h('div.dp-foot', null, h('button.btn-ghost', { text: 'Clear', onClick: () => set('') }))),
      { width: 268, autofocus: false }
    )
    return p
  }

  // ---------------- Page picker ----------------
  UI.pagePicker = function(anchor, opts) {
    const S = F.store
    const input = h('input.menu-search', { placeholder: opts.placeholder || 'Search pages…', autofocus: true })
    const list = h('div.menu-list')
    let active = 0
    let rows = []
    let p
    function render() {
      list.innerHTML = ''
      rows = []
      let results = S.search(input.value, 40).filter(r => !opts.filter || opts.filter(r.page))
      if (opts.extra) {
        opts.extra(input.value).forEach(x => {
          const row = h('div.menu-item', { onClick: () => { p.close(); x.onClick() } }, iconNode(x.icon), h('span.menu-label', { text: x.label }))
          row._run = x.onClick
          rows.push(row)
          list.appendChild(row)
        })
      }
      if (opts.header) list.appendChild(h('div.menu-header', { text: opts.header }))
      results.forEach(r => {
        const pg = r.page
        const crumbs = S.ancestors(pg.id).map(a => S.pageTitle(a)).join(' / ')
        const row = h(
          'div.menu-item',
          { onClick: () => choose(pg) },
          pg.icon ? h('span.menu-emoji', { text: pg.icon }) : U.icon(pg.type === 'database' ? 'database' : 'page', 16),
          h('span.menu-label', null, S.pageTitle(pg), crumbs ? h('span.menu-crumb', { text: ' — ' + crumbs }) : null)
        )
        row._page = pg
        rows.push(row)
        list.appendChild(row)
      })
      if (!rows.length) list.appendChild(h('div.menu-empty', { text: 'No pages found' }))
      setActive(0)
    }
    function setActive(i) {
      rows.forEach(r => r.classList.remove('active'))
      active = i
      if (rows[i]) {
        rows[i].classList.add('active')
        rows[i].scrollIntoView({ block: 'nearest' })
      }
    }
    function choose(pg) {
      p.close()
      opts.onSelect(pg)
    }
    input.addEventListener('input', render)
    input.addEventListener('keydown', e => {
      e.stopPropagation()
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive(Math.min(rows.length - 1, active + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(Math.max(0, active - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const r = rows[active]
        if (!r) return
        if (r._page) choose(r._page)
        else {
          p.close()
          r._run()
        }
      } else if (e.key === 'Escape') {
        p.close()
      }
    })
    render()
    p = UI.popover(anchor, h('div.menu', null, opts.title ? h('div.menu-header', { text: opts.title }) : null, input, list), {
      className: 'menu-pop',
      width: 340,
      placement: opts.placement,
    })
    return p
  }

  // Color menu items for text/background
  UI.colorItems = function(current, onPick) {
    const items = [{ header: 'Text color' }]
    UI.COLORS.forEach(c => {
      items.push({
        label: UI.colorLabel(c) + (c === 'default' ? '' : ''),
        icon: h('span.color-swatch', { class: 'c-' + c, text: 'A' }),
        checked: current === (c === 'default' ? '' : 'c-' + c),
        onClick: () => onPick(c === 'default' ? '' : 'c-' + c),
      })
    })
    items.push({ header: 'Background color' })
    UI.COLORS.forEach(c => {
      items.push({
        label: UI.colorLabel(c) + ' background',
        icon: h('span.color-swatch.bg', { class: 'bg-' + c, text: 'A' }),
        checked: current === (c === 'default' ? '' : 'bg-' + c),
        onClick: () => onPick(c === 'default' ? '' : 'bg-' + c),
      })
    })
    return items
  }
})(window.Folio)
