/* Folio — habits with streaks and heatmaps. */
window.Folio = window.Folio || {}
;(function(F) {
  'use strict'
  const U = F.util
  const h = U.h
  const UI = F.ui
  const P = F.planner
  const K = F.kit
  const V = (F.views = F.views || {})

  function goalText(g) {
    return g >= 7 ? 'Every day' : g + '× a week'
  }

  function habitDialog(existing) {
    const hb = existing || { name: '', icon: '✨', tone: 'lavender', goal: 7 }
    let icon = hb.icon
    let tone = hb.tone
    let goal = hb.goal
    let m
    const name = h('input.set-input', { value: hb.name, placeholder: 'e.g. Walk 8,000 steps', id: 'habit-name', 'aria-label': 'Habit name' })
    const iconBtn = h('button.habit-icon-pick', { class: 'tone-' + tone, text: icon, title: 'Pick an icon' })
    iconBtn.addEventListener('click', () => UI.emojiPicker(iconBtn, { onSelect: e => { icon = e; iconBtn.textContent = e } }))
    const tones = h('div.tone-pick')
    const goals = h('div')
    function paint() {
      iconBtn.className = 'habit-icon-pick tone-' + tone
      tones.innerHTML = ''
      P.TONES.forEach(t => tones.appendChild(h('button.tone-dot', { class: 'tone-' + t + (t === tone ? ' active' : ''), title: t, onClick: () => { tone = t; paint() } })))
      goals.innerHTML = ''
      goals.appendChild(K.segmented([3, 4, 5, 6, 7].map(n => ({ id: n, label: n === 7 ? 'Daily' : n + '×/wk' })), goal, v => { goal = v; paint() }, 'seg-sm'))
    }
    paint()
    function submit() {
      const n = name.value.trim()
      if (!n) return name.focus()
      if (existing) P.updateHabit(existing.id, { name: n, icon, tone, goal })
      else P.addHabit({ name: n, icon, tone, goal })
      m.close()
    }
    name.addEventListener('keydown', e => {
      if (e.key === 'Enter') submit()
    })
    m = UI.modal(
      h('div.habit-dialog', null,
        h('div.confirm-title', { text: existing ? 'Edit habit' : 'New habit' }),
        h('div.hd-row', null, iconBtn, name),
        h('div.hd-label', { text: 'Color' }), tones,
        h('div.hd-label', { text: 'Goal' }), goals,
        h('div.confirm-actions', null,
          existing ? h('button.btn-text.danger', { onClick: () => {
            m.close()
            const gone = P.deleteHabit(existing.id)
            UI.toast('Deleted “' + gone.name + '”', { action: { label: 'Undo', onClick: () => { F.store.state().habits[gone.id] = gone; F.store.commit('habits') } } })
          } }, 'Delete') : null,
          h('div.spacer'),
          h('button.btn', { onClick: () => m.close() }, 'Cancel'),
          h('button.btn-ink', { onClick: submit }, existing ? 'Save' : 'Create habit')
        )
      ),
      { width: 440 }
    )
  }

  function heatmap(hb, weeks) {
    const t = U.todayISO()
    const start = U.addDays(U.weekStart(t, true), -7 * (weeks - 1))
    const grid = h('div.heat', { style: { gridTemplateColumns: 'repeat(' + weeks + ', 1fr)' } })
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const iso = U.addDays(start, w * 7 + d)
        const future = iso > t
        grid.appendChild(h('i', { class: (hb.days[iso] ? 'on ' : '') + (future ? 'future ' : '') + (iso === t ? 'today' : ''), title: U.formatDate(iso) + (hb.days[iso] ? ' · done' : ''), style: { gridColumn: w + 1, gridRow: d + 1 } }))
      }
    }
    return grid
  }

  function habitCard(hb) {
    const t = U.todayISO()
    const weekStart = U.weekStart(t, true)
    const streak = P.habitStreak(hb)
    const week = h('div.hweek')
    for (let i = 0; i < 7; i++) {
      const iso = U.addDays(weekStart, i)
      const future = iso > t
      week.appendChild(
        h('button.hday', { class: (hb.days[iso] ? 'on ' : '') + (iso === t ? 'today' : ''), disabled: future ? true : null, title: U.formatDate(iso), onClick: () => {
          if (P.toggleHabit(hb.id, iso)) K.celebrate()
        } },
          h('span.hday-l', { text: U.DAYS[U.parseISODate(iso).getDay()].charAt(0) }),
          h('span.hday-c', null, U.icon('check', 12))
        )
      )
    }
    const weekDone = [0, 1, 2, 3, 4, 5, 6].filter(i => hb.days[U.addDays(weekStart, i)]).length
    return h('div.habit-card', { class: 'tone-' + hb.tone },
      h('div.hb-top', null,
        h('span.hb-icon', { text: hb.icon }),
        h('div.hb-text', null, h('div.hb-name', { text: hb.name }), h('div.hb-goal', { text: goalText(hb.goal) + ' · ' + weekDone + '/' + Math.min(7, hb.goal) + ' this week' })),
        h('span.hb-streak', { class: streak ? 'hot' : null, title: 'Current streak' }, U.icon('flame', 14), h('b.num', { text: String(streak) })),
        h('button.btn-icon', { title: 'Edit habit', onClick: () => habitDialog(hb) }, U.icon('dots', 15))
      ),
      week,
      heatmap(hb, 17),
      h('div.hb-stats', null,
        h('div', null, h('b.num', { text: P.habitBest(hb) + 'd' }), h('span', { text: 'best streak' })),
        h('div', null, h('b.num', { text: P.habitRate(hb, 30) + '%' }), h('span', { text: 'last 30 days' })),
        h('div', null, h('b.num', { text: String(Object.keys(hb.days).length) }), h('span', { text: 'total check-ins' }))
      )
    )
  }

  V.habits = {
    title: 'Habits',
    icon: 'habit',
    mount(host) {
      const root = h('div.vt.vt-habits')
      host.appendChild(root)
      function render() {
        root.innerHTML = ''
        const t = U.todayISO()
        const list = P.habits()
        const done = list.filter(hb => hb.days[t]).length
        const best = list.reduce((a, hb) => Math.max(a, P.habitStreak(hb)), 0)
        root.appendChild(K.head({
          title: 'Habits',
          sub: done + ' of ' + list.length + ' done today · longest current streak ' + best + (best === 1 ? ' day' : ' days'),
          actions: [h('button.btn-ink', { onClick: () => habitDialog() }, U.icon('plus', 15), 'New habit')],
        }))
        // Today strip with big toggles
        const strip = h('div.habit-today', null,
          h('div.ht-ring', null, K.ring(list.length ? (done / list.length) * 100 : 0, { size: 84, stroke: 8, tone: 'mint', label: done + '/' + list.length })),
          h('div.ht-list', null, list.map(hb =>
            h('button.ht-chip', { class: 'tone-' + hb.tone + (hb.days[t] ? ' on' : ''), 'aria-pressed': hb.days[t] ? 'true' : 'false', onClick: () => {
              if (P.toggleHabit(hb.id)) K.celebrate()
            } }, h('span.ht-emoji', { text: hb.icon }), h('span', { text: hb.name }), h('span.ht-check', null, U.icon('check', 12)))
          ))
        )
        root.appendChild(strip)
        const grid = h('div.habit-grid')
        list.forEach(hb => grid.appendChild(habitCard(hb)))
        grid.appendChild(h('button.habit-card.habit-new', { onClick: () => habitDialog() }, h('span.pn-plus', null, U.icon('plus', 22)), h('span', { text: 'New habit' }), h('span.muted.small', { text: 'Small, repeatable, trackable' })))
        root.appendChild(grid)
      }
      render()
      const unsub = K.watch(['habits'], render)
      return { destroy: unsub }
    },
  }
})(window.Folio)
