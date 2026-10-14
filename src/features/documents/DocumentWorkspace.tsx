import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { authenticatedFetch } from '../auth/session.ts'
import { readSse } from '../../shared/lib/sse.ts'
import { renderMarkdown } from './markdown.ts'
import { documentPageSize, documentPageUrl } from './document-page-url.ts'
import { historyPageSize, summaryPageUrl } from './summary-page-url.ts'
import { statusExamples } from './status-examples.ts'
import type { DocumentDetailsDto, DocumentDto, DocumentEvent, DocumentPage, DocumentType, GenerationConfig, OcrStatus, SummaryDto, SummaryPage } from './types.ts'
import './workspace.css'
import './markdown.css'

const defaults: Record<DocumentType, string[]> = {
  PUR: ['Objetivos principais', 'Requisitos de negócio', 'Requisitos funcionais e não funcionais', 'Fronteira de escopo', 'Dependências críticas'],
  RDA: ['Objetivos do RDA', 'Contexto e escopo', 'Principais definições', 'Dependências e riscos', 'Conclusões e recomendações'],
}
const running = ['QUEUED', 'EXTRACTING', 'SUMMARIZING', 'CANCELLING']
const finished = ['EXTRACTED', 'COMPLETED', 'FAILED', 'CANCELLED']
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(path, options)
  const body = await response.json().catch(() => ({})) as T & { message?: string | string[] }
  if (!response.ok) {
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    throw new Error(message || `Falha na API (${response.status}).`)
  }
  return body
}

function Markdown({ content, streaming = false }: { content: string; streaming?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) renderMarkdown(ref.current, content, streaming) }, [content, streaming])
  return <div ref={ref} className="summary-scroll w-full min-w-0 min-h-40 font-body-md text-body-md text-on-surface leading-relaxed" />
}

function statusLabel(status: OcrStatus) {
  const labels: Record<OcrStatus, string> = {
    QUEUED: 'Na fila',
    EXTRACTING: 'Extraindo',
    EXTRACTED: 'Extraído',
    SUMMARIZING: 'Gerando síntese',
    CANCELLING: 'Cancelando',
    CANCELLED: 'Cancelado',
    COMPLETED: 'Concluído',
    FAILED: 'Erro',
  }
  return labels[status]
}

function statusStyle(status: OcrStatus) {
  if (status === 'COMPLETED' || status === 'EXTRACTED') return { border: 'border-l-emerald-500', badge: 'bg-emerald-50 text-emerald-700', icon: 'check_circle' }
  if (status === 'FAILED') return { border: 'border-l-red-500', badge: 'bg-red-50 text-red-700', icon: 'error' }
  if (status === 'CANCELLED') return { border: 'border-l-slate-400', badge: 'bg-slate-100 text-slate-600', icon: 'cancel' }
  if (status === 'QUEUED') return { border: 'border-l-amber-500', badge: 'bg-amber-50 text-amber-700', icon: 'schedule' }
  return { border: 'border-l-blue-500', badge: 'bg-blue-50 text-blue-700', icon: 'progress_activity' }
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentWorkspace() {
  const [params] = useSearchParams()
  const type: DocumentType = params.get('type') === 'RDA' ? 'RDA' : 'PUR'
  const [docs, setDocs] = useState<DocumentDto[]>([])
  const [showExamples, setShowExamples] = useState(false)
  const [examplePage, setExamplePage] = useState(1)
  const [documentPage, setDocumentPage] = useState<DocumentPage | null>(null)
  const [documentPageNumber, setDocumentPageNumber] = useState(1)
  const [documentsRevision, setDocumentsRevision] = useState(0)
  const [loadingDocuments, setLoadingDocuments] = useState(true)
  const documentCursors = useRef<(string | null)[]>([null])
  const documentNavigation = useRef<AbortController | null>(null)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<DocumentDto[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeId, setActiveId] = useState('')
  const [detail, setDetail] = useState<DocumentDetailsDto | null>(null)
  const [detailRevision, setDetailRevision] = useState(0)
  const [preview, setPreview] = useState('')
  const [progress, setProgress] = useState('')
  const [promptPercent, setPromptPercent] = useState<number | null>(null)
  const [history, setHistory] = useState<SummaryPage | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyRevision, setHistoryRevision] = useState(0)
  const historyCursors = useRef<(string | null)[]>([null])
  const historyNavigation = useRef<AbortController | null>(null)
  const cancelling = useRef(false)
  const [selectedSummary, setSelectedSummary] = useState<SummaryDto | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const summaryArea = useRef<HTMLDivElement>(null)
  const [topicsOpen, setTopicsOpen] = useState(false)
  const [topics, setTopics] = useState<string[]>([])
  const [topicInput, setTopicInput] = useState('')
  const [questions, setQuestions] = useState('')
  const [savedModal, setSavedModal] = useState<SummaryDto | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [toast, setToast] = useState('')

  const active = detail?.id === activeId ? detail : docs.find((item) => item.id === activeId) || searchResults.find((item) => item.id === activeId)
  const processing = Boolean(active && running.includes(active.ocrStatus))
  const canGenerate = Boolean(active?.markdownKey && !processing)
  const canStop = Boolean(active && (active.ocrStatus === 'SUMMARIZING' || (active.ocrStatus === 'QUEUED' && active.markdownKey)))
  const content = selectedSummary?.content || (processing || preview ? preview : historyPage === 1 ? history?.items[0]?.content : '') || ''
  const placeholder = active?.ocrStatus === 'FAILED' ? active.ocrError || 'Falha no processamento.' : promptPercent !== null ? `Processando entrada: ${promptPercent}%` : progress || (active?.ocrStatus === 'EXTRACTED' ? 'Extração concluída. Configure os tópicos para gerar a síntese.' : active ? statusLabel(active.ocrStatus) : `Envie um PDF ${type} e gere uma síntese para exibi-la aqui.`)
  const notice = useCallback((error: unknown) => setToast(error instanceof Error ? error.message : 'Falha na operação.'), [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    document.title = `DocSynth - Análise de ${type}`
    return () => { document.title = 'DocSynth' }
  }, [type])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setTopicsOpen(false); setSavedModal(null); setSearchOpen(false) }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [])

  useEffect(() => {
    documentNavigation.current?.abort()
    documentNavigation.current = null
    documentCursors.current = [null]
    const controller = new AbortController()
    request<DocumentPage>(documentPageUrl(type), { signal: controller.signal })
      .then((page) => {
        setDocs(page.items)
        setDocumentPage(page)
        setDocumentPageNumber(1)
        documentCursors.current[1] = page.nextCursor
        setActiveId((id) => id || page.items[0]?.id || '')
      }).catch((error: unknown) => { if (!controller.signal.aborted) notice(error) })
      .finally(() => { if (!controller.signal.aborted) setLoadingDocuments(false) })
    return () => controller.abort()
  }, [type, documentsRevision, notice])

  useEffect(() => {
    if (!searchText.trim() || searchText.length > 120) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      request<DocumentPage>(`/documents?${new URLSearchParams({ type, limit: '25', search: searchText.trim() })}`, { signal: controller.signal })
        .then((page) => setSearchResults(page.items))
        .catch((error: unknown) => { if (!controller.signal.aborted) notice(error) })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [searchText, type, notice])

  useEffect(() => {
    if (!activeId) return
    const controller = new AbortController()
    request<DocumentDetailsDto>(`/documents/${activeId}`, { signal: controller.signal })
      .then((item) => {
        setDetail(item)
        if (item.generatedSummary) setPreview(item.generatedSummary)
      }).catch((error: unknown) => { if (!controller.signal.aborted) notice(error) })
    return () => controller.abort()
  }, [activeId, detailRevision, notice])

  useEffect(() => {
    if (!activeId) return
    const controller = new AbortController()
    request<SummaryPage>(summaryPageUrl(activeId, null), { signal: controller.signal })
      .then((page) => {
        setHistory(page)
        historyCursors.current = [null, page.nextCursor]
      }).catch((error: unknown) => { if (!controller.signal.aborted) notice(error) })
    return () => controller.abort()
  }, [activeId, historyRevision, notice])

  useEffect(() => () => historyNavigation.current?.abort(), [])
  useEffect(() => () => documentNavigation.current?.abort(), [])

  const refresh = useCallback(() => {
    setLoadingDocuments(true)
    setDocumentsRevision((value) => value + 1)
    setDetailRevision((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!activeId || !processing) return
    const controller = new AbortController()
    let terminal = false
    async function connect() {
      while (!controller.signal.aborted && !terminal) {
        try {
          const response = await authenticatedFetch(`/documents/${activeId}/events`, { headers: { Accept: 'text/event-stream' }, signal: controller.signal })
          await readSse(response, (data) => {
            const event = JSON.parse(data) as DocumentEvent
            if (cancelling.current && !finished.includes(event.status ?? '')) return
            if (event.kind === 'status') {
              setDetail((item) => item?.id === activeId ? { ...item, ocrStatus: event.status } : item)
              setDocs((items) => items.map((item) => item.id === activeId ? { ...item, ocrStatus: event.status } : item))
              if (event.status === 'SUMMARIZING') { setPreview(''); setProgress('') }
              if (finished.includes(event.status)) { terminal = true; cancelling.current = false; setPromptPercent(null) }
            }
            if (event.kind === 'progress') setProgress(event.message)
            if (event.kind === 'prompt_progress') setPromptPercent(event.percent)
            if (event.kind === 'reasoning') { setProgress('Raciocinando…'); setPromptPercent(null) }
            if (event.kind === 'summary_snapshot') { setPreview(event.summary); setPromptPercent(null) }
            if (event.kind === 'summary_delta') { setPreview((text) => text + event.delta); setPromptPercent(null) }
            if (event.kind === 'error') {
              setDetail((item) => item?.id === activeId ? { ...item, ocrStatus: 'FAILED', ocrError: event.message } : item)
              terminal = true
            }
          })
          if (terminal) { refresh(); break }
        } catch (error) {
          if (!controller.signal.aborted) notice(error)
        }
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 1500)
          controller.signal.addEventListener('abort', () => { window.clearTimeout(timer); resolve() }, { once: true })
        })
      }
    }
    void connect()
    return () => controller.abort()
  }, [activeId, processing, active?.jobId, refresh, notice])

  function selectDocument(item: DocumentDto) {
    cancelling.current = false
    historyNavigation.current?.abort()
    setActiveId(item.id)
    setDetail(null)
    setPreview('')
    setProgress('')
    setPromptPercent(null)
    setSelectedSummary(null)
    setHistory(null)
    setHistoryPage(1)
    historyCursors.current = [null]
    setHistoryLoading(false)
    setSearchText('')
    setSearchOpen(false)
  }

  async function openDocumentPage(pageNumber: number) {
    const cursor = documentCursors.current[pageNumber - 1]
    if (cursor === undefined || loadingDocuments || (pageNumber > documentPageNumber && !documentPage?.nextCursor)) return
    const controller = new AbortController()
    documentNavigation.current = controller
    setLoadingDocuments(true)
    try {
      const page = await request<DocumentPage>(documentPageUrl(type, cursor), { signal: controller.signal })
      setDocs(page.items)
      setDocumentPage(page)
      setDocumentPageNumber(pageNumber)
      documentCursors.current[pageNumber] = page.nextCursor
    } catch (error) {
      if (!controller.signal.aborted) notice(error)
    } finally {
      if (documentNavigation.current === controller) {
        documentNavigation.current = null
        setLoadingDocuments(false)
      }
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) || file.size > 20 * 1024 * 1024) {
      setToast('Selecione um PDF válido de até 20 MB.')
      return
    }
    const body = new FormData()
    body.append('file', file)
    body.append('type', type)
    body.append('title', title.trim())
    body.append('description', description.trim())
    setBusy(true)
    try {
      const item = await request<DocumentDto>('/documents', { method: 'POST', body })
      historyNavigation.current?.abort()
      setHistoryLoading(false)
      setFile(null); setTitle(''); setDescription('')
      if (fileInput.current) fileInput.current.value = ''
      setActiveId(item.id)
      setDetail(null); setPreview(''); setHistory(null); setHistoryPage(1); historyCursors.current = [null]
      setLoadingDocuments(true)
      setDocumentsRevision((value) => value + 1)
      setToast('PDF enviado. A extração do Markdown começou.')
    } catch (error) { notice(error) } finally { setBusy(false) }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) { setFile(event.target.files?.[0] || null) }
  function onFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setFile(event.dataTransfer.files[0] || null)
  }

  function openTopics() {
    if (!active || !canGenerate) return
    setTopics(active.topics.length ? active.topics : defaults[type])
    setQuestions(active.questions.join('\n'))
    setTopicInput('')
    setTopicsOpen(true)
  }

  function addTopic() {
    const value = topicInput.trim()
    if (!value) return
    if (topics.length >= 30) { setToast('É possível incluir até 30 tópicos.'); return }
    if (!topics.includes(value)) setTopics((items) => [...items, value])
    setTopicInput('')
  }

  async function generate() {
    if (!active) return
    const selectedTopics = topicInput.trim() && !topics.includes(topicInput.trim()) ? [...topics, topicInput.trim()] : topics
    const additional = questions.split('\n').map((item) => item.trim()).filter(Boolean)
    if (!selectedTopics.length || selectedTopics.length > 30 || additional.length > 20) {
      setToast('Informe de 1 a 30 tópicos e até 20 informações adicionais.')
      return
    }
    const config: GenerationConfig = { topics: selectedTopics, questions: additional }
    setBusy(true)
    try {
      const item = await request<DocumentDto>(`/documents/${active.id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
      cancelling.current = false
      setDetail({ ...item, generatedSummary: null })
      setDocs((items) => items.map((doc) => doc.id === item.id ? item : doc))
      setPreview(''); setSelectedSummary(null); setProgress(''); setPromptPercent(null)
      setTopicsOpen(false)
      setToast('Síntese enviada para geração.')
    } catch (error) { notice(error) } finally { setBusy(false) }
  }

  async function stop() {
    if (!active || stopping) return
    setStopping(true)
    cancelling.current = true
    try {
      const result = await request<{ status: OcrStatus }>(`/documents/${active.id}/cancel`, { method: 'POST' })
      if (result.status === 'CANCELLED') cancelling.current = false
      setDetail((item) => item?.id === active.id ? { ...item, ocrStatus: result.status } : item)
      setDocs((items) => items.map((item) => item.id === active.id ? { ...item, ocrStatus: result.status } : item))
    } catch (error) { cancelling.current = false; notice(error); refresh() } finally { setStopping(false) }
  }

  async function save() {
    if (!active || saving || !preview || active.ocrStatus !== 'COMPLETED') return
    setSaving(true)
    try {
      const summary = await request<SummaryDto>(`/documents/${active.id}/summaries`, { method: 'POST' })
      historyNavigation.current?.abort()
      setHistoryLoading(false)
      setPreview(''); setSelectedSummary(summary)
      historyCursors.current = [null]
      setHistoryPage(1)
      setHistoryRevision((value) => value + 1)
      setToast('Síntese salva no histórico deste documento.')
    } catch (error) { notice(error) } finally { setSaving(false) }
  }

  async function openHistoryPage(pageNumber: number) {
    const cursor = historyCursors.current[pageNumber - 1]
    if (!activeId || cursor === undefined || historyLoading) return
    const controller = new AbortController()
    historyNavigation.current = controller
    setHistoryLoading(true)
    try {
      const page = await request<SummaryPage>(summaryPageUrl(activeId, cursor), { signal: controller.signal })
      setHistory(page)
      setHistoryPage(pageNumber)
      historyCursors.current[pageNumber] = page.nextCursor
    } catch (error) {
      if (!controller.signal.aborted) notice(error)
    } finally {
      if (historyNavigation.current === controller) {
        historyNavigation.current = null
        setHistoryLoading(false)
      }
    }
  }

  const currentPage = history?.items || []
  const pageCount = Math.max(1, Math.ceil((history?.total || 0) / historyPageSize))
  const start = (historyPage - 1) * historyPageSize
  const words = content.trim() ? content.trim().split(/\s+/).length : 0

  const statusPage = showExamples ? examplePage : documentPageNumber
  const statusTotal = showExamples ? statusExamples.length : documentPage?.total || 0
  const statusPageCount = Math.max(1, Math.ceil(statusTotal / documentPageSize))
  const visibleStatusItems = showExamples ? statusExamples.slice((examplePage - 1) * documentPageSize, examplePage * documentPageSize) : docs

  return <div className="bg-background font-body-md text-on-surface antialiased">
    <main className="max-w-7xl mx-auto px-6 lg:px-12 py-8 flex flex-col gap-8">
      <div className="flex items-center border-b border-surface-container-high/70 pb-3 overflow-x-auto">
        <nav className="inline-flex shrink-0 p-1 bg-surface-container-low rounded-xl border border-surface-container-high/60 gap-1" aria-label="Tipo de documento">
          {(['PUR', 'RDA'] as const).map((item) => <Link key={item} to={`/workspace?type=${item}`} aria-current={type === item ? 'page' : undefined} className={`px-5 py-2 rounded-lg font-label-md text-label-md flex items-center gap-2 transition-colors ${type === item ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}><span className="material-symbols-outlined text-[17px]">{item === 'PUR' ? 'description' : 'sync_alt'}</span>{item}</Link>)}
          <span aria-disabled="true" className="px-5 py-2 rounded-lg text-on-surface-variant/50 font-label-md text-label-md flex items-center gap-2 cursor-not-allowed"><span className="material-symbols-outlined text-[17px]">fact_check</span>Relatório</span>
        </nav>
      </div>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2 max-w-3xl"><h1 className="font-display-lg text-display-lg text-primary tracking-tight">Análise de {type}{type === 'PUR' ? ' — Proposta de Escopo' : ''}</h1><p className="font-body-md text-body-md text-on-surface-variant">Envie PDFs de {type}, acompanhe o processamento e gere sínteses analíticas.</p></div>
        <div className="flex items-center flex-wrap gap-3 bg-surface-container-lowest p-3 rounded-xl shadow-sm self-start md:self-auto max-w-full border border-surface-container-high/40">
          <div className="flex items-center gap-2.5 px-2"><span className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary"><span className="material-symbols-outlined text-[18px]">picture_as_pdf</span></span><span className="flex flex-col"><strong className="font-headline-sm text-headline-sm text-primary leading-tight">{documentPage?.total || 0}</strong><span className="font-label-sm text-label-sm text-on-surface-variant">Documentos</span></span></div>
          <span className="hidden sm:block w-px h-7 bg-surface-container-high" />
          <div className="flex items-center gap-2.5 px-2"><span className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary"><span className="material-symbols-outlined text-[18px]">bookmark_added</span></span><span className="flex flex-col"><strong className="font-headline-sm text-headline-sm text-primary leading-tight">{history?.total || 0}</strong><span className="font-label-sm text-label-sm text-on-surface-variant">Sínteses salvas</span></span></div>
        </div>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" aria-label="Documentos">
        <form onSubmit={upload} className="lg:col-span-5 bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-surface-container-high/40 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[20px]">upload_file</span><h2 className="font-headline-sm text-headline-sm text-primary">Enviar PDF {type}</h2></div><span className="font-label-sm text-label-sm text-on-surface-variant">Até 20 MB</span></div>
          <label className="flex flex-col gap-1.5 font-label-sm text-label-sm font-medium">Nome do Documento / Identificador<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="w-full px-3 py-2 bg-surface-container-low rounded-lg border border-transparent focus:border-surface-container-high focus:bg-surface-container-lowest outline-none font-body-sm text-body-sm" placeholder={`ex: ${type}_Documento_v1.0`} /></label>
          <label className="flex flex-col gap-1.5 font-label-sm text-label-sm font-medium">Descrição / Contexto do {type}<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={2} className="w-full px-3 py-2 bg-surface-container-low rounded-lg border border-transparent focus:border-surface-container-high focus:bg-surface-container-lowest outline-none font-body-sm text-body-sm resize-none" placeholder="Escopo, contexto e objetivos do documento" /></label>
          <div onDragOver={(event) => event.preventDefault()} onDrop={onFileDrop} className="group relative flex flex-col items-center justify-center p-6 bg-surface-container-low hover:bg-surface-container rounded-xl border border-dashed border-surface-container-high text-center transition-colors">
            <input ref={fileInput} id="file-selector" type="file" accept="application/pdf,.pdf" onChange={onFileChange} className="peer sr-only" />
            <label htmlFor="file-selector" className="cursor-pointer flex flex-col items-center rounded-lg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-secondary peer-focus-visible:outline-offset-2"><span className="w-10 h-10 rounded-full bg-surface-container-lowest flex items-center justify-center mb-2 shadow-sm"><span className="material-symbols-outlined text-on-surface-variant text-[22px]">cloud_upload</span></span><span className="font-body-sm text-body-sm text-primary font-medium break-all">{file?.name || 'Arraste seu PDF aqui ou procure no disco'}</span></label>
            <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">O processamento começa após o envio.</p>
          </div>
          <button type="submit" disabled={busy} className="w-full px-4 py-2.5 bg-primary hover:bg-primary-container text-on-primary rounded-lg font-label-md text-label-md font-medium flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">bolt</span>{busy ? 'Enviando…' : `Enviar PDF ${type}`}</button>
        </form>
        <div className="lg:col-span-7 bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-surface-container-high/40 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 pb-1"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-on-surface-variant text-[20px]">sync</span><h2 className="font-headline-sm text-headline-sm text-primary">Status de Processamento</h2></div><span className="font-label-sm text-label-sm text-on-surface-variant">{showExamples ? `Prévia · ${statusExamples.length} dados fictícios` : `${statusTotal} itens`}</span></div>
          <button type="button" onClick={() => { setShowExamples((value) => !value); setExamplePage(1) }} aria-pressed={showExamples} className="self-start font-label-md text-label-md text-secondary hover:underline">{showExamples ? 'Ver meus documentos' : 'Ver exemplos de status'}</button>
          <div className="flex flex-col gap-3 max-h-[310px] overflow-y-auto pr-1">
            {visibleStatusItems.length ? visibleStatusItems.map((item) => {
              const style = statusStyle(item.ocrStatus)
              return <article key={item.id} className={`p-3.5 rounded-xl border-l-4 border border-surface-container-high/40 bg-surface-container-low/60 ${style.border}`}>
                <div className="flex items-start gap-3 min-w-0"><span className="w-9 h-9 shrink-0 rounded-lg bg-surface-container-lowest flex items-center justify-center text-secondary"><span className="material-symbols-outlined text-[19px]">description</span></span><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><h3 className="truncate font-body-sm text-body-sm font-semibold text-primary">{item.title || item.originalName}</h3><span className="shrink-0 font-label-sm text-label-sm text-on-surface-variant">{fileSize(item.size)}</span></div><div className="flex items-center justify-between gap-2 mt-1"><span className="truncate font-label-sm text-label-sm text-on-surface-variant">{item.description || item.originalName}</span><span className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-label-sm text-label-sm font-medium ${style.badge}`}><span className="material-symbols-outlined text-[14px]">{style.icon}</span>{statusLabel(item.ocrStatus)}</span></div></div></div>
              </article>
            }) : <p className="font-body-sm text-body-sm text-on-surface-variant">Seus PDFs {type} aparecerão aqui.</p>}
          </div>
          {statusTotal > 0 && <nav aria-label="Paginação do status de processamento" className="self-center inline-flex items-center gap-1 p-1 bg-surface-container-low rounded-xl border border-surface-container-high/50 font-label-sm text-label-sm"><button type="button" disabled={statusPage <= 1 || (!showExamples && loadingDocuments)} onClick={() => showExamples ? setExamplePage((page) => page - 1) : void openDocumentPage(documentPageNumber - 1)} className="px-2.5 py-1.5 rounded-lg hover:bg-surface-container-lowest disabled:opacity-40">Anterior</button><span aria-live="polite" className="px-2.5 py-1.5 text-primary font-semibold">{statusPage} de {statusPageCount}</span><button type="button" disabled={showExamples ? statusPage >= statusPageCount : !documentPage?.nextCursor || loadingDocuments} onClick={() => showExamples ? setExamplePage((page) => page + 1) : void openDocumentPage(documentPageNumber + 1)} className="px-2.5 py-1.5 rounded-lg hover:bg-surface-container-lowest disabled:opacity-40">Próximo</button></nav>}
        </div>
      </section>

      <section className="bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container-high/40 overflow-hidden" aria-label="Síntese">
        <div className="p-5 border-b border-surface-container-high/60 flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0"><label htmlFor="document-search" className="font-label-sm text-label-sm text-on-surface-variant shrink-0 font-medium">Documento ativo</label><div className="relative min-w-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSearchOpen(false) }}><span aria-hidden="true" className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span><input id="document-search" value={searchText} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearchText(event.target.value); setSearchResults([]) }} placeholder={active ? active.title || active.originalName : 'Buscar documento…'} maxLength={120} aria-expanded={searchOpen && (searchText.trim() ? searchResults.length > 0 : docs.length > 0)} aria-controls="document-options" className="w-full sm:min-w-[300px] pl-10 pr-3.5 py-2 bg-surface-container-low rounded-lg border border-surface-container-high/50 focus:border-primary outline-none font-body-sm text-body-sm" />
            {searchOpen && (searchText.trim() ? searchResults : docs).length > 0 && <div id="document-options" role="group" aria-label="Selecionar documento" className="absolute z-20 top-full left-0 w-full max-h-48 overflow-auto bg-surface-container-lowest shadow-xl border rounded-lg">{(searchText.trim() ? searchResults : docs).map((item) => <button type="button" key={item.id} onClick={() => selectDocument(item)} className="block w-full text-left p-2 hover:bg-surface-container-low">{item.title || item.originalName}</button>)}</div>}
          </div></div>
          <div className="flex items-center gap-2 flex-wrap"><span role="status" className="inline-flex items-center gap-1 text-secondary font-label-sm text-label-sm">{processing && <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>{progress || (active?.ocrStatus === 'EXTRACTING' ? 'Extraindo PDF…' : 'Gerando síntese…')}</>}</span><button type="button" onClick={openTopics} disabled={!canGenerate} className="px-3 py-2 bg-surface-container-low hover:bg-surface-container rounded-lg border border-surface-container-high/40 font-label-md text-label-md inline-flex items-center gap-1.5 disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">tune</span>Configurar tópicos</button><button type="button" onClick={openTopics} disabled={!canGenerate} className="px-3 py-2 bg-surface-container-low hover:bg-surface-container rounded-lg border border-surface-container-high/40 font-label-md text-label-md inline-flex items-center gap-1.5 disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">refresh</span>Regerar</button><button type="button" onClick={save} disabled={!preview || active?.ocrStatus !== 'COMPLETED' || saving || Boolean(selectedSummary)} className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md inline-flex items-center gap-2 disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">save</span>{saving ? 'Salvando…' : selectedSummary ? 'Síntese salva' : 'Salvar síntese'}</button></div>
        </div>
        <div className="px-6 py-2.5 bg-surface-container-low border-b border-surface-container-high/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant"><span className="flex items-center gap-2"><span className="material-symbols-outlined text-secondary text-[16px]">info</span>A síntese gerada fica como prévia. Clique em “Salvar síntese” para guardá-la no histórico.</span><span className="font-code-sm text-code-sm">Gerado pelo motor de síntese DocSynth</span></div>
        <div ref={summaryArea} className="p-6 md:p-8 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-surface-container-low/40 border border-surface-container-high/40"><div><span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">Síntese {type}</span><h2 className="font-headline-md text-headline-md font-semibold text-primary">{active ? active.title || active.originalName : `Selecione um documento ${type}`}</h2></div><div className="flex gap-2 flex-wrap"><button type="button" onClick={stop} disabled={!canStop || stopping} className={`px-3 py-1.5 bg-error-container text-error rounded-lg inline-flex items-center gap-1.5 font-label-sm text-label-sm disabled:opacity-50 ${canStop || active?.ocrStatus === 'CANCELLING' ? '' : 'hidden'}`}><span className="material-symbols-outlined text-[16px]">stop_circle</span>{stopping || active?.ocrStatus === 'CANCELLING' ? 'Parando…' : 'Parar geração'}</button><button type="button" onClick={() => { void navigator.clipboard.writeText(content).then(() => setToast('Resumo copiado.')).catch(notice) }} disabled={!content} className="px-3 py-1.5 bg-surface-container-low hover:bg-surface-container rounded-lg border border-surface-container-high/40 inline-flex items-center gap-1.5 font-label-sm text-label-sm disabled:opacity-50"><span className="material-symbols-outlined text-[16px]">content_copy</span>Copiar resumo</button></div></div>
          <Markdown content={content || placeholder} streaming={Boolean(content && processing)} />
        </div>
        <div className="px-6 py-4 bg-surface-container-low border-t border-surface-container-high/50 flex flex-wrap justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant"><span>Extensão estimada: {words ? `${words} palavras` : '—'}</span><span>Documento recebido: {active?.createdAt ? new Date(active.createdAt).toLocaleString('pt-BR') : '—'}</span></div>
      </section>

      <section className="flex flex-col gap-5" aria-label="Histórico de resumos">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="flex items-center gap-3"><h2 className="font-headline-md text-headline-md text-primary font-semibold">Histórico de Resumos Salvos</h2><span className="px-2 py-0.5 bg-surface-container-high rounded-lg font-label-sm text-label-sm text-primary font-semibold">{history?.total || 0} resumos salvos</span></div><p className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1.5"><span className="material-symbols-outlined text-emerald-600 text-[16px]">check_circle</span>Histórico do documento selecionado</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentPage.length ? currentPage.map((summary, index) => <article key={summary.id} className="p-5 bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container-high/40 flex flex-col gap-4 min-w-0"><div className="flex justify-between items-center gap-2"><strong className="font-label-sm text-label-sm text-secondary">Resumo #{(history?.total || 0) - start - index}</strong><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-label-sm text-label-sm"><span className="material-symbols-outlined text-[14px]">check_circle</span>Salvo</span></div><div><h3 className="font-headline-sm text-headline-sm text-primary font-semibold truncate">{active?.title || active?.originalName}</h3><time dateTime={summary.createdAt} className="font-label-sm text-label-sm text-on-surface-variant">{new Date(summary.createdAt).toLocaleString('pt-BR')}</time></div><p className="line-clamp-3 font-body-sm text-body-sm text-on-surface-variant min-h-[54px]">{summary.content.slice(0, 240)}</p><div className="flex flex-wrap gap-1">{summary.topics.slice(0, 3).map((topic) => <span key={topic} className="bg-surface-container-low rounded-lg px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">{topic}</span>)}</div><div className="flex gap-4 pt-3 mt-auto border-t border-surface-container-high/50 font-label-md text-label-md"><button type="button" onClick={() => { setSelectedSummary(summary); summaryArea.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }} className="text-secondary hover:underline">Exibir na síntese</button><button type="button" onClick={() => setSavedModal(summary)} className="text-secondary hover:underline">Visualizar</button></div></article>) : <p className="font-body-sm text-body-sm text-on-surface-variant">Nenhuma síntese salva para este documento.</p>}
        </div>
        {(history?.total || 0) > 0 && <div className="flex flex-wrap justify-between items-center gap-3 pt-2 font-label-sm text-label-sm text-on-surface-variant"><span>Mostrando {start + 1}–{start + currentPage.length} de {history?.total} sínteses</span><nav aria-label="Paginação do histórico" className="inline-flex items-center gap-1 p-1 bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container-high/50"><button type="button" disabled={historyPage <= 1 || historyLoading} onClick={() => { void openHistoryPage(historyPage - 1) }} className="px-2.5 py-1.5 hover:bg-surface-container-low rounded-lg inline-flex items-center gap-1 disabled:opacity-40"><span className="material-symbols-outlined text-[16px]">chevron_left</span>Anterior</button><span aria-live="polite" className="px-2.5 py-1.5 bg-primary text-on-primary rounded-lg font-semibold">{historyPage} de {pageCount}</span><button type="button" disabled={!history?.nextCursor || historyLoading} onClick={() => { void openHistoryPage(historyPage + 1) }} className="px-2.5 py-1.5 hover:bg-surface-container-low rounded-lg inline-flex items-center gap-1 disabled:opacity-40">Próxima<span className="material-symbols-outlined text-[16px]">chevron_right</span></button></nav></div>}
      </section>
    </main>

    {topicsOpen && <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/40 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setTopicsOpen(false) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="topics-title" className="bg-surface-container-lowest w-full max-w-xl max-h-[90vh] overflow-auto rounded-xl shadow-2xl border border-surface-container-high/70 flex flex-col">
        <header className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-surface-container-low"><div><h2 id="topics-title" className="font-headline-md text-headline-md font-semibold text-primary">Tópicos da síntese {type}</h2><p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Escolha o que a síntese deve abordar.</p></div><button type="button" onClick={() => setTopicsOpen(false)} aria-label="Fechar configuração" className="p-1.5 rounded-lg hover:bg-surface-container-low text-on-surface-variant"><span className="material-symbols-outlined text-[20px]">close</span></button></header>
        <div className="px-6 py-5 flex flex-col gap-4 min-h-0 overflow-y-auto"><label htmlFor="topic-input" className="font-label-md text-label-md font-semibold">Tópicos</label><div className="flex gap-2"><input id="topic-input" autoFocus value={topicInput} onChange={(event) => setTopicInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTopic() } }} maxLength={200} placeholder="Ex.: Dependências e riscos" className="min-w-0 flex-1 px-3 py-2 border border-surface-container-high rounded-lg" /><button type="button" onClick={addTopic} className="px-3 py-2 bg-surface-container-low hover:bg-surface-container rounded-lg font-label-md text-label-md">Adicionar</button></div><div className="flex flex-wrap gap-2 min-h-16 content-start p-3 bg-surface-container-low/80 rounded-lg" aria-label="Tópicos selecionados">{topics.map((topic) => <button type="button" key={topic} onClick={() => setTopics((items) => items.filter((item) => item !== topic))} aria-label={`Remover tópico ${topic}`} className="px-3 py-1 bg-surface-container-lowest border border-surface-container-high rounded-lg font-body-sm text-body-sm">{topic} ×</button>)}</div><label className="flex flex-col gap-2 font-label-md text-label-md font-semibold">Informações adicionais (uma por linha)<textarea value={questions} onChange={(event) => setQuestions(event.target.value)} rows={3} className="w-full p-3 border border-surface-container-high rounded-lg font-body-sm text-body-sm font-normal" /></label></div>
        <footer className="px-6 py-4 flex flex-wrap justify-end gap-3 border-t border-surface-container-low bg-surface-container-low/40"><button type="button" onClick={() => setTopicsOpen(false)} className="px-3 py-2 rounded-lg hover:bg-surface-container-low">Cancelar</button><button type="button" onClick={generate} disabled={busy} className="px-4 py-2 bg-primary text-on-primary rounded-lg disabled:opacity-50">{busy ? 'Gerando…' : 'Gerar síntese'}</button></footer>
      </section>
    </div>}
    {savedModal && <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/40 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSavedModal(null) }}><section role="dialog" aria-modal="true" aria-labelledby="saved-title" className="bg-surface-container-lowest w-full max-w-4xl max-h-[90vh] overflow-auto rounded-xl shadow-2xl border border-surface-container-high/70 p-6"><div className="flex justify-between items-start gap-4 pb-4 border-b border-surface-container-high/50"><div><p className="font-label-sm text-label-sm text-on-surface-variant">Salvo em {new Date(savedModal.createdAt).toLocaleString('pt-BR')}</p><h2 id="saved-title" className="font-headline-md text-headline-md text-primary mt-1">{active?.title || active?.originalName}</h2></div><button type="button" onClick={() => setSavedModal(null)} aria-label="Fechar visualização" className="p-1.5 rounded-lg hover:bg-surface-container-low text-on-surface-variant"><span className="material-symbols-outlined text-[20px]">close</span></button></div><div className="pt-5"><Markdown content={savedModal.content} /></div></section></div>}
    {toast && <div role="status" className="fixed bottom-6 right-6 z-50 bg-primary text-on-primary px-4 py-3 rounded-xl shadow-xl">{toast}</div>}
  </div>
}
