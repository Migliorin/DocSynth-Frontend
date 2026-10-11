import { readSse } from './sse.js';

(() => {
  const token = sessionStorage.getItem('docsynth-token') || localStorage.getItem('docsynth-token');
  const apiBase = new URLSearchParams(window.location.search).get('api') || 'http://localhost:3000';
  const requestedType = new URLSearchParams(window.location.search).get('type');
  const documentType = requestedType === 'RDA' || (requestedType !== 'PUR' && sessionStorage.getItem('docsynth-document-type') === 'RDA') ? 'RDA' : 'PUR';
  sessionStorage.setItem('docsynth-document-type', documentType);
  const defaults = documentType === 'RDA'
    ? ['Objetivos do RDA', 'Contexto e escopo', 'Principais definições', 'Dependências e riscos', 'Conclusões e recomendações']
    : ['Objetivos principais', 'Requisitos de negócio', 'Requisitos funcionais e não funcionais', 'Fronteira de escopo', 'Dependências críticas'];
  const modal = document.getElementById('pur-topics-modal');
  const topicInput = document.getElementById('topic-input');
  const tagsContainer = document.getElementById('tags-container');
  const draftTopics = [];
  const docs = [];
  const streamControllers = new Map();
  const progressMessages = new Map();
  const promptProgress = new Map();
  const streamedSummaries = new Map();
  const stoppingIds = new Set();
  const savedSummaryModal = document.getElementById('saved-summary-modal');
  let activeId = '';
  let loading = false;
  let selectedSummaryId = '';
  let savingSummary = false;
  let summaryRenderFrame = 0;

  for (const type of ['PUR', 'RDA']) {
    const tab = document.getElementById(`tab-${type.toLowerCase()}`);
    const url = new URL(window.location.href);
    url.searchParams.set('type', type);
    tab.href = `${url.pathname}${url.search}`;
    tab.className = `px-5 py-2 rounded-lg font-label-md text-label-md flex items-center gap-2 transition-all ${type === documentType
      ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm'
      : 'text-on-surface-variant font-medium hover:text-primary'}`;
    if (type === documentType) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (documentType === 'RDA') {
    document.title = 'DocSynth - Análise de RDA';
    document.getElementById('analysis-heading').textContent = 'Análise de RDA';
    document.getElementById('analysis-description').textContent = 'Envie PDFs de RDA, configure os tópicos e gere sínteses analíticas.';
    document.getElementById('upload-heading').textContent = 'Ingestão de RDA';
    document.getElementById('doc-id').placeholder = 'ex: RDA_Documento_v1.0';
    document.getElementById('doc-description-label').textContent = 'Descrição / Contexto do RDA';
    document.getElementById('doc-desc').placeholder = 'Contexto, objetivos e pontos relevantes do RDA...';
    document.getElementById('upload-submit-label').textContent = 'Enviar PDF RDA';
    document.getElementById('processing-queue').firstElementChild.textContent = 'Seus PDFs RDA aparecerão aqui.';
    document.getElementById('current-doc-select').firstElementChild.textContent = 'Nenhum documento RDA enviado';
    document.getElementById('summary-type-label').textContent = 'Síntese RDA';
    document.getElementById('summary-markdown').textContent = 'Envie um PDF RDA e gere uma síntese para exibi-la aqui.';
    document.getElementById('topics-modal-title').textContent = 'Tópicos da síntese RDA';
  }

  async function request(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      for (const storage of [sessionStorage, localStorage]) {
        storage.removeItem('docsynth-token');
        storage.removeItem('docsynth-user');
      }
      window.top.location.replace('/login');
    }
    if (!response.ok) {
      const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      throw new Error(message || `Falha na API (${response.status}).`);
    }
    return body;
  }

  function notify(message) {
    const toast = document.getElementById('toast-notify');
    const text = document.getElementById('toast-message');
    if (!toast || !text) return;
    text.textContent = message;
    toast.classList.remove('translate-y-3', 'opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100', 'translate-y-0');
    setTimeout(() => {
      toast.classList.add('translate-y-3', 'opacity-0', 'pointer-events-none');
      toast.classList.remove('opacity-100', 'translate-y-0');
    }, 2600);
  }

  function fileSize(bytes) {
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function status(item) {
    if (['EXTRACTED', 'COMPLETED'].includes(item.ocrStatus)) return 'Concluído';
    if (item.ocrStatus === 'FAILED') return 'Erro';
    if (item.ocrStatus === 'CANCELLING') return 'Parando';
    if (item.ocrStatus === 'CANCELLED') return 'Cancelado';
    return 'Em progresso';
  }

  function current() {
    return docs.find((item) => item.id === activeId);
  }

  function completedDocuments() {
    return docs.filter((item) => item.markdownKey && ['EXTRACTED', 'QUEUED', 'SUMMARIZING', 'CANCELLING', 'CANCELLED', 'COMPLETED', 'FAILED'].includes(item.ocrStatus));
  }

  function selectDocument(id) {
    activeId = id;
    selectedSummaryId = '';
    render();
  }

  function displayedSummary(item) {
    if (!item) return '';
    if (selectedSummaryId) {
      const selected = item.summaries?.find((summary) => summary.id === selectedSummaryId);
      if (selected) return selected.content;
    }
    if (streamedSummaries.has(item.id)) return streamedSummaries.get(item.id);
    return item.summaries?.[0]?.content || '';
  }

  function applyStreamEvent(item, event) {
    if ((item.ocrStatus === 'CANCELLING' || stoppingIds.has(item.id)) &&
        !['CANCELLED', 'COMPLETED', 'FAILED'].includes(event.status)) return;
    if (event.kind === 'status') {
      item.ocrStatus = event.status;
      if (event.status === 'SUMMARIZING') {
        streamedSummaries.set(item.id, '');
        progressMessages.delete(item.id);
        promptProgress.delete(item.id);
      }
      if (event.status === 'CANCELLED') {
        progressMessages.delete(item.id);
      }
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(event.status)) promptProgress.delete(item.id);
    }
    if (event.kind === 'progress') progressMessages.set(item.id, event.message);
    if (event.kind === 'prompt_progress' && Number.isInteger(event.percent) && event.percent >= 0 && event.percent <= 100) {
      promptProgress.set(item.id, event.percent);
    }
    if (event.kind === 'reasoning') {
      promptProgress.delete(item.id);
      progressMessages.set(item.id, 'Raciocinando…');
    }
    if (event.kind === 'summary_snapshot') {
      streamedSummaries.set(item.id, event.summary || '');
      if (event.summary) {
        progressMessages.delete(item.id);
        promptProgress.delete(item.id);
      }
    }
    if (event.kind === 'summary_delta') {
      if (item.ocrStatus === 'CANCELLED') return;
      streamedSummaries.set(item.id, (streamedSummaries.get(item.id) || '') + event.delta);
      progressMessages.delete(item.id);
      promptProgress.delete(item.id);
      if (!summaryRenderFrame) summaryRenderFrame = requestAnimationFrame(() => {
        summaryRenderFrame = 0;
        renderSummary();
      });
      return;
    }
    if (event.kind === 'error') {
      item.ocrStatus = 'FAILED';
      item.ocrError = event.message;
      promptProgress.delete(item.id);
    }
    render();
    if (['EXTRACTED', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(item.ocrStatus)) {
      setTimeout(refreshDocuments, 500);
    }
  }

  async function connectStream(item) {
    if (streamControllers.has(item.id)) return;
    const controller = new AbortController();
    streamControllers.set(item.id, controller);
    try {
      const response = await fetch(`${apiBase}/documents/${item.id}/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      if (response.status === 401) {
        for (const storage of [sessionStorage, localStorage]) {
          storage.removeItem('docsynth-token');
          storage.removeItem('docsynth-user');
        }
        window.top.location.replace('/login');
      }
      await readSse(response, (data) => applyStreamEvent(docs.find((doc) => doc.id === item.id) || item, JSON.parse(data)));
    } catch (error) {
      if (error.name !== 'AbortError') notify(error.message);
    } finally {
      streamControllers.delete(item.id);
      const latest = docs.find((doc) => doc.id === item.id);
      if (latest && ['QUEUED', 'EXTRACTING', 'SUMMARIZING', 'CANCELLING'].includes(latest.ocrStatus)) {
        setTimeout(() => connectStream(latest), 1500);
      }
    }
  }

  function renderQueue() {
    const queue = document.getElementById('processing-queue');
    queue.replaceChildren();
    document.getElementById('queue-count').textContent = `${docs.length} ${docs.length === 1 ? 'item' : 'itens'}`;
    if (!docs.length) {
      const empty = document.createElement('p');
      empty.className = 'font-body-sm text-body-sm text-on-surface-variant';
      empty.textContent = `Seus PDFs ${documentType} aparecerão aqui.`;
      queue.append(empty);
      return;
    }

    for (const item of docs) {
      const selected = item.id === activeId;
      const tone = ['EXTRACTED', 'COMPLETED'].includes(item.ocrStatus) ? ['border-l-emerald-500', 'bg-emerald-50', 'text-emerald-700', 'check_circle']
        : item.ocrStatus === 'FAILED' ? ['border-l-error', 'bg-error-container', 'text-error', 'error']
          : ['EXTRACTING', 'SUMMARIZING'].includes(item.ocrStatus) ? ['border-l-secondary', 'bg-blue-50', 'text-secondary', 'progress_activity']
            : item.ocrStatus === 'QUEUED' ? ['border-l-amber-500', 'bg-amber-50', 'text-amber-700', 'hourglass_empty']
              : ['border-l-surface-container-high', 'bg-surface-container-high', 'text-on-surface-variant', 'description'];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `w-full text-left p-3.5 bg-surface-container-low rounded-xl flex flex-col gap-2 border-l-4 ${tone[0]} ${selected ? 'ring-1 ring-primary/30' : ''}`;
      card.setAttribute('aria-pressed', String(selected));
      const top = document.createElement('div');
      top.className = 'flex items-start justify-between gap-3';
      const info = document.createElement('div');
      info.className = 'flex items-start gap-3 min-w-0';
      const iconBox = document.createElement('div');
      iconBox.className = `p-2 ${tone[1]} ${tone[2]} rounded-lg shrink-0`;
      const icon = document.createElement('span');
      icon.className = `material-symbols-outlined text-[18px] ${['EXTRACTING', 'SUMMARIZING'].includes(item.ocrStatus) ? 'animate-spin' : ''}`;
      icon.textContent = tone[3];
      iconBox.append(icon);
      const text = document.createElement('div');
      text.className = 'flex flex-col min-w-0';
      const title = document.createElement('span');
      title.className = 'font-body-md text-body-md font-medium text-primary truncate';
      title.textContent = item.title || item.originalName;
      const badge = document.createElement('span');
      badge.className = `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg ${tone[1]} ${tone[2]} font-label-sm text-label-sm font-semibold`;
      badge.textContent = status(item);
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 flex-wrap';
      row.append(title, badge);
      const description = document.createElement('p');
      description.className = 'font-body-sm text-body-sm text-on-surface-variant line-clamp-1 mt-0.5';
      description.textContent = item.description || item.originalName;
      text.append(row, description);
      info.append(iconBox, text);
      const size = document.createElement('span');
      size.className = 'font-code-sm text-code-sm text-on-surface-variant shrink-0';
      size.textContent = fileSize(item.size);
      top.append(info, size);
      card.append(top);
      card.addEventListener('click', () => selectDocument(item.id));
      queue.append(card);
    }
  }

  function renderSelector() {
    const select = document.getElementById('current-doc-select');
    const available = completedDocuments();
    select.replaceChildren();
    if (!available.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = `Nenhum PDF ${documentType} concluído`;
      select.append(option);
      activeId = '';
      return;
    }
    if (!available.some((item) => item.id === activeId)) activeId = available[0].id;
    for (const item of available) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.title || item.originalName}${item.description ? ` — ${item.description}` : ''}`;
      select.append(option);
    }
    select.value = activeId;
  }

  function renderHistory() {
    const grid = document.getElementById('saved-summaries-grid');
    const item = current();
    const saved = item?.summaries || [];
    const totalSaved = docs.reduce((count, doc) => count + (doc.summaries?.length || 0), 0);
    grid.replaceChildren();
    document.getElementById('saved-count-badge').textContent = `${saved.length} ${saved.length === 1 ? 'resumo salvo' : 'resumos salvos'}`;
    document.getElementById('history-count-label').textContent = saved.length ? `${saved.length} ${saved.length === 1 ? 'síntese salva' : 'sínteses salvas'} para este documento · ${totalSaved} no total` : 'Nenhuma síntese salva para este documento';
    if (!saved.length) {
      const empty = document.createElement('p');
      empty.className = 'font-body-sm text-body-sm text-on-surface-variant';
      empty.textContent = item ? 'Salve uma síntese para adicioná-la ao histórico deste documento.' : 'Selecione um documento para ver o histórico de sínteses.';
      grid.append(empty);
      return;
    }

    saved.forEach((summary, index) => {
      const card = document.createElement('article');
      card.className = 'p-5 bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container-high/40 flex flex-col justify-between gap-4';
      const content = document.createElement('div');
      content.className = 'flex flex-col gap-3';
      const meta = document.createElement('div');
      meta.className = 'flex items-center justify-between gap-2';
      const version = document.createElement('span');
      version.className = 'px-2 py-0.5 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm font-semibold';
      version.textContent = `Resumo #${saved.length - index}`;
      const created = document.createElement('time');
      created.className = 'font-code-sm text-code-sm text-on-surface-variant';
      created.dateTime = summary.createdAt;
      created.textContent = new Date(summary.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      meta.append(version, created);
      const heading = document.createElement('h3');
      heading.className = 'font-headline-sm text-headline-sm font-semibold text-primary';
      heading.textContent = item.title || item.originalName;
      const excerpt = document.createElement('p');
      excerpt.className = 'font-body-sm text-body-sm text-on-surface-variant line-clamp-3';
      excerpt.textContent = summary.content.slice(0, 240);
      content.append(meta, heading, excerpt);
      const topics = document.createElement('div');
      topics.className = 'flex flex-wrap gap-1.5';
      for (const topic of (summary.topics || []).slice(0, 3)) {
        const tag = document.createElement('span');
        tag.className = 'px-2 py-0.5 rounded-lg bg-surface-container-high text-on-surface font-label-sm text-label-sm';
        tag.textContent = topic;
        topics.append(tag);
      }
      if (summary.topics?.length) {
        const count = document.createElement('span');
        count.className = 'font-label-sm text-label-sm text-on-surface-variant self-center';
        count.textContent = `${summary.topics.length} tópicos`;
        topics.append(count);
      }
      content.append(topics);
      const actions = document.createElement('div');
      actions.className = 'flex items-center justify-between pt-3 bg-surface-container-low/50 -mx-5 -mb-5 px-5 py-3 rounded-b-xl border-t border-surface-container-high/40';
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'font-label-sm text-label-sm font-medium text-primary hover:text-secondary cursor-pointer flex items-center gap-1';
      view.textContent = 'Visualizar';
      view.addEventListener('click', () => openSavedSummary(item, summary));
      actions.append(view);
      card.append(content, actions);
      grid.append(card);
    });
  }

  function openSavedSummary(documentItem, summary) {
    document.getElementById('saved-summary-modal-title').textContent = documentItem.title || documentItem.originalName;
    document.getElementById('saved-summary-modal-date').textContent = `Resumo salvo em ${new Date(summary.createdAt).toLocaleString('pt-BR')}`;
    window.renderMarkdown(document.getElementById('saved-summary-modal-content'), summary.content);
    savedSummaryModal.classList.remove('hidden');
  }

  function closeSavedSummary() {
    savedSummaryModal.classList.add('hidden');
  }

  function renderSummary() {
    const item = current();
    const processing = item && ['QUEUED', 'EXTRACTING', 'SUMMARIZING', 'CANCELLING'].includes(item.ocrStatus);
    const content = displayedSummary(item);
    const inputPercent = item?.ocrStatus === 'SUMMARIZING' ? promptProgress.get(item.id) : undefined;
    const generated = Boolean(item && item.ocrStatus === 'COMPLETED' && content && streamedSummaries.has(item.id) && !selectedSummaryId);
    const title = document.getElementById('summary-title');
    const summary = document.getElementById('summary-markdown');
    title.textContent = item ? `Síntese Paramétrica: ${item.title || item.originalName}` : `Selecione um documento ${documentType}`;
    const placeholder = item?.ocrStatus === 'FAILED' ? item.ocrError
      : inputPercent !== undefined ? `Processando entrada: ${inputPercent}%`
        : progressMessages.get(item?.id) || (item ? status(item) : `Envie um PDF ${documentType} e gere uma síntese para exibi-la aqui.`);
    window.renderMarkdown(summary, content || placeholder, Boolean(content && ['SUMMARIZING', 'CANCELLING', 'CANCELLED'].includes(item?.ocrStatus)));
    const words = content?.trim().split(/\s+/).filter(Boolean).length;
    document.getElementById('summary-word-count').textContent = `Extensão estimada: ${words ? `${words} palavras` : '—'}`;
    document.getElementById('summary-updated-at').textContent = `Documento recebido: ${item?.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR') : '—'}`;
    document.getElementById('copy-summary-btn').disabled = !content;
    document.getElementById('configure-topics-btn').disabled = !item?.markdownKey || processing;
    document.getElementById('regen-btn').disabled = !item?.markdownKey || processing;
    document.getElementById('regen-preview-btn').disabled = !item?.markdownKey || processing;
    const saveButton = document.getElementById('save-summary-btn');
    const selectedSaved = Boolean(selectedSummaryId && item?.summaries?.some((saved) => saved.id === selectedSummaryId));
    saveButton.disabled = !generated || savingSummary || selectedSaved;
    document.getElementById('summary-saved-label').textContent = savingSummary ? 'Salvando…' : selectedSaved ? 'Síntese salva' : 'Salvar síntese';
    document.getElementById('save-summary-icon').textContent = selectedSaved ? 'bookmark_added' : 'save';
    const generationStatus = document.getElementById('generation-status');
    const generationLabel = document.getElementById('generation-status-label');
    const liveStatus = item?.ocrStatus === 'CANCELLING'
      ? 'Parando geração…'
      : item?.ocrStatus === 'SUMMARIZING' || (item?.ocrStatus === 'QUEUED' && item.markdownKey)
      ? inputPercent !== undefined ? `Processando entrada: ${inputPercent}%` : progressMessages.get(item.id) === 'Raciocinando…' ? 'Raciocinando…' : 'Gerando síntese…'
      : item?.ocrStatus === 'EXTRACTING' || (item?.ocrStatus === 'QUEUED' && !item.markdownKey)
        ? 'Extraindo PDF…'
        : '';
    generationStatus.className = liveStatus ? 'inline-flex items-center gap-1.5 font-label-sm text-label-sm text-secondary' : 'hidden';
    generationLabel.textContent = liveStatus;
    const stopButton = document.getElementById('stop-generation-btn');
    const canStop = item?.ocrStatus === 'SUMMARIZING' || (item?.ocrStatus === 'QUEUED' && item.markdownKey);
    stopButton.classList.toggle('hidden', !canStop && item?.ocrStatus !== 'CANCELLING');
    stopButton.classList.toggle('inline-flex', canStop || item?.ocrStatus === 'CANCELLING');
    stopButton.disabled = !canStop || stoppingIds.has(item?.id);
    document.getElementById('stop-generation-label').textContent = item?.ocrStatus === 'CANCELLING' || stoppingIds.has(item?.id) ? 'Parando…' : 'Parar geração';
  }

  function render() {
    renderSelector();
    document.getElementById('current-doc-select').value = activeId;
    renderQueue();
    renderSummary();
    renderHistory();
    document.getElementById('header-document-count').textContent = String(docs.length);
    document.getElementById('header-saved-count').textContent = String(docs.reduce((count, item) => count + (item.summaries?.length || 0), 0));
  }

  async function refreshDocuments() {
    if (loading || !token) return;
    loading = true;
    try {
      const rows = await request('/documents');
      docs.splice(0, docs.length, ...rows.filter((item) => item.type === documentType));
      docs.forEach((item) => {
        if (item.generatedSummary && !streamedSummaries.has(item.id))
          streamedSummaries.set(item.id, item.generatedSummary);
      });
      render();
      docs.filter((item) => ['QUEUED', 'EXTRACTING', 'SUMMARIZING', 'CANCELLING'].includes(item.ocrStatus)).forEach(connectStream);
    } catch (error) {
      notify(error.message);
    } finally {
      loading = false;
    }
  }

  function renderTopicTags() {
    tagsContainer.replaceChildren();
    if (!draftTopics.length) {
      const empty = document.createElement('p');
      empty.className = 'font-body-sm text-body-sm text-on-surface-variant';
      empty.textContent = 'Nenhum tópico selecionado.';
      tagsContainer.append(empty);
    }
    draftTopics.forEach((topic, index) => {
      const tag = document.createElement('span');
      tag.className = 'inline-flex max-w-full items-center gap-2 bg-surface-container-lowest border border-surface-container-high text-on-surface font-label-md text-label-md px-3 py-1.5 rounded-lg shadow-xs';
      const label = document.createElement('span');
      label.className = 'min-w-0 break-words';
      label.textContent = topic;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'text-on-surface-variant hover:text-error rounded';
      remove.setAttribute('aria-label', `Remover tópico ${topic}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        draftTopics.splice(index, 1);
        renderTopicTags();
      });
      tag.append(label, remove);
      tagsContainer.append(tag);
    });
  }

  function addTopic() {
    const topic = topicInput.value.trim();
    if (!topic) return false;
    if (!draftTopics.includes(topic)) {
      if (draftTopics.length >= 30) {
        notify('É possível incluir até 30 tópicos.');
        return false;
      }
      draftTopics.push(topic);
      renderTopicTags();
    }
    topicInput.value = '';
    topicInput.focus();
    return true;
  }

  function openTopics() {
    const item = current();
    if (!item) return notify(`Envie um PDF ${documentType} antes de configurar a síntese.`);
    draftTopics.splice(0, draftTopics.length, ...(item.topics?.length ? item.topics : defaults));
    topicInput.value = '';
    renderTopicTags();
    document.getElementById('additional-info-input').value = (item.questions || []).join('\n');
    modal.classList.remove('hidden');
    topicInput.focus();
  }

  function closeTopics() {
    modal.classList.add('hidden');
  }

  async function generate(item, config) {
    return request(`/documents/${item.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  }

  document.getElementById('current-doc-select').addEventListener('change', (event) => selectDocument(event.currentTarget.value));
  document.querySelectorAll('a[aria-disabled="true"]').forEach((tab) => {
    tab.tabIndex = -1;
    tab.addEventListener('click', (event) => event.preventDefault());
  });
  document.getElementById('upload-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = document.getElementById('file-selector').files[0];
    if (!file) return notify('Selecione um arquivo PDF.');
    if ((!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) || file.size > 20 * 1024 * 1024) {
      return notify('Selecione um PDF válido de até 20 MB.');
    }
    const data = new FormData();
    data.append('file', file);
    data.append('type', documentType);
    data.append('title', document.getElementById('doc-id').value.trim());
    data.append('description', document.getElementById('doc-desc').value.trim());
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const uploaded = await request('/documents', { method: 'POST', body: data });
      activeId = uploaded.id;
      form.reset();
      document.querySelector('#file-selector').parentElement.querySelector('p').textContent = 'Arraste seu PDF aqui ou procure no disco';
      notify('PDF enviado. A extração do Markdown começou.');
      await refreshDocuments();
    } catch (error) {
      notify(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('file-selector').addEventListener('change', (event) => {
    const file = event.currentTarget.files[0];
    if (file) event.currentTarget.parentElement.querySelector('p').textContent = file.name;
  });
  document.getElementById('configure-topics-btn').addEventListener('click', openTopics);
  document.getElementById('btn-add-topic').addEventListener('click', addTopic);
  topicInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTopic();
    }
  });
  document.getElementById('stop-generation-btn').addEventListener('click', async () => {
    const item = current();
    if (!item || stoppingIds.has(item.id)) return;
    stoppingIds.add(item.id);
    renderSummary();
    try {
      const result = await request(`/documents/${item.id}/cancel`, { method: 'POST' });
      const latest = docs.find((doc) => doc.id === item.id) || item;
      if (['QUEUED', 'SUMMARIZING'].includes(latest.ocrStatus)) latest.ocrStatus = result.status;
      render();
    } catch (error) {
      notify(error.message);
      await refreshDocuments();
    } finally {
      stoppingIds.delete(item.id);
      renderSummary();
    }
  });
  document.getElementById('regen-btn').addEventListener('click', openTopics);
  document.getElementById('regen-preview-btn').addEventListener('click', openTopics);
  document.getElementById('copy-summary-btn').addEventListener('click', async () => {
    const content = displayedSummary(current());
    if (!content) return;
    await navigator.clipboard.writeText(content);
    notify(`Resumo ${documentType} copiado.`);
  });

  document.getElementById('save-summary-btn').addEventListener('click', async () => {
    const item = current();
    if (!item || savingSummary) return;
    savingSummary = true;
    renderSummary();
    try {
      const saved = await request(`/documents/${item.id}/summaries`, { method: 'POST' });
      item.summaries = [saved, ...(item.summaries || [])];
      item.generatedSummary = null;
      streamedSummaries.delete(item.id);
      selectedSummaryId = saved.id;
      await refreshDocuments();
      notify('Síntese salva no histórico deste documento.');
    } catch (error) {
      notify(error.message);
    } finally {
      savingSummary = false;
      render();
    }
  });

  document.getElementById('close-pur-modal-btn').addEventListener('click', closeTopics);
  document.getElementById('cancel-pur-modal-btn').addEventListener('click', closeTopics);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeTopics(); });
  document.getElementById('close-saved-summary-modal').addEventListener('click', closeSavedSummary);
  savedSummaryModal.addEventListener('click', (event) => { if (event.target === savedSummaryModal) closeSavedSummary(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeTopics();
      closeSavedSummary();
    }
  });
  document.getElementById('save-pur-topics-btn').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const item = current();
    if (topicInput.value.trim() && !addTopic()) return;
    const topics = [...draftTopics];
    const additionalInfo = document.getElementById('additional-info-input').value.split('\n').map((value) => value.trim()).filter(Boolean);
    if (!item) return notify(`Selecione um documento ${documentType}.`);
    if (!topics.length) return notify('Informe ao menos um tópico.');
    button.disabled = true;
    try {
      await generate(item, { topics, questions: additionalInfo });
      streamedSummaries.set(item.id, '');
      selectedSummaryId = '';
      closeTopics();
      notify('Síntese enviada para geração.');
      await refreshDocuments();
    } catch (error) {
      notify(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('file-selector').parentElement.addEventListener('dragover', (event) => event.preventDefault());
  refreshDocuments();
})();
