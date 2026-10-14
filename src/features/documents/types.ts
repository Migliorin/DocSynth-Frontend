export type OcrStatus = 'QUEUED' | 'EXTRACTING' | 'EXTRACTED' | 'SUMMARIZING' | 'CANCELLING' | 'CANCELLED' | 'COMPLETED' | 'FAILED'
export type DocumentType = 'PUR' | 'RDA'
export type SummaryLevel = 'concise' | 'balanced' | 'deep'

export interface DocumentDto {
  id: string
  objectKey: string
  originalName: string
  title: string | null
  description: string | null
  mimeType: string
  size: number
  jobId: string | null
  ocrStatus: OcrStatus
  markdownKey: string | null
  ocrError: string | null
  type: DocumentType
  userId: string | null
  topics: string[]
  questions: string[]
  summaryLevel: SummaryLevel
  createdAt: string
}

export interface DocumentDetailsDto extends DocumentDto {
  generatedSummary: string | null
}

export interface SummaryDto {
  id: string
  documentId: string
  generationId: string
  content: string
  topics: string[]
  questions: string[]
  summaryLevel: SummaryLevel
  createdAt: string
}

export interface PageDto<T> {
  items: T[]
  nextCursor: string | null
  total: number
}

export type DocumentPage = PageDto<DocumentDto>
export type SummaryPage = PageDto<SummaryDto>

export type DocumentEvent = (
  | { kind: 'status'; status: OcrStatus }
  | { kind: 'progress' | 'error'; message: string }
  | { kind: 'prompt_progress'; percent: number }
  | { kind: 'reasoning' }
  | { kind: 'summary_snapshot'; summary: string }
  | { kind: 'summary_delta'; delta: string }
) & { status?: OcrStatus }

export interface GenerationConfig {
  topics: string[]
  questions?: string[]
  summaryLevel?: SummaryLevel
}
