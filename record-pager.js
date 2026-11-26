'use strict';

function renderRecordPager(nav, current, totalPages, params) {
  nav.setAttribute('aria-label', '评测记录分页');
  nav.hidden = totalPages === 0;
  if (!totalPages) {
    nav.replaceChildren();
    return;
  }

  const count = document.createElement('span');
  const total = document.createElement('strong');
  total.textContent = totalPages;
  count.className = 'record-page-count';
  count.append('共 ', total, ' 页');

  function control(target, label, direction, double = false) {
    const selected = !direction && target === current;
    const disabled = direction && target === current;
    const item = document.createElement(selected || disabled ? 'span' : 'a');
    item.className = 'record-page-control';
    item.setAttribute('aria-label', label);
    if (selected) {
      item.setAttribute('aria-current', 'page');
    } else if (disabled) {
      item.setAttribute('role', 'link');
      item.setAttribute('aria-disabled', 'true');
    } else {
      const query = new URLSearchParams(params);
      if (target === 1) query.delete('page');
      else query.set('page', target);
      item.href = '#records' + (query.size ? '?' + query : '');
    }

    if (direction) {
      item.title = label;
      item.dataset.direction = direction;
      const arrow = document.createElement('i');
      arrow.setAttribute('aria-hidden', 'true');
      item.append(arrow);
      if (double) item.append(arrow.cloneNode());
    } else {
      item.textContent = target;
    }
    return item;
  }

  const first = Math.max(1, Math.min(current - 4, totalPages - 9));
  const items = [count, control(1, '首页', 'left', true),
    control(Math.max(1, current - 1), '上一页', 'left')];
  for (let page = first; page <= Math.min(first + 9, totalPages); page++) {
    items.push(control(page, '第 ' + page + ' 页'));
  }
  items.push(control(Math.min(totalPages, current + 1), '下一页', 'right'),
    control(totalPages, '末页', 'right', true));
  nav.replaceChildren(...items);
}
