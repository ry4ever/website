/* Folio — shared utilities: DOM helpers, icons, caret handling, sanitizing. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = (F.util = {})

  U.uid = function() {
    return (
      Math.random()
        .toString(36)
        .slice(2, 9) + Date.now().toString(36).slice(-4)
    )
  }

  U.$ = (sel, root) => (root || document).querySelector(sel)
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel))

  function appendChildren(el, children) {
    for (const c of children) {
      if (c == null || c === false) continue
      if (Array.isArray(c)) appendChildren(el, c)
      else if (c instanceof Node) el.appendChild(c)
      else el.appendChild(document.createTextNode(String(c)))
    }
  }

  // Tiny hyperscript: h('div.a.b', { onClick, title }, child, ...)
  U.h = function(tag, attrs) {
    const children = Array.prototype.slice.call(arguments, 2)
    const parts = tag.split('.')
    const el = document.createElement(parts[0] || 'div')
    if (parts.length > 1) el.className = parts.slice(1).join(' ')
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k]
        if (v == null || v === false) continue
        if (k === 'class') el.className = el.className ? el.className + ' ' + v : v
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
        else if (k === 'dataset') Object.assign(el.dataset, v)
        else if (k === 'text') el.textContent = v
        else if (k === 'html') el.innerHTML = v
        else if (k === 'value') el.value = v
        else if (k.slice(0, 2) === 'on' && typeof v === 'function')
          el.addEventListener(k.slice(2).toLowerCase(), v)
        else el.setAttribute(k, v === true ? '' : v)
      }
    }
    appendChildren(el, children)
    return el
  }

  U.escapeHTML = function(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  U.htmlToText = function(html) {
    const t = document.createElement('template')
    t.innerHTML = html || ''
    return t.content.textContent.replace(/​/g, '')
  }

  U.debounce = function(fn, ms) {
    let t
    const d = function() {
      const args = arguments
      clearTimeout(t)
      t = setTimeout(() => fn.apply(null, args), ms)
    }
    d.flush = function() {
      clearTimeout(t)
      fn()
    }
    return d
  }

  U.clamp = (n, a, b) => Math.max(a, Math.min(b, n))

  U.isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  U.mod = e => (U.isMac ? e.metaKey : e.ctrlKey)
  U.modKey = U.isMac ? '⌘' : 'Ctrl+'

  U.timeAgo = function(ts) {
    const s = Math.round((Date.now() - ts) / 1000)
    if (s < 45) return 'just now'
    const m = Math.round(s / 60)
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago')
    const h = Math.round(m / 60)
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago')
    const d = Math.round(h / 24)
    if (d < 7) return d + (d === 1 ? ' day ago' : ' days ago')
    return U.formatDate(ts)
  }

  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  U.MONTHS = MONTHS

  // Accepts a timestamp or a YYYY-MM-DD string.
  U.formatDate = function(v, withTime) {
    if (!v) return ''
    const d = typeof v === 'string' ? U.parseISODate(v) : new Date(v)
    if (!d || isNaN(d)) return ''
    let out = MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ', ' + d.getFullYear()
    if (withTime) {
      let h = d.getHours()
      const ampm = h >= 12 ? 'PM' : 'AM'
      h = h % 12 || 12
      out += ' ' + h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ampm
    }
    return out
  }

  U.parseISODate = function(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
    if (!m) return null
    return new Date(+m[1], +m[2] - 1, +m[3])
  }

  U.toISODate = function(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    )
  }

  U.download = function(filename, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      URL.revokeObjectURL(a.href)
      a.remove()
    }, 100)
  }

  U.copyText = function(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
    }
    fallbackCopy(text)
    return Promise.resolve()
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
    } catch (e) {
      /* ignore */
    }
    ta.remove()
  }

  U.readFileAsDataURL = function(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(file)
    })
  }

  // Downscale big images so they fit comfortably in localStorage.
  U.compressImage = function(file, maxDim) {
    maxDim = maxDim || 1600
    return U.readFileAsDataURL(file).then(
      url =>
        new Promise(resolve => {
          if (file.type === 'image/gif' || file.type === 'image/svg+xml') return resolve(url)
          const img = new Image()
          img.onload = () => {
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
            const c = document.createElement('canvas')
            c.width = Math.round(img.width * scale)
            c.height = Math.round(img.height * scale)
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
            resolve(c.toDataURL('image/jpeg', 0.85))
          }
          img.onerror = () => resolve(url)
          img.src = url
        })
    )
  }

  U.safeUrl = function(url) {
    url = String(url || '').trim()
    if (!url) return ''
    if (/^(https?:|mailto:|#)/i.test(url)) return url
    if (/^data:image\//i.test(url)) return url
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(url)) return 'https://' + url
    return ''
  }

  // ---------- Sanitizing rich text ----------
  const ALLOWED = {
    B: 1,
    STRONG: 1,
    I: 1,
    EM: 1,
    U: 1,
    S: 1,
    STRIKE: 1,
    DEL: 1,
    CODE: 1,
    A: 1,
    SPAN: 1,
    BR: 1,
    MARK: 1,
  }
  const CLASS_OK = /^(c-[a-z]+|bg-[a-z]+|mention|mention-page|mention-date|inline-code)$/

  function cleanNode(node, doc) {
    const out = doc.createDocumentFragment()
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) {
        out.appendChild(doc.createTextNode(child.nodeValue))
      } else if (child.nodeType === 1) {
        const tag = child.tagName
        if (tag === 'DIV' || tag === 'P' || tag === 'LI') {
          // Collapse block-level wrappers into line breaks
          if (out.childNodes.length) out.appendChild(doc.createElement('br'))
          out.appendChild(cleanNode(child, doc))
        } else if (ALLOWED[tag]) {
          const el = doc.createElement(tag === 'STRIKE' || tag === 'DEL' ? 'S' : tag)
          if (tag === 'A') {
            const href = U.safeUrl(child.getAttribute('href'))
            if (href) el.setAttribute('href', href)
            const pid = child.getAttribute('data-page-id')
            if (pid && /^[\w-]+$/.test(pid)) {
              el.setAttribute('data-page-id', pid)
              el.setAttribute('contenteditable', 'false')
            }
          }
          if (tag === 'SPAN' && child.getAttribute('data-date')) {
            const dd = child.getAttribute('data-date')
            if (/^\d{4}-\d{2}-\d{2}$/.test(dd)) {
              el.setAttribute('data-date', dd)
              el.setAttribute('contenteditable', 'false')
            }
          }
          const cls = (child.getAttribute('class') || '')
            .split(/\s+/)
            .filter(c => CLASS_OK.test(c))
          if (cls.length) el.setAttribute('class', cls.join(' '))
          el.appendChild(cleanNode(child, doc))
          if (tag === 'SPAN' && !cls.length && !el.getAttribute('data-date')) {
            out.appendChild(cleanNode(child, doc))
          } else {
            out.appendChild(el)
          }
        } else if (tag !== 'SCRIPT' && tag !== 'STYLE' && tag !== 'TEMPLATE') {
          out.appendChild(cleanNode(child, doc))
        }
      }
    })
    return out
  }

  U.sanitize = function(html) {
    if (!html) return ''
    if (!/[<&]/.test(html)) return html
    const doc = document.implementation.createHTMLDocument('')
    const src = doc.createElement('div')
    src.innerHTML = html
    const dst = doc.createElement('div')
    dst.appendChild(cleanNode(src, doc))
    let out = dst.innerHTML
    if (out === '<br>') out = ''
    return out
  }

  // ---------- Caret helpers (offsets measured in textContent characters) ----------
  U.getSelectionRange = function() {
    const sel = window.getSelection()
    return sel && sel.rangeCount ? sel.getRangeAt(0) : null
  }

  U.getCaretOffset = function(el) {
    const r = U.getSelectionRange()
    if (!r || !el.contains(r.startContainer)) return -1
    const pre = document.createRange()
    pre.selectNodeContents(el)
    pre.setEnd(r.startContainer, r.startOffset)
    return pre.toString().length
  }

  U.getSelectionOffsets = function(el) {
    const r = U.getSelectionRange()
    if (!r || !el.contains(r.startContainer)) return null
    const pre = document.createRange()
    pre.selectNodeContents(el)
    pre.setEnd(r.startContainer, r.startOffset)
    const start = pre.toString().length
    return { start, end: start + r.toString().length }
  }

  function locate(el, offset) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null)
    let node
    let remaining = offset
    let last = null
    while ((node = walker.nextNode())) {
      const len = node.nodeValue.length
      if (remaining <= len) return { node, offset: remaining }
      remaining -= len
      last = node
    }
    if (last) return { node: last, offset: last.nodeValue.length }
    return { node: el, offset: el.childNodes.length }
  }

  U.rangeFromOffsets = function(el, start, end) {
    const r = document.createRange()
    const a = locate(el, start)
    const b = end === start ? a : locate(el, end)
    r.setStart(a.node, a.offset)
    r.setEnd(b.node, b.offset)
    return r
  }

  U.setCaret = function(el, offset, endOffset) {
    if (!el) return
    if (document.activeElement !== el) el.focus({ preventScroll: true })
    const len = el.textContent.length
    if (offset == null || offset < 0 || offset > len) offset = len
    if (endOffset == null) endOffset = offset
    const r = U.rangeFromOffsets(el, offset, Math.min(endOffset, len))
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
  }

  U.caretAtStart = function(el) {
    const r = U.getSelectionRange()
    return !!r && r.collapsed && U.getCaretOffset(el) === 0
  }

  U.caretAtEnd = function(el) {
    const r = U.getSelectionRange()
    return !!r && r.collapsed && U.getCaretOffset(el) === el.textContent.length
  }

  U.caretRect = function() {
    const r = U.getSelectionRange()
    if (!r) return null
    const rects = r.getClientRects()
    if (rects.length) return rects[rects.length - 1]
    // Collapsed caret in an empty node: measure with a temporary marker
    const span = document.createElement('span')
    span.textContent = '​'
    const clone = r.cloneRange()
    clone.insertNode(span)
    const rect = span.getBoundingClientRect()
    const parent = span.parentNode
    span.remove()
    if (parent) parent.normalize()
    return rect
  }

  // Is the caret on the first/last visual line of el?
  U.caretOnFirstLine = function(el) {
    if (!el.textContent.length) return true
    const cr = U.caretRect()
    if (!cr || (!cr.top && !cr.height)) return U.getCaretOffset(el) === 0
    const er = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight) || 24
    return cr.top - (er.top + (parseFloat(cs.paddingTop) || 0)) < lh * 0.8
  }
  U.caretOnLastLine = function(el) {
    if (!el.textContent.length) return true
    const cr = U.caretRect()
    if (!cr || (!cr.top && !cr.height)) return U.getCaretOffset(el) === el.textContent.length
    const er = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight) || 24
    return er.bottom - (parseFloat(cs.paddingBottom) || 0) - cr.bottom < lh * 0.8
  }

  // Place caret in el at the given client X on its first/last line.
  U.caretFromPoint = function(el, x, atEnd) {
    const r = el.getBoundingClientRect()
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 24
    const y = atEnd ? r.bottom - lh / 2 : r.top + lh / 2
    let pos = null
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y)
      if (range && el.contains(range.startContainer)) pos = range
    } else if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y)
      if (p && el.contains(p.offsetNode)) {
        pos = document.createRange()
        pos.setStart(p.offsetNode, p.offset)
      }
    }
    el.focus({ preventScroll: true })
    if (pos) {
      pos.collapse(true)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(pos)
    } else {
      U.setCaret(el, atEnd ? el.textContent.length : 0)
    }
  }

  // Split the HTML of el at the current caret into [before, after].
  U.splitAtCaret = function(el) {
    const r = U.getSelectionRange()
    if (!r || !el.contains(r.startContainer)) return [el.innerHTML, '']
    if (!r.collapsed) r.deleteContents()
    const before = document.createRange()
    before.selectNodeContents(el)
    before.setEnd(r.startContainer, r.startOffset)
    const after = document.createRange()
    after.selectNodeContents(el)
    after.setStart(r.startContainer, r.startOffset)
    const div = document.createElement('div')
    div.appendChild(before.cloneContents())
    const a = div.innerHTML
    div.innerHTML = ''
    div.appendChild(after.cloneContents())
    const b = div.innerHTML
    return [a, b]
  }

  U.scrollIntoViewIfNeeded = function(el, container) {
    if (!el) return
    const c = container || el.closest('.scroller')
    if (!c) return
    const r = el.getBoundingClientRect()
    const cr = c.getBoundingClientRect()
    if (r.top < cr.top + 40) c.scrollTop -= cr.top + 40 - r.top
    else if (r.bottom > cr.bottom - 40) c.scrollTop += r.bottom - (cr.bottom - 40)
  }

  // ---------- Icons (hand-drawn 20x20 line icons) ----------
  const P = {
    plus: '<path d="M10 4v12M4 10h12"/>',
    chevronRight: '<path d="M8 5l5 5-5 5"/>',
    chevronDown: '<path d="M5 8l5 5 5-5"/>',
    chevronLeft: '<path d="M12 5l-5 5 5 5"/>',
    chevronsLeft: '<path d="M10 5L5 10l5 5M15 5l-5 5 5 5"/>',
    chevronsRight: '<path d="M5 5l5 5-5 5M10 5l5 5-5 5"/>',
    dots:
      '<circle cx="4.5" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10" r="1.3" fill="currentColor" stroke="none"/>',
    grip:
      '<g fill="currentColor" stroke="none"><circle cx="7.5" cy="5" r="1.3"/><circle cx="12.5" cy="5" r="1.3"/><circle cx="7.5" cy="10" r="1.3"/><circle cx="12.5" cy="10" r="1.3"/><circle cx="7.5" cy="15" r="1.3"/><circle cx="12.5" cy="15" r="1.3"/></g>',
    search: '<circle cx="8.5" cy="8.5" r="5"/><path d="M12.5 12.5L17 17"/>',
    home: '<path d="M3.5 9.5L10 4l6.5 5.5"/><path d="M5.5 8v8h9V8"/><path d="M8.5 16v-4h3v4"/>',
    gear:
      '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2.2M10 15.3v2.2M17.5 10h-2.2M4.7 10H2.5M15.3 4.7l-1.6 1.6M6.3 13.7l-1.6 1.6M15.3 15.3l-1.6-1.6M6.3 6.3L4.7 4.7"/>',
    trash:
      '<path d="M4 6h12M8 6V4.5h4V6M5.5 6l.8 10h7.4l.8-10"/><path d="M8.5 9v4.5M11.5 9v4.5"/>',
    star: '<path d="M10 3l2.1 4.4 4.8.6-3.5 3.3.9 4.7L10 13.7 5.7 16l.9-4.7L3.1 8l4.8-.6z"/>',
    starFill:
      '<path fill="currentColor" d="M10 3l2.1 4.4 4.8.6-3.5 3.3.9 4.7L10 13.7 5.7 16l.9-4.7L3.1 8l4.8-.6z"/>',
    page: '<path d="M5 2.8h6.5L15 6.3v10.9H5z"/><path d="M11.2 3v3.6H15"/><path d="M7.5 10h5M7.5 13h5"/>',
    pageBlank: '<path d="M5 2.8h6.5L15 6.3v10.9H5z"/><path d="M11.2 3v3.6H15"/>',
    menu: '<path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"/>',
    clock: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.8 1.8"/>',
    check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
    x: '<path d="M5 5l10 10M15 5L5 15"/>',
    image:
      '<rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="7.5" cy="8.3" r="1.4"/><path d="M3.5 14l4-4 3 3 2-2 4 3.5"/>',
    link:
      '<path d="M8.5 11.5a3 3 0 004.2 0l2.6-2.6a3 3 0 00-4.2-4.2l-1 1"/><path d="M11.5 8.5a3 3 0 00-4.2 0l-2.6 2.6a3 3 0 004.2 4.2l1-1"/>',
    table: '<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M3 8h14M3 12h14M8 8v8"/>',
    board: '<rect x="3" y="4" width="4" height="12" rx="1"/><rect x="8.5" y="4" width="4" height="8" rx="1"/><rect x="14" y="4" width="3" height="10" rx="1"/>',
    gallery:
      '<rect x="3" y="3.5" width="6" height="6" rx="1"/><rect x="11" y="3.5" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/>',
    list: '<path d="M7 5.5h10M7 10h10M7 14.5h10"/><circle cx="3.8" cy="5.5" r=".9" fill="currentColor"/><circle cx="3.8" cy="10" r=".9" fill="currentColor"/><circle cx="3.8" cy="14.5" r=".9" fill="currentColor"/>',
    calendar:
      '<rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8.5h14M7 2.8v3.2M13 2.8v3.2"/>',
    filter: '<path d="M3.5 5h13M6 10h8M8.5 15h3"/>',
    sort: '<path d="M6.5 4v12M3.5 13l3 3 3-3M13.5 16V4M10.5 7l3-3 3 3"/>',
    text: '<path d="M4 6V4.5h12V6M10 4.5v11M7.5 15.5h5"/>',
    hash: '<path d="M8 3.5L6.5 16.5M13.5 3.5L12 16.5M4 7.5h12.5M3.5 12.5H16"/>',
    select: '<circle cx="10" cy="10" r="7"/><path d="M7 9l3 3 3-3"/>',
    multiSelect: '<path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9"/><path d="M3 5.5l1 1 1.8-2M3 10l1 1 1.8-2M3 14.5l1 1 1.8-2"/>',
    status: '<circle cx="10" cy="10" r="7" stroke-dasharray="3 2"/><circle cx="10" cy="10" r="3" fill="currentColor"/>',
    checkbox: '<rect x="3.5" y="3.5" width="13" height="13" rx="2"/><path d="M6.5 10l2.5 2.5 4.5-5"/>',
    at: '<circle cx="10" cy="10" r="3"/><path d="M13 10v1.3a2.2 2.2 0 004.4 0V10A7.4 7.4 0 1014 16.2"/>',
    person: '<circle cx="10" cy="7" r="3.2"/><path d="M3.8 17c.8-3.4 3.3-5 6.2-5s5.4 1.6 6.2 5"/>',
    open: '<path d="M11 3.5h5.5V9M16.5 3.5L9 11M14 12.5v4H3.5V6h4"/>',
    peek: '<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M11 4v12"/>',
    copy: '<rect x="7" y="7" width="9.5" height="9.5" rx="1.5"/><path d="M13 7V4.8a1.3 1.3 0 00-1.3-1.3H4.8a1.3 1.3 0 00-1.3 1.3v6.9A1.3 1.3 0 004.8 13H7"/>',
    duplicate: '<rect x="7" y="7" width="9.5" height="9.5" rx="1.5"/><path d="M13 7V4.8a1.3 1.3 0 00-1.3-1.3H4.8a1.3 1.3 0 00-1.3 1.3v6.9A1.3 1.3 0 004.8 13H7"/><path d="M11.8 9.6v4.3M9.6 11.8h4.3"/>',
    upload: '<path d="M10 13V3.5M6 7.5l4-4 4 4M3.5 13v3.5h13V13"/>',
    download: '<path d="M10 3.5V13M6 9l4 4 4-4M3.5 13v3.5h13V13"/>',
    smile: '<circle cx="10" cy="10" r="7"/><path d="M7 11.8c.8 1.1 1.8 1.7 3 1.7s2.2-.6 3-1.7"/><circle cx="7.6" cy="8" r=".9" fill="currentColor"/><circle cx="12.4" cy="8" r=".9" fill="currentColor"/>',
    sun: '<circle cx="10" cy="10" r="3.3"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
    moon: '<path d="M15.5 12.2A6.5 6.5 0 017.8 4.5 6.5 6.5 0 1015.5 12.2z"/>',
    template: '<rect x="3" y="3.5" width="14" height="13" rx="1.5"/><path d="M3 8h14M8 8v8.5"/>',
    import: '<path d="M10 3v9M6.5 8.5L10 12l3.5-3.5"/><path d="M4 11.5V16h12v-4.5"/>',
    lock: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 016 0V9"/>',
    unlock: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 015.8-1"/>',
    undo: '<path d="M7 5L3.5 8.5 7 12"/><path d="M3.5 8.5H12a4.5 4.5 0 010 9H8"/>',
    redo: '<path d="M13 5l3.5 3.5L13 12"/><path d="M16.5 8.5H8a4.5 4.5 0 000 9h4"/>',
    share: '<circle cx="14.5" cy="5" r="2"/><circle cx="5.5" cy="10" r="2"/><circle cx="14.5" cy="15" r="2"/><path d="M7.3 9l5.4-3M7.3 11l5.4 3"/>',
    comment: '<path d="M4 4.5h12v8.5H9l-3.5 3v-3H4z"/>',
    arrowUp: '<path d="M10 16V4M5 9l5-5 5 5"/>',
    arrowDown: '<path d="M10 4v12M5 11l5 5 5-5"/>',
    arrowRight: '<path d="M4 10h12M11 5l5 5-5 5"/>',
    eyeOff: '<path d="M3 3l14 14"/><path d="M8.2 5.3A7.7 7.7 0 0110 5c4.3 0 7 5 7 5a13 13 0 01-2.3 2.8M12 14.6a7 7 0 01-2 .4c-4.3 0-7-5-7-5a12.5 12.5 0 013-3.4"/>',
    eye: '<path d="M3 10s2.7-5 7-5 7 5 7 5-2.7 5-7 5-7-5-7-5z"/><circle cx="10" cy="10" r="2.3"/>',
    edit: '<path d="M4 16l.7-3.3L13 4.4l2.6 2.6-8.3 8.3z"/><path d="M11.3 6.1l2.6 2.6"/>',
    turnInto: '<path d="M4 7h10l-3-3M16 13H6l3 3"/>',
    palette: '<path d="M10 3a7 7 0 000 14c1 0 1.5-.6 1.5-1.4 0-.9-.8-1.3-.8-2.1 0-.8.7-1.4 1.5-1.4H14a3 3 0 003-3C17 5.8 13.9 3 10 3z"/><circle cx="6.5" cy="9.5" r="1" fill="currentColor"/><circle cx="8.8" cy="6.3" r="1" fill="currentColor"/><circle cx="12.5" cy="6.5" r="1" fill="currentColor"/>',
    moveTo: '<path d="M3.5 10h11M11 6l4 4-4 4"/><path d="M16.5 4v12"/>',
    code: '<path d="M7 6l-4 4 4 4M13 6l4 4-4 4"/>',
    quote: '<path d="M4 5v10"/><path d="M8 7h8M8 10.5h8M8 14h5"/>',
    divider: '<path d="M3 10h14"/>',
    toc: '<path d="M4 5.5h12M6.5 10h9.5M9 14.5h7"/>',
    bulb: '<path d="M7.5 14h5M8 16.5h4M10 3a5 5 0 00-3 9c.6.5 1 1.1 1 1.8V14h4v-.2c0-.7.4-1.3 1-1.8a5 5 0 00-3-9z"/>',
    sparkle: '<path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z"/>',
    bell: '<path d="M5.5 13.5V9a4.5 4.5 0 019 0v4.5l1.3 1.5H4.2z"/><path d="M8.5 16.8a1.7 1.7 0 003 0"/>',
    help: '<circle cx="10" cy="10" r="7"/><path d="M8 8a2 2 0 113 1.7c-.6.4-1 .8-1 1.5v.3"/><circle cx="10" cy="13.8" r=".6" fill="currentColor"/>',
    keyboard: '<rect x="2.5" y="5" width="15" height="10" rx="1.5"/><path d="M5.5 8h1M8.5 8h1M11.5 8h1M14.5 8h.1M5.5 11h.1M7.5 12h5M14.5 11h.1"/>',
    refresh: '<path d="M15.5 8A6 6 0 004.6 7M4.5 12a6 6 0 0010.9 1"/><path d="M15.5 3.5V8H11M4.5 16.5V12H9"/>',
    font: '<path d="M4 16L8.5 4h1L14 16M5.7 12h6.6"/><path d="M14.5 16v-5.2M12.8 12.2c.5-1 1.2-1.4 2.2-1.4 1.3 0 2 .8 2 2V16"/>',
    textSize: '<path d="M3 15l3.5-9h1l3.5 9M4.4 12h5.2M12 15l2.3-6h.4l2.3 6M12.8 13h3.4"/>',
    width: '<path d="M3 4v12M17 4v12M6 10h8M8 7.5L5.5 10 8 12.5M12 7.5l2.5 2.5-2.5 2.5"/>',
    inbox: '<path d="M3 11l2-6.5h10L17 11v5H3z"/><path d="M3 11h4l1 2h4l1-2h4"/>',
    number: '<path d="M5 15V5L3.5 6.3M8.5 7.5a1.8 1.8 0 113.3 1c-.6.9-3.3 3.6-3.3 3.6H12M14.4 5.3h2.3l-1.6 2.3c1 0 1.8.8 1.8 1.8s-.8 1.8-1.8 1.8a1.8 1.8 0 01-1.6-.9"/>',
    bullet: '<circle cx="4.5" cy="6" r="1.3" fill="currentColor"/><circle cx="4.5" cy="14" r="1.3" fill="currentColor"/><path d="M8.5 6h8M8.5 14h8"/>',
    toggle: '<path fill="currentColor" stroke="none" d="M4 5.5l4.5 3-4.5 3z"/><path d="M10.5 8.5h6M6 14.5h10.5"/>',
    todo: '<rect x="3" y="5" width="7" height="7" rx="1.2"/><path d="M12.5 8.5h4.5"/><path d="M4.8 8.6l1.3 1.3 2.3-2.5"/>',
    database: '<ellipse cx="10" cy="5" rx="6" ry="2.2"/><path d="M4 5v10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V5M4 10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"/>',
    pin: '<path d="M7 3.5h6M8 3.5v5L5.5 11h9L12 8.5v-5M10 11v5.5"/>',
    logout: '<path d="M8 4H4v12h4M12 6.5L15.5 10 12 13.5M15.5 10H7.5"/>',
  }
  U.icons = P

  U.icon = function(name, size) {
    const s = size || 16
    const span = document.createElement('span')
    span.className = 'icon icon-' + name
    span.innerHTML =
      '<svg viewBox="0 0 20 20" width="' +
      s +
      '" height="' +
      s +
      '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (P[name] || '') +
      '</svg>'
    return span
  }
})(window.Folio)
