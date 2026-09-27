# Folio

Folio is a block-based workspace for notes, docs, tasks and small databases. It
is written in plain HTML, CSS and JavaScript, needs no build step, and keeps all
data in the browser's `localStorage`.

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

## Features

**Editor**

- Blocks: text, headings 1–3, to-dos, bulleted and numbered lists, toggles,
  toggle headings, quotes, callouts, dividers, code (with syntax highlighting),
  images, simple tables, sub-pages, links to pages, table of contents and inline
  databases
- `/` command menu, `@` mentions for pages and dates, `:` for emoji
- Simple tables with Tab/Enter navigation, header row and column, a
  right-click menu for inserting and deleting rows and columns, and
  spreadsheet-style paste
- Markdown shortcuts (`#`, `-`, `1.`, `[]`, `>`, `"`, ` ``` `, `---`, `**bold**`,
  `*italic*`, `` `code` ``, `~strike~`)
- A formatting toolbar for selected text: bold, italic, underline, strikethrough,
  inline code, links, text and background colors, and turn-into
- Drag handles, nesting with Tab/Shift+Tab, multi-block selection (Esc, drag a
  rectangle, or drag across blocks), duplicate, move to another page, per-page
  undo/redo
- Paste Markdown to create blocks, and paste or drop images

**Pages**

- Nested pages in a sidebar with drag-and-drop reordering and nesting,
  favorites, Trash with restore, breadcrumbs, and page icons and covers
- Page options: font style (default/serif/mono), small text, full width, lock,
  duplicate, move, and export to Markdown or HTML
- Search (`Ctrl/⌘ K`) across titles and content, a Home view with recent pages
  and upcoming dated items, templates, and Markdown import
- Backlinks listing the pages that mention or link to the current page
- Page history: versions are saved every couple of minutes while you edit and
  can be previewed and restored

**Databases**

- Table, board, gallery, list and calendar views
- Properties: title, text, number, select, multi-select, status, date,
  checkbox, URL, email, created time and last edited time
- Filters, sorts, search, hidden properties, column resizing, drag to reorder
  rows, drag cards between board columns or calendar days
- Column calculations in tables: counts, percentages, sum, average, median,
  min, max, range, checked counts and date ranges
- Rows are full pages that open in a side peek

**Settings**

- Light, dark or system theme, start page, how rows open, workspace name and
  icon, and JSON export/import and reset of the whole workspace

## Code layout

| File                 | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `js/util.js`         | DOM helpers, caret utilities, sanitizer, icons  |
| `js/store.js`        | Workspace state, persistence, trash, undo       |
| `js/editor.js`       | Block editor, slash/mention menus, toolbar      |
| `js/database.js`     | Database views, properties, filters and sorts   |
| `js/app.js`          | Sidebar, topbar, routing, search, settings      |
| `js/ui.js`           | Popovers, menus, modals, toasts and pickers     |
| `js/md.js`           | Markdown import and export                      |
| `js/highlight.js`    | Syntax highlighter for code blocks              |
| `js/templates.js`    | Page templates                                  |
| `js/seed.js`         | Starter workspace content                       |
| `js/emoji.js`        | Emoji data for the icon picker                  |
