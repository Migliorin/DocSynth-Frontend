(() => {
  const inlinePattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;

  function appendInline(parent, text) {
    let position = 0;
    for (const match of text.matchAll(inlinePattern)) {
      parent.append(document.createTextNode(text.slice(position, match.index)));
      let node;
      if (match[2] !== undefined) {
        try {
          const url = new URL(match[3], window.location.href);
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            node = document.createElement('a');
            node.href = url.href;
            node.target = '_blank';
            node.rel = 'noopener noreferrer';
          }
        } catch { /* Invalid links stay visible as text. */ }
        if (node) node.textContent = match[2];
      } else if (match[4] !== undefined || match[5] !== undefined) {
        node = document.createElement('strong');
        node.textContent = match[4] ?? match[5];
      } else if (match[6] !== undefined) {
        node = document.createElement('del');
        node.textContent = match[6];
      } else if (match[7] !== undefined) {
        node = document.createElement('code');
        node.textContent = match[7];
      } else {
        node = document.createElement('em');
        node.textContent = match[8] ?? match[9];
      }
      if (node) parent.append(node);
      else parent.append(document.createTextNode(match[0]));
      position = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(position)));
  }

  function isBlockStart(line) {
    return /^(#{1,6})\s|^```|^\s*[-*+]\s+|^\s*\d+[.)]\s+|^>\s?|^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
  }

  function tableCells(line) {
    const cells = [];
    const text = line.trim();
    let cell = '';
    let codeTicks = 0;
    let trailingPipe = false;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === '\\' && text[i + 1] === '|') {
        cell += '|';
        i += 1;
        trailingPipe = false;
      } else if (text[i] === '`') {
        let ticks = 1;
        while (text[i + ticks] === '`') ticks += 1;
        codeTicks = codeTicks === ticks ? 0 : codeTicks || ticks;
        cell += text.slice(i, i + ticks);
        i += ticks - 1;
        trailingPipe = false;
      } else if (text[i] === '|' && !codeTicks) {
        cells.push(cell.trim());
        cell = '';
        trailingPipe = true;
      } else {
        cell += text[i];
        trailingPipe = false;
      }
    }
    cells.push(cell.trim());
    if (text.startsWith('|')) cells.shift();
    if (trailingPipe) cells.pop();
    return cells;
  }

  function isTableStart(lines, index) {
    if (!lines[index]?.includes('|') || !lines[index + 1]?.includes('|')) return false;
    const headers = tableCells(lines[index]);
    const separators = tableCells(lines[index + 1]);
    return headers.length > 0 && headers.length === separators.length &&
      separators.every((cell) => /^:?-+:?$/.test(cell));
  }

  function isPendingTableStart(lines, index) {
    if (index < lines.length - 2 || !lines[index]?.includes('|')) return false;
    const headers = tableCells(lines[index]);
    if (headers.length < 2 || !headers.some(Boolean)) return false;
    const next = lines[index + 1];
    if (next === undefined || next === '') return lines[index].trim().startsWith('|') || (lines[index].match(/\|/g) || []).length > 1;
    return index === lines.length - 2 && /^[\s|:-]*$/.test(next);
  }

  window.renderMarkdown = (container, markdown, streaming = false) => {
    container.replaceChildren();
    container.classList.add('markdown-output');
    const lines = String(markdown || '').replace(/\r/g, '').split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i += 1; continue; }

      const fence = line.match(/^\s*```/);
      if (fence) {
        i += 1;
        const code = [];
        while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
        if (i < lines.length) i += 1;
        const pre = document.createElement('pre');
        const codeNode = document.createElement('code');
        codeNode.textContent = code.join('\n');
        pre.append(codeNode);
        container.append(pre);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const node = document.createElement(`h${heading[1].length}`);
        appendInline(node, heading[2]);
        container.append(node);
        i += 1;
        continue;
      }

      if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        container.append(document.createElement('hr'));
        i += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quote = document.createElement('blockquote');
        const parts = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) parts.push(lines[i++].replace(/^>\s?/, ''));
        appendInline(quote, parts.join(' '));
        container.append(quote);
        continue;
      }

      const completeHeader = isTableStart(lines, i);
      if (completeHeader || (streaming && isPendingTableStart(lines, i))) {
        const headers = tableCells(line);
        const alignments = completeHeader
          ? tableCells(lines[i + 1]).map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left')
          : headers.map(() => 'left');
        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-table-wrap';
        wrapper.tabIndex = 0;
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Tabela da síntese');
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const heading = document.createElement('tr');
        headers.forEach((value, column) => {
          const th = document.createElement('th');
          th.scope = 'col';
          th.style.textAlign = alignments[column];
          appendInline(th, value);
          heading.append(th);
        });
        thead.append(heading);
        const tbody = document.createElement('tbody');
        i += lines[i + 1] === undefined ? 1 : 2;
        while (i < lines.length && lines[i].trim() && lines[i].includes('|') && !isBlockStart(lines[i])) {
          const row = document.createElement('tr');
          const values = tableCells(lines[i]);
          headers.forEach((_, column) => {
            const td = document.createElement('td');
            td.style.textAlign = alignments[column];
            appendInline(td, values[column] || '');
            row.append(td);
          });
          tbody.append(row);
          i += 1;
        }
        table.append(thead, tbody);
        wrapper.append(table);
        container.append(wrapper);
        continue;
      }

      const listMatch = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+/);
      if (listMatch) {
        const list = document.createElement(listMatch[2] ? 'ol' : 'ul');
        while (i < lines.length) {
          const item = lines[i].match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
          if (!item || Boolean(item[2]) !== Boolean(listMatch[2])) break;
          const li = document.createElement('li');
          appendInline(li, item[3]);
          list.append(li);
          i += 1;
        }
        container.append(list);
        continue;
      }

      const paragraph = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i]) && !isTableStart(lines, i) && !(streaming && isPendingTableStart(lines, i))) paragraph.push(lines[i++]);
      if (!paragraph.length) paragraph.push(lines[i++]);
      const p = document.createElement('p');
      paragraph.forEach((part, index) => {
        if (index) p.append(document.createElement('br'));
        appendInline(p, part);
      });
      container.append(p);
    }
  };
})();
