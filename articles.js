(() => {
  'use strict';

  const assets = new URL('.', document.currentScript.src);
  const shanghaiTime = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  let dispose = () => {};

  async function load(slug) {
    const catalogResponse = await fetch(new URL('articles.json', assets), { cache: 'no-cache' });
    if (!catalogResponse.ok) throw new Error('文章目录读取失败，请刷新重试。');
    const articles = await catalogResponse.json();
    if (!slug) return articles;
    const article = articles.find(item => item.id === slug);
    if (!article) throw new Error('找不到这篇文章。');
    const response = await fetch(new URL(article.markdownFile, assets), { cache: 'no-cache' });
    if (!response.ok) throw new Error('文章正文读取失败，请刷新重试。');
    article.markdown = await response.text();
    return articles;
  }

  function element(tag, className, label) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label != null) node.textContent = label;
    return node;
  }

  function metadata(article) {
    const list = element('dl', 'oj-article-meta');
    const author = element('div', 'oj-article-byline');
    const avatar = element('img', 'oj-article-avatar');
    avatar.src = new URL('avatar.jpg', assets);
    avatar.alt = '';
    avatar.width = avatar.height = 36;
    const name = element('dd', '', article.author);
    name.prepend(avatar);
    author.append(element('dt', '', '作者'), name);
    const published = element('div');
    const time = element('time', '', shanghaiTime.format(new Date(article.publishedAt)));
    time.dateTime = article.publishedAt.replace(' ', 'T');
    const date = element('dd');
    date.append(time);
    published.append(element('dt', '', '发布时间'), date);
    const category = element('div');
    category.append(element('dt', '', '分类'), element('dd', '', article.category));
    list.append(author, published, category);
    return list;
  }

  function banner(title, details) {
    const header = element('header', 'oj-article-banner');
    const inner = element('div', 'oj-article-inner');
    const heading = element('h1', 'oj-article-title', title);
    inner.append(heading);
    if (details) inner.append(details);
    header.append(inner);
    return header;
  }

  function renderPlaza(container, articles) {
    const header = banner('文章广场');
    const list = element('ul', 'oj-article-inner oj-article-list');
    for (const article of articles) {
      const item = element('li');
      const title = element('h2');
      const link = element('a', '', article.title);
      link.href = '#articles/' + encodeURIComponent(article.id);
      title.append(link);
      item.append(title);
      if (article.summary) item.append(element('p', 'oj-article-summary', article.summary));
      item.append(metadata(article));
      list.append(item);
    }
    container.replaceChildren(header, list);
  }

  function headingLabel(heading) {
    const copy = heading.cloneNode(true);
    for (const math of copy.querySelectorAll('.katex')) {
      math.replaceWith(math.querySelector('annotation')?.textContent || math.querySelector('.katex-html')?.textContent || '');
    }
    return copy.textContent.trim();
  }

  function attachContents(sidebar, headings) {
    const details = element('details', 'oj-article-toc');
    const nav = element('nav');
    nav.setAttribute('aria-label', '文章目录');
    const buttons = headings.map((heading, index) => {
      heading.id = 'oj-article-heading-' + index;
      const label = headingLabel(heading);
      const button = element('button', 'oj-article-toc-item');
      button.type = 'button';
      button.title = label;
      button.setAttribute('aria-controls', heading.id);
      button.dataset.level = heading.tagName.slice(1);
      button.append(element('span', '', label));
      nav.append(button);
      return button;
    });
    details.append(element('summary', '', '目录'), nav);
    sidebar.append(details);

    const mobile = matchMedia('(max-width: 760px)');
    function syncLayout() {
      details.open = !mobile.matches;
    }
    syncLayout();
    mobile.addEventListener('change', syncLayout);

    let active = -1;
    let frame = 0;
    let jumpPosition = null;
    function mark(index) {
      if (index === active) return;
      if (active >= 0) buttons[active].removeAttribute('aria-current');
      active = index;
      buttons[active].setAttribute('aria-current', 'location');
      if (!mobile.matches && nav.scrollHeight > nav.clientHeight) {
        const item = buttons[active].getBoundingClientRect();
        const box = nav.getBoundingClientRect();
        if (item.top < box.top) nav.scrollTop += item.top - box.top;
        else if (item.bottom > box.bottom) nav.scrollTop += item.bottom - box.bottom;
      }
    }
    function syncPosition() {
      frame = 0;
      if (jumpPosition !== null && Math.abs(window.scrollY - jumpPosition) < 1) return;
      jumpPosition = null;
      const stickyTop = parseFloat(getComputedStyle(headings[0]).scrollMarginTop) + 2;
      let index = 0;
      for (let i = 1; i < headings.length; i++) {
        if (headings[i].getBoundingClientRect().top > stickyTop) break;
        index = i;
      }
      if (window.scrollY > 0 && Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight) {
        index = headings.length - 1;
      }
      mark(index);
    }
    function scheduleSync() {
      if (!frame) frame = requestAnimationFrame(syncPosition);
    }
    buttons.forEach((button, index) => button.addEventListener('click', () => {
      if (mobile.matches) details.open = false;
      headings[index].focus({ preventScroll: true });
      headings[index].scrollIntoView({ block: 'start' });
      mark(index);
      jumpPosition = window.scrollY;
    }));
    headings.forEach(heading => { heading.tabIndex = -1; });
    window.addEventListener('scroll', scheduleSync, { passive: true });
    window.addEventListener('resize', scheduleSync);
    scheduleSync();
    return () => {
      window.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      mobile.removeEventListener('change', syncLayout);
      cancelAnimationFrame(frame);
    };
  }

  function renderArticle(container, article) {
    const header = banner(article.title, metadata(article));
    const layout = element('div', 'oj-article-inner oj-article-layout');
    const body = element('article', 'prose oj-article-prose');
    window.OJTypeset.render(body, article.markdown);
    const sidebar = element('aside', 'oj-article-sidebar');
    layout.append(sidebar, body);
    container.replaceChildren(header, layout);
    const headings = [header.querySelector('h1'), ...body.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    dispose = attachContents(sidebar, headings);
  }

  function render(container, articles, slug) {
    dispose();
    dispose = () => {};
    container.classList.add('oj-articles-view');
    if (slug) {
      const article = articles.find(item => item.id === slug);
      if (!article) throw new Error('找不到这篇文章。');
      renderArticle(container, article);
      return article.title;
    }
    renderPlaza(container, articles);
    return '文章广场';
  }

  window.OJArticles = Object.freeze({ load, render, dispose: () => dispose() });
})();
