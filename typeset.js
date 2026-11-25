'use strict';

(() => {
    const escapeHTML = value => value.replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);

    const delimiters = [
        {open: '$$', close: '$$', display: true},
        {open: '\\[', close: '\\]', display: true},
        {open: '\\(', close: '\\)', display: false},
        {open: '$', close: '$', display: false}
    ];

    function mathToken(source, block) {
        const input = block ? source.replace(/^ {0,3}/, '') : source;
        const delimiter = delimiters.find(d => input.startsWith(d.open));
        if (!delimiter || (block && !delimiter.display)) return;
        const {open, close, display} = delimiter;
        let pos = open.length;
        for (;;) {
            pos = input.indexOf(close, pos);
            if (pos === -1) return;
            let left = pos;
            while (left > 0 && input[left - 1] === '\\') left--;
            if ((pos - left) % 2 === 0) break;
            pos += close.length;
        }
        const tex = input.slice(open.length, pos);
        if (!tex.trim() || (!display && tex.includes('\n'))) return;
        const end = source.length - input.length + pos + close.length;
        const tail = block ? source.slice(end).match(/^[ \t]*(?:\n|$)/) : null;
        if (block && !tail) return;
        return {type: block ? 'displayMath' : 'inlineMath', raw: source.slice(0, end + (tail?.[0].length || 0)), tex, display};
    }

    function render(container, markdown) {
        const formulas = [];
        function slot(token) {
            const index = formulas.push(token) - 1;
            return '<span data-oj-math="' + index + '"></span>';
        }
        const parser = new marked.Marked({
            gfm: true,
            extensions: [
                {
                    name: 'displayMath', level: 'block',
                    start(source) { return source.match(/(?:^|\n) {0,3}(?:\$\$|\\\[)/)?.index; },
                    tokenizer(source) { return mathToken(source, true); },
                    renderer: slot,
                },
                {
                    name: 'inlineMath', level: 'inline',
                    start(source) { return source.match(/\$|\\[(\[]/)?.index; },
                    tokenizer(source) { return mathToken(source, false); },
                    renderer: slot,
                }
            ],
            renderer: {
                html(token) { return escapeHTML(token.text); },
                image(token) { return escapeHTML(token.text || ''); }
            }
        });

        // Sanitize authored markup before rendering formulas into the surviving slots.
        const fragment = DOMPurify.sanitize(parser.parse(String(markdown ?? '')), {
            RETURN_DOM_FRAGMENT: true,
            ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','hr','em','strong','del',
                'a','ul','ol','li','blockquote','pre','code','table','thead','tbody','tr','th','td','span'],
            ALLOWED_ATTR: ['href','title','start','align','data-oj-math'],
            ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false
        });
        for (const link of fragment.querySelectorAll('a[href]')) {
            try {
                const url = new URL(link.getAttribute('href'), location.href);
                if (!['https:', 'http:'].includes(url.protocol)) link.removeAttribute('href');
                else if (url.origin !== location.origin) {
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                }
            } catch { link.removeAttribute('href'); }
        }
        for (const node of fragment.querySelectorAll('[data-oj-math]')) {
            const token = formulas[Number(node.dataset.ojMath)];
            node.removeAttribute('data-oj-math');
            if (!token) continue;
            katex.render(token.tex, node, {
                displayMode: token.display, throwOnError: false, trust: false,
                maxSize: 30, maxExpand: 1000, strict: 'ignore'
            });
        }
        container.classList.add('markdown-body');
        container.replaceChildren(fragment);
    }

    window.OJTypeset = Object.freeze({render});
})();
