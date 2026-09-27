# Folio

Folio is a personal workspace for the whole day: tasks, a calendar, a focus
timer, habits, projects and notes, all in one app. It is written in plain HTML,
CSS and JavaScript, needs no build step, and keeps all data in the browser's
`localStorage`.

- `index.html`: the landing page
- `app.html`: the workspace app

## Running it

Open `folio/index.html` or `folio/app.html` in a browser. Everything also works
from a static server:

```
cd folio
python3 -m http.server 8080
# then visit http://localhost:8080/app.html
```

When it's served over http(s), a service worker caches the app so it opens
without a connection after the first visit, and browsers can install it as a
standalone app from the address bar.

## The app

**Dashboard.** A greeting with what's due, scheduled and overdue; quick
actions to plan the day, start a focus session, open today's note or block
time; stat cards for tasks due, tasks completed this week, focus time and
habits; today's schedule with a live "now" line; your task list with a quick
add box; upcoming deadlines; top projects with progress and health; the focus
timer, today's habits, a scratchpad and recent pages.

**Tasks.** My Tasks groups work by date (overdue, today, tomorrow, next 7 days,
later), project or priority, with filters for today, upcoming, no date and
completed. Quick add understands natural language: `Email Sam tomorrow 3pm
#q4 !high`, `Long run sunday 7am every week for 1h`, `@label`, `!!!`. A task
drawer holds status, due date and time, duration, priority, project, repeat,
labels, subtasks and notes. Repeating tasks create their next occurrence when
you finish one, and undo puts things back.

**Board.** A Kanban board (To do, In progress, Review, Done) across all tasks
or a single project, with drag and drop between and within columns.

**Calendar.** Day, week and month views. Drag on empty space to create an
event, drag events and timed tasks to move them (across days too), and drag
the bottom edge to resize. Events have calendars (Work, Personal, Health,
Learning, Social), location, notes and a tentative or confirmed status. Tasks
with a date but no time appear in the all-day row.

**Projects.** Project cards with progress, health and due dates, and a page per
project with its tasks, board, notes and timeline. Projects can be pinned to
the sidebar, paused or completed.

**Focus.** A Pomodoro-style timer with focus, short break and long break modes,
rounds, an optional chime, a task to focus on and a weekly chart. The timer
keeps running while you move around the app and shows in the top bar.

**Habits.** Daily or weekly goals, one-tap check-ins, streaks, best streak,
30-day rate and a heatmap of recent weeks.

**Timeline.** A Gantt-style view of projects and their dated tasks with today
marked; drag bars to reschedule.

**Docs.** A block editor with headings, to-dos, lists, toggles, callouts,
quotes, code with syntax highlighting, images, tables, sub-pages, inline
databases, `/` commands, `@` mentions, `:` emoji, Markdown shortcuts and paste,
backlinks and page history. Databases have table, board, gallery, list and
calendar views with properties, filters, sorts and column calculations.
Templates and a daily note are one click away.

**Everywhere.** Search and commands on `Ctrl/⌘ K` or `/`, `Q` for a new task,
`G` then a letter to jump (`H` dashboard, `T` tasks, `B` board, `C` calendar,
`P` projects, `F` focus, `A` habits, `L` timeline, `D` docs), `Ctrl/⌘ Shift L`
for light or dark, `Ctrl/⌘ \` to hide the sidebar and `?` for the full list.
Reminders appear 10 minutes before events and timed tasks. Appearance settings
cover theme, accent color and wallpaper; workspace data can be exported and
imported as JSON.

## Code layout

| File                 | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `js/util.js`         | DOM and date helpers, caret utilities, sanitizer, icons     |
| `js/store.js`        | Workspace state, persistence, trash, undo, page history     |
| `js/planner.js`      | Tasks, projects, events, habits and focus data; quick add   |
| `js/kit.js`          | Shared UI pieces: cards, pills, rings, charts, task rows    |
| `js/app.js`          | Shell: sidebar, top bar, routing, search, settings, keys    |
| `js/dashboard.js`    | Dashboard                                                   |
| `js/tasks.js`        | Task drawer, My Tasks and the Kanban board                  |
| `js/calendar.js`     | Calendar views and the event editor                         |
| `js/projects.js`     | Projects overview and project pages                         |
| `js/focus.js`        | Focus timer and its view                                    |
| `js/habits.js`       | Habits, streaks and heatmaps                                |
| `js/timeline.js`     | Project timeline                                            |
| `js/editor.js`       | Block editor, slash/mention menus, toolbar                  |
| `js/database.js`     | Database views, properties, filters and sorts               |
| `js/ui.js`           | Popovers, menus, modals, toasts and pickers                 |
| `js/md.js`           | Markdown import and export                                  |
| `js/highlight.js`    | Syntax highlighter for code blocks                          |
| `js/templates.js`    | Page templates                                              |
| `js/seed.js`         | Starter workspace content                                   |
| `js/emoji.js`        | Emoji data for the icon picker                              |
| `js/landing.js`      | Landing page demos and scroll effects                       |
| `css/app.css`        | Design tokens, shell, editor and database styles            |
| `css/views.css`      | Dashboard, tasks, calendar, focus, habits and other views   |
| `css/landing.css`    | Landing page                                                |
| `sw.js`              | Service worker for offline use                              |
