(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const editor = $('editor');
  const preview = $('preview');
  const searchInput = $('searchInput');
  const lineNumbers = $('lineNumbers');
  const formatSelect = $('formatSelect');
  const state = { type: 'txt', formatMode: 'auto', parsed: null, error: null, view: 'tree', fileName: 'data', search: '' };
  const samples = {
    json: JSON.stringify({ project: 'Data Lens', version: '1.0.0', static: true, formats: ['JSON', 'XML', 'CSV', 'TXT'], features: { localProcessing: true, cloudflarePages: true } }, null, 2),
    xml: '<?xml version="1.0" encoding="UTF-8"?>\n<catalog>\n  <tool id="json"><name>JSON Viewer</name><enabled>true</enabled></tool>\n  <tool id="xml"><name>XML Viewer</name><enabled>true</enabled></tool>\n</catalog>',
    csv: 'name,format,status\nJSON Viewer,JSON,ready\nXML Viewer,XML,ready\nCSV Viewer,CSV,ready',
    txt: 'Data Lens\n\n这是一个纯静态的数据查看与编辑工具。\n所有内容只在浏览器本地处理。'
  };

  const escapeHtml = value => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 1600);
  }

  function countDelimiter(line, delimiter) {
    let count = 0, quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === '"') quoted = !quoted;
      else if (line[i] === delimiter && !quoted) count += 1;
    }
    return count;
  }

  function detectType(text, fileName = '') {
    const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    if (['json', 'xml', 'csv'].includes(ext)) return ext;
    if (['txt', 'log', 'md'].includes(ext)) return 'txt';
    const value = text.trim();
    if (!value) return 'txt';
    if (value.startsWith('{') || value.startsWith('[')) return 'json';
    if (value.startsWith('<')) return 'xml';
    const lines = value.split(/\r?\n/).filter(Boolean);
    if (lines.length > 1 && [',', '\t', ';', '|'].some(d => {
      const n = countDelimiter(lines[0], d);
      return n > 0 && lines.slice(1, 6).every(line => countDelimiter(line, d) === n);
    })) return 'csv';
    return 'txt';
  }

  function getEffectiveType(text, fileName = '') {
    return state.formatMode === 'auto' ? detectType(text, fileName) : state.formatMode;
  }

  function parseCsv(text) {
    const first = text.split(/\r?\n/)[0] || '';
    const delimiter = [',', '\t', ';', '|'].sort((a, b) => countDelimiter(first, b) - countDelimiter(first, a))[0];
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i], next = text[i + 1];
      if (char === '"' && quoted && next === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) { row.push(field); field = ''; }
      else if ((char === '\n' || (char === '\r' && next === '\n')) && !quoted) {
        row.push(field); rows.push(row); row = []; field = ''; if (char === '\r') i += 1;
      } else field += char;
    }
    row.push(field);
    if (row.some(Boolean) || !rows.length) rows.push(row);
    const clean = rows.filter(r => r.some(cell => cell.trim() !== ''));
    const headers = clean[0] || [];
    const records = clean.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h || `column_${i + 1}`, values[i] ?? ''])));
    return { delimiter, headers, rows: clean, records };
  }

  function xmlToObject(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const out = {};
    if (node.attributes.length) out['@attributes'] = Object.fromEntries([...node.attributes].map(a => [a.name, a.value]));
    const elements = [...node.children];
    const text = [...node.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.nodeValue.trim()).filter(Boolean).join(' ');
    if (!elements.length && !node.attributes.length) return text;
    if (text) out['#text'] = text;
    elements.forEach(child => {
      const value = xmlToObject(child);
      if (Object.hasOwn(out, child.nodeName)) out[child.nodeName] = Array.isArray(out[child.nodeName]) ? [...out[child.nodeName], value] : [out[child.nodeName], value];
      else out[child.nodeName] = value;
    });
    return out;
  }

  function parse(text, type) {
    if (!text.trim()) return null;
    if (type === 'json') return JSON.parse(text);
    if (type === 'csv') return parseCsv(text);
    if (type === 'xml') {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      const error = doc.querySelector('parsererror');
      if (error) throw new Error((error.textContent || 'XML 解析失败').split('\n')[0]);
      return { [doc.documentElement.nodeName]: xmlToObject(doc.documentElement) };
    }
    return text;
  }

  function createTree(value, key = null, root = true, path = '$') {
    const ul = document.createElement('ul');
    if (root) ul.className = 'tree-root';
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.path = path;
    row.title = path;
    const branch = value !== null && typeof value === 'object';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `tree-toggle${branch ? '' : ' placeholder'}`;
    toggle.textContent = '▼';
    toggle.setAttribute('aria-expanded', branch ? 'true' : 'false');
    row.appendChild(toggle);
    if (key !== null) {
      const label = document.createElement('span');
      label.className = 'tree-key';
      label.textContent = `${key}:`;
      row.appendChild(label);
    }
    if (!branch) {
      const type = value === null ? 'null' : typeof value;
      const span = document.createElement('span');
      span.className = `tree-${type}`;
      span.textContent = typeof value === 'string' ? `“${value}”` : String(value);
      row.appendChild(span); li.appendChild(row); ul.appendChild(li); return ul;
    }
    const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
    const dot = document.createElement('span');
    dot.className = 'tree-type-dot';
    const meta = document.createElement('span');
    meta.className = 'tree-meta';
    meta.textContent = `${Array.isArray(value) ? 'Array' : 'Object'} · ${entries.length}`;
    row.append(dot, meta); li.appendChild(row);
    const children = document.createElement('ul');
    entries.forEach(([k, v]) => {
      const childPath = Array.isArray(value) ? `${path}[${k}]` : `${path}.${k}`;
      children.appendChild(createTree(v, k, false, childPath).firstChild);
    });
    li.appendChild(children); ul.appendChild(li);
    toggle.onclick = () => {
      const collapsed = children.classList.toggle('tree-hidden');
      toggle.textContent = collapsed ? '▶' : '▼';
      toggle.setAttribute('aria-expanded', String(!collapsed));
    };
    return ul;
  }

  function setTreeExpanded(expanded) {
    preview.querySelectorAll('.tree-toggle:not(.placeholder)').forEach(toggle => {
      const children = toggle.closest('.tree-row')?.nextElementSibling;
      if (!children) return;
      children.classList.toggle('tree-hidden', !expanded);
      toggle.textContent = expanded ? '▼' : '▶';
      toggle.setAttribute('aria-expanded', String(expanded));
    });
  }

  function tableData() {
    if (state.type === 'csv') return state.parsed.records;
    if (state.type === 'json') {
      if (Array.isArray(state.parsed) && state.parsed.every(v => v && typeof v === 'object' && !Array.isArray(v))) return state.parsed;
      if (state.parsed && typeof state.parsed === 'object' && !Array.isArray(state.parsed)) return Object.entries(state.parsed).map(([key, value]) => ({ key, value: typeof value === 'object' ? JSON.stringify(value) : value }));
    }
    return [];
  }

  function renderTable() {
    const rows = tableData();
    if (!rows.length) { preview.innerHTML = '<div class="empty-state"><div><strong>当前数据不适合表格展示</strong><span>数组对象或 CSV 会自动生成表格。</span></div></div>'; return; }
    const headers = [...new Set(rows.flatMap(Object.keys))];
    const query = state.search.toLowerCase();
    const filtered = query ? rows.filter(row => JSON.stringify(row).toLowerCase().includes(query)) : rows;
    preview.innerHTML = `<p class="table-note">${filtered.length} 行 · ${headers.length} 列</p><table class="data-table"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${filtered.map(row => `<tr>${headers.map(h => `<td>${highlight(row[h] ?? '', query)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $('searchCount').textContent = query ? filtered.length : 0;
  }

  function highlight(value, query) {
    const safe = escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value);
    if (!query) return safe;
    return safe.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), match => `<mark>${match}</mark>`);
  }

  function syntax(text) {
    let safe = escapeHtml(text);
    if (state.type === 'json') safe = safe.replace(/(&quot;.*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g, match => `<span class="syntax-${match.endsWith(':') ? 'key' : match.startsWith('&quot;') ? 'string' : /true|false|null/.test(match) ? 'literal' : 'number'}">${match}</span>`);
    if (state.type === 'xml') safe = safe.replace(/(&lt;\/?[\w:-]+)|([\w:-]+)=(&quot;.*?&quot;)|(&gt;)/g, '<span class="syntax-tag">$&</span>');
    return highlight(safe, state.search.toLowerCase());
  }

  function render() {
    $('treeActions').hidden = state.view !== 'tree';
    if (!editor.value.trim()) { preview.innerHTML = '<div class="empty-state"><div><strong>等待数据</strong><span>粘贴、输入或打开一个文件。</span></div></div>'; $('searchCount').textContent = '0'; return; }
    if (state.error) { preview.innerHTML = `<div class="empty-state"><div><strong>无法解析</strong><span>${escapeHtml(state.error.message)}</span></div></div>`; return; }
    if (state.view === 'raw') { preview.innerHTML = `<pre class="raw-code">${syntax(editor.value)}</pre>`; return; }
    if (state.view === 'table') { renderTable(); return; }
    const data = state.type === 'txt' ? { lines: editor.value.split(/\r?\n/).length, characters: editor.value.length, content: editor.value } : state.type === 'csv' ? { delimiter: state.parsed.delimiter === '\t' ? 'TAB' : state.parsed.delimiter, headers: state.parsed.headers, records: state.parsed.records } : state.parsed;
    preview.replaceChildren(createTree(data));
    const query = state.search.toLowerCase();
    let hits = 0;
    preview.querySelectorAll('.tree-row').forEach(row => {
      const match = query && row.textContent.toLowerCase().includes(query);
      row.style.display = !query || match ? '' : 'none';
      if (match) hits += 1;
    });
    $('searchCount').textContent = query ? hits : 0;
  }

  function refresh() {
    const text = editor.value;
    updateLineNumbers();
    state.type = getEffectiveType(text, state.fileName);
    const formatBadge = $('formatBadge');
    formatBadge.textContent = state.type.toUpperCase();
    formatBadge.classList.toggle('manual', state.formatMode !== 'auto');
    formatBadge.title = state.formatMode === 'auto' ? `自动识别为 ${state.type.toUpperCase()}` : `已手动指定为 ${state.type.toUpperCase()}`;
    try {
      state.parsed = parse(text, state.type); state.error = null;
      $('parseStatus').textContent = text.trim() ? `${state.type.toUpperCase()} 有效` : '等待输入';
      $('parseStatus').className = `status-value ${text.trim() ? 'success' : 'neutral'}`;
      $('parseMessage').textContent = text.trim() ? `${state.formatMode === 'auto' ? '自动识别' : '手动指定'}为 ${state.type.toUpperCase()}，解析完成。` : '粘贴或打开文件后自动解析，也可以手动选择类型。';
    } catch (error) {
      state.parsed = null; state.error = error;
      $('parseStatus').textContent = `${state.type.toUpperCase()} 无效`;
      $('parseStatus').className = 'status-value error';
      $('parseMessage').textContent = error.message;
    }
    const lines = text ? text.split(/\r?\n/).length : 0;
    $('summaryValue').textContent = `${text.length.toLocaleString()} 字符`;
    $('summaryMessage').textContent = state.type === 'csv' && state.parsed ? `${lines} 行 · ${state.parsed.headers.length} 列` : `${lines} 行`;
    render();
  }

  function updateLineNumbers() {
    const count = Math.max(1, editor.value.split(/\r?\n/).length);
    lineNumbers.textContent = Array.from({ length: count }, (_, index) => index + 1).join('\n');
  }

  function updateCursor() {
    const before = editor.value.slice(0, editor.selectionStart).split('\n');
    $('cursorPosition').textContent = `第 ${before.length} 行，第 ${before.at(-1).length + 1} 列`;
  }

  function formatXml(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('XML 格式不正确');
    const source = new XMLSerializer().serializeToString(doc).replace(/>\s*</g, '><').replace(/</g, '\n<').trim();
    let depth = 0;
    return source.split('\n').map(line => {
      if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
      const result = `${'  '.repeat(depth)}${line}`;
      if (/^<[^!?/][^>]*[^/]>$/.test(line) && !/<\/[^>]+>$/.test(line)) depth += 1;
      return result;
    }).join('\n');
  }

  function csvText(parsed) {
    const quote = value => {
      const text = String(value ?? '');
      return /["\r\n]/.test(text) || text.includes(parsed.delimiter) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return parsed.rows.map(row => row.map(quote).join(parsed.delimiter)).join('\n');
  }

  let timer;
  editor.addEventListener('input', () => { state.fileName = 'data'; clearTimeout(timer); timer = setTimeout(refresh, 120); updateCursor(); updateLineNumbers(); });
  editor.addEventListener('scroll', () => { lineNumbers.scrollTop = editor.scrollTop; });
  ['click', 'keyup'].forEach(name => editor.addEventListener(name, updateCursor));
  editor.addEventListener('keydown', event => {
    if (event.key === 'Tab') { event.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); editor.dispatchEvent(new Event('input')); }
  });

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(item => { item.classList.toggle('active', item === tab); item.setAttribute('aria-selected', item === tab ? 'true' : 'false'); });
    state.view = tab.dataset.view; render();
  }));
  searchInput.addEventListener('input', () => { state.search = searchInput.value; render(); });
  $('expandAllButton').onclick = () => setTreeExpanded(true);
  $('collapseAllButton').onclick = () => setTreeExpanded(false);
  formatSelect.onchange = event => {
    state.formatMode = event.target.value;
    refresh();
    toast(state.formatMode === 'auto' ? `已切换为自动识别：${state.type.toUpperCase()}` : `已手动指定为 ${state.type.toUpperCase()}`);
  };

  function readFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { state.fileName = file.name; editor.value = String(reader.result || ''); refresh(); toast(`已打开 ${file.name}`); };
    reader.onerror = () => toast('文件读取失败');
    reader.readAsText(file);
  }
  $('fileInput').addEventListener('change', event => readFile(event.target.files[0]));
  ['dragenter', 'dragover'].forEach(name => $('dropZone').addEventListener(name, event => { event.preventDefault(); $('dropZone').classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(name => $('dropZone').addEventListener(name, event => { event.preventDefault(); $('dropZone').classList.remove('dragging'); }));
  $('dropZone').addEventListener('drop', event => readFile(event.dataTransfer.files[0]));

  $('pasteButton').onclick = async () => {
    try { editor.value = await navigator.clipboard.readText(); state.fileName = 'data'; refresh(); toast('已从剪贴板粘贴'); }
    catch { editor.focus(); toast('请直接按 Ctrl/Cmd + V 粘贴'); }
  };
  $('formatButton').onclick = () => {
    try {
      if (!editor.value.trim()) return toast('请先输入数据');
      const type = getEffectiveType(editor.value, state.fileName);
      editor.value = type === 'json' ? JSON.stringify(JSON.parse(editor.value), null, 2) : type === 'xml' ? formatXml(editor.value) : type === 'csv' ? csvText(parseCsv(editor.value)) : editor.value.split(/\r?\n/).map(line => line.trimEnd()).join('\n');
      refresh(); toast('格式化完成');
    } catch (error) { toast(`格式化失败：${error.message}`); }
  };
  $('minifyButton').onclick = () => {
    try {
      if (!editor.value.trim()) return toast('请先输入数据');
      const type = getEffectiveType(editor.value, state.fileName);
      editor.value = type === 'json' ? JSON.stringify(JSON.parse(editor.value)) : type === 'xml' ? editor.value.replace(/>\s+</g, '><').trim() : type === 'csv' ? csvText(parseCsv(editor.value)) : editor.value.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
      refresh(); toast('压缩完成');
    } catch (error) { toast(`压缩失败：${error.message}`); }
  };
  $('copyButton').onclick = async () => { try { await navigator.clipboard.writeText(editor.value); toast('已复制'); } catch { editor.select(); document.execCommand('copy'); toast('已复制'); } };
  $('downloadButton').onclick = () => {
    if (!editor.value) return toast('没有可下载的内容');
    const blob = new Blob([editor.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `${state.fileName.replace(/\.[^.]+$/, '') || 'data'}.${state.type}`; link.click(); URL.revokeObjectURL(url); toast('文件已生成');
  };
  $('clearButton').onclick = () => { editor.value = ''; state.fileName = 'data'; state.search = ''; searchInput.value = ''; refresh(); editor.focus(); };
  $('sampleSelect').onchange = event => { if (!event.target.value) return; editor.value = samples[event.target.value]; state.fileName = `sample.${event.target.value}`; event.target.value = ''; refresh(); toast('示例已载入'); };

  const root = document.documentElement;
  try { root.dataset.theme = localStorage.getItem('data-lens-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { root.dataset.theme = 'light'; }
  $('themeToggle').onclick = () => { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('data-lens-theme', root.dataset.theme); } catch {} };

  updateLineNumbers();
  refresh();
})();
