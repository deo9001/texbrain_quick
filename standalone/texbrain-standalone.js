const SAMPLE_SOURCE = String.raw`\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage{geometry}
\usepackage{amsmath}
\usepackage{booktabs}
\usepackage{tabularx}
\usepackage{tikz}
\usepackage{listings}
\usepackage{xcolor}
\usepackage{hyperref}

\title{TeXbrain Standalone Showcase}
\author{Local ZIP / file:// mode}
\date{\today}

\begin{document}
\maketitle % Renders the title block in static mode too

\section{What works well here}
This standalone editor opens directly from the extracted repository folder. It supports inline math such as $E = mc^2$ and \(a_n = a_{n-1} + 2\), plus headings, paragraphs, comments, and list environments.

\subsection{User example: align*}
\begin{align*}
x^2 + y^2 &= 1 \\
y &= \sqrt{1 - x^2}
\end{align*}

\subsection{User example: equation}
\maketitle % repeated on purpose so standalone mode can show the fallback warning list
\begin{equation}
    f(x) = \int_{a}^{b} \frac{1}{x} \, dx
\end{equation}

\subsection{Lists and display math}
\begin{itemize}
  \item Load a .tex file from disk.
  \item Export your source again with no installs.
  \item Keep writing even if the CDN math renderer is blocked.
\end{itemize}

\[
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
\]

\section{Graceful source fallbacks}
The standalone page does not promise full TeX compilation, so unsupported blocks stay visible instead of disappearing.

\begin{table}
\centering
\begin{tabularx}{\linewidth}{lXr}
\toprule
Name & Notes & Score \\
\midrule
Alpha & This shows as a source fallback in static mode. & 95 \\
Beta & Full tabular compilation still belongs to the full Svelte app. & 88 \\
\bottomrule
\end{tabularx}
\caption{Table fallback example}
\end{table}

\begin{tikzpicture}
\draw (0,0) circle (1cm);
\draw[->] (-1.2,0) -- (1.2,0);
\end{tikzpicture}

\begin{lstlisting}[language=Python]
def greet(name):
    return f"Hello, {name}!"
\end{lstlisting}

\end{document}`;

const STORAGE_KEY = 'texbrain-standalone-source-v2';
const LAYOUT_KEY = 'texbrain-standalone-layout';
const THEME_KEY = 'texbrain-standalone-theme';
const FOCUS_KEY = 'texbrain-standalone-focus';
const FILE_NAME_KEY = 'texbrain-standalone-file-name';
const MATHJAX_URL = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml-full.js';
const MATH_ENVS = new Set(['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*']);
const MATHJAX_LOAD_TIMEOUT_MS = 8000;
const BUTTON_FEEDBACK_MS = 1200;
const RAW_ENVIRONMENTS = new Set(['lstlisting', 'verbatim', 'Verbatim']);
const FALLBACK_MESSAGES = {
  tikzpicture: 'TikZ graphics are shown as source because static mode does not run a TeX engine or picture compiler.',
  table: 'Table environments are shown as source in standalone mode. The full app can compile them into PDF output.',
  tabular: 'Tabular content is kept as source because static mode does not fully typeset LaTeX tables.',
  tabularx: 'tabularx is preserved as source because standalone mode does not execute package-specific layout logic.',
  figure: 'Figure environments are shown as source because static mode does not resolve external graphics or full float placement.',
  lstlisting: 'Code listings are preserved as source because static mode does not run the listings package renderer.',
  verbatim: 'Verbatim content is shown as source in standalone mode.',
  center: 'This environment is preserved as source in standalone mode.'
};

const TODAY_DISPLAY = new Date().toISOString().slice(0, 10);

const state = {
  currentFileName: localStorage.getItem(FILE_NAME_KEY) || 'sample.tex',
  mathStatus: 'loading',
  mathMessage: 'Loading MathJax from jsDelivr…',
  warnings: [],
  renderTimer: null,
  mathTimeoutId: null
};

const elements = {
  editor: document.getElementById('editor'),
  previewPaper: document.getElementById('previewPaper'),
  previewBanner: document.getElementById('previewBanner'),
  loadButton: document.getElementById('loadBtn'),
  fileInput: document.getElementById('fileInput'),
  downloadBtn: document.getElementById('downloadBtn'),
  copyBtn: document.getElementById('copyBtn'),
  resetBtn: document.getElementById('resetBtn'),
  layoutSplitBtn: document.getElementById('layoutSplitBtn'),
  layoutPreviewBtn: document.getElementById('layoutPreviewBtn'),
  layoutEditorBtn: document.getElementById('layoutEditorBtn'),
  focusBtn: document.getElementById('focusBtn'),
  themeSelect: document.getElementById('themeSelect'),
  helpButton: document.getElementById('helpBtn'),
  aboutButton: document.getElementById('aboutBtn'),
  helpDialog: document.getElementById('helpDialog'),
  aboutDialog: document.getElementById('aboutDialog'),
  aboutContent: document.getElementById('aboutContent'),
  renderStatusChip: document.getElementById('renderStatusChip'),
  mathStatusChip: document.getElementById('mathStatusChip'),
  fileStatusChip: document.getElementById('fileStatusChip'),
  warningStatusChip: document.getElementById('warningStatusChip'),
  warningCountBadge: document.getElementById('warningCountBadge'),
  warningList: document.getElementById('warningList'),
  documentSummary: document.getElementById('documentSummary'),
  editorMeta: document.getElementById('editorMeta'),
  previewMeta: document.getElementById('previewMeta')
};

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
}

function stripLatexComments(source) {
  const lines = normalizeNewlines(source).split('\n');
  const output = [];
  let rawEnvDepth = 0;
  let activeRawEnv = '';

  for (const line of lines) {
    const trimmed = line.trim();
    const beginMatch = trimmed.match(/^\\begin\{([^}]+)\}/);
    const endMatch = trimmed.match(/^\\end\{([^}]+)\}/);

    if (rawEnvDepth > 0) {
      output.push(line);
      if (endMatch && endMatch[1] === activeRawEnv) {
        rawEnvDepth = 0;
        activeRawEnv = '';
      }
      continue;
    }

    let stripped = '';
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '%' && line[index - 1] !== '\\') {
        break;
      }
      stripped += char;
    }

    output.push(stripped);

    if (beginMatch && RAW_ENVIRONMENTS.has(beginMatch[1])) {
      rawEnvDepth = 1;
      activeRawEnv = beginMatch[1];
    }
  }

  return output.join('\n');
}

function readCommandValue(source, command) {
  const match = source.match(new RegExp(String.raw`\\${command}\*?(?:\[[^\]]*\])?\{([\s\S]*?)\}`));
  return match ? match[1].trim() : '';
}

function extractPackages(source) {
  return Array.from(source.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g))
    .flatMap((match) => match[1].split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function extractDocument(source) {
  const normalized = normalizeNewlines(source);
  const stripped = stripLatexComments(normalized);
  const bodyMatch = stripped.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  const preamble = bodyMatch ? stripped.slice(0, bodyMatch.index) : stripped;
  return {
    source: stripped,
    body: bodyMatch ? bodyMatch[1].trim() : stripped.trim(),
    documentClass: readCommandValue(preamble, 'documentclass') || 'unknown',
    title: readCommandValue(stripped, 'title'),
    author: readCommandValue(stripped, 'author'),
    date: (readCommandValue(stripped, 'date') || '').replace(/\\today/g, TODAY_DISPLAY),
    packages: extractPackages(preamble)
  };
}

function applyInlineFormatting(text) {
  return text
    .replace(/\\textbf\{([^{}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\textit\{([^{}]+)\}/g, '<em>$1</em>')
    .replace(/\\emph\{([^{}]+)\}/g, '<em>$1</em>')
    .replace(/\\underline\{([^{}]+)\}/g, '<u>$1</u>')
    .replace(/\\%/g, '%')
    .replace(/\\_/g, '_')
    .replace(/\\#/g, '#')
    .replace(/\\&amp;/g, '&amp;')
    .replace(/\\linebreak|\\newline/g, '<br>')
    .replace(/\\\\/g, '<br>')
    .replace(/\n/g, '<br>');
}

function renderInline(text) {
  const normalized = normalizeNewlines(text).replace(/\\today/g, TODAY_DISPLAY);
  const tokens = [];
  const mathWrapped = normalized.replace(/\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g, (match, parenExpr, dollarExpr) => {
    const expression = parenExpr ?? dollarExpr ?? '';
    const display = parenExpr ? String.raw`\\(${expression}\\)` : String.raw`\\(${expression}\\)`;
    const token = `__TEXBRAIN_INLINE_MATH_${tokens.length}__`;
    tokens.push(`<span class="tex-inline">${escapeHtml(display)}</span>`);
    return token;
  });

  let output = applyInlineFormatting(escapeHtml(mathWrapped));
  tokens.forEach((tokenHtml, index) => {
    output = output.replace(`__TEXBRAIN_INLINE_MATH_${index}__`, tokenHtml);
  });
  return output;
}

function renderTitleBlock(meta, count) {
  const title = meta.title ? renderInline(meta.title) : 'Untitled document';
  const author = meta.author ? `<p class="title-author">${renderInline(meta.author)}</p>` : '';
  const date = meta.date ? `<p>${renderInline(meta.date)}</p>` : '';
  const repeatNote = count > 1 ? '<p><strong>Repeated \\maketitle:</strong> rendered again because it appears again in the source.</p>' : '';
  return `<section class="title-block"><h1>${title}</h1>${author}${date}${repeatNote}</section>`;
}

function renderMathCard(source, label) {
  return `<section class="math-card"><div class="math-label"><span>${escapeHtml(label)}</span><span>Math preview</span></div><div class="tex-block">${escapeHtml(source)}</div></section>`;
}

function renderFallbackBlock(environment, source) {
  const description = FALLBACK_MESSAGES[environment] || `The ${environment} environment is shown as source because static mode does not fully compile this LaTeX feature.`;
  return `
    <section class="fallback-block" data-environment="${escapeHtml(environment)}">
      <div class="fallback-meta">
        <span>${escapeHtml(environment)}</span>
        <span>Source fallback</span>
      </div>
      <p>${escapeHtml(description)}</p>
      <pre><code>${escapeHtml(source)}</code></pre>
    </section>
  `;
}

function renderListEnvironment(blockLines, ordered) {
  const items = [];
  let currentItem = [];
  const innerLines = blockLines.slice(1, -1);

  for (const line of innerLines) {
    const trimmed = line.trim();
    const itemMatch = trimmed.match(/^\\item(?:\s*\[[^\]]*\])?\s*(.*)$/);
    if (itemMatch) {
      if (currentItem.length) items.push(currentItem.join('\n').trim());
      currentItem = [itemMatch[1]];
    } else if (trimmed || currentItem.length) {
      currentItem.push(line);
    }
  }

  if (currentItem.length) items.push(currentItem.join('\n').trim());
  const tagName = ordered ? 'ol' : 'ul';
  const content = items.length
    ? items.map((item) => `<li>${renderInline(item)}</li>`).join('')
    : '<li><em>No list items found.</em></li>';

  return `<${tagName}>${content}</${tagName}>`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectEnvironment(lines, startIndex, environment) {
  const beginPattern = new RegExp(`^\\\\begin\\{${escapeRegex(environment)}\\}`);
  const endPattern = new RegExp(`^\\\\end\\{${escapeRegex(environment)}\\}`);
  const block = [];
  let depth = 0;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (beginPattern.test(trimmed)) depth += 1;
    block.push(line);
    if (endPattern.test(trimmed)) {
      depth -= 1;
      if (depth === 0) {
        return { block, endIndex: index, closed: true };
      }
    }
  }

  return { block, endIndex: lines.length - 1, closed: false };
}

function addWarning(warnings, message) {
  if (!warnings.includes(message)) warnings.push(message);
}

function renderDocument(source) {
  const meta = extractDocument(source);
  const lines = meta.body.split('\n');
  const html = [];
  const warnings = [];
  let paragraph = [];
  let titleCount = 0;
  let totalWords = 0;

  if (meta.packages.length) {
    addWarning(warnings, `Detected package declarations: ${meta.packages.join(', ')}. Standalone mode reads them for context but does not execute package code.`);
  }

  const flushParagraph = () => {
    const joined = paragraph.join('\n').trim();
    paragraph = [];
    if (!joined) return;
    totalWords += joined.split(/\s+/).filter(Boolean).length;
    html.push(`<p>${renderInline(joined)}</p>`);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (/^\\maketitle\b/.test(trimmed)) {
      flushParagraph();
      titleCount += 1;
      if (titleCount > 1) {
        addWarning(warnings, 'Repeated \\maketitle was found. Standalone mode renders each occurrence again, but full compiled layouts may differ.');
      }
      html.push(renderTitleBlock(meta, titleCount));
      continue;
    }

    const headingMatch = trimmed.match(/^\\(section|subsection|subsubsection)\*?\{([\s\S]*?)\}$/);
    if (headingMatch) {
      flushParagraph();
      const tag = headingMatch[1] === 'section' ? 'h2' : headingMatch[1] === 'subsection' ? 'h3' : 'h4';
      html.push(`<${tag}>${renderInline(headingMatch[2])}</${tag}>`);
      continue;
    }

    if (trimmed === '$$' || /^\$\$/.test(trimmed)) {
      flushParagraph();
      const mathLines = [];
      if (trimmed !== '$$' && trimmed.endsWith('$$') && trimmed.length > 4) {
        mathLines.push(trimmed);
      } else {
        mathLines.push('$$');
        while (index + 1 < lines.length) {
          index += 1;
          mathLines.push(lines[index]);
          if (lines[index].trim() === '$$') break;
        }
      }
      html.push(renderMathCard(mathLines.join('\n'), '$$ display math'));
      continue;
    }

    if (trimmed === '\\[' || /^\\\[/.test(trimmed)) {
      flushParagraph();
      const mathLines = [];
      if (trimmed !== '\\[' && trimmed.endsWith('\\]')) {
        mathLines.push(trimmed);
      } else {
        mathLines.push('\\[');
        while (index + 1 < lines.length) {
          index += 1;
          mathLines.push(lines[index]);
          if (lines[index].includes('\\]')) break;
        }
      }
      html.push(renderMathCard(mathLines.join('\n'), '\\[ display math'));
      continue;
    }

    const beginMatch = trimmed.match(/^\\begin\{([^}]+)\}/);
    if (beginMatch) {
      flushParagraph();
      const environment = beginMatch[1];
      const { block, endIndex, closed } = collectEnvironment(lines, index, environment);
      index = endIndex;

      if (!closed) {
        addWarning(warnings, `Environment ${environment} is missing a closing \\end{${environment}}. Standalone mode preserved the remaining source as a fallback.`);
        html.push(renderFallbackBlock(environment, block.join('\n')));
        continue;
      }

      const blockSource = block.join('\n');

      if (environment === 'itemize' || environment === 'enumerate') {
        html.push(renderListEnvironment(block, environment === 'enumerate'));
        continue;
      }

      if (MATH_ENVS.has(environment)) {
        html.push(renderMathCard(blockSource, `${environment} environment`));
        continue;
      }

      addWarning(warnings, FALLBACK_MESSAGES[environment] || `Static mode shows the ${environment} environment as source because it does not fully compile this LaTeX feature.`);
      html.push(renderFallbackBlock(environment, blockSource));
      continue;
    }

    if (/^\\(documentclass|usepackage)\b/.test(trimmed)) {
      addWarning(warnings, `Preamble command kept for context only: ${trimmed}`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();

  if (!html.length) {
    html.push('<section class="empty-state"><h2>Nothing to preview yet</h2><p>Start typing LaTeX on the left, or load a `.tex` file from disk.</p></section>');
  }

  return {
    html: html.join('\n'),
    meta,
    warnings,
    stats: {
      words: totalWords,
      lines: lines.filter((line) => line.trim()).length,
      titleCount
    }
  };
}

function setChipState(element, text, variant = '') {
  element.textContent = text;
  element.classList.remove('is-success', 'is-warning', 'is-danger');
  if (variant) element.classList.add(variant);
}

function setBanner(text, variant) {
  if (!text) {
    elements.previewBanner.textContent = '';
    elements.previewBanner.className = 'preview-banner';
    return;
  }
  elements.previewBanner.textContent = text;
  elements.previewBanner.className = `preview-banner is-visible ${variant || ''}`.trim();
}

function updateWarningPanel(warnings) {
  state.warnings = warnings;
  elements.warningList.innerHTML = warnings.length
    ? warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')
    : '<li>No warnings. Preview coverage is solid for the current source.</li>';

  const variant = warnings.length ? 'is-warning' : 'is-success';
  elements.warningCountBadge.textContent = String(warnings.length);
  elements.warningCountBadge.className = `badge ${variant}`;
  setChipState(elements.warningStatusChip, `Warnings: ${warnings.length}`, warnings.length ? 'is-warning' : 'is-success');
}

function updateDocumentSummary(meta, stats) {
  const entries = [
    ['Document class', meta.documentClass || 'unknown'],
    ['Title', meta.title || 'Not set'],
    ['Author', meta.author || 'Not set'],
    ['Date', meta.date || 'Not set'],
    ['Packages', meta.packages.length ? meta.packages.join(', ') : 'None detected'],
    ['Body lines', String(stats.lines)],
    ['Approx. words', String(stats.words)]
  ];

  elements.documentSummary.innerHTML = entries
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join('');
}

async function typesetPreview() {
  if (state.mathStatus !== 'ready' || !window.MathJax?.typesetPromise) {
    return;
  }

  try {
    if (window.MathJax.typesetClear) {
      window.MathJax.typesetClear([elements.previewPaper]);
    }
    await window.MathJax.typesetPromise([elements.previewPaper]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    addWarning(state.warnings, `MathJax reported a rendering error: ${message}`);
    updateWarningPanel(state.warnings);
    setChipState(elements.renderStatusChip, 'Render: completed with math warnings', 'is-warning');
  }
}

async function renderNow() {
  setChipState(elements.renderStatusChip, 'Render: parsing source…');
  const source = elements.editor.value;
  localStorage.setItem(STORAGE_KEY, source);
  localStorage.setItem(FILE_NAME_KEY, state.currentFileName);

  const rendered = renderDocument(source);
  elements.previewPaper.innerHTML = rendered.html;
  updateWarningPanel(rendered.warnings);
  updateDocumentSummary(rendered.meta, rendered.stats);

  elements.editorMeta.textContent = `${rendered.stats.lines} non-empty lines • ${rendered.stats.words} words • autosaved locally`;
  elements.previewMeta.textContent = state.mathStatus === 'ready'
    ? 'Common math environments are being typeset with MathJax.'
    : 'Preview is using static fallback mode for math until the CDN renderer is available.';

  if (state.mathStatus === 'ready') {
    await typesetPreview();
    setChipState(elements.renderStatusChip, rendered.warnings.length ? 'Render: ready with fallbacks' : 'Render: ready', rendered.warnings.length ? 'is-warning' : 'is-success');
  } else if (state.mathStatus === 'failed') {
    setChipState(elements.renderStatusChip, 'Render: ready (math source fallback)', rendered.warnings.length ? 'is-warning' : 'is-success');
  } else {
    setChipState(elements.renderStatusChip, 'Render: ready (waiting for MathJax)', 'is-warning');
  }

  const bannerMessage = state.mathStatus === 'failed'
    ? 'MathJax could not be loaded from the CDN. Editing, autosave, import, and export still work; math remains visible as source.'
    : state.mathStatus === 'loading'
      ? 'MathJax is still loading from the CDN. The preview will automatically upgrade from raw TeX to rendered math when it finishes loading.'
      : rendered.warnings.length
        ? 'Standalone mode rendered what it could and kept unsupported structures visible as source fallback panels.'
        : '';

  const bannerVariant = state.mathStatus === 'failed' ? 'is-danger' : rendered.warnings.length || state.mathStatus === 'loading' ? 'is-warning' : 'is-success';
  setBanner(bannerMessage, bannerMessage ? bannerVariant : '');
}

function scheduleRender(delay = 100) {
  clearTimeout(state.renderTimer);
  state.renderTimer = window.setTimeout(() => {
    renderNow();
  }, delay);
}

function updateFileStatus() {
  setChipState(elements.fileStatusChip, `File: ${state.currentFileName}`);
}

function setLayout(layout) {
  document.body.dataset.layout = layout;
  localStorage.setItem(LAYOUT_KEY, layout);
  for (const button of [elements.layoutSplitBtn, elements.layoutPreviewBtn, elements.layoutEditorBtn]) {
    button.classList.toggle('is-active', button.dataset.layoutChoice === layout);
  }
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  elements.themeSelect.value = theme;
  localStorage.setItem(THEME_KEY, theme);
}

function setFocusMode(enabled) {
  document.body.dataset.focus = enabled ? 'on' : 'off';
  elements.focusBtn.setAttribute('aria-pressed', String(enabled));
  elements.focusBtn.textContent = enabled ? 'Show sidebar' : 'Focus panels';
  localStorage.setItem(FOCUS_KEY, enabled ? 'on' : 'off');
}

function buildAboutContent() {
  const localAssets = [
    {
      name: 'texbrain.html',
      purpose: 'Root entry file that works from the extracted repository with relative links to the standalone CSS and JS.'
    },
    {
      name: 'standalone/texbrain-standalone.css',
      purpose: 'Standalone shell styling, responsive layout, dialogs, warning cards, and focus-visible states.'
    },
    {
      name: 'standalone/texbrain-standalone.js',
      purpose: 'Standalone parser, render pipeline, import/export workflow, autosave, keyboard shortcuts, and MathJax loading logic.'
    }
  ];

  const externalAssets = [
    {
      name: 'MathJax 3 (`tex-chtml-full.js`) via jsDelivr CDN',
      purpose: 'Renders inline and display math, including environments like `equation`, `equation*`, `align`, and `align*`.',
      note: 'If the network or CDN is blocked, the app keeps working for editing/exporting and leaves math visible as TeX source.'
    }
  ];

  elements.aboutContent.innerHTML = `
    <h3>Standalone mode summary</h3>
    <p>This standalone experience is designed for a downloaded ZIP + double-click workflow. It improves local comfort and discoverability without attempting to replace the full Svelte application.</p>

    <h3>Local files used by standalone mode</h3>
    <ul class="dependencies">
      ${localAssets.map((asset) => `<li><strong>${escapeHtml(asset.name)}</strong><br>${escapeHtml(asset.purpose)}</li>`).join('')}
    </ul>

    <h3>External CDN dependencies</h3>
    <ul class="dependencies">
      ${externalAssets.map((asset) => `<li><strong>${escapeHtml(asset.name)}</strong><br>${escapeHtml(asset.purpose)}<br><em>${escapeHtml(asset.note)}</em></li>`).join('')}
    </ul>

    <h3>Local browser storage</h3>
    <p>The standalone editor stores the current source, selected theme, layout choice, and last file name in your browser <code>localStorage</code> so the page can restore your draft after reload.</p>

    <h3>What differs from the full app</h3>
    <ul>
      <li>Standalone mode does not perform full PDF compilation.</li>
      <li>Standalone mode does not provide git, collaboration, multi-file tabs, or browser filesystem project sync.</li>
      <li>The full app still lives in the Svelte/Vite workflow and is not modified by opening <code>texbrain.html</code>.</li>
    </ul>
  `;
}

function downloadSource() {
  const blob = new Blob([elements.editor.value], { type: 'text/x-tex;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = state.currentFileName.endsWith('.tex') ? state.currentFileName : `${state.currentFileName}.tex`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copySource() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(elements.editor.value);
    } else {
      elements.editor.select();
      try {
        document.execCommand('copy');
      } catch {
        throw new Error('Clipboard copy fallback failed');
      }
    }
    elements.copyBtn.textContent = 'Copied';
  } catch {
    elements.copyBtn.textContent = 'Copy failed';
  }
  window.setTimeout(() => {
    elements.copyBtn.textContent = 'Copy source';
  }, BUTTON_FEEDBACK_MS);
}

async function loadSelectedFile(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  const text = await file.text();
  elements.editor.value = normalizeNewlines(text);
  state.currentFileName = file.name || 'loaded-file.tex';
  localStorage.setItem(FILE_NAME_KEY, state.currentFileName);
  updateFileStatus();
  scheduleRender(0);
  event.target.value = '';
}

function resetSample() {
  elements.editor.value = SAMPLE_SOURCE;
  state.currentFileName = 'sample.tex';
  localStorage.setItem(FILE_NAME_KEY, state.currentFileName);
  updateFileStatus();
  scheduleRender(0);
  elements.editor.focus();
}

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  }
}

function installKeyboardShortcuts() {
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const isModifier = event.ctrlKey || event.metaKey;

    if (isModifier && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      elements.fileInput.click();
      return;
    }

    if (isModifier && event.key.toLowerCase() === 's') {
      event.preventDefault();
      downloadSource();
      return;
    }

    if (isModifier && event.shiftKey && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      copySource();
      return;
    }

    if (!isModifier && event.key === '?') {
      event.preventDefault();
      openDialog(elements.helpDialog);
      return;
    }

    if (!isModifier && ['1', '2', '3'].includes(event.key)) {
      event.preventDefault();
      setLayout(event.key === '1' ? 'split' : event.key === '2' ? 'preview' : 'editor');
    }
  });
}

function initMathJax() {
  window.MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\(', '\\)']],
      displayMath: [['$$', '$$'], ['\\[', '\\]']],
      processEscapes: true,
      processEnvironments: true
    },
    options: {
      skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    }
  };

  setChipState(elements.mathStatusChip, 'Math: loading CDN renderer…');
  state.mathTimeoutId = window.setTimeout(() => {
    if (state.mathStatus === 'loading') {
      setChipState(elements.mathStatusChip, 'Math: CDN is taking longer than expected', 'is-warning');
      scheduleRender(0);
    }
  }, MATHJAX_LOAD_TIMEOUT_MS);

  const script = document.createElement('script');
  script.src = MATHJAX_URL;
  script.async = true;
  script.onload = () => {
    state.mathStatus = 'ready';
    state.mathMessage = 'MathJax loaded successfully.';
    clearTimeout(state.mathTimeoutId);
    setChipState(elements.mathStatusChip, 'Math: MathJax ready', 'is-success');
    scheduleRender(0);
  };
  script.onerror = () => {
    state.mathStatus = 'failed';
    state.mathMessage = 'MathJax failed to load from the CDN.';
    clearTimeout(state.mathTimeoutId);
    setChipState(elements.mathStatusChip, 'Math: CDN unavailable, source fallback active', 'is-danger');
    scheduleRender(0);
  };
  document.head.appendChild(script);
}

function restoreUiPreferences() {
  setLayout(localStorage.getItem(LAYOUT_KEY) || 'split');
  setTheme(localStorage.getItem(THEME_KEY) || 'system');
  setFocusMode(localStorage.getItem(FOCUS_KEY) === 'on');
}

function bindEvents() {
  elements.editor.addEventListener('input', () => scheduleRender());
  elements.loadButton.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', loadSelectedFile);
  elements.downloadBtn.addEventListener('click', downloadSource);
  elements.copyBtn.addEventListener('click', copySource);
  elements.resetBtn.addEventListener('click', resetSample);
  elements.layoutSplitBtn.addEventListener('click', () => setLayout('split'));
  elements.layoutPreviewBtn.addEventListener('click', () => setLayout('preview'));
  elements.layoutEditorBtn.addEventListener('click', () => setLayout('editor'));
  elements.focusBtn.addEventListener('click', () => setFocusMode(document.body.dataset.focus !== 'on'));
  elements.themeSelect.addEventListener('change', (event) => setTheme(event.target.value));
  elements.helpButton.addEventListener('click', () => openDialog(elements.helpDialog));
  elements.aboutButton.addEventListener('click', () => openDialog(elements.aboutDialog));
}

function bootstrap() {
  buildAboutContent();
  restoreUiPreferences();
  bindEvents();
  installKeyboardShortcuts();

  elements.editor.value = localStorage.getItem(STORAGE_KEY) || SAMPLE_SOURCE;
  updateFileStatus();
  scheduleRender(0);
  initMathJax();
}

bootstrap();
