# TeXbrain standalone mode (`texbrain.html`)

This repository now includes a significantly upgraded standalone local editor at the repository root:

- `texbrain.html`
- `standalone/texbrain-standalone.css`
- `standalone/texbrain-standalone.js`

The goal is a practical **download ZIP → extract → double-click `texbrain.html`** workflow for users who cannot install Node, pnpm, VS Code, Git, or admin-level prerequisites.

## Quick use

1. Download the repository ZIP.
2. Extract it.
3. Open the extracted folder.
4. Double-click `texbrain.html`.
5. Use **Load .tex file** to open a document from disk, or start with the included sample.
6. Use **Export .tex** to download the edited source again.

## What standalone mode is for

Standalone mode focuses on a premium static/local experience:

- local editing from `file://`
- autosave in browser `localStorage`
- import/export/copy/reset workflows
- live preview for common LaTeX structure
- MathJax-powered math rendering when the CDN is reachable
- warnings plus readable fallback panels for unsupported environments
- in-app help/about and dependency disclosure
- responsive, keyboard-friendly UI

## What standalone mode renders well

The upgraded standalone preview now supports these practical cases much better than the earlier basic parser:

- `\title`, `\author`, `\date`, `\maketitle`
- `\section`, `\subsection`, `\subsubsection`
- paragraphs and manual line breaks
- comments using `%` in a practical line-based way
- inline math with `$...$` and `\(...\)`
- display math with `$$...$$` and `\[...\]`
- common display math environments:
  - `equation`
  - `equation*`
  - `align`
  - `align*`
  - `gather`
  - `gather*`
  - `multline`
  - `multline*`
- basic `itemize` and `enumerate`

The user-reported examples such as:

```latex
\begin{align*}
x^2 + y^2 &= 1 \\
y &= \sqrt{1 - x^2}
\end{align*}
```

and:

```latex
\maketitle

\begin{equation}
    f(x) = \int_{a}^{b} \frac{1}{x} \, dx
\end{equation}
```

now render acceptably in standalone mode when MathJax is available, and still remain visible as readable TeX source if the CDN renderer cannot load.

## Unsupported / partial features in standalone mode

Standalone mode still does **not** promise full TeX compilation.

Instead, unsupported or package-heavy structures are shown as labeled source fallback panels with warnings, for example:

- `tikzpicture`
- `table`
- `tabular`
- `tabularx`
- `figure`
- `lstlisting`
- other unknown environments that need a real compiler or package runtime

This means the page does **not** crash or go blank on larger LaTeX documents. It renders what it can and preserves the rest as visible source with explanations.

## External dependencies and local asset files

### Local files used by standalone mode

1. `texbrain.html`
   - root entry file
   - loads the standalone CSS/JS with relative paths so extracted ZIP usage works

2. `standalone/texbrain-standalone.css`
   - standalone shell styling
   - responsive layout
   - dialogs, warning cards, focus states, themes

3. `standalone/texbrain-standalone.js`
   - parser / preview logic
   - import/export workflows
   - autosave
   - keyboard shortcuts
   - MathJax CDN loading and fallback handling

### External CDN dependency

1. **MathJax 3** (`https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml-full.js`)
   - purpose: render TeX math in the browser
   - used for inline math and display math environments such as `equation` and `align*`
   - limitation: if the browser cannot reach the CDN, standalone mode still edits and exports normally, but math stays visible as source instead of fully rendered math

## Offline / blocked-network behavior

If CDN access is blocked:

- the editor still opens from `file://`
- source editing still works
- autosave still works
- load/export/copy/reset still work
- the status area explains that MathJax could not be loaded
- math remains visible as source instead of failing silently

## Keyboard shortcuts

- `Ctrl` / `Cmd` + `O` → load `.tex`
- `Ctrl` / `Cmd` + `S` → export `.tex`
- `Ctrl` / `Cmd` + `Shift` + `C` → copy source
- `?` → open help
- `1` / `2` / `3` → split / preview / editor layout

## Known differences vs the full app

Standalone mode is intentionally separate from the main Svelte/Vite app.

### Standalone mode

- runs by opening `texbrain.html`
- works from `file://`
- no install required
- no Node/pnpm/Git/VS Code required
- preview-oriented, not full PDF compilation
- no collaboration or git operations
- no multi-file project workspace

### Full app

- run with the repository’s Svelte workflow
- offers browser-based PDF compilation
- supports multi-file editing, git flows, and collaboration features
- requires the development/build toolchain (or a hosted deployment)

## Troubleshooting

### The page opens but math is not rendered

Open the status area at the top of the page.

If it says the CDN renderer is unavailable, the browser could not load MathJax from jsDelivr. In that case:

- keep editing normally
- export the `.tex` file if needed
- use the full app for real compilation
- or retry on a network/browser profile that permits CDN access

### The preview shows source fallback panels

That is expected for unsupported environments such as TikZ, `tabularx`, figures, or listings. Static mode does not run a TeX compiler.

### My changes are gone after a browser reset

The standalone page stores drafts in browser `localStorage`, which can be cleared by browser settings or privacy policies. Export your `.tex` file regularly if you need a durable copy.

## Validation summary

The standalone implementation was manually validated for the static entry path:

- `texbrain.html` remains at repository root
- local CSS/JS are loaded with relative paths
- the repository’s full Svelte build still succeeds separately
- unsupported blocks degrade to visible source/warning cards instead of breaking the preview
