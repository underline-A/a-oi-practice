'use strict';

function renderLibraryPage() {
  const root = byId('library-page');
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const keyword = (params.get('q') || '').trim();
  const filter = params.get('state') || '';
  const sort = params.get('sort') || 'id';
  const compare = new Intl.Collator('zh-CN', {numeric: true});
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase();
  const needle = normalize(keyword);
  const matching = model.problems.filter(problem => {
    if (filter === 'solved' && !problem.solved) return false;
    if (filter === 'unsolved' && problem.solved) return false;
    return normalize(problemLabel(problem.id) + ' ' + problem.title).includes(needle);
  });
  const byTitle = sort === 'title' || sort === '-title';
  matching.sort((a,b) => {
    const titleOrder = byTitle ? compare.compare(a.title,b.title) : 0;
    const order = titleOrder || compare.compare(problemLabel(a.id),problemLabel(b.id));
    return sort.startsWith('-') ? -order : order;
  });
  const pageSize = 50;
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(pages, Math.max(1, Math.trunc(Number(params.get('page'))) || 1));

  function url(changes) {
    const next = new URLSearchParams(params);
    for (const [key,value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return '#library' + (next.size ? '?' + next.toString() : '');
  }
  function anchor(text, href, className) {
    const node = element('a', className, text);
    node.href = href;
    return node;
  }

  const form = element('form','library-filter');
  form.setAttribute('role','search');
  form.setAttribute('aria-label','搜索题库');
  const fields = element('div','library-fields');
  const stateLabel = element('label','library-field','做题状态');
  const select = element('select');
  select.name = 'state';
  for (const [value,title] of [['','全部状态'],['unsolved','未通过'],['solved','已通过']]) {
    select.add(new Option(title,value));
  }
  select.value = filter;
  stateLabel.append(select);
  const queryLabel = element('label','library-field','关键词');
  const input = element('input');
  input.type = 'search';
  input.name = 'q';
  input.placeholder = '题号或题目名称';
  input.value = keyword;
  queryLabel.append(input);
  fields.append(stateLabel, queryLabel);
  const menu = element('div','library-tools');
  const count = element('span','library-count','共计 ' + matching.length + ' 条结果');
  const clear = anchor('清除筛选','#library','library-clear');
  clear.addEventListener('click', () => { input.value = ''; select.value = ''; });
  const submit = element('button','library-search','搜索');
  submit.type = 'submit';
  menu.append(count, clear, submit);
  form.append(fields,menu);
  function applyFilters() {
    location.hash = url({q:input.value.trim(),state:select.value,page:''});
  }
  form.addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
  select.addEventListener('change',applyFilters);

  const sheet = element('section','library-sheet');
  const table = element('table','library-table');
  table.setAttribute('aria-label','练习题目');
  const header = table.createTHead().insertRow();
  const statusHead = element('th','library-status-col');
  statusHead.scope = 'col';
  statusHead.setAttribute('aria-label','状态');
  header.append(statusHead);
  for (const [key,title] of [['id','题号'],['title','题目名称']]) {
    const th = element('th');
    th.scope = 'col';
    const active = sort === key || sort === '-' + key;
    const descending = sort === '-' + key;
    if (active) th.setAttribute('aria-sort', descending ? 'descending' : 'ascending');
    const destination = sort === key ? '-' + key : key;
    const toggle = anchor(title,url({sort:destination === 'id' ? '' : destination,page:''}),'library-sort');
    toggle.setAttribute('aria-label', '按' + title + (destination.startsWith('-') ? '降序' : '升序') + '排列');
    const arrows = element('span','library-sort-mark');
    arrows.setAttribute('aria-hidden','true');
    toggle.append(arrows);
    th.append(toggle);
    header.append(th);
  }
  const body = table.createTBody();
  for (const problem of matching.slice((page-1)*pageSize,page*pageSize)) {
    const row = body.insertRow();
    const state = element('span','library-state',problem.solved ? '✓' : '—');
    state.classList.toggle('is-solved',Boolean(problem.solved));
    state.title = problem.solved ? '已通过' : '未通过';
    state.setAttribute('aria-label', state.title);
    row.insertCell().append(state);
    row.insertCell().append(anchor(problemLabel(problem.id),problemHref(problem.id),'library-number'));
    row.insertCell().append(anchor(problem.title,problemHref(problem.id),'library-name'));
  }
  sheet.append(table);
  if (!matching.length) {
    sheet.append(element('p','library-empty',model.problems.length ? '没有找到符合条件的题目。' : '题库里还没有题目。'));
  }
  if (matching.length) {
    const pager = element('nav','library-pager');
    pager.setAttribute('aria-label','题库分页');
    pager.append(element('span','','共 ' + pages + ' 页'));
    function addPage(value,text,description) {
      const link = anchor(text,url({page:value === 1 ? '' : String(value)}),'library-page-link');
      link.setAttribute('aria-label',description);
      if (value === page && text === String(page)) link.setAttribute('aria-current','page');
      pager.append(link);
    }
    if (page > 1) addPage(page-1,'‹','上一页');
    const numbers = [...new Set([1,page-2,page-1,page,page+1,page+2,pages])]
      .filter(value => value >= 1 && value <= pages).sort((a,b) => a-b);
    numbers.forEach((value,index) => {
      if (index && value - numbers[index-1] > 1) pager.append(element('span','library-page-gap','…'));
      addPage(value,String(value),'第 ' + value + ' 页');
    });
    if (page < pages) addPage(page+1,'›','下一页');
    sheet.append(pager);
  }
  root.replaceChildren(form,sheet);
}
