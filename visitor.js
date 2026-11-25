'use strict';

const verdicts = {
  AC: 'Accepted', WA: 'Wrong Answer', TLE: 'Time Limit Exceeded', MLE: 'Memory Limit Exceeded',
  RE: 'Runtime Error', OLE: 'Output Limit Exceeded', CE: 'Compile Error', JE: 'Judge Error', pending: '未运行'
};
const displayDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
const pageSize = 25;
const byId = id => document.getElementById(id);
const element = el;
const model = {problems: []};
const workbench = byId('workbench');
const navigationDelay = 550;
let generation = 0;
let delayTimer;
let hasRouted = false;
let action;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const profile = document.getElementById('profile').content;
const notice = document.getElementById('notice');
const caseDialog = document.getElementById('case-detail');
let snapshot;
let problemsById;
let problemsByLabel;
let recordsByNumber;

function el(tag, className, value) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (value !== null && value !== undefined) result.textContent = value;
  return result;
}

function link(text, href, className) {
  const result = el('a', className, text);
  result.href = href;
  return result;
}

function size(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(2) + 'KB';
  return (bytes / 1048576).toFixed(2) + 'MB';
}

function time(ms) {
  if (!Number.isFinite(ms)) return '—';
  return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(2) + 's';
}

function date(value) {
  const day = new Date(value);
  return Number.isNaN(day.getTime()) ? '—' : displayDate.format(day);
}

function fields(pairs, className) {
  const dl = el('dl', className);
  for (const [label, value] of pairs) {
    const row = el('div');
    const dd = el('dd');
    dd.append(value ?? '—');
    row.append(el('dt', '', label), dd);
    dl.append(row);
  }
  return dl;
}

function markdown(text) {
  const content = el('div', 'prose');
  window.OJTypeset.render(content, text);
  return content;
}

function problemLabel(id) { return problemsById.get(id)?.label ?? id; }
function problemHref(id) { return '#' + problemLabel(id); }
function related(p) { return '#records?problemId=' + encodeURIComponent(p.label); }

function renderProblem(problem) {
  byId('problem-id').textContent = problemLabel(problem.id);
  byId('problem-title').textContent = problem.title;
  byId('sidebar-id').textContent = problemLabel(problem.id);
  byId('submit-count').textContent = problem.counts.total;
  byId('ac-count').textContent = problem.counts.accepted;
  const progress = byId('problem-progress');
  progress.textContent = problem.bestScore ?? '—';
  progress.className = problem.solved ? 'passed' : '';
  byId('time-limit').textContent = (problem.timeMs / 1000).toFixed(2) + 's';
  byId('memory-limit').textContent = problem.memoryMb.toFixed(2) + 'MB';
  byId('statement').replaceChildren();
  for (const item of problem.sections) {
    const section = element('section');
    section.append(element('h2', '', item.title), markdown(item.text));
    byId('statement').append(section);
  }
  byId('samples-section').hidden = !problem.samples.length;
  const samples = byId('samples');
  samples.replaceChildren();
  problem.samples.forEach((sample, i) => {
    const body = element('div', 'sample');
    const pair = element('div', 'sample-pair');
    for (const [label, value] of [['输入', sample.input], ['输出', sample.output]]) {
      const part = element('div', 'sample-block');
      const head = element('div', 'sample-head');
      const title = label + ' #' + (i + 1);
      const copy = element('button', 'sample-copy', '复制');
      copy.type = 'button';
      copy.setAttribute('aria-label', '复制' + title);
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(value);
          copy.textContent = '已复制';
        } catch {
          copy.textContent = '请手动复制';
        }
        setTimeout(() => { copy.textContent = '复制'; }, 1600);
      };
      head.append(element('strong', '', title), copy);
      part.append(head, element('pre', '', value.replace(/\r?\n$/, '')));
      pair.append(part);
    }
    body.append(pair);
    if (sample.explanation) body.append(markdown(sample.explanation));
    samples.append(body);
  });
  const sourceSection = byId('source-section');
  const sourceLink = byId('source-link');
  sourceSection.hidden = true;
  sourceLink.replaceChildren();
  if (problem.solved && problem.source) {
    const src = problem.source;
    const title = [src.id, src.title].filter(Boolean).join(' · ');
    const link = element('a', '', title || '查看原题');
    try {
      const url = new URL(src.url);
      if (['https:', 'http:'].includes(url.protocol)) {
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
    } catch { /* Text remains visible when the source has no URL. */ }
    sourceLink.append(link);
    sourceSection.hidden = false;
  }
}
function showCase(item, number) {
  caseDialog.querySelector('h2').textContent = '测试点 #' + number;
  const details = fields([['评测状态', verdicts[item.status] ?? item.status],
    ['运行时间', Number.isFinite(item.timeMs) ? Math.round(item.timeMs) + ' ms' : '—'], ['内存占用', size(item.memoryBytes)]], 'case-detail-facts');
  caseDialog.querySelector('dl').replaceWith(details);
  const text = {AC:'程序输出与标准答案一致。',WA:'程序输出与标准答案不符。',RE:'程序运行时异常退出。',TLE:'程序超过本测试点的时间限制。',MLE:'程序超过本测试点的空间限制。',OLE:'程序超过本测试点的输出限制。'}[item.status];
  const message = byId('case-detail-message');
  message.textContent = text ?? '';
  message.hidden = !text;
  caseDialog.showModal();
}

function showRecordSource(panel, code) {
  const head = el('div', 'record-code-head');
  head.append(el('h2', '', '源代码'));
  panel.append(head);
  if (typeof code !== 'string') {
    panel.append(el('p', 'guest-empty', '当前快照未收录这条提交的源代码。'));
    return;
  }
  const copy = el('button', 'outline-button', '复制代码');
  copy.type = 'button';
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      copy.textContent = '已复制';
    } catch {
      copy.textContent = '请手动复制';
    }
  };
  head.append(copy);
  const pre = el('pre', 'record-code-body');
  const source = el('code', 'cpp-source');
  function appendTokens(parent, tokens) {
    for (const token of [].concat(tokens)) {
      if (typeof token === 'string') {
        parent.append(token);
      } else {
        const span = el('span', 'token ' + token.type);
        if (token.alias) span.classList.add(...[].concat(token.alias));
        appendTokens(span, token.content);
        parent.append(span);
      }
    }
  }
  try {
    appendTokens(source, Prism.tokenize(code, Prism.languages.cpp));
  } catch {
    source.textContent = code;
  }
  pre.append(source);
  panel.append(pre);
}

function showRecord(page, r) {
  const p = problemsById.get(r.problemId);
  const card = el('div', 'main-card');
  const evaluation = el('section', 'tab-content');
  const source = el('section', 'tab-content');
  source.id = 'record-code';
  card.append(evaluation, source);
  evaluation.id = 'judge';
  evaluation.append(el('h2', '', '测试点信息'));
  const cases = el('div', 'cases');
  cases.id = 'cases';
  r.cases.forEach((item, index) => {
    const tone = item.status === 'AC' ? 'good' : item.status === 'pending' ? '' : 'bad';
    const tile = el('button', 'case ' + tone);
    tile.type = 'button';
    tile.dataset.verdict = item.status === 'pending' ? 'skipped' : item.status;
    tile.setAttribute('aria-haspopup', 'dialog');
    tile.setAttribute('aria-label', '测试点 #' + (index + 1) + ' · ' + (verdicts[item.status] ?? item.status));
    tile.append(el('span', 'case-top', '#' + (index + 1)), el('span', 'case-code', item.status === 'pending' ? '未运行' : item.status));
    tile.append(el('span', 'case-usage', Number.isFinite(item.timeMs) ? Math.round(item.timeMs) + 'ms/' + size(item.memoryBytes) : '—'));
    tile.onclick = () => {
      if (action === 'route') return;
      schedule('case', () => {
        if (!evaluation.hidden) showCase(item, index + 1);
      }, navigationDelay);
    };
    cases.append(tile);
  });
  evaluation.append(r.cases.length ? cases : el('p', 'guest-empty', '没有测试点记录。'));
  const side = el('aside', 'aside-card detail-side');
  const owner = link('', '#records', 'record-owner');
  owner.append(profile.querySelector('.oj-profile').cloneNode(true));
  const status = el('strong', 'record-status ' + (r.status === 'AC' ? 'good' : 'bad'), verdicts[r.status] ?? r.status);
  side.append(owner, fields([['所属题目', link(p.label + ' ' + p.title, '#' + p.label)], ['评测状态', status],
    ['评测分数', el('strong', status.className, r.score ?? '—')], ['提交时间', date(r.createdAt)]], 'fact-list'), link('本题提交记录', related(p), 'text-link'));
  const columns = el('div', 'columns record-columns');
  columns.append(card, side);
  const mast = el('header', 'masthead record-mast');
  const meta = el('div');
  const tabs = el('div', 'record-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '记录详情');
  const panels = [evaluation, source];
  function activate(panel) {
    if (panel === source && !source.hasChildNodes()) showRecordSource(source, r.code);
    panels.forEach((target, index) => {
      const selected = target === panel;
      target.hidden = !selected;
      tabs.children[index].setAttribute('aria-selected', String(selected));
      tabs.children[index].tabIndex = selected ? 0 : -1;
    });
  }
  for (const panel of panels) {
    const tab = el('button', '', panel === evaluation ? '评测信息' : '源代码');
    tab.type = 'button';
    tab.id = panel.id + '-tab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    tab.onclick = () => activate(panel);
    tabs.append(tab);
  }
  tabs.onkeydown = event => {
    const other = event.target === tabs.firstElementChild ? 1 : 0;
    const index = {ArrowLeft:other, ArrowRight:other, Home:0, End:1}[event.key];
    if (index === undefined) return;
    event.preventDefault();
    activate(panels[index]);
    tabs.children[index].focus();
  };
  activate(evaluation);
  meta.append(fields([
    ['编程语言', r.language], ['代码长度', size(r.bytes)], ['用时', Number.isFinite(r.totalTimeMs) ? Math.round(r.totalTimeMs) + 'ms' : '—'], ['内存', size(r.memoryBytes)]
  ], 'record-facts'), tabs);
  mast.append(el('h1', '', 'R' + r.number + ' 记录详情'), meta);
  page.replaceChildren(mast, columns);
}

function metric(icon, title, value) {
  const span = el('span', 'record-metric');
  span.title = title + ' ' + value;
  const glyph = el('i', 'record-icon ri-' + icon);
  glyph.setAttribute('aria-hidden', 'true');
  span.append(glyph, value);
  return span;
}

function recordRow(r) {
  const p = problemsById.get(r.problemId);
  const href = '#record/' + r.number;
  const row = el('article', 'record-row');
  const author = link('', href, 'record-row-author');
  author.setAttribute('aria-label', '查看 R' + r.number + ' 评测详情');
  const byline = el('span', 'record-byline');
  const when = el('time', 'record-row-date', date(r.createdAt).slice(5));
  when.dateTime = r.createdAt;
  when.title = date(r.createdAt) + ' 北京时间';
  byline.append(profile.querySelector('.oj-profile-nameplate').cloneNode(true), when);
  author.append(profile.querySelector('img').cloneNode(true), byline);
  const result = link('', href, 'record-row-result');
  result.title = 'R' + r.number + ' · ' + (verdicts[r.status] ?? r.status);
  const ac = r.status === 'AC';
  const grade = el('span', 'record-grade', r.score ?? '—');
  const fraction = r.maxScore ? r.score / r.maxScore : 0;
  grade.dataset.tone = fraction >= .8 ? 'high' : fraction >= .6 ? 'mid' : 'low';
  result.append(el('span', 'record-verdict ' + (ac ? 'good' : 'bad'), ac ? 'Accepted' : ['WA','RE','TLE','MLE','OLE'].includes(r.status) ? 'Unaccepted' : (verdicts[r.status] ?? r.status)), grade);
  const question = link('', '#' + p.label, 'record-row-problem');
  question.append(el('strong', '', p.label), el('span', '', p.title));
  const resources = link('', href, 'record-metrics');
  const line = el('span', 'metric-line');
  line.append(metric('time', '用时', time(r.totalTimeMs)), ' / ', metric('memory', '内存', size(r.memoryBytes)), ' / ', metric('size', '代码长度', size(r.bytes)));
  resources.append(line, metric('code', '编程语言', r.language));
  row.append(author, result, question, resources);
  row.onclick = event => {
    if (!event.target.closest('a') && !window.getSelection()?.toString()) location.hash = href;
  };
  return row;
}

function listURL(params) { return '#records' + (params.size ? '?' + params : ''); }
function filterForm(params, selected, problems, refresh) {
  const form = element('form','records-filter');
  form.setAttribute('role','search');
  form.setAttribute('aria-label','查找评测记录');
  const searchRow = element('div','record-filter-row');
  const problem = element('label','','查找记录');
  problem.htmlFor = 'record-search-input';
  const input = element('input');
  input.id = problem.htmlFor;
  input.type = 'search';
  input.placeholder = '题目编号或名称';
  input.setAttribute('aria-label','题目编号或名称');
  input.autocomplete = 'off';
  input.value = selected ? problemLabel(selected.id) : params.get('q') || params.get('problemId') || '';
  const choices = element('datalist');
  choices.id = 'record-problem-options';
  input.setAttribute('list',choices.id);
  input.oninput = () => {
    const text = input.value.trim().toLocaleLowerCase();
    choices.replaceChildren();
    if (!text) return;
    for (const p of problems) {
      const id = problemLabel(p.id);
      if (id.toLowerCase().includes(text) || p.title.toLocaleLowerCase().includes(text)) {
        const option = element('option');
        option.value = id + ' ' + p.title;
        choices.append(option);
        if (choices.childElementCount === 12) break;
      }
    }
  };
  const user = element('input');
  user.type = 'text';
  user.readOnly = true;
  user.value = '275860';
  user.setAttribute('aria-label','用户编号');
  searchRow.append(problem,input,user,choices);
  const statusRow = element('div','record-filter-row');
  const verdict = element('label','','筛选选项');
  verdict.htmlFor = 'record-status-filter';
  const select = element('select');
  select.id = verdict.htmlFor;
  select.setAttribute('aria-label','评测状态');
  select.name = 'status';
  const states = [['','全部状态'], ...Object.entries(verdicts).filter(([key]) => key !== 'pending')];
  for (const [value,text] of states) select.add(new Option(text,value));
  select.value = params.get('status') || '';
  statusRow.append(verdict,select);
  const footer = element('div','record-filter-footer');
  const count = element('span','record-result-count','正在读取结果…');
  count.setAttribute('role','status');
  const submit = element('button','primary record-search-button','搜索');
  const searchIcon = element('i','record-search-icon');
  searchIcon.setAttribute('aria-hidden','true');
  submit.prepend(searchIcon);
  submit.type = 'submit';
  form.onsubmit = event => {
    event.preventDefault();
    const next = new URLSearchParams();
    const text = input.value.trim();
    const exact = problems.find(p => {
      const id = problemLabel(p.id).toLowerCase();
      return text.toLowerCase() === id || text === id.slice(1) || text.toLowerCase() === id + ' ' + p.title.toLocaleLowerCase();
    });
    if (exact) next.set('problemId',problemLabel(exact.id));
    else if (text) next.set('q',text);
    if (select.value) next.set('status',select.value);
    const target = listURL(next);
    if (target === location.hash) refresh();
    else location.hash = target;
  };
  select.onchange = () => form.requestSubmit();
  footer.append(count);
  if (params.has('q') || params.has('problemId') || params.has('status')) footer.append(link('清除筛选','#records','clear-record-filter'));
  footer.append(submit);
  form.append(searchRow,statusRow,footer);
  return {form,count};
}
function showRecords(params) {
  const token = params.get('problemId');
  const selected = problemsById.get(token) || problemsByLabel.get(token?.toUpperCase());
  const keyword = (params.get('q') || '').normalize('NFKC').trim().toLowerCase();
  const data = snapshot.records.filter(r => {
    const p = problemsById.get(r.problemId);
    return (!token || r.problemId === selected?.id) && (!params.get('status') || params.get('status') === r.status) &&
      (p.label + ' ' + p.title).normalize('NFKC').toLowerCase().includes(keyword);
  });
  const {form, count} = filterForm(params, selected, snapshot.problems, route);
  count.textContent = '共计 ' + data.length + ' 条结果';
  const stream = el('div', 'records-table-wrap record-stream');
  const pages = Math.max(1, Math.ceil(data.length / pageSize));
  const current = Math.min(pages, Math.max(1, Math.trunc(Number(params.get('page'))) || 1));
  for (const record of data.slice((current-1)*pageSize, current*pageSize)) stream.append(recordRow(record));
  if (!data.length) stream.append(el('p','list-empty',params.size ? '没有符合条件的提交记录。' : '还没有提交记录。'));
  const pager = el('nav','records-pages');
  pager.hidden = pages <= 1;
  const pageLink = (number, text) => {
    const dest = new URLSearchParams(params);
    dest.set('page',number);
    return link(text,listURL(dest));
  };
  if (current > 1) pager.append(pageLink(current-1,'上一页'));
  pager.append(el('span','',current + ' / ' + pages));
  if (current < pages) pager.append(pageLink(current+1,'下一页'));
  byId('records-page').replaceChildren(form,stream,pager);
}

function showSolution(p) {
  byId('solution-title').textContent = p.label + ' ' + p.title + ' 题解';
  byId('solution-back').href = problemHref(p.id);
  const review = p.solved && p.review?.markdown?.trim();
  const empty = p.solved ? '本题已通过，复盘后会在这里发布题解。' : '通过本题并完成复盘后，可在这里查看题解。';
  byId('solution-body').replaceChildren(review ? markdown(review) : el('p','solution-empty',empty));
}

function breadcrumbs(parts) {
  const nav = byId('breadcrumbs');
  nav.replaceChildren();
  for (const [text, href] of parts) {
    if (nav.childElementCount) nav.append(el('span', 'separator', '/'));
    const crumb = href ? link(text,href) : el('span','',text);
    if (!href) crumb.setAttribute('aria-current','page');
    nav.append(crumb);
  }
}

function schedule(kind, work, delay) {
  const stamp = ++generation;
  const requestedHash = location.hash;
  clearTimeout(delayTimer);
  action = kind;
  workbench.setAttribute('aria-busy','true');
  const commit = () => {
    if (stamp !== generation || location.hash !== requestedHash) return;
    try { work(); }
    finally {
      if (stamp === generation) {
        workbench.removeAttribute('aria-busy');
        action = null;
      }
    }
  };
  if (delay && !reducedMotion.matches) delayTimer = setTimeout(commit,delay);
  else commit();
}

function renderRoute(hash) {
  const [path, search] = hash.slice(1).split('?');
  const params = new URLSearchParams(search);
  const [name, subpage, ...extra] = (path || 'home').split('/');
  const p = problemsByLabel.get(name.toUpperCase()) || problemsById.get(name);
  const record = name === 'record' && /^\d+$/.test(subpage) ? recordsByNumber.get(Number(subpage)) : null;
  let dest, title, crumbs, active;
  if (p && (!subpage || subpage === 'solution') && !extra.length) {
    active = 'library';
    dest = subpage === 'solution' ? 'solution-page' : 'practice';
    crumbs = [['题目列表','#library'],[p.label,subpage ? problemHref(p.id) : '']];
    if (subpage) {
      title = p.label + ' ' + p.title + ' 题解';
      crumbs.push(['题解']);
      showSolution(p);
    } else {
      renderProblem(p);
      title = p.title;
      byId('tab-statement').href = problemHref(p.id);
      byId('history-button').href = related(p);
      byId('show-review').href = problemHref(p.id) + '/solution';
    }
  } else if (record && !extra.length) {
    active = 'records';
    dest = 'record-page';
    title = 'R' + record.number + ' 记录详情';
    crumbs = [['评测记录','#records'],['R' + record.number]];
    showRecord(byId(dest),record);
  } else if (!subpage && !extra.length && ['records','library','home'].includes(name)) {
    active = name;
    dest = name + '-page';
    title = {records:'评测记录',library:'题目列表',home:'首页'}[name];
    crumbs = [[title]];
    if (name === 'library') renderLibraryPage();
    if (name === 'records') showRecords(params);
  } else {
    title = '找不到页面';
    crumbs = [[title]];
    notice.className = 'main-card guest-err';
    notice.replaceChildren(el('h1','','找不到这个页面'),link('返回题库','#library'));
  }
  notice.hidden = Boolean(dest);
  for (const page of document.querySelectorAll('#workbench > section')) page.hidden = page.id !== dest;
  for (const item of document.querySelectorAll('.rail a')) {
    if (item.hash === '#' + active) item.setAttribute('aria-current','page');
    else item.removeAttribute('aria-current');
  }
  breadcrumbs(crumbs);
  document.title = title + ' · ___A__OI';
  window.scrollTo(0,0);
}

function route() {
  const hash = location.hash;
  const dwell = hasRouted || (hash && hash !== '#home') ? navigationDelay : 0;
  hasRouted = true;
  if (caseDialog.open) caseDialog.close();
  byId('personal-menu').open = false;
  schedule('route', () => renderRoute(hash), dwell);
}

caseDialog.addEventListener('click', event => {
  if (event.target !== caseDialog) return;
  const rect = caseDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) caseDialog.close();
});
async function start() {
  try {
    const response = await fetch('./snapshot.json', {credentials: 'omit', cache: 'no-cache'});
    if (!response.ok) throw new Error('snapshot');
    snapshot = await response.json();
    problemsById = new Map(snapshot.problems.map(p => [p.id, p]));
    problemsByLabel = new Map(snapshot.problems.map(p => [p.label.toUpperCase(), p]));
    recordsByNumber = new Map(snapshot.records.map(r => [r.number, r]));
    model.problems = snapshot.problems;
    byId('personal-menu').querySelector('.account-title').append(profile.querySelector('.oj-profile-nameplate').cloneNode(true));
    window.addEventListener('hashchange', route);
    route();
  } catch {
    notice.hidden = false;
    notice.className = 'main-card guest-err';
    notice.replaceChildren(el('h1', '', '暂时无法读取题库'), link('重新加载', location.href));
    notice.querySelector('a').onclick = event => { event.preventDefault(); location.reload(); };
  }
}

start();
