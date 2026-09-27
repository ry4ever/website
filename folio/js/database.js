/* Folio — databases: table, board, gallery, list and calendar views with properties, filters and sorts. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const h = U.h
  const S = F.store
  const UI = F.ui

  const TYPES = {
    title: { label: 'Title', icon: 'text' },
    text: { label: 'Text', icon: 'menu' },
    number: { label: 'Number', icon: 'hash' },
    select: { label: 'Select', icon: 'select' },
    multi_select: { label: 'Multi-select', icon: 'multiSelect' },
    status: { label: 'Status', icon: 'status' },
    date: { label: 'Date', icon: 'calendar' },
    checkbox: { label: 'Checkbox', icon: 'checkbox' },
    url: { label: 'URL', icon: 'link' },
    email: { label: 'Email', icon: 'at' },
    created_time: { label: 'Created time', icon: 'clock' },
    last_edited_time: { label: 'Last edited time', icon: 'clock' },
  }
  const ADDABLE = ['text', 'number', 'select', 'multi_select', 'status', 'date', 'checkbox', 'url', 'email', 'created_time', 'last_edited_time']
  const OPTION_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']
  const VIEW_ICONS = { table: 'table', board: 'board', gallery: 'gallery', list: 'list', calendar: 'calendar' }
  const isSelect = t => t === 'select' || t === 'status' || t === 'multi_select'

  // ---------------------------------------------------------------- values
  function getValue(row, prop) {
    if (prop.type === 'title') return row.title || ''
    if (prop.type === 'created_time') return row.createdAt
    if (prop.type === 'last_edited_time') return row.updatedAt
    return row.props[prop.id]
  }

  function setValue(row, prop, v) {
    if (prop.type === 'title') row.title = v
    else if (prop.type === 'created_time' || prop.type === 'last_edited_time') return
    else row.props[prop.id] = v
    row.updatedAt = Date.now()
    S.commit('row', row.id)
  }

  function isEmpty(v) {
    return v == null || v === '' || (Array.isArray(v) && !v.length) || v === false
  }

  function optionOf(prop, id) {
    return (prop.options || []).find(o => o.id === id)
  }

  function valueText(row, prop) {
    const v = getValue(row, prop)
    if (prop.type === 'title') return S.pageTitle(row)
    if (prop.type === 'created_time' || prop.type === 'last_edited_time') return U.formatDate(v, true)
    return F.md.propText(prop, v)
  }

  function compare(a, b, prop) {
    const ea = isEmpty(a)
    const eb = isEmpty(b)
    if (ea && eb) return 0
    if (ea) return 1
    if (eb) return -1
    switch (prop.type) {
      case 'number':
      case 'created_time':
      case 'last_edited_time':
        return Number(a) - Number(b)
      case 'checkbox':
        return (a ? 1 : 0) - (b ? 1 : 0)
      case 'select':
      case 'status': {
        const opts = prop.options || []
        return opts.findIndex(o => o.id === a) - opts.findIndex(o => o.id === b)
      }
      case 'multi_select': {
        const na = (optionOf(prop, a[0]) || {}).name || ''
        const nb = (optionOf(prop, b[0]) || {}).name || ''
        return na.localeCompare(nb)
      }
      default:
        return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
    }
  }

  const OPS = {
    title: ['contains', 'does not contain', 'is', 'is not', 'is empty', 'is not empty'],
    text: ['contains', 'does not contain', 'is', 'is not', 'is empty', 'is not empty'],
    url: ['contains', 'does not contain', 'is empty', 'is not empty'],
    email: ['contains', 'does not contain', 'is empty', 'is not empty'],
    number: ['=', '≠', '>', '<', '≥', '≤', 'is empty', 'is not empty'],
    select: ['is', 'is not', 'is empty', 'is not empty'],
    status: ['is', 'is not', 'is empty', 'is not empty'],
    multi_select: ['contains', 'does not contain', 'is empty', 'is not empty'],
    checkbox: ['is checked', 'is not checked'],
    date: ['is', 'is before', 'is after', 'is empty', 'is not empty'],
    created_time: ['is', 'is before', 'is after'],
    last_edited_time: ['is', 'is before', 'is after'],
  }
  const NO_VALUE = { 'is empty': 1, 'is not empty': 1, 'is checked': 1, 'is not checked': 1 }

  function matchFilter(row, prop, f) {
    if (!prop) return true
    let v = getValue(row, prop)
    const op = f.op
    const fv = f.value
    if (op === 'is empty') return isEmpty(v)
    if (op === 'is not empty') return !isEmpty(v)
    if (op === 'is checked') return !!v
    if (op === 'is not checked') return !v
    if (fv == null || fv === '') return true
    switch (prop.type) {
      case 'number': {
        if (isEmpty(v)) return false
        const a = Number(v)
        const b = Number(fv)
        return op === '=' ? a === b : op === '≠' ? a !== b : op === '>' ? a > b : op === '<' ? a < b : op === '≥' ? a >= b : a <= b
      }
      case 'select':
      case 'status':
        return op === 'is' ? v === fv : v !== fv
      case 'multi_select': {
        const has = (v || []).indexOf(fv) !== -1
        return op === 'contains' ? has : !has
      }
      case 'date':
      case 'created_time':
      case 'last_edited_time': {
        if (isEmpty(v)) return false
        const d = typeof v === 'number' ? U.toISODate(new Date(v)) : v
        return op === 'is' ? d === fv : op === 'is before' ? d < fv : d > fv
      }
      default: {
        if (prop.type === 'title') v = S.pageTitle(row) === 'Untitled' && !row.title ? '' : row.title
        const s = String(v || '').toLowerCase()
        const q = String(fv).toLowerCase()
        if (op === 'contains') return s.indexOf(q) !== -1
        if (op === 'does not contain') return s.indexOf(q) === -1
        if (op === 'is') return s === q
        if (op === 'is not') return s !== q
        return true
      }
    }
  }

  function viewRows(dbPage, view) {
    const db = dbPage.db
    let rows = S.dbRows(dbPage.id)
    const q = (view.search || '').trim().toLowerCase()
    if (q) rows = rows.filter(r => db.properties.some(p => valueText(r, p).toLowerCase().indexOf(q) !== -1))
    ;(view.filters || []).forEach(f => {
      const prop = db.properties.find(p => p.id === f.prop)
      rows = rows.filter(r => matchFilter(r, prop, f))
    })
    const sorts = (view.sorts || []).filter(s => db.properties.find(p => p.id === s.prop))
    if (sorts.length) {
      rows = rows.slice().sort((a, b) => {
        for (let i = 0; i < sorts.length; i++) {
          const prop = db.properties.find(p => p.id === sorts[i].prop)
          const c = compare(getValue(a, prop), getValue(b, prop), prop)
          if (c) return sorts[i].dir === 'desc' ? -c : c
        }
        return 0
      })
    }
    return rows
  }

  // ---------------------------------------------------------------- calculations
  const CALCS = {
    none: ['None', ''],
    count_all: ['Count all', 'Count'],
    count_values: ['Count values', 'Values'],
    count_empty: ['Count empty', 'Empty'],
    count_unique: ['Count unique values', 'Unique'],
    percent_empty: ['Percent empty', 'Empty'],
    percent_not_empty: ['Percent not empty', 'Not empty'],
    sum: ['Sum', 'Sum'],
    average: ['Average', 'Average'],
    median: ['Median', 'Median'],
    min: ['Min', 'Min'],
    max: ['Max', 'Max'],
    range: ['Range', 'Range'],
    checked: ['Checked', 'Checked'],
    unchecked: ['Unchecked', 'Unchecked'],
    percent_checked: ['Percent checked', 'Checked'],
    earliest: ['Earliest date', 'Earliest'],
    latest: ['Latest date', 'Latest'],
    date_range: ['Date range', 'Range'],
  }

  function calcsFor(type) {
    const base = ['none', 'count_all', 'count_values', 'count_empty', 'count_unique', 'percent_empty', 'percent_not_empty']
    if (type === 'number') return base.concat(['sum', 'average', 'median', 'min', 'max', 'range'])
    if (type === 'checkbox') return ['none', 'count_all', 'checked', 'unchecked', 'percent_checked']
    if (type === 'date' || type === 'created_time' || type === 'last_edited_time') return base.concat(['earliest', 'latest', 'date_range'])
    return base
  }

  function calcValue(rows, prop, calc) {
    const vals = rows.map(r => getValue(r, prop))
    const n = rows.length
    const filled = vals.filter(v => !isEmpty(v))
    const pct = x => (n ? Math.round((x / n) * 1000) / 10 : 0) + '%'
    const nums = filled.map(Number).filter(x => !isNaN(x)).sort((a, b) => a - b)
    const fmt = x => (Math.round(x * 100) / 100).toLocaleString()
    const dateOf = v => (typeof v === 'number' ? v : U.parseISODate(v) ? U.parseISODate(v).getTime() : NaN)
    const dates = filled.map(dateOf).filter(x => !isNaN(x)).sort((a, b) => a - b)
    switch (calc) {
      case 'count_all':
        return String(n)
      case 'count_values':
        return String(prop.type === 'multi_select' ? filled.reduce((a, v) => a + v.length, 0) : filled.length)
      case 'count_empty':
        return String(n - filled.length)
      case 'count_unique': {
        const flat = prop.type === 'multi_select' ? filled.reduce((a, v) => a.concat(v), []) : filled.map(v => (typeof v === 'string' ? v.toLowerCase() : v))
        return String(new Set(flat).size)
      }
      case 'percent_empty':
        return pct(n - filled.length)
      case 'percent_not_empty':
        return pct(filled.length)
      case 'sum':
        return fmt(nums.reduce((a, x) => a + x, 0))
      case 'average':
        return nums.length ? fmt(nums.reduce((a, x) => a + x, 0) / nums.length) : '—'
      case 'median': {
        if (!nums.length) return '—'
        const m = Math.floor(nums.length / 2)
        return fmt(nums.length % 2 ? nums[m] : (nums[m - 1] + nums[m]) / 2)
      }
      case 'min':
        return nums.length ? fmt(nums[0]) : '—'
      case 'max':
        return nums.length ? fmt(nums[nums.length - 1]) : '—'
      case 'range':
        return nums.length ? fmt(nums[nums.length - 1] - nums[0]) : '—'
      case 'checked':
        return String(vals.filter(Boolean).length)
      case 'unchecked':
        return String(vals.filter(v => !v).length)
      case 'percent_checked':
        return pct(vals.filter(Boolean).length)
      case 'earliest':
        return dates.length ? U.formatDate(dates[0]) : '—'
      case 'latest':
        return dates.length ? U.formatDate(dates[dates.length - 1]) : '—'
      case 'date_range': {
        if (!dates.length) return '—'
        const days = Math.round((dates[dates.length - 1] - dates[0]) / 86400000)
        return days + (days === 1 ? ' day' : ' days')
      }
      default:
        return ''
    }
  }

  // ---------------------------------------------------------------- display
  function pill(opt, status) {
    if (!opt) return null
    return h('span.pill', { class: 'opt-' + (opt.color || 'gray') + (status ? ' status' : '') }, status ? h('span.dot') : null, h('span.pill-text', { text: opt.name }))
  }

  function renderValue(row, prop, compact) {
    const v = getValue(row, prop)
    switch (prop.type) {
      case 'title':
        return h('span.v-title', null, row.icon ? h('span.v-icon', { text: row.icon }) : compact ? null : h('span.v-icon.faint', null, U.icon('page', 14)), h('span.v-title-text', { text: S.pageTitle(row), class: row.title ? null : 'untitled' }))
      case 'select':
      case 'status':
        return pill(optionOf(prop, v), prop.type === 'status')
      case 'multi_select':
        return isEmpty(v) ? null : h('span.pills', null, (v || []).map(id => pill(optionOf(prop, id))))
      case 'checkbox':
        return h('span.cb', { class: v ? 'on' : null, role: 'checkbox', 'aria-checked': v ? 'true' : 'false' }, U.icon('check', 12))
      case 'date':
        return v ? h('span.v-date', { text: U.formatDate(v) }) : null
      case 'created_time':
      case 'last_edited_time':
        return h('span.v-date', { text: U.formatDate(v, true) })
      case 'url':
        return v ? h('a.v-url', { href: U.safeUrl(v) || '#', target: '_blank', rel: 'noopener', text: String(v).replace(/^https?:\/\//, ''), onClick: e => e.stopPropagation() }) : null
      case 'email':
        return v ? h('a.v-url', { href: 'mailto:' + v, text: v, onClick: e => e.stopPropagation() }) : null
      case 'number':
        return v === '' || v == null ? null : h('span.v-num', { text: Number(v).toLocaleString() })
      default:
        return v ? h('span.v-text', { text: v }) : null
    }
  }

  // ---------------------------------------------------------------- editors
  function editValue(anchorEl, row, prop, dbPage, onDone) {
    const rect = anchorEl.getBoundingClientRect()
    const done = () => onDone && onDone()
    switch (prop.type) {
      case 'checkbox':
        setValue(row, prop, !getValue(row, prop))
        return done()
      case 'created_time':
      case 'last_edited_time':
        return
      case 'date':
        return UI.datePicker(rect, getValue(row, prop) || '', v => {
          setValue(row, prop, v)
          done()
        })
      case 'select':
      case 'status':
      case 'multi_select':
        return optionPicker(rect, row, prop, dbPage, done)
      default:
        return textEditor(rect, row, prop, done)
    }
  }

  function textEditor(rect, row, prop, done) {
    const multiline = prop.type === 'text' || prop.type === 'title'
    const cur = getValue(row, prop)
    const input = h(multiline ? 'textarea.cell-input' : 'input.cell-input', {
      value: cur == null ? '' : String(cur),
      type: prop.type === 'number' ? 'number' : 'text',
      rows: multiline ? '1' : null,
      placeholder: prop.type === 'url' ? 'Paste a link…' : prop.type === 'email' ? 'name@example.com' : 'Empty',
    })
    let cancelled = false
    const commit = () => {
      if (cancelled) return
      let v = input.value
      if (prop.type === 'title') v = v.replace(/\s*\n\s*/g, ' ')
      if (prop.type === 'number') v = v === '' ? '' : Number(v)
      if (prop.type === 'url' && v) v = U.safeUrl(v) || v
      if (v !== (cur == null ? '' : cur)) setValue(row, prop, v)
      done()
    }
    const grow = () => {
      if (!multiline) return
      input.style.height = 'auto'
      input.style.height = Math.min(240, input.scrollHeight) + 'px'
    }
    input.addEventListener('input', grow)
    input.addEventListener('keydown', e => {
      e.stopPropagation()
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        pop.close()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        pop.close()
      }
    })
    const r = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.top, width: rect.width, height: 0 }
    const pop = UI.popover(r, h('div.cell-editor', null, input), { className: 'cell-pop', width: Math.max(rect.width, 240), offset: 0, onClose: commit })
    if (!pop) return
    requestAnimationFrame(() => {
      grow()
      input.focus()
      if (input.select) input.select()
    })
    return pop
  }

  function optionPicker(rect, row, prop, dbPage, done) {
    const multi = prop.type === 'multi_select'
    const input = h('input.opt-search', { placeholder: multi ? 'Search or create an option…' : 'Search for an option…' })
    const chips = h('div.opt-chips')
    const list = h('div.opt-list')
    let active = 0
    let rows = []
    const current = () => {
      const v = getValue(row, prop)
      return multi ? v || [] : v ? [v] : []
    }
    const select = opt => {
      if (multi) {
        const cur = current()
        setValue(row, prop, cur.indexOf(opt.id) === -1 ? cur.concat([opt.id]) : cur.filter(x => x !== opt.id))
        input.value = ''
        render()
      } else {
        setValue(row, prop, current()[0] === opt.id ? null : opt.id)
        pop.close()
      }
    }
    const create = name => {
      const opt = { id: U.uid(), name, color: OPTION_COLORS[Math.floor(Math.random() * OPTION_COLORS.length)] }
      prop.options = (prop.options || []).concat([opt])
      S.commit('db', dbPage.id)
      select(opt)
    }
    function render() {
      chips.innerHTML = ''
      current().forEach(id => {
        const o = optionOf(prop, id)
        if (!o) return
        const p = pill(o, prop.type === 'status')
        p.appendChild(h('button.pill-x', { title: 'Remove', onClick: () => select(o) }, U.icon('x', 10)))
        chips.appendChild(p)
      })
      chips.appendChild(input)
      list.innerHTML = ''
      rows = []
      const q = input.value.trim()
      const ql = q.toLowerCase()
      list.appendChild(h('div.menu-header', { text: 'Select an option or create one' }))
      ;(prop.options || [])
        .filter(o => !ql || o.name.toLowerCase().indexOf(ql) !== -1)
        .forEach(o => {
          const r = h(
            'div.opt-row',
            {
              onClick: () => select(o),
              onMouseenter: () => setActive(rows.indexOf(r)),
            },
            h('span.opt-grip', null, U.icon('grip', 12)),
            pill(o, prop.type === 'status'),
            h('div.spacer'),
            current().indexOf(o.id) !== -1 ? U.icon('check', 14) : null,
            h('button.btn-icon.opt-more', {
              title: 'Edit option',
              onClick: e => {
                e.stopPropagation()
                editOption(e.currentTarget, prop, o, dbPage, render)
              },
            }, U.icon('dots', 14))
          )
          r._run = () => select(o)
          rows.push(r)
          list.appendChild(r)
        })
      if (q && !(prop.options || []).some(o => o.name.toLowerCase() === ql)) {
        const r = h('div.opt-row', { onClick: () => create(q) }, h('span.muted', { text: 'Create' }), pill({ name: q, color: 'gray' }))
        r._run = () => create(q)
        rows.push(r)
        list.appendChild(r)
      }
      setActive(Math.min(active, rows.length - 1))
    }
    function setActive(i) {
      active = Math.max(0, i)
      rows.forEach((r, j) => r.classList.toggle('active', j === active))
    }
    input.addEventListener('input', () => {
      active = 0
      render()
      input.focus()
    })
    input.addEventListener('keydown', e => {
      e.stopPropagation()
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive(Math.min(rows.length - 1, active + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(active - 1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (rows[active]) rows[active]._run()
      } else if (e.key === 'Backspace' && !input.value && multi) {
        const cur = current()
        if (cur.length) setValue(row, prop, cur.slice(0, -1))
        render()
        input.focus()
      } else if (e.key === 'Escape') {
        pop.close()
      }
    })
    render()
    const r = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.top, width: rect.width, height: 0 }
    const pop = UI.popover(r, h('div.opt-picker', null, chips, list), { className: 'cell-pop', width: Math.max(rect.width, 280), offset: 0, onClose: done })
    if (pop) setTimeout(() => input.focus(), 0)
    return pop
  }

  function editOption(anchor, prop, opt, dbPage, after) {
    const name = h('input.pop-input', { value: opt.name })
    name.addEventListener('keydown', e => {
      e.stopPropagation()
      if (e.key === 'Enter') pop.close()
    })
    name.addEventListener('input', () => {
      opt.name = name.value
    })
    const colors = h('div.menu-list')
    OPTION_COLORS.forEach(c => {
      colors.appendChild(
        h('div.menu-item', {
          onClick: () => {
            opt.color = c
            S.commit('db', dbPage.id)
            pop.close()
          },
        }, h('span.color-dot', { class: 'opt-' + c }), h('span.menu-label', { text: UI.colorLabel(c) }), opt.color === c ? U.icon('check', 14) : null)
      )
    })
    const pop = UI.popover(
      anchor,
      h('div.menu', null,
        h('div.menu-pad', null, name),
        h('div.menu-item.danger', {
          onClick: () => {
            prop.options = prop.options.filter(o => o.id !== opt.id)
            S.dbRows(dbPage.id).forEach(r => {
              const v = r.props[prop.id]
              if (v === opt.id) r.props[prop.id] = null
              else if (Array.isArray(v)) r.props[prop.id] = v.filter(x => x !== opt.id)
            })
            S.commit('db', dbPage.id)
            pop.close()
          },
        }, U.icon('trash', 16), h('span.menu-label', { text: 'Delete' })),
        h('div.menu-divider'),
        h('div.menu-header', { text: 'Colors' }),
        colors
      ),
      {
        className: 'menu-pop',
        width: 220,
        placement: 'right-start',
        onClose: () => {
          S.commit('db', dbPage.id)
          if (after) after()
        },
      }
    )
  }

  // ---------------------------------------------------------------- property menu
  function uniqueName(db, base) {
    let name = base
    let i = 1
    while (db.properties.some(p => p.name === name)) name = base + ' ' + ++i
    return name
  }

  function addProperty(dbPage, type, view) {
    const db = dbPage.db
    const prop = { id: U.uid(), name: uniqueName(db, TYPES[type].label), type }
    if (isSelect(type)) prop.options = type === 'status'
      ? [{ id: U.uid(), name: 'Not started', color: 'gray' }, { id: U.uid(), name: 'In progress', color: 'blue' }, { id: U.uid(), name: 'Done', color: 'green' }]
      : []
    db.properties.push(prop)
    if (view && view.hidden) view.hidden = view.hidden.filter(x => x !== prop.id)
    S.commit('db', dbPage.id)
    return prop
  }

  function addPropertyMenu(anchor, dbPage, view, after) {
    return UI.menu(anchor, [{ header: 'Property type' }].concat(
      ADDABLE.map(t => ({
        label: TYPES[t].label,
        icon: TYPES[t].icon,
        onClick: () => {
          const p = addProperty(dbPage, t, view)
          if (after) after(p)
        },
      }))
    ), { width: 240, search: true, searchPlaceholder: 'Search for a property type…' })
  }

  function propertyMenu(anchor, dbPage, prop, view, ctx) {
    const db = dbPage.db
    const nameInput = h('input.pop-input', { value: prop.name })
    nameInput.addEventListener('input', () => {
      prop.name = nameInput.value
    })
    nameInput.addEventListener('keydown', e => {
      e.stopPropagation()
      if (e.key === 'Enter') menu.close()
    })
    const items = [
      { render: () => h('div.menu-pad', null, h('div.prop-name-row', null, U.icon(TYPES[prop.type].icon, 16), nameInput)) },
      prop.type !== 'title'
        ? {
            label: 'Type',
            icon: 'turnInto',
            hint: TYPES[prop.type].label,
            submenu: () =>
              ADDABLE.map(t => ({
                label: TYPES[t].label,
                icon: TYPES[t].icon,
                checked: prop.type === t,
                onClick: () => changeType(dbPage, prop, t),
              })),
          }
        : null,
      { divider: true },
      view
        ? {
            label: 'Sort ascending',
            icon: 'arrowUp',
            onClick: () => {
              view.sorts = [{ prop: prop.id, dir: 'asc' }]
              S.commit('db', dbPage.id)
            },
          }
        : null,
      view
        ? {
            label: 'Sort descending',
            icon: 'arrowDown',
            onClick: () => {
              view.sorts = [{ prop: prop.id, dir: 'desc' }]
              S.commit('db', dbPage.id)
            },
          }
        : null,
      view
        ? {
            label: 'Filter',
            icon: 'filter',
            onClick: () => {
              view.filters = (view.filters || []).concat([{ prop: prop.id, op: OPS[prop.type][0], value: '' }])
              S.commit('db', dbPage.id)
              if (ctx && ctx.openFilters) setTimeout(() => ctx.openFilters(), 0)
            },
          }
        : null,
      { divider: true },
      view && prop.type !== 'title'
        ? {
            label: 'Hide in view',
            icon: 'eyeOff',
            onClick: () => {
              view.hidden = (view.hidden || []).concat([prop.id])
              S.commit('db', dbPage.id)
            },
          }
        : null,
      view
        ? {
            label: 'Move left',
            icon: 'chevronLeft',
            onClick: () => moveProp(dbPage, prop, -1),
          }
        : null,
      view
        ? {
            label: 'Move right',
            icon: 'chevronRight',
            onClick: () => moveProp(dbPage, prop, 1),
          }
        : null,
      prop.type !== 'title'
        ? {
            label: 'Duplicate property',
            icon: 'duplicate',
            onClick: () => {
              const copy = JSON.parse(JSON.stringify(prop))
              copy.id = U.uid()
              copy.name = uniqueName(db, prop.name)
              db.properties.splice(db.properties.indexOf(prop) + 1, 0, copy)
              S.dbRows(dbPage.id).forEach(r => {
                if (r.props[prop.id] != null) r.props[copy.id] = JSON.parse(JSON.stringify(r.props[prop.id]))
              })
              S.commit('db', dbPage.id)
            },
          }
        : null,
      prop.type !== 'title'
        ? {
            label: 'Delete property',
            icon: 'trash',
            danger: true,
            onClick: () => {
              UI.confirm('Rows will lose the values stored in “' + prop.name + '”.', { title: 'Delete this property?', ok: 'Delete', danger: true }).then(ok => {
                if (!ok) return
                db.properties = db.properties.filter(p => p.id !== prop.id)
                db.views.forEach(v => {
                  v.sorts = (v.sorts || []).filter(s => s.prop !== prop.id)
                  v.filters = (v.filters || []).filter(f => f.prop !== prop.id)
                  if (v.groupBy === prop.id) v.groupBy = null
                  if (v.dateProp === prop.id) v.dateProp = null
                })
                S.dbRows(dbPage.id).forEach(r => delete r.props[prop.id])
                S.commit('db', dbPage.id)
              })
            },
          }
        : null,
    ]
    const menu = UI.menu(anchor, items, {
      width: 250,
      onClose: () => {
        if (!prop.name.trim()) prop.name = TYPES[prop.type].label
        S.commit('db', dbPage.id)
      },
    })
    if (menu) setTimeout(() => nameInput.select(), 0)
    return menu
  }

  function moveProp(dbPage, prop, dir) {
    const props = dbPage.db.properties
    const i = props.indexOf(prop)
    const j = i + dir
    if (j < 0 || j >= props.length) return
    props.splice(i, 1)
    props.splice(j, 0, prop)
    S.commit('db', dbPage.id)
  }

  function changeType(dbPage, prop, type) {
    const rows = S.dbRows(dbPage.id)
    const old = prop.type
    if (old === type) return
    const texts = rows.map(r => valueText(r, prop))
    prop.type = type
    if (isSelect(type)) {
      prop.options = prop.options || []
      if (!isSelect(old)) {
        texts.forEach(t => {
          t.split(',').map(s => s.trim()).filter(Boolean).forEach(name => {
            if (!prop.options.some(o => o.name === name))
              prop.options.push({ id: U.uid(), name, color: OPTION_COLORS[prop.options.length % OPTION_COLORS.length] })
          })
        })
      }
    }
    rows.forEach((r, i) => {
      const t = texts[i]
      let v = null
      if (type === 'text' || type === 'url' || type === 'email') v = t
      else if (type === 'number') v = t === '' || isNaN(Number(t)) ? '' : Number(t)
      else if (type === 'checkbox') v = !!t && t !== '0' && t.toLowerCase() !== 'false'
      else if (type === 'date') {
        const d = t ? new Date(t) : null
        v = d && !isNaN(d) ? U.toISODate(d) : ''
      } else if (isSelect(type)) {
        const names = t.split(',').map(s => s.trim()).filter(Boolean)
        const ids = names.map(n => (prop.options.find(o => o.name === n) || {}).id).filter(Boolean)
        v = type === 'multi_select' ? ids : ids[0] || null
      }
      r.props[prop.id] = v
    })
    dbPage.db.views.forEach(v => {
      v.filters = (v.filters || []).filter(f => f.prop !== prop.id)
      if (v.groupBy === prop.id && !(type === 'select' || type === 'status')) v.groupBy = null
      if (v.dateProp === prop.id && type !== 'date') v.dateProp = null
    })
    S.commit('db', dbPage.id)
  }

  // ---------------------------------------------------------------- DbView
  class DbView {
    constructor(host, dbId, opts) {
      this.host = host
      this.dbId = dbId
      this.opts = opts || {}
      this.muted = false
      this.searchOpen = false
      this.calMonth = null
      host.classList.add('db-host')
      this.render()
      this.scheduled = false
      this.unsub = S.on((type, id) => this.onStore(type, id))
    }
    get page() {
      return S.page(this.dbId)
    }
    get db() {
      return this.page && this.page.db
    }
    get view() {
      const db = this.db
      return db.views.find(v => v.id === db.activeView) || db.views[0]
    }
    destroy() {
      this.destroyed = true
      this.unsub()
      this.host.innerHTML = ''
    }
    onStore(type, id) {
      if (this.muted || this.destroyed) return
      const p = this.page
      if (!p) return
      if (type === 'title' && id === this.dbId) {
        if (this.titleEl && document.activeElement !== this.titleEl) this.titleEl.textContent = p.title
        return
      }
      const rows = p.db ? p.db.rowOrder : []
      if (id === this.dbId || rows.indexOf(id) !== -1 || type === 'pages' || type === 'reset') this.schedule()
    }
    schedule() {
      if (this.scheduled) return
      this.scheduled = true
      requestAnimationFrame(() => {
        this.scheduled = false
        if (!this.destroyed) this.renderBody()
      })
    }
    commit() {
      this.muted = true
      S.commit('db', this.dbId)
      this.muted = false
      this.render()
    }

    render() {
      const p = this.page
      this.host.innerHTML = ''
      if (!p || !p.db) {
        this.host.appendChild(h('div.db-missing', { text: p ? 'This page is not a database.' : 'This database was deleted.' }))
        return
      }
      if (S.isTrashed(p.id) && this.opts.inline) {
        this.host.appendChild(h('div.db-missing', null, U.icon('trash', 14), ' This database is in Trash.'))
        return
      }
      const locked = p.locked
      const wrap = h('div.db', { class: this.opts.inline ? 'inline' : 'full' })
      if (this.opts.inline) {
        const title = h('div.db-title', { contenteditable: locked ? 'false' : 'true', spellcheck: 'false', 'data-placeholder': 'Untitled' })
        title.textContent = p.title || ''
        title.addEventListener('input', () => {
          p.title = title.textContent
          p.updatedAt = Date.now()
          this.muted = true
          S.commit('title', p.id)
          this.muted = false
        })
        title.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            title.blur()
          }
          e.stopPropagation()
        })
        this.titleEl = title
        wrap.appendChild(
          h('div.db-title-row', null,
            p.icon ? h('span.db-title-icon', { text: p.icon }) : null,
            title,
            h('button.btn-icon.db-open', { title: 'Open as full page', onClick: () => F.app.open(p.id) }, U.icon('open', 14))
          )
        )
      }
      wrap.appendChild(this.renderToolbar())
      this.chipsEl = h('div.db-chips')
      wrap.appendChild(this.chipsEl)
      this.bodyEl = h('div.db-body')
      wrap.appendChild(this.bodyEl)
      this.host.appendChild(wrap)
      this.renderChips()
      this.renderBody()
    }

    renderToolbar() {
      const db = this.db
      const view = this.view
      const tabs = h('div.db-tabs')
      db.views.forEach(v => {
        const tab = h(
          'button.db-tab',
          {
            class: v.id === view.id ? 'active' : null,
            onClick: () => {
              if (v.id === this.view.id) return this.viewMenu(tab, v)
              db.activeView = v.id
              this.commit()
            },
            onContextmenu: e => {
              e.preventDefault()
              this.viewMenu(tab, v)
            },
          },
          U.icon(VIEW_ICONS[v.type] || 'table', 14),
          h('span', { text: v.name })
        )
        tabs.appendChild(tab)
      })
      if (!this.page.locked) {
        const add = h('button.btn-icon.db-add-view', { title: 'Add a view' }, U.icon('plus', 14))
        add.addEventListener('click', () =>
          UI.menu(add, [{ header: 'Add a view' }].concat(
            Object.keys(VIEW_ICONS).map(t => ({
              label: S.VIEW_LABELS[t],
              icon: VIEW_ICONS[t],
              onClick: () => {
                const v = S.newView(t, db)
                db.views.push(v)
                db.activeView = v.id
                this.commit()
              },
            }))
          ), { width: 200 })
        )
        tabs.appendChild(add)
      }

      const actions = h('div.db-actions')
      const searchInput = h('input.db-search', { placeholder: 'Type to search…', value: view.search || '' })
      searchInput.addEventListener('input', () => {
        view.search = searchInput.value
        this.muted = true
        S.commit('db', this.dbId)
        this.muted = false
        this.renderBody()
      })
      searchInput.addEventListener('keydown', e => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          searchInput.value = ''
          view.search = ''
          this.searchOpen = false
          this.commit()
        }
      })
      const searchOpen = this.searchOpen || !!view.search
      const searchBtn = h('button.btn-icon', {
        title: 'Search',
        class: searchOpen ? 'on' : null,
        onClick: () => {
          this.searchOpen = !searchOpen
          if (!this.searchOpen) view.search = ''
          this.commit()
          if (this.searchOpen) {
            const i = this.host.querySelector('.db-search')
            if (i) i.focus()
          }
        },
      }, U.icon('search', 15))
      const filterBtn = h('button.btn-text', { class: (view.filters || []).length ? 'on' : null, onClick: () => this.openFilters(filterBtn) }, 'Filter')
      const sortBtn = h('button.btn-text', { class: (view.sorts || []).length ? 'on' : null, onClick: () => this.openSorts(sortBtn) }, 'Sort')
      const moreBtn = h('button.btn-icon', { title: 'View settings', onClick: () => this.settingsMenu(moreBtn) }, U.icon('dots', 15))
      this.filterBtn = filterBtn
      this.sortBtn = sortBtn
      actions.appendChild(filterBtn)
      actions.appendChild(sortBtn)
      actions.appendChild(searchBtn)
      if (searchOpen) actions.appendChild(searchInput)
      actions.appendChild(moreBtn)
      if (!this.page.locked) {
        actions.appendChild(
          h('button.btn.btn-primary.btn-sm.db-new', { onClick: () => this.newRow({}, true) }, 'New')
        )
      }
      return h('div.db-toolbar', null, tabs, actions)
    }

    renderChips() {
      const view = this.view
      const db = this.db
      this.chipsEl.innerHTML = ''
      const sorts = (view.sorts || []).filter(s => db.properties.find(p => p.id === s.prop))
      const filters = (view.filters || []).filter(f => db.properties.find(p => p.id === f.prop))
      if (!sorts.length && !filters.length) {
        this.chipsEl.style.display = 'none'
        return
      }
      this.chipsEl.style.display = ''
      if (sorts.length) {
        const s = sorts[0]
        const prop = db.properties.find(p => p.id === s.prop)
        const chip = h('button.chip', { onClick: () => this.openSorts(chip) }, U.icon(s.dir === 'desc' ? 'arrowDown' : 'arrowUp', 12), sorts.length > 1 ? sorts.length + ' sorts' : prop.name, U.icon('chevronDown', 10))
        this.chipsEl.appendChild(chip)
      }
      filters.forEach(f => {
        const prop = db.properties.find(p => p.id === f.prop)
        let label = prop.name + ': ' + f.op
        if (!NO_VALUE[f.op] && f.value !== '' && f.value != null) {
          if (isSelect(prop.type)) label = prop.name + ': ' + ((optionOf(prop, f.value) || {}).name || '')
          else if (prop.type === 'date') label = prop.name + ' ' + f.op + ' ' + U.formatDate(f.value)
          else label = prop.name + ': ' + f.value
        }
        const chip = h('button.chip.filter', { onClick: () => this.openFilters(chip) }, U.icon(TYPES[prop.type].icon, 12), h('span', { text: label }), U.icon('chevronDown', 10))
        this.chipsEl.appendChild(chip)
      })
    }

    renderBody() {
      if (!this.bodyEl || !this.page) return
      const view = this.view
      this.bodyEl.innerHTML = ''
      this.bodyEl.className = 'db-body view-' + view.type
      const rows = viewRows(this.page, view)
      const fn = { table: 'renderTable', board: 'renderBoard', gallery: 'renderGallery', list: 'renderList', calendar: 'renderCalendar' }[view.type] || 'renderTable'
      this[fn](rows)
    }

    visibleProps(includeTitle) {
      const view = this.view
      return this.db.properties.filter(p => (includeTitle || p.type !== 'title') && (view.hidden || []).indexOf(p.id) === -1)
    }

    openRow(row) {
      F.app.peek(row.id)
    }

    newRow(props, open, index) {
      if (this.page.locked) return null
      const view = this.view
      props = Object.assign({}, props)
      // New rows satisfy simple "is" filters so they stay visible.
      ;(view.filters || []).forEach(f => {
        const prop = this.db.properties.find(p => p.id === f.prop)
        if (!prop || props[prop.id] != null) return
        if ((prop.type === 'select' || prop.type === 'status') && f.op === 'is' && f.value) props[prop.id] = f.value
        if (prop.type === 'multi_select' && f.op === 'contains' && f.value) props[prop.id] = [f.value]
        if (prop.type === 'checkbox' && f.op === 'is checked') props[prop.id] = true
      })
      const row = S.addRow(this.dbId, props, index)
      if (open) this.openRow(row)
      return row
    }

    rowMenu(anchor, row) {
      UI.menu(anchor, [
        { label: 'Open in side peek', icon: 'peek', onClick: () => F.app.peek(row.id) },
        { label: 'Open as full page', icon: 'open', onClick: () => F.app.open(row.id) },
        { divider: true },
        {
          label: 'Duplicate',
          icon: 'duplicate',
          onClick: () => S.duplicatePage(row.id),
        },
        {
          label: 'Copy link',
          icon: 'link',
          onClick: () => {
            U.copyText(location.href.split('#')[0] + '#/p/' + row.id)
            UI.toast('Link copied')
          },
        },
        { divider: true },
        {
          label: 'Delete',
          icon: 'trash',
          danger: true,
          onClick: () => {
            S.trashPage(row.id)
            UI.toast('Moved to Trash', { action: { label: 'Undo', onClick: () => S.restorePage(row.id) } })
          },
        },
      ], { width: 220 })
    }

    // ------------------------------------------------ table
    renderTable(rows) {
      const view = this.view
      const props = this.visibleProps(true)
      const locked = this.page.locked
      const table = h('div.tbl')
      const width = p => (view.widths && view.widths[p.id]) || (p.type === 'title' ? 280 : p.type === 'checkbox' ? 110 : 180)
      const head = h('div.tbl-row.tbl-head')
      head.appendChild(h('div.tbl-gutter'))
      props.forEach(p => {
        const th = h('div.th', { style: { width: width(p) + 'px' } }, U.icon(TYPES[p.type].icon, 14), h('span.th-name', { text: p.name }))
        if (!locked) {
          th.addEventListener('click', () => propertyMenu(th, this.page, p, view, { openFilters: () => this.openFilters(this.filterBtn) }))
          const grip = h('div.th-resize')
          grip.addEventListener('mousedown', e => this.resizeColumn(e, p, th))
          grip.addEventListener('click', e => e.stopPropagation())
          th.appendChild(grip)
        }
        head.appendChild(th)
      })
      if (!locked) {
        const add = h('div.th.th-add', { title: 'Add a property' }, U.icon('plus', 14))
        add.addEventListener('click', () => addPropertyMenu(add, this.page, view))
        head.appendChild(add)
      }
      head.appendChild(h('div.th-fill'))
      table.appendChild(head)

      const canDrag = !locked && !(view.sorts || []).length
      rows.forEach(row => {
        const tr = h('div.tbl-row', { dataset: { id: row.id } })
        const menuBtn = h('button.row-handle', { title: 'Drag to move · Click for options', draggable: canDrag ? 'true' : 'false' }, U.icon('grip', 14))
        menuBtn.addEventListener('click', () => this.rowMenu(menuBtn, row))
        if (canDrag) this.makeRowDraggable(menuBtn, tr, row)
        tr.appendChild(h('div.tbl-gutter', null, locked ? null : menuBtn))
        props.forEach(p => {
          const td = h('div.td', { class: 'td-' + p.type, style: { width: width(p) + 'px' } }, renderValue(row, p))
          if (p.type === 'title') {
            td.appendChild(h('button.open-btn', {
              onClick: e => {
                e.stopPropagation()
                this.openRow(row)
              },
            }, U.icon('peek', 12), 'OPEN'))
          }
          if (!locked) td.addEventListener('click', e => {
            if (e.target.closest('a')) return
            td.classList.add('editing')
            editValue(td, row, p, this.page, () => td.classList.remove('editing'))
          })
          else if (p.type === 'title') td.addEventListener('click', () => this.openRow(row))
          tr.appendChild(td)
        })
        tr.appendChild(h('div.td-fill'))
        table.appendChild(tr)
      })
      if (!locked) {
        table.appendChild(
          h('div.tbl-new', {
            onClick: () => {
              const row = this.newRow({}, false)
              setTimeout(() => {
                const td = this.host.querySelector('.tbl-row[data-id="' + row.id + '"] .td-title')
                if (td) td.click()
              }, 30)
            },
          }, U.icon('plus', 14), 'New')
        )
      }
      const foot = h('div.tbl-row.tbl-calc')
      foot.appendChild(h('div.tbl-gutter'))
      props.forEach(p => {
        const calcs = view.calcs || {}
        let calc = calcs[p.id] || (p.type === 'title' ? 'count_all' : 'none')
        if (calcsFor(p.type).indexOf(calc) === -1) calc = 'none'
        const set = calc !== 'none'
        const cell = h('div.tc', { style: { width: width(p) + 'px' }, class: set ? 'set' : null },
          set ? h('span.tc-label', { text: CALCS[calc][1] }) : h('span.tc-label.tc-hint', null, 'Calculate', U.icon('chevronDown', 10)),
          set ? h('span.tc-val', { text: calcValue(rows, p, calc) }) : null
        )
        if (!locked) {
          cell.addEventListener('click', () =>
            UI.menu(cell, calcsFor(p.type).map(k => ({
              label: CALCS[k][0],
              checked: k === calc,
              onClick: () => {
                view.calcs = Object.assign({}, view.calcs, { [p.id]: k })
                this.commit()
              },
            })), { width: 220, placement: 'top-start' })
          )
        }
        foot.appendChild(cell)
      })
      foot.appendChild(h('div.td-fill'))
      table.appendChild(foot)
      this.bodyEl.appendChild(h('div.tbl-scroll', null, table))
    }

    resizeColumn(e, prop, th) {
      e.preventDefault()
      e.stopPropagation()
      const view = this.view
      const x0 = e.clientX
      const w0 = th.offsetWidth
      const cells = U.$$('.tbl-row', this.host).map(r => r.children[Array.prototype.indexOf.call(th.parentNode.children, th)])
      let w = w0
      const move = ev => {
        w = Math.max(80, w0 + ev.clientX - x0)
        cells.forEach(c => c && (c.style.width = w + 'px'))
      }
      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        view.widths = view.widths || {}
        view.widths[prop.id] = w
        this.muted = true
        S.commit('db', this.dbId)
        this.muted = false
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    }

    makeRowDraggable(handle, el, row) {
      handle.addEventListener('dragstart', e => {
        this.dragRow = row.id
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', row.id)
        e.dataTransfer.setDragImage(el, 10, 10)
        e.stopPropagation()
      })
      handle.addEventListener('dragend', () => {
        this.dragRow = null
        U.$$('.drop-before, .drop-after', this.host).forEach(x => x.classList.remove('drop-before', 'drop-after'))
      })
      el.addEventListener('dragover', e => {
        if (!this.dragRow || this.dragRow === row.id) return
        e.preventDefault()
        e.stopPropagation()
        const r = el.getBoundingClientRect()
        const before = e.clientY < r.top + r.height / 2
        U.$$('.drop-before, .drop-after', this.host).forEach(x => x.classList.remove('drop-before', 'drop-after'))
        el.classList.add(before ? 'drop-before' : 'drop-after')
      })
      el.addEventListener('drop', e => {
        if (!this.dragRow || this.dragRow === row.id) return
        e.preventDefault()
        e.stopPropagation()
        const before = el.classList.contains('drop-before')
        const order = this.db.rowOrder.filter(id => id !== this.dragRow)
        const i = order.indexOf(row.id)
        order.splice(before ? i : i + 1, 0, this.dragRow)
        this.db.rowOrder = order
        this.dragRow = null
        this.commit()
      })
    }

    // ------------------------------------------------ board
    groupProp() {
      const view = this.view
      let prop = this.db.properties.find(p => p.id === view.groupBy && (p.type === 'select' || p.type === 'status'))
      if (!prop) {
        prop = this.db.properties.find(p => p.type === 'status' || p.type === 'select')
        if (prop) view.groupBy = prop.id
      }
      return prop
    }

    needProp(message, type) {
      this.bodyEl.appendChild(
        h('div.db-need', null,
          h('div', { text: message }),
          this.page.locked ? null : h('button.btn.btn-sm', {
            onClick: () => {
              const p = addProperty(this.page, type, this.view)
              if (type === 'date') this.view.dateProp = p.id
              else this.view.groupBy = p.id
              this.commit()
            },
          }, 'Add a ' + TYPES[type].label + ' property')
        )
      )
    }

    card(row, props, opts) {
      opts = opts || {}
      const locked = this.page.locked
      const card = h('div.card', { dataset: { id: row.id }, draggable: locked ? 'false' : 'true' })
      if (opts.preview) {
        const prev = h('div.card-preview')
        if (row.cover) {
          const cv = UI.coverCSS(row.cover)
          if (row.cover.type === 'image') prev.style.backgroundImage = cv
          else prev.style.background = cv
          prev.classList.add('cover')
        } else {
          const img = findImage(row.blocks)
          if (img) {
            prev.style.backgroundImage = 'url("' + img.replace(/"/g, '%22') + '")'
            prev.classList.add('cover')
          } else {
            const txt = S.pageText(row).trim().split('\n').slice(0, 6)
            txt.forEach(t => prev.appendChild(h('div.card-line', { text: t })))
          }
        }
        card.appendChild(prev)
      }
      const body = h('div.card-body')
      body.appendChild(h('div.card-title', null, row.icon ? h('span.card-icon', { text: row.icon }) : null, h('span', { text: S.pageTitle(row), class: row.title ? null : 'untitled' })))
      props.forEach(p => {
        const v = getValue(row, p)
        if (p.type !== 'checkbox' && isEmpty(v)) return
        const val = renderValue(row, p, true)
        if (val) body.appendChild(h('div.card-prop', { title: p.name }, p.type === 'checkbox' ? h('span.card-prop-name', null, val, ' ' + p.name) : val))
      })
      card.appendChild(body)
      if (!locked) {
        const more = h('button.card-more', { title: 'Options' }, U.icon('dots', 14))
        more.addEventListener('click', e => {
          e.stopPropagation()
          this.rowMenu(more, row)
        })
        card.appendChild(more)
      }
      card.addEventListener('click', () => this.openRow(row))
      return card
    }

    renderBoard(rows) {
      const prop = this.groupProp()
      if (!prop) return this.needProp('A board groups cards by a Select or Status property.', 'status')
      const view = this.view
      const locked = this.page.locked
      const props = this.visibleProps().filter(p => p.id !== prop.id)
      const board = h('div.board')
      const groups = [{ id: null, opt: null }].concat((prop.options || []).map(o => ({ id: o.id, opt: o })))
      groups.forEach(g => {
        const items = rows.filter(r => (r.props[prop.id] || null) === g.id)
        if (g.id === null && !items.length) return
        const col = h('div.board-col', { class: g.opt ? 'col-' + g.opt.color : 'col-none' })
        const head = h('div.board-head', null,
          g.opt ? pill(g.opt, prop.type === 'status') : h('span.pill.opt-none', null, U.icon('eyeOff', 12), h('span.pill-text', { text: 'No ' + prop.name })),
          h('span.board-count', { text: String(items.length) }),
          h('div.spacer'),
          locked ? null : h('button.btn-icon', { title: 'New', onClick: () => this.newRow(g.id ? { [prop.id]: g.id } : {}, true) }, U.icon('plus', 14))
        )
        col.appendChild(head)
        const list = h('div.board-cards', { dataset: { group: g.id || '' } })
        items.forEach(r => list.appendChild(this.card(r, props)))
        if (!locked) list.appendChild(h('button.board-new', { onClick: () => this.newRow(g.id ? { [prop.id]: g.id } : {}, true) }, U.icon('plus', 14), 'New'))
        col.appendChild(list)
        if (!locked) this.boardDnD(list, prop, g.id)
        board.appendChild(col)
      })
      if (!locked) {
        const addGroup = h('button.board-add-group', null, U.icon('plus', 14), 'Add group')
        addGroup.addEventListener('click', () =>
          UI.inputPopover(addGroup, {
            placeholder: 'Group name',
            onSubmit: name => {
              name = name.trim()
              if (!name) return
              prop.options = (prop.options || []).concat([{ id: U.uid(), name, color: OPTION_COLORS[(prop.options || []).length % OPTION_COLORS.length] }])
              this.commit()
            },
          })
        )
        board.appendChild(h('div.board-col.board-col-add', null, addGroup))
      }
      this.bodyEl.appendChild(board)
      void view
    }

    boardDnD(list, prop, groupId) {
      list.addEventListener('dragstart', e => {
        const card = e.target.closest('.card')
        if (!card) return
        this.dragRow = card.dataset.id
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', card.dataset.id)
        setTimeout(() => card.classList.add('dragging'), 0)
      })
      list.addEventListener('dragend', e => {
        const card = e.target.closest('.card')
        if (card) card.classList.remove('dragging')
        this.dragRow = null
        U.$$('.card-drop', this.host).forEach(x => x.remove())
      })
      list.addEventListener('dragover', e => {
        if (!this.dragRow) return
        e.preventDefault()
        const cards = U.$$('.card', list).filter(c => c.dataset.id !== this.dragRow)
        let before = null
        for (let i = 0; i < cards.length; i++) {
          const r = cards[i].getBoundingClientRect()
          if (e.clientY < r.top + r.height / 2) {
            before = cards[i]
            break
          }
        }
        U.$$('.card-drop', this.host).forEach(x => x.remove())
        const marker = h('div.card-drop')
        if (before) list.insertBefore(marker, before)
        else list.insertBefore(marker, list.querySelector('.board-new'))
        this.dropBefore = before ? before.dataset.id : null
      })
      list.addEventListener('drop', e => {
        if (!this.dragRow) return
        e.preventDefault()
        const id = this.dragRow
        const row = S.page(id)
        row.props[prop.id] = groupId
        row.updatedAt = Date.now()
        const order = this.db.rowOrder.filter(x => x !== id)
        if (this.dropBefore) order.splice(order.indexOf(this.dropBefore), 0, id)
        else {
          const inGroup = order.filter(x => S.page(x) && (S.page(x).props[prop.id] || null) === groupId)
          const last = inGroup[inGroup.length - 1]
          order.splice(last ? order.indexOf(last) + 1 : order.length, 0, id)
        }
        this.db.rowOrder = order
        this.dragRow = null
        this.muted = true
        S.commit('row', id)
        this.muted = false
        this.commit()
      })
    }

    // ------------------------------------------------ gallery
    renderGallery(rows) {
      const props = this.visibleProps()
      const grid = h('div.gallery')
      rows.forEach(r => grid.appendChild(this.card(r, props, { preview: this.view.preview !== 'none' })))
      if (!this.page.locked) grid.appendChild(h('button.gallery-new', { onClick: () => this.newRow({}, true) }, U.icon('plus', 16), 'New'))
      this.bodyEl.appendChild(grid)
    }

    // ------------------------------------------------ list
    renderList(rows) {
      const props = this.visibleProps()
      const list = h('div.dblist')
      rows.forEach(r => {
        const item = h('div.dblist-row', { onClick: () => this.openRow(r) },
          r.icon ? h('span.dblist-icon', { text: r.icon }) : h('span.dblist-icon.faint', null, U.icon('page', 16)),
          h('span.dblist-title', { text: S.pageTitle(r), class: r.title ? null : 'untitled' }),
          h('div.spacer'),
          h('div.dblist-props', null, props.map(p => {
            const v = getValue(r, p)
            if (isEmpty(v) && p.type !== 'checkbox') return null
            return renderValue(r, p, true)
          }))
        )
        if (!this.page.locked) {
          const more = h('button.card-more', { title: 'Options' }, U.icon('dots', 14))
          more.addEventListener('click', e => {
            e.stopPropagation()
            this.rowMenu(more, r)
          })
          item.appendChild(more)
        }
        list.appendChild(item)
      })
      if (!rows.length) list.appendChild(h('div.db-empty', { text: 'No pages yet' }))
      if (!this.page.locked) list.appendChild(h('div.tbl-new', { onClick: () => this.newRow({}, true) }, U.icon('plus', 14), 'New'))
      this.bodyEl.appendChild(list)
    }

    // ------------------------------------------------ calendar
    renderCalendar(rows) {
      const view = this.view
      let prop = this.db.properties.find(p => p.id === view.dateProp && p.type === 'date')
      if (!prop) {
        prop = this.db.properties.find(p => p.type === 'date')
        if (prop) view.dateProp = prop.id
      }
      if (!prop) return this.needProp('A calendar places pages by a Date property.', 'date')
      const locked = this.page.locked
      const now = new Date()
      if (!this.calMonth) this.calMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const month = this.calMonth
      const head = h('div.cal-head', null,
        h('div.cal-title', { text: U.MONTHS[month.getMonth()] + ' ' + month.getFullYear() }),
        h('div.spacer'),
        h('button.btn-icon', { title: 'Previous month', onClick: () => { this.calMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1); this.renderBody() } }, U.icon('chevronLeft', 14)),
        h('button.btn-text', { onClick: () => { this.calMonth = new Date(now.getFullYear(), now.getMonth(), 1); this.renderBody() } }, 'Today'),
        h('button.btn-icon', { title: 'Next month', onClick: () => { this.calMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1); this.renderBody() } }, U.icon('chevronRight', 14))
      )
      const grid = h('div.cal-grid')
      ;['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => grid.appendChild(h('div.cal-dow', { text: d })))
      const first = new Date(month)
      first.setDate(1 - first.getDay())
      const todayIso = U.toISODate(now)
      const byDate = {}
      rows.forEach(r => {
        const v = r.props[prop.id]
        if (v) (byDate[v] = byDate[v] || []).push(r)
      })
      const weeks = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7)
      for (let i = 0; i < weeks * 7; i++) {
        const d = new Date(first)
        d.setDate(first.getDate() + i)
        const iso = U.toISODate(d)
        const cell = h('div.cal-cell', { class: (d.getMonth() !== month.getMonth() ? 'other ' : '') + (iso === todayIso ? 'today' : ''), dataset: { date: iso } },
          h('div.cal-cell-head', null,
            locked ? null : h('button.cal-add', { title: 'New page on this day', onClick: () => this.newRow({ [prop.id]: iso }, true) }, U.icon('plus', 12)),
            h('div.spacer'),
            h('span.cal-num', { text: d.getDate() === 1 ? U.MONTHS[d.getMonth()].slice(0, 3) + ' 1' : String(d.getDate()) })
          )
        )
        ;(byDate[iso] || []).forEach(r => {
          const ev = h('div.cal-event', { draggable: locked ? 'false' : 'true', dataset: { id: r.id }, onClick: () => this.openRow(r) },
            r.icon ? h('span', { text: r.icon + ' ' }) : null,
            h('span', { text: S.pageTitle(r) })
          )
          ev.addEventListener('dragstart', e => {
            this.dragRow = r.id
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', r.id)
          })
          cell.appendChild(ev)
        })
        if (!locked) {
          cell.addEventListener('dragover', e => {
            if (!this.dragRow) return
            e.preventDefault()
            cell.classList.add('drop')
          })
          cell.addEventListener('dragleave', () => cell.classList.remove('drop'))
          cell.addEventListener('drop', e => {
            if (!this.dragRow) return
            e.preventDefault()
            const row = S.page(this.dragRow)
            this.dragRow = null
            setValue(row, prop, iso)
          })
        }
        grid.appendChild(cell)
      }
      const undated = rows.filter(r => !r.props[prop.id]).length
      this.bodyEl.appendChild(h('div.calendar', null, head, grid, undated ? h('div.cal-foot.muted', { text: undated + (undated === 1 ? ' page has' : ' pages have') + ' no ' + prop.name.toLowerCase() }) : null))
    }

    // ------------------------------------------------ menus
    viewMenu(anchor, v) {
      const db = this.db
      if (this.page.locked) return
      const input = h('input.pop-input', { value: v.name })
      input.addEventListener('input', () => {
        v.name = input.value
      })
      input.addEventListener('keydown', e => {
        e.stopPropagation()
        if (e.key === 'Enter') m.close()
      })
      const m = UI.menu(anchor, [
        { render: () => h('div.menu-pad', null, input) },
        {
          label: 'Layout',
          icon: VIEW_ICONS[v.type],
          hint: S.VIEW_LABELS[v.type],
          submenu: () =>
            Object.keys(VIEW_ICONS).map(t => ({
              label: S.VIEW_LABELS[t],
              icon: VIEW_ICONS[t],
              checked: v.type === t,
              onClick: () => {
                if (Object.keys(S.VIEW_LABELS).some(k => S.VIEW_LABELS[k] === v.name)) v.name = S.VIEW_LABELS[t]
                v.type = t
                this.commit()
              },
            })),
        },
        {
          label: 'Duplicate view',
          icon: 'duplicate',
          onClick: () => {
            const copy = JSON.parse(JSON.stringify(v))
            copy.id = U.uid()
            copy.name = v.name + ' (copy)'
            db.views.splice(db.views.indexOf(v) + 1, 0, copy)
            db.activeView = copy.id
            this.commit()
          },
        },
        db.views.length > 1
          ? {
              label: 'Delete view',
              icon: 'trash',
              danger: true,
              onClick: () => {
                db.views = db.views.filter(x => x.id !== v.id)
                if (db.activeView === v.id) db.activeView = db.views[0].id
                this.commit()
              },
            }
          : null,
      ], {
        width: 240,
        onClose: () => {
          if (!v.name.trim()) v.name = S.VIEW_LABELS[v.type]
          this.commit()
        },
      })
      if (m) setTimeout(() => input.select(), 0)
    }

    settingsMenu(anchor) {
      const view = this.view
      const db = this.db
      const locked = this.page.locked
      const items = [
        { header: 'View options' },
        locked
          ? null
          : {
              label: 'Layout',
              icon: VIEW_ICONS[view.type],
              hint: S.VIEW_LABELS[view.type],
              submenu: () =>
                Object.keys(VIEW_ICONS).map(t => ({
                  label: S.VIEW_LABELS[t],
                  icon: VIEW_ICONS[t],
                  checked: view.type === t,
                  onClick: () => {
                    view.type = t
                    this.commit()
                  },
                })),
            },
        {
          label: 'Properties',
          icon: 'eye',
          hint: String(this.visibleProps(true).length) + ' shown',
          subWidth: 250,
          submenu: () =>
            db.properties.map(p => ({
              label: p.name,
              icon: TYPES[p.type].icon,
              checked: (view.hidden || []).indexOf(p.id) === -1,
              keepOpen: true,
              disabled: p.type === 'title',
              onClick: () => {
                const hid = view.hidden || []
                view.hidden = hid.indexOf(p.id) === -1 ? hid.concat([p.id]) : hid.filter(x => x !== p.id)
                this.commit()
              },
            })),
        },
        view.type === 'board'
          ? {
              label: 'Group by',
              icon: 'board',
              hint: (db.properties.find(p => p.id === view.groupBy) || {}).name || 'None',
              submenu: () =>
                db.properties
                  .filter(p => p.type === 'select' || p.type === 'status')
                  .map(p => ({
                    label: p.name,
                    icon: TYPES[p.type].icon,
                    checked: view.groupBy === p.id,
                    onClick: () => {
                      view.groupBy = p.id
                      this.commit()
                    },
                  })),
            }
          : null,
        view.type === 'calendar'
          ? {
              label: 'Show calendar by',
              icon: 'calendar',
              hint: (db.properties.find(p => p.id === view.dateProp) || {}).name || 'None',
              submenu: () =>
                db.properties
                  .filter(p => p.type === 'date')
                  .map(p => ({
                    label: p.name,
                    icon: 'calendar',
                    checked: view.dateProp === p.id,
                    onClick: () => {
                      view.dateProp = p.id
                      this.commit()
                    },
                  })),
            }
          : null,
        view.type === 'gallery'
          ? {
              label: 'Card preview',
              icon: 'image',
              hint: view.preview === 'none' ? 'None' : 'Cover or content',
              submenu: () => [
                { label: 'Cover or content', checked: view.preview !== 'none', onClick: () => { view.preview = 'content'; this.commit() } },
                { label: 'None', checked: view.preview === 'none', onClick: () => { view.preview = 'none'; this.commit() } },
              ],
            }
          : null,
        { divider: true },
        locked ? null : { label: 'Add a property', icon: 'plus', onClick: () => addPropertyMenu(anchor, this.page, view) },
        { label: 'Export as Markdown', icon: 'download', onClick: () => U.download(S.pageTitle(this.page) + '.md', F.md.fromPage(this.page), 'text/markdown') },
        this.opts.inline ? { label: 'Open as full page', icon: 'open', onClick: () => F.app.open(this.dbId) } : null,
      ]
      UI.menu(anchor, items, { width: 260, placement: 'bottom-end' })
    }

    openFilters(anchor) {
      const view = this.view
      const db = this.db
      const box = h('div.rules')
      let pop
      const render = () => {
        box.innerHTML = ''
        view.filters = (view.filters || []).filter(f => db.properties.find(p => p.id === f.prop))
        if (!view.filters.length) box.appendChild(h('div.rules-empty', { text: 'No filters applied to this view' }))
        view.filters.forEach((f, i) => {
          const prop = db.properties.find(p => p.id === f.prop)
          const propSel = h('select.rule-sel', null, db.properties.map(p => h('option', { value: p.id, text: p.name, selected: p.id === f.prop ? true : null })))
          propSel.addEventListener('change', () => {
            const np = db.properties.find(p => p.id === propSel.value)
            f.prop = np.id
            f.op = OPS[np.type][0]
            f.value = ''
            apply()
          })
          const opSel = h('select.rule-sel', null, OPS[prop.type].map(o => h('option', { value: o, text: o, selected: o === f.op ? true : null })))
          opSel.addEventListener('change', () => {
            f.op = opSel.value
            apply()
          })
          let valEl = null
          if (!NO_VALUE[f.op]) {
            if (isSelect(prop.type)) {
              valEl = h('select.rule-sel', null, [h('option', { value: '', text: 'Select an option' })].concat((prop.options || []).map(o => h('option', { value: o.id, text: o.name, selected: o.id === f.value ? true : null }))))
              valEl.addEventListener('change', () => {
                f.value = valEl.value
                apply(true)
              })
            } else {
              valEl = h('input.rule-input', {
                type: prop.type === 'number' ? 'number' : /date|time/.test(prop.type) ? 'date' : 'text',
                value: f.value || '',
                placeholder: 'Value',
              })
              valEl.addEventListener('input', () => {
                f.value = valEl.value
                apply(true)
              })
              valEl.addEventListener('keydown', e => e.stopPropagation())
            }
          }
          box.appendChild(
            h('div.rule', null,
              h('span.rule-where', { text: i === 0 ? 'Where' : 'And' }),
              propSel,
              opSel,
              valEl,
              h('button.btn-icon', {
                title: 'Remove filter',
                onClick: () => {
                  view.filters.splice(i, 1)
                  apply()
                },
              }, U.icon('x', 14))
            )
          )
        })
        box.appendChild(
          h('div.rules-foot', null,
            h('button.btn-text', {
              onClick: () => {
                const p = db.properties[0]
                view.filters.push({ prop: p.id, op: OPS[p.type][0], value: '' })
                apply()
              },
            }, U.icon('plus', 14), 'Add a filter'),
            view.filters.length ? h('button.btn-text.danger', { onClick: () => { view.filters = []; apply() } }, 'Clear all') : null
          )
        )
      }
      const apply = keepFocus => {
        this.muted = true
        S.commit('db', this.dbId)
        this.muted = false
        this.renderChips()
        this.renderBody()
        this.filterBtn.classList.toggle('on', view.filters.length > 0)
        if (!keepFocus) render()
        if (pop) pop.reposition()
      }
      render()
      pop = UI.popover(anchor, h('div.rules-pop', null, box), { width: 520, placement: 'bottom-end', autofocus: false })
    }

    openSorts(anchor) {
      const view = this.view
      const db = this.db
      const box = h('div.rules')
      let pop
      const render = () => {
        box.innerHTML = ''
        view.sorts = (view.sorts || []).filter(s => db.properties.find(p => p.id === s.prop))
        if (!view.sorts.length) box.appendChild(h('div.rules-empty', { text: 'No sorts applied to this view' }))
        view.sorts.forEach((s, i) => {
          const propSel = h('select.rule-sel', null, db.properties.map(p => h('option', { value: p.id, text: p.name, selected: p.id === s.prop ? true : null })))
          propSel.addEventListener('change', () => {
            s.prop = propSel.value
            apply()
          })
          const dirSel = h('select.rule-sel', null, [h('option', { value: 'asc', text: 'Ascending', selected: s.dir !== 'desc' ? true : null }), h('option', { value: 'desc', text: 'Descending', selected: s.dir === 'desc' ? true : null })])
          dirSel.addEventListener('change', () => {
            s.dir = dirSel.value
            apply()
          })
          box.appendChild(
            h('div.rule', null,
              h('span.rule-where', { text: i === 0 ? 'Sort by' : 'Then by' }),
              propSel,
              dirSel,
              h('button.btn-icon', { title: 'Remove sort', onClick: () => { view.sorts.splice(i, 1); apply() } }, U.icon('x', 14))
            )
          )
        })
        const unused = db.properties.filter(p => !view.sorts.some(s => s.prop === p.id))
        box.appendChild(
          h('div.rules-foot', null,
            unused.length ? h('button.btn-text', { onClick: () => { view.sorts.push({ prop: unused[0].id, dir: 'asc' }); apply() } }, U.icon('plus', 14), 'Add a sort') : null,
            view.sorts.length ? h('button.btn-text.danger', { onClick: () => { view.sorts = []; apply() } }, 'Delete sort') : null
          )
        )
      }
      const apply = () => {
        this.muted = true
        S.commit('db', this.dbId)
        this.muted = false
        this.renderChips()
        this.renderBody()
        this.sortBtn.classList.toggle('on', view.sorts.length > 0)
        render()
        if (pop) pop.reposition()
      }
      render()
      pop = UI.popover(anchor, h('div.rules-pop', null, box), { width: 420, placement: 'bottom-end', autofocus: false })
    }
  }

  function findImage(blocks) {
    let url = null
    S.walkBlocks(blocks || [], b => {
      if (b.type === 'image' && b.url) {
        url = b.url
        return false
      }
    })
    return url
  }

  // ---------------------------------------------------------------- row properties panel
  class RowProps {
    constructor(host, page) {
      this.host = host
      this.pageId = page.id
      this.render()
      this.unsub = S.on((type, id) => {
        const p = S.page(this.pageId)
        if (!p) return
        if ((type === 'row' && id === this.pageId) || (type === 'db' && id === p.parentId)) this.render()
      })
    }
    render() {
      const page = S.page(this.pageId)
      this.host.innerHTML = ''
      if (!page) return
      const dbPage = S.page(page.parentId)
      if (!dbPage || !dbPage.db) return
      const locked = page.locked || dbPage.locked
      dbPage.db.properties.forEach(prop => {
        if (prop.type === 'title') return
        const name = h('div.prop-label', { title: prop.name }, U.icon(TYPES[prop.type].icon, 14), h('span', { text: prop.name }))
        if (!locked) name.addEventListener('click', () => propertyMenu(name, dbPage, prop, null))
        const valueEl = renderValue(page, prop)
        const val = h('div.prop-value', { class: 'pv-' + prop.type }, valueEl || h('span.prop-empty', { text: 'Empty' }))
        if (!locked && prop.type !== 'created_time' && prop.type !== 'last_edited_time') {
          val.addEventListener('click', e => {
            if (e.target.closest('a')) return
            val.classList.add('editing')
            editValue(val, page, prop, dbPage, () => val.classList.remove('editing'))
          })
        }
        this.host.appendChild(h('div.prop-row', null, name, val))
      })
      if (!locked) {
        const add = h('button.prop-add', null, U.icon('plus', 14), 'Add a property')
        add.addEventListener('click', () => addPropertyMenu(add, dbPage, null))
        this.host.appendChild(add)
      }
      this.host.appendChild(h('div.prop-sep'))
    }
    destroy() {
      this.unsub()
    }
  }

  F.database = {
    TYPES,
    mount: (host, dbId, opts) => new DbView(host, dbId, opts),
    rowProps: (host, page) => new RowProps(host, page),
    viewRows,
  }
})(window.Folio)
