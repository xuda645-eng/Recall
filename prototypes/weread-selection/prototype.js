const books = [
  { id: 'echo', title: '阅读的回声', coverTitle: '阅读的回声', author: '林序', progress: 68, marked: false, highlights: 12, thoughts: 3, bookmarks: 2, date: '2026-10-30', tone: '#657253', ink: '#f1eddc' },
  { id: 'scale', title: '思考的尺度', coverTitle: '思考的尺度', author: '陈舟', progress: 100, marked: true, highlights: 8, thoughts: 5, bookmarks: 1, date: '2026-10-28', tone: '#d8c6a0', ink: '#514932' },
  { id: 'slow', title: '慢下来，才能看清', coverTitle: '慢下来', author: '沈禾', progress: 41, marked: false, highlights: 6, thoughts: 2, bookmarks: 0, date: '2026-10-26', tone: '#ab6b52', ink: '#fff1df' },
  { id: 'forest', title: '林间的日常', coverTitle: '林间日常', author: '周未', progress: 100, marked: true, highlights: 9, thoughts: 1, bookmarks: 0, date: '2026-10-21', tone: '#8c9a98', ink: '#f9f5e7' },
  { id: 'city', title: '理解一座城市的方式：从日常生活到人与空间的关系', coverTitle: '城市的方式', author: '许远', progress: 12, marked: false, highlights: 5, thoughts: 3, bookmarks: 1, date: '2026-10-18', tone: '#c4bdb0', ink: '#4d524a' },
  { id: 'letter', title: '写给未来的自己', coverTitle: '未来的信', author: '乔宁', progress: 0, marked: false, highlights: 0, thoughts: 3, bookmarks: 1, date: '2026-10-15', tone: '#ded7c8', ink: '#6a6658' },
  { id: 'question', title: '练习提问', coverTitle: '练习提问', author: '江映', progress: 1, marked: false, highlights: 4, thoughts: 0, bookmarks: 0, date: '2026-10-11', tone: '#596967', ink: '#f0e9d8' },
  { id: 'between', title: '书页之间', coverTitle: '书页之间', author: '顾言', progress: null, marked: null, highlights: 2, thoughts: null, bookmarks: null, date: null, tone: '#918b76', ink: '#fff7e6' },
];
const storageKey = 'recall.prototype.weread-selection.v1';
const icons = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  filter: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="2" fill="currentColor" stroke="none"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  retry: '<path d="M19 8a8 8 0 1 0 1 7M19 3v5h-5"/>',
  warning: '<path d="M12 8v5m0 4h.01M12 3 2 21h20z"/>',
};
const main = document.getElementById('main');
const footer = document.getElementById('footer');
const sheet = document.getElementById('sheet');
const device = document.getElementById('device');
let route = 'connect';
let selected = new Set();
let filter = 'all';
let query = '';
let sort = 'recent';
let onlyHighlights = false;
let onlyUnimported = false;
let scenario = 'success';
let imported = { scale: 3 };
let job = null;
let timer = null;
let toastTimer = null;
let drawerTimer = null;
let connectionTimer = null;
let connecting = false;
let allowChanges = false;
let sheetReturnId = '';

function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function cover(book) { return `<div class="cover" style="--cover-bg:${book.tone};--cover-ink:${book.ink}" aria-hidden="true"><span class="cover-title">${escapeHtml(book.coverTitle)}</span><span class="cover-edition">RECALL NOTES</span></div>`; }
function progressBar(percent) { return `<div class="progress-track" aria-hidden="true"><div class="progress-fill" style="--progress:${percent}%"></div></div>`; }
function getBook(id) { return books.find(book => book.id === id); }
function persist() {
  try { sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, route, selected: [...selected], imported, scenario, job, allowChanges })); } catch { return; }
}
function restore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (!saved || saved.version !== 1) return;
    selected = new Set((saved.selected || []).filter(id => getBook(id)?.highlights));
    imported = Object.fromEntries(Object.entries(saved.imported || {}).filter(([id, count]) => getBook(id) && Number.isSafeInteger(count) && count >= 0));
    scenario = ['success', 'generation-failure', 'import-failure', 'changes'].includes(saved.scenario) ? saved.scenario : 'success';
    allowChanges = saved.allowChanges === true;
    if (saved.job && Array.isArray(saved.job.items) && saved.job.items.every(item => getBook(item.id) && Number.isSafeInteger(item.generated) && Number.isSafeInteger(item.target) && item.generated >= 0 && item.generated <= item.target)) {
      job = saved.job;
      if (['generating', 'importing'].includes(job.status)) { job.resumeStage = job.status; job.status = 'paused'; }
    }
    route = job ? job.status === 'done' ? 'done' : 'process' : saved.route === 'books' ? 'books' : 'connect';
  } catch { return; }
}
function notify(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2500);
}
function navigate(next) {
  route = next;
  main.scrollTop = 0;
  render();
  main.focus({ preventScroll: true });
  persist();
}
function render() {
  document.querySelector('#scenario').value = scenario;
  device.dataset.screenLabel = route;
  if (route === 'connect') renderConnect();
  else if (route === 'books') renderBooks();
  else if (route === 'process') renderProcess();
  else renderDone();
}
function renderConnect() {
  footer.innerHTML = '';
  main.innerHTML = `<section class="landing reveal" data-screen-label="连接入口">
    <span class="section-label">YOUR READING, RECALLED</span>
    <h1>读过的，<br>也能记得住。</h1>
    <p>把微信读书里的划线，<br>变成下一次温习的问题。</p>
    <svg class="book-art" viewBox="0 0 300 236" aria-hidden="true">
      <defs><pattern id="paper-lines" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8H8" stroke="#dfdfd3" stroke-width=".5"/></pattern></defs>
      <ellipse cx="153" cy="206" rx="113" ry="12" fill="#e3e4d7"/>
      <g transform="translate(47 54) rotate(-14 52 68)"><rect width="95" height="132" rx="5" fill="#b6bba0"/><path d="M8 0v132" stroke="#d8dcc7"/><text x="54" y="28" fill="#424d36" font-family="Songti SC,serif" font-size="14" writing-mode="vertical-rl">阅读的回声</text><circle cx="47" cy="116" r="28" stroke="#818d6c" fill="none"/></g>
      <g transform="translate(114 34) rotate(8 52 78)"><rect width="104" height="152" rx="5" fill="#4e5b43"/><path d="M8 0v152" stroke="#818d6c"/><text x="66" y="24" fill="#eee9d4" font-family="Songti SC,serif" font-size="17" writing-mode="vertical-rl">思考的尺度</text><path d="M24 110h60m-60 9h43" stroke="#aab495" stroke-width=".7"/></g>
      <g transform="translate(174 120) rotate(-5 43 35)"><rect width="89" height="65" rx="5" fill="#fffdf9" stroke="#dedfd3"/><rect width="89" height="65" rx="5" fill="url(#paper-lines)"/><path d="M14 24h57m-57 13h45" stroke="#a3b083" stroke-width="7" opacity=".5"/><path d="m56 52 7 6 14-16" fill="none" stroke="#596649" stroke-width="2"/></g>
      <path d="M242 55v16m-8-8h16M45 31v10m-5-5h10" stroke="#8b947c" stroke-width="1.5"/>
      <circle cx="257" cy="95" r="2" fill="#b5bc9f"/>
    </svg>
    <button type="button" class="primary" id="connect" ${connecting ? 'disabled' : ''}>${connecting ? '<span class="spinner"></span> 正在连接' : `连接微信读书 ${icon('arrow')}`}</button>
    <p class="quiet-note">选择后再确认，不会自动读取整本书。</p>
    <button type="button" class="text-button" id="other-methods">其他导入方式</button>
    <span class="section-label" style="font-size:9px;letter-spacing:.8px;margin-top:15px;color:var(--muted)">交互原型 · 非个人数据</span>
  </section>`;
  document.getElementById('connect').onclick = () => {
    if (connecting) return;
    connecting = true;
    renderConnect();
    connectionTimer = setTimeout(() => { connecting = false; navigate('books'); }, 700);
  };
  document.getElementById('other-methods').onclick = () => openSheet('其他导入方式', '<p class="sheet-note">正式应用保留本地 Skill 文件导入，收在次级入口，不再挤占连接页。</p><button type="button" class="secondary" data-dismiss>了解了</button>');
}
function visibleBooks() {
  const normalized = query.trim().toLowerCase();
  return books.filter(book => (!normalized || `${book.title} ${book.author}`.toLowerCase().includes(normalized))
    && (filter === 'all' || (filter === 'finished' ? book.marked === true : book.marked === false))
    && (!onlyHighlights || book.highlights > 0) && (!onlyUnimported || !imported[book.id]))
    .sort((first, second) => sort === 'highlights' ? second.highlights - first.highlights : sort === 'progress' ? (second.progress ?? -1) - (first.progress ?? -1) : (second.date || '').localeCompare(first.date || ''));
}
function bookCard(book) {
  const total = book.thoughts === null || book.bookmarks === null ? null : book.highlights + book.thoughts + book.bookmarks;
  const reading = book.marked === null ? '状态未提供' : book.marked ? '已标记读完' : '在读';
  return `<button type="button" class="book-card" data-book="${book.id}" aria-pressed="${selected.has(book.id)}" ${book.highlights ? '' : 'disabled'} aria-label="${escapeHtml(book.title)}，${book.highlights} 条划线${book.highlights ? '' : '，暂无可导入划线'}">
    ${cover(book)}<div class="book-info"><div class="book-title-row"><h3>${escapeHtml(book.title)}</h3><span class="check-mark">${icon('check')}</span></div>
    <p class="author">${escapeHtml(book.author)}</p>
    <div class="reading-row"><span class="reading-label ${book.marked ? 'finished' : ''}">${reading}</span><span>${book.progress === null ? '进度未提供' : `阅读进度 ${book.progress}%`}</span></div>
    ${book.progress === null ? '' : progressBar(book.progress)}
    <div class="book-counts"><strong>${book.highlights}</strong><span>条划线</span><span class="total">· ${total === null ? '笔记总数未提供' : `笔记共 ${total} 条`}</span></div>
    <div class="book-extra"><span>${book.highlights ? book.date ? `最近笔记 ${book.date.slice(5).replace('-', '/')}` : '笔记时间未提供' : '暂无可导入划线'}</span>${imported[book.id] ? '<span class="imported-label">· 已导入 Recall</span>' : ''}</div></div>
  </button>`;
}
function renderBooks() {
  main.innerHTML = `<section class="page-heading reveal" data-screen-label="选书列表"><span class="section-label">YOUR NOTEBOOKS</span><h1>选择想记住的书</h1><p>演示书架 · ${books.length} 本有笔记的书</p></section>
    <div class="search-row"><div class="search-box">${icon('search')}<input type="search" id="search" aria-label="搜索书名或作者" placeholder="搜索书名或作者" value="${escapeHtml(query)}"></div><button type="button" class="filter-button ${onlyHighlights || onlyUnimported ? 'active' : ''}" id="filter-settings" aria-label="更多筛选">${icon('filter')}</button></div>
    <div class="filters" aria-label="阅读状态筛选"><button type="button" class="filter-chip" data-filter="all" aria-pressed="${filter === 'all'}">全部</button><button type="button" class="filter-chip" data-filter="reading" aria-pressed="${filter === 'reading'}">在读</button><button type="button" class="filter-chip" data-filter="finished" aria-pressed="${filter === 'finished'}">已读完</button></div>
    <div class="list-meta"><span id="result-count"></span><select class="sort-select" id="sort" aria-label="书籍排序"><option value="recent">最近笔记 ↓</option><option value="highlights">划线最多 ↓</option><option value="progress">阅读进度 ↓</option></select></div><div class="book-list" id="book-list"></div>`;
  document.getElementById('sort').value = sort;
  document.getElementById('search').oninput = event => { query = event.target.value; renderBookList(); };
  document.getElementById('sort').onchange = event => { sort = event.target.value; renderBookList(); };
  document.querySelectorAll('[data-filter]').forEach(button => { button.onclick = () => { filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.filter === filter))); renderBookList(); }; });
  document.getElementById('filter-settings').onclick = openFilters;
  renderBookList();
  renderSelectionFooter();
}
function renderBookList() {
  const visible = visibleBooks();
  document.getElementById('result-count').textContent = `${visible.length} 本书 · 每批最多选 5 本`;
  document.getElementById('book-list').innerHTML = visible.length ? visible.map(bookCard).join('') : '<div class="empty"><h2>暂时没有匹配的书</h2><p>换个关键词，或试试其他筛选。</p><button type="button" class="secondary" id="clear-filters">清除搜索与筛选</button></div>';
  document.querySelectorAll('[data-book]').forEach(button => { button.onclick = () => {
    const id = button.dataset.book;
    if (selected.has(id)) selected.delete(id);
    else if (selected.size < 5) selected.add(id);
    else { notify('每批最多选 5 本，其他书可以下一批导入。'); return; }
    button.setAttribute('aria-pressed', String(selected.has(id)));
    renderSelectionFooter();
    persist();
  }; });
  const clear = document.getElementById('clear-filters');
  if (clear) clear.onclick = () => { query = ''; filter = 'all'; onlyHighlights = false; onlyUnimported = false; renderBooks(); };
}
function renderSelectionFooter() {
  const count = [...selected].reduce((total, id) => total + getBook(id).highlights, 0);
  footer.innerHTML = `<div class="footer-summary"><strong>已选 ${selected.size} 本</strong><span>${count ? `${count} 条划线` : '从书卡里挑选'}</span></div><button type="button" class="primary" id="next" ${selected.size ? '' : 'disabled'}>下一步 · AI 问题与导入 ${icon('arrow')}</button>`;
  document.getElementById('next').onclick = openConfirmation;
}
function openSheet(title, content, returnId = document.activeElement?.id) {
  if (!sheet.open) sheetReturnId = returnId || 'main';
  sheet.innerHTML = `<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-header"><h2 id="sheet-title">${title}</h2><button type="button" class="close-sheet" id="close-sheet" aria-label="关闭弹层">${icon('close')}</button></div>${content}`;
  positionSheet();
  if (!sheet.open) sheet.showModal();
  document.getElementById('close-sheet').onclick = () => sheet.close();
  sheet.querySelectorAll('[data-dismiss]').forEach(button => { button.onclick = () => sheet.close(); });
}
function positionSheet() {
  const bounds = device.getBoundingClientRect();
  sheet.style.position = 'fixed';
  sheet.style.left = `${bounds.left}px`;
  sheet.style.bottom = `${Math.max(0, window.innerHeight - bounds.bottom)}px`;
  sheet.style.width = `${bounds.width}px`;
  const topPadding = parseFloat(getComputedStyle(document.querySelector('.appbar')).paddingTop);
  sheet.style.maxHeight = `${Math.max(100, bounds.height - topPadding - 20)}px`;
}
function openFilters() {
  openSheet('挑选你的书', `<p class="sheet-note">按阅读状态、划线或导入记录筛选。</p><label class="check-option"><input type="checkbox" id="only-highlights" ${onlyHighlights ? 'checked' : ''}>只看有划线、可以制卡的书</label><label class="check-option"><input type="checkbox" id="only-unimported" ${onlyUnimported ? 'checked' : ''}>只看未导入 Recall 的书</label><button type="button" class="primary" id="apply-filters">显示筛选结果</button>`, 'filter-settings');
  document.getElementById('apply-filters').onclick = () => { onlyHighlights = document.getElementById('only-highlights').checked; onlyUnimported = document.getElementById('only-unimported').checked; sheet.close(); renderBooks(); };
}
function planItems(updateChanged) {
  return [...selected].map(id => {
    const book = getBook(id);
    const existing = Math.min(imported[id] || 0, book.highlights);
    const changed = scenario === 'changes' && id === 'scale' ? Math.min(existing, 3) : 0;
    const newCount = book.highlights - existing;
    return { id, newCount, changed, duplicate: existing - changed, update: updateChanged ? changed : 0, target: newCount + (updateChanged ? changed : 0), generated: 0 };
  });
}
function openConfirmation() {
  if (!selected.size) return;
  const items = planItems(allowChanges);
  const target = items.reduce((total, item) => total + item.target, 0);
  const changed = items.reduce((total, item) => total + item.changed, 0);
  openSheet('让划线变成问题', `<p class="sheet-note">已选 ${selected.size} 本书 · 原创演示数据</p><div class="confirm-books">${items.map(item => { const book = getBook(item.id); return `<div class="confirm-book">${cover(book)}<div><h3>${escapeHtml(book.title)}</h3><p>${book.highlights} 条划线${item.duplicate ? ` · ${item.duplicate} 条重复将跳过` : ''}</p></div></div>`; }).join('')}</div>
    ${changed ? `<label class="check-option"><input type="checkbox" id="update-changed" ${allowChanges ? 'checked' : ''}>同时更新 ${changed} 张变化卡，保留复习进度</label>` : ''}
    <div class="confirmation-total"><span>本次生成</span><strong id="confirm-count">${target}<span>个问题</span></strong></div>
    <p class="consent-note">${target ? '确认后，将所选划线发送给 AI 生成问题。全部生成成功后，自动导入卡组；划线原文不改写。' : '这些划线已在卡组中，无需重复生成或导入。'}<br>此处仅演示流程，不调用真实服务。</p>
    <button type="button" class="primary" id="confirm-job">${target ? `生成并自动导入 ${icon('arrow')}` : '查看演示卡组'}</button><button type="button" class="text-button" style="width:100%;margin-top:5px" data-dismiss>再选一选</button>`, 'next');
  const updates = document.getElementById('update-changed');
  if (updates) updates.onchange = () => {
    allowChanges = updates.checked;
    const count = planItems(allowChanges).reduce((total, item) => total + item.target, 0);
    document.getElementById('confirm-count').innerHTML = `${count}<span>个问题</span>`;
    document.getElementById('confirm-job').innerHTML = count ? `生成并自动导入 ${icon('arrow')}` : '查看演示卡组';
  };
  document.getElementById('confirm-job').onclick = () => { sheet.close(); startJob(); };
}
function startJob() {
  clearTimeout(timer);
  job = { items: planItems(allowChanges), status: 'generating', resumeStage: 'generating', failedOnce: false, importFailedOnce: false, scenario };
  if (!job.items.some(item => item.target)) { job.status = 'done'; navigate('done'); return; }
  navigate('process');
  scheduleTick();
}
function scheduleTick() { clearTimeout(timer); timer = setTimeout(tick, 180); }
function tick() {
  if (!job || job.status !== 'generating') return;
  const item = job.items.find(entry => entry.generated < entry.target);
  if (!item) { beginImport(); return; }
  const generated = job.items.reduce((total, entry) => total + entry.generated, 0);
  if (job.scenario === 'generation-failure' && !job.failedOnce && generated >= 4) {
    job.failedOnce = true; job.failedId = item.id; job.status = 'generation-failed'; renderProcess(); persist(); return;
  }
  item.generated += 1;
  renderProcess();
  persist();
  scheduleTick();
}
function beginImport() {
  job.status = 'importing'; job.resumeStage = 'importing'; renderProcess(); persist();
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (job.status !== 'importing') return;
    if (job.scenario === 'import-failure' && !job.importFailedOnce) { job.importFailedOnce = true; job.status = 'import-failed'; renderProcess(); persist(); return; }
    job.items.forEach(item => { imported[item.id] = Math.max(imported[item.id] || 0, getBook(item.id).highlights); });
    job.status = 'done'; navigate('done');
  }, 1000);
}
function retryJob() {
  if (!job || !['paused', 'generation-failed', 'import-failed'].includes(job.status)) return;
  const importing = job.status === 'import-failed' || (job.status === 'paused' && job.resumeStage === 'importing');
  delete job.failedId;
  if (importing) beginImport();
  else { job.status = 'generating'; renderProcess(); persist(); scheduleTick(); }
}
function renderProcess() {
  const focusedId = document.activeElement?.id;
  const status = job.status;
  const generated = job.items.reduce((total, item) => total + item.generated, 0);
  const target = job.items.reduce((total, item) => total + item.target, 0);
  const active = job.items.find(item => item.generated < item.target)?.id;
  const title = status === 'generation-failed' ? '生成暂停了' : status === 'import-failed' ? '问题已好，导入未完成' : status === 'paused' ? '进度已为你保留' : status === 'importing' ? '正在放进你的卡组' : '正在把划线变成问题';
  const subtitle = ['generation-failed', 'paused'].includes(status) ? '已完成的问题保留，继续时不重做。' : status === 'import-failed' ? '无需重新生成，重试只执行导入。' : status === 'importing' ? '问题全部生成成功，现在自动导入。' : '一条划线，一个问题。原文始终保留。';
  main.innerHTML = `<section class="page-heading process-heading" data-screen-label="生成与导入"><span class="section-label">READING INTO MEMORY · 演示</span><h1 id="process-title">${title}</h1><p>${subtitle}</p></section><section class="process-summary"><div class="process-top"><span>${status === 'importing' || status === 'import-failed' ? '问题已生成' : '问题生成进度'}</span><strong class="process-number" id="generated-count">${generated}<span> / ${target}</span></strong></div>${progressBar(target ? generated / target * 100 : 100)}<div class="process-stages"><span class="${status === 'generating' ? 'active' : ''}">01 ${generated === target ? '问题已生成' : '生成问题'}</span><span class="stage-line"></span><span class="${status === 'importing' ? 'active' : ''}">02 导入卡组</span></div></section><div class="job-list">${job.items.map(item => {
    const book = getBook(item.id);
    const complete = item.generated === item.target;
    const failed = job.failedId === item.id;
    const running = status === 'generating' && active === item.id;
    const label = !item.target ? '无需生成 · 已有卡片保留' : failed ? '生成失败 · 等待重试' : complete ? '问题已生成' : running ? '问题生成中' : status === 'paused' && active === item.id ? '已暂停' : '等待生成';
    return `<article class="job-card ${failed ? 'failed' : complete ? 'complete' : ''}" data-job="${item.id}">${cover(book)}<div><div class="job-title"><h3>${escapeHtml(book.title)}</h3><span>${item.generated} / ${item.target}</span></div><p class="job-status">${running ? '<span class="spinner"></span>' : icon(failed ? 'warning' : complete ? 'check' : 'pause')}${label}</p>${progressBar(item.target ? item.generated / item.target * 100 : 100)}</div></article>`;
  }).join('')}</div>${['generation-failed', 'import-failed'].includes(status) ? `<p class="failure-note" role="alert">${status === 'generation-failed' ? '演示：AI 服务暂时没有响应。尚未导入任何卡片，重试后继续未完成的问题。' : '演示：卡组写入未完成。问题草稿已保留，重试导入不会重复生成。'}</p>` : ''}<p class="process-note">原创演示数据 · 不会写入真实卡片库</p>`;
  if (status === 'generating') {
    footer.innerHTML = `<button type="button" class="secondary" id="pause-job">${icon('pause')} 暂停，保留进度</button>`;
    document.getElementById('pause-job').onclick = () => { clearTimeout(timer); job.resumeStage = 'generating'; job.status = 'paused'; renderProcess(); persist(); };
  } else if (['paused', 'generation-failed', 'import-failed'].includes(status)) {
    footer.innerHTML = `<button type="button" class="primary" id="retry-job">${icon('retry')} ${status === 'import-failed' ? '重试导入' : status === 'paused' ? '继续生成与导入' : '重试并继续'}</button>`;
    document.getElementById('retry-job').onclick = retryJob;
  } else footer.innerHTML = '<button type="button" class="primary" disabled><span class="spinner"></span> 正在自动导入</button>';
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
}
function renderDone() {
  const items = job?.items || [];
  const added = items.reduce((total, item) => total + item.newCount, 0);
  const updated = items.reduce((total, item) => total + item.update, 0);
  const skipped = items.reduce((total, item) => total + item.duplicate + item.changed - item.update, 0);
  main.innerHTML = `<section class="done-hero reveal" data-screen-label="导入完成"><div class="done-symbol">${icon('check')}</div><h1>让读过的，留得住。</h1><p>演示导入完成 · ${items.length} 本书已整理为卡组<br>原文保留，温习从一个好问题开始。</p></section><div class="receipt"><div><strong>${added}</strong><span>新增卡片</span></div><div><strong>${updated}</strong><span>更新卡片</span></div><div><strong>${skipped}</strong><span>跳过已有</span></div></div><span class="section-label">YOUR READING GROUPS</span>${items.map(item => { const book = getBook(item.id); return `<article class="group-card">${cover(book)}<div><h3>${escapeHtml(book.title)}</h3><p>${book.highlights} 张演示卡片 · 原文未改写</p></div><button type="button" data-group="${book.id}">查看 ${icon('arrow')}</button></article>`; }).join('')}<p class="process-note">这只是交互原型，真实卡片库没有变化。</p>`;
  footer.innerHTML = '<button type="button" class="primary" id="back-books">继续选择其他书</button>';
  document.getElementById('back-books').onclick = () => { job = null; selected.clear(); allowChanges = false; navigate('books'); };
  document.querySelectorAll('[data-group]').forEach(button => { button.onclick = () => {
    const book = getBook(button.dataset.group);
    openSheet('演示卡组', `<p class="sheet-note">${escapeHtml(book.title)} · 原创流程样例，非 AI 输出</p><article class="sample-question"><span class="section-label">问题 / 01</span><h3>怎样判断自己真正理解了读过的内容？</h3><span class="section-label">划线原文</span><p>合上书，用自己的话重新说明一个观点，再对照原文检查遗漏。能够认出一句话，不等于能够独立解释它。</p></article><button type="button" class="secondary" data-dismiss>返回导入结果</button>`);
  }; });
}
function setDrawer(open) {
  clearTimeout(drawerTimer);
  const drawer = document.getElementById('drawer');
  const logo = document.getElementById('logo');
  if (open) { drawer.hidden = false; drawer.inert = false; }
  device.classList.toggle('drawer-open', open);
  document.getElementById('page-veil').hidden = !open;
  logo.setAttribute('aria-expanded', String(open));
  logo.setAttribute('aria-label', open ? '关闭 Recall 导航' : '打开 Recall 导航');
  main.inert = open;
  footer.inert = open;
  document.getElementById('demo-menu').inert = open;
  if (open) drawer.querySelector('button').focus();
  else { drawer.inert = true; logo.focus({ preventScroll: true }); drawerTimer = setTimeout(() => { if (!device.classList.contains('drawer-open')) drawer.hidden = true; }, 300); }
}
function resetDemo(next = 'connect') {
  clearTimeout(timer); clearTimeout(connectionTimer); connecting = false; job = null; selected.clear(); imported = { scale: 3 }; query = ''; filter = 'all'; onlyHighlights = false; onlyUnimported = false; allowChanges = false;
  if (sheet.open) sheet.close();
  navigate(next);
}
function preview(target) {
  resetDemo(target === 'connect' ? 'connect' : 'books');
  if (['confirm', 'failure', 'done'].includes(target)) {
    selected = new Set(['echo', 'scale']);
    renderSelectionFooter();
    if (target === 'confirm') openConfirmation();
    else {
      job = { items: planItems(false), status: target === 'done' ? 'done' : 'generation-failed', resumeStage: 'generating', failedOnce: true, importFailedOnce: false, scenario: 'generation-failure', ...(target === 'failure' ? { failedId: 'echo' } : {}) };
      job.items.forEach(item => { item.generated = target === 'done' ? item.target : item.id === 'echo' ? 4 : 0; });
      if (target === 'done') job.items.forEach(item => { imported[item.id] = getBook(item.id).highlights; });
      navigate(target === 'done' ? 'done' : 'process');
    }
    persist();
  }
}
function openDemoSettings() {
  openSheet('原型演示', `<p class="sheet-note">所有书籍与数量均为演示数据。选择失败场景后，下一次任务会暂停并显示重试。</p><div class="sheet-controls"><label for="mobile-scenario">演示场景</label><select id="mobile-scenario"><option value="success">顺利生成并导入</option><option value="generation-failure">生成中途失败</option><option value="import-failure">导入阶段失败</option><option value="changes">存在已变化的卡片</option></select><button type="button" class="secondary" id="mobile-preview-failure">直接查看生成失败</button><button type="button" class="secondary" id="mobile-preview-books">直接查看选书列表</button><button type="button" class="primary" id="save-demo-settings">保存演示设置</button><button type="button" class="text-button" id="mobile-reset">重新演示</button></div>`);
  document.getElementById('mobile-scenario').value = scenario;
  document.getElementById('save-demo-settings').onclick = () => { scenario = document.getElementById('mobile-scenario').value; document.getElementById('scenario').value = scenario; sheet.close(); persist(); notify('演示场景已更新，下一次任务生效。'); };
  document.getElementById('mobile-preview-failure').onclick = () => preview('failure');
  document.getElementById('mobile-preview-books').onclick = () => preview('books');
  document.getElementById('mobile-reset').onclick = () => resetDemo();
}
document.getElementById('logo').onclick = () => setDrawer(!device.classList.contains('drawer-open'));
document.getElementById('page-veil').onclick = () => setDrawer(false);
document.getElementById('demo-menu').onclick = openDemoSettings;
document.getElementById('reset-demo').onclick = () => resetDemo();
document.getElementById('scenario').onchange = event => { scenario = event.target.value; persist(); };
document.querySelectorAll('[data-preview]').forEach(button => { button.onclick = () => preview(button.dataset.preview); });
document.querySelectorAll('[data-nav]').forEach(button => { button.onclick = () => { const target = button.dataset.nav; setDrawer(false); if (target === 'demo') openDemoSettings(); else if (job && job.status !== 'done') notify('当前任务已保留，请完成或在原型设置中重新演示。'); else { clearTimeout(connectionTimer); connecting = false; job = null; navigate(target); } }; });
document.addEventListener('keydown', event => {
  if (!device.classList.contains('drawer-open')) return;
  if (event.key === 'Escape') { event.preventDefault(); setDrawer(false); }
  if (event.key === 'Tab') {
    const controls = [...document.querySelectorAll('#drawer button'), document.getElementById('logo')];
    const position = controls.indexOf(document.activeElement);
    event.preventDefault(); controls[(position + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
  }
});
sheet.addEventListener('click', event => { if (event.target === sheet) { const bounds = sheet.getBoundingClientRect(); if (event.clientY < bounds.top || event.clientX < bounds.left || event.clientX > bounds.right) sheet.close(); } });
sheet.addEventListener('close', () => { document.getElementById(sheetReturnId)?.focus({ preventScroll: true }); });
window.addEventListener('pagehide', persist);
window.addEventListener('resize', () => { if (sheet.open) positionSheet(); });
restore();
render();
const requestedPreview = new URLSearchParams(location.search).get('preview');
if (['connect', 'books', 'confirm', 'failure', 'done'].includes(requestedPreview)) preview(requestedPreview);
