/* Folio — Markdown import/export for pages and pasted text. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const MD = (F.md = {})

  // ---------- inline ----------
  MD.inlineToHtml = function(s) {
    const codes = []
    let out = U.escapeHTML(s).replace(/`([^`]+)`/g, (m, c) => {
      codes.push(c)
      return '\u0000' + (codes.length - 1) + '\u0000'
    })
    out = out
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/__([^_]+)__/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, url) => {
        const href = U.safeUrl(url.replace(/&amp;/g, '&'))
        return href ? '<a href="' + U.escapeHTML(href) + '">' + t + '</a>' : t
      })
    return out.replace(/\u0000(\d+)\u0000/g, (m, i) => '<code>' + codes[+i] + '</code>')
  }

  MD.htmlToInline = function(html) {
    const t = document.createElement('template')
    t.innerHTML = html || ''
    const walk = node => {
      let out = ''
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) out += n.nodeValue.replace(/​/g, '')
        else if (n.nodeType === 1) {
          const inner = walk(n)
          switch (n.tagName) {
            case 'B':
            case 'STRONG':
              out += inner ? '**' + inner + '**' : ''
              break
            case 'I':
            case 'EM':
              out += inner ? '*' + inner + '*' : ''
              break
            case 'S':
              out += inner ? '~~' + inner + '~~' : ''
              break
            case 'CODE':
              out += inner ? '`' + inner + '`' : ''
              break
            case 'A':
              out += n.getAttribute('href') ? '[' + inner + '](' + n.getAttribute('href') + ')' : inner
              break
            case 'BR':
              out += '  \n'
              break
            default:
              out += inner
          }
        }
      })
      return out
    }
    return walk(t.content)
  }

  // ---------- blocks -> markdown ----------
  MD.fromBlocks = function(blocks, depth) {
    depth = depth || 0
    const S = F.store
    const pad = '    '.repeat(depth)
    const lines = []
    let num = 0
    blocks.forEach(b => {
      num = b.type === 'numbered' ? num + 1 : 0
      const t = MD.htmlToInline(b.text)
      let line = null
      switch (b.type) {
        case 'h1':
          line = '# ' + t
          break
        case 'h2':
          line = '## ' + t
          break
        case 'h3':
          line = '### ' + t
          break
        case 'bullet':
        case 'toggle':
          line = '- ' + t
          break
        case 'numbered':
          line = num + '. ' + t
          break
        case 'todo':
          line = '- [' + (b.checked ? 'x' : ' ') + '] ' + t
          break
        case 'quote':
          line = '> ' + t
          break
        case 'callout':
          line = '> ' + (b.icon ? b.icon + ' ' : '') + t
          break
        case 'code':
          line = '```' + (b.language || '') + '\n' + b.text + '\n```'
          break
        case 'divider':
          line = '---'
          break
        case 'image':
          line = b.url ? '![' + S.stripTags(b.text) + '](' + b.url + ')' : ''
          break
        case 'page': {
          const p = S.page(b.pageId)
          line = p ? (p.icon ? p.icon + ' ' : '') + '[' + S.pageTitle(p) + '](' + S.pageTitle(p) + '.md)' : ''
          break
        }
        case 'database':
          line = MD.dbTable(b.pageId)
          break
        case 'toc':
          line = ''
          break
        default:
          line = t
      }
      if (line == null) return
      lines.push(line.split('\n').map(l => (l ? pad + l : l)).join('\n'))
      if (b.children && b.children.length) lines.push(MD.fromBlocks(b.children, depth + 1))
      if (depth === 0 && ['text', 'h1', 'h2', 'h3', 'code', 'divider', 'quote', 'callout', 'image', 'database'].indexOf(b.type) !== -1)
        lines.push('')
    })
    return lines.join('\n')
  }

  MD.propText = function(prop, value) {
    if (value == null || value === '') return ''
    switch (prop.type) {
      case 'checkbox':
        return value ? '✓' : ''
      case 'select':
      case 'status': {
        const o = (prop.options || []).find(o => o.id === value)
        return o ? o.name : ''
      }
      case 'multi_select':
        return (value || [])
          .map(id => (prop.options || []).find(o => o.id === id))
          .filter(Boolean)
          .map(o => o.name)
          .join(', ')
      case 'date':
        return U.formatDate(value)
      default:
        return String(value)
    }
  }

  MD.dbTable = function(dbId) {
    const S = F.store
    const db = S.page(dbId)
    if (!db || !db.db) return ''
    const props = db.db.properties
    const rows = S.dbRows(dbId)
    const esc = s => String(s).replace(/\|/g, '\\|')
    const out = ['**' + S.pageTitle(db) + '**', '']
    out.push('| ' + props.map(p => esc(p.name)).join(' | ') + ' |')
    out.push('| ' + props.map(() => '---').join(' | ') + ' |')
    rows.forEach(r => {
      out.push(
        '| ' +
          props
            .map(p => esc(p.type === 'title' ? S.pageTitle(r) : MD.propText(p, r.props[p.id])))
            .join(' | ') +
          ' |'
      )
    })
    return out.join('\n')
  }

  MD.fromPage = function(p) {
    const S = F.store
    let out = '# ' + (p.icon ? p.icon + ' ' : '') + S.pageTitle(p) + '\n\n'
    if (p.type === 'database') out += MD.dbTable(p.id) + '\n'
    else out += MD.fromBlocks(p.blocks)
    return out.replace(/\n{3,}/g, '\n\n').trim() + '\n'
  }

  // ---------- markdown -> blocks ----------
  MD.toBlocks = function(text) {
    const S = F.store
    const lines = String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
    const root = []
    const stack = [{ indent: -1, children: root }]
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].replace(/\t/g, '    ')
      if (!raw.trim()) continue
      const indent = raw.match(/^ */)[0].length
      const line = raw.trim()
      let block
      let m
      const fence = /^```\s*([\w+#-]*)/.exec(line)
      if (fence) {
        const code = []
        i++
        while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++])
        block = S.newBlock('code', { text: code.join('\n'), language: fence[1] || 'plain' })
      } else if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
        block = S.newBlock('h' + m[1].length, { text: MD.inlineToHtml(m[2]) })
      } else if ((m = /^[-*+]\s+\[([ xX])\]\s*(.*)$/.exec(line))) {
        block = S.newBlock('todo', { text: MD.inlineToHtml(m[2]), checked: m[1] !== ' ' })
      } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
        block = S.newBlock('divider')
      } else if ((m = /^[-*+•]\s+(.*)$/.exec(line))) {
        block = S.newBlock('bullet', { text: MD.inlineToHtml(m[1]) })
      } else if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) {
        block = S.newBlock('numbered', { text: MD.inlineToHtml(m[1]) })
      } else if ((m = /^>\s?(.*)$/.exec(line))) {
        block = S.newBlock('quote', { text: MD.inlineToHtml(m[1]) })
      } else if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line))) {
        block = S.newBlock('image', { url: U.safeUrl(m[2]), text: U.escapeHTML(m[1]) })
      } else {
        block = S.newBlock('text', { text: MD.inlineToHtml(line) })
      }
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
      stack[stack.length - 1].children.push(block)
      if (['bullet', 'numbered', 'todo'].indexOf(block.type) !== -1) {
        stack.push({ indent, children: block.children })
      }
    }
    return root
  }

  // Split a markdown document into a title and blocks.
  MD.toPage = function(text, fallbackTitle) {
    const blocks = MD.toBlocks(text)
    let title = fallbackTitle || ''
    if (blocks.length && blocks[0].type === 'h1') {
      title = U.htmlToText(blocks.shift().text)
    }
    return { title, blocks }
  }
})(window.Folio)
