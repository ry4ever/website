/* Folio — a tiny, dependency-free syntax highlighter for code blocks. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util

  const JS_KW =
    'break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await null true false undefined static get set'
  const KW = {
    javascript: JS_KW,
    typescript: JS_KW + ' interface type enum implements private public protected readonly declare namespace abstract as any number string boolean unknown never keyof',
    python: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self print',
    java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws try void volatile while true false null var record',
    c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while NULL true false include define',
    cpp: 'auto bool break case catch char class const constexpr continue default delete do double else enum explicit export extern false float for friend goto if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while include define std',
    csharp: 'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while async await',
    go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil string int bool error byte rune float64 make len append',
    rust: 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while Some None Ok Err String Vec Option Result',
    ruby: 'alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield require attr_accessor puts',
    php: 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include instanceof insteadof interface isset list match namespace new or print private protected public require return static switch throw trait try unset use var while xor yield true false null',
    swift: 'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch false is nil super self Self throw throws true try async await',
    kotlin: 'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while by catch constructor data enum finally get import init lateinit open override private protected public sealed set suspend',
    sql: 'select from where and or not insert into values update set delete create table drop alter add join left right inner outer full on as group by order having limit offset distinct union all case when then else end null is in like between exists primary key foreign references index view default count sum avg min max asc desc',
    bash: 'if then else elif fi for while in do done case esac function return local export echo exit cd ls grep sed awk cat sudo source alias unset read',
    css: 'important',
    json: 'true false null',
    yaml: 'true false null yes no',
  }
  const HASH_COMMENT = { python: 1, ruby: 1, bash: 1, yaml: 1 }

  F.LANGUAGES = [
    ['plain', 'Plain text'],
    ['bash', 'Bash'],
    ['c', 'C'],
    ['cpp', 'C++'],
    ['csharp', 'C#'],
    ['css', 'CSS'],
    ['go', 'Go'],
    ['html', 'HTML'],
    ['java', 'Java'],
    ['javascript', 'JavaScript'],
    ['json', 'JSON'],
    ['kotlin', 'Kotlin'],
    ['markdown', 'Markdown'],
    ['php', 'PHP'],
    ['python', 'Python'],
    ['ruby', 'Ruby'],
    ['rust', 'Rust'],
    ['sql', 'SQL'],
    ['swift', 'Swift'],
    ['typescript', 'TypeScript'],
    ['yaml', 'YAML'],
  ]

  const sets = {}
  function kwSet(lang) {
    if (!sets[lang]) {
      const s = {}
      ;(KW[lang] || '').split(' ').forEach(w => {
        if (w) s[lang === 'sql' ? w.toLowerCase() : w] = 1
      })
      sets[lang] = s
    }
    return sets[lang]
  }

  function span(cls, text) {
    return '<span class="tok-' + cls + '">' + U.escapeHTML(text) + '</span>'
  }

  function highlightMarkup(code) {
    const re = /(<!--[\s\S]*?-->)|(<\/?[\w-]+)|("[^"\n]*"|'[^'\n]*')|(\/?>)|([\w-]+)(?==)/g
    let out = ''
    let last = 0
    let m
    while ((m = re.exec(code))) {
      out += U.escapeHTML(code.slice(last, m.index))
      if (m[1]) out += span('comment', m[1])
      else if (m[2]) out += span('keyword', m[2])
      else if (m[3]) out += span('string', m[3])
      else if (m[4]) out += span('keyword', m[4])
      else if (m[5]) out += span('attr', m[5])
      last = re.lastIndex
    }
    return out + U.escapeHTML(code.slice(last))
  }

  function highlightMarkdown(code) {
    return code
      .split('\n')
      .map(line => {
        if (/^#{1,6}\s/.test(line)) return span('keyword', line)
        if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
          const m = /^(\s*(?:[-*+]|\d+\.))(.*)$/.exec(line)
          return span('attr', m[1]) + U.escapeHTML(m[2])
        }
        if (/^>/.test(line)) return span('comment', line)
        return U.escapeHTML(line).replace(/(`[^`]+`)/g, '<span class="tok-string">$1</span>')
      })
      .join('\n')
  }

  F.highlight = function(code, lang) {
    code = code || ''
    if (!lang || lang === 'plain') return U.escapeHTML(code)
    if (lang === 'html' || lang === 'xml') return highlightMarkup(code)
    if (lang === 'markdown') return highlightMarkdown(code)
    const kws = kwSet(lang)
    const comment = HASH_COMMENT[lang] ? '#[^\\n]*' : lang === 'sql' ? '--[^\\n]*' : '\\/\\/[^\\n]*'
    const re = new RegExp(
      '(' + comment + '|\\/\\*[\\s\\S]*?\\*\\/)' +
        '|("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)' +
        '|(\\b\\d+(?:\\.\\d+)?(?:px|em|rem|%|s|ms)?\\b|#[0-9a-fA-F]{3,8}\\b)' +
        '|([A-Za-z_$@][\\w$-]*)',
      'g'
    )
    let out = ''
    let last = 0
    let m
    while ((m = re.exec(code))) {
      out += U.escapeHTML(code.slice(last, m.index))
      if (m[1]) out += span('comment', m[1])
      else if (m[2]) out += span('string', m[2])
      else if (m[3]) out += span('number', m[3])
      else if (m[4]) {
        const w = m[4]
        const key = lang === 'sql' ? w.toLowerCase() : w
        if (kws[key]) out += span('keyword', w)
        else if (/^\s*\(/.test(code.slice(re.lastIndex))) out += span('fn', w)
        else if (lang === 'css' && /^\s*:/.test(code.slice(re.lastIndex))) out += span('attr', w)
        else if (lang === 'json' && /^"/.test(w)) out += span('attr', w)
        else if (/^[A-Z][a-z]/.test(w) && lang !== 'css') out += span('type', w)
        else out += U.escapeHTML(w)
      }
      last = re.lastIndex
    }
    return out + U.escapeHTML(code.slice(last))
  }
})(window.Folio)
