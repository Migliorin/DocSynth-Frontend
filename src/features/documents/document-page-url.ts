import type { DocumentType } from './types.ts'

export const documentPageSize = 25

export function documentPageUrl(type: DocumentType, cursor: string | null = null) {
  const query = new URLSearchParams({ type, limit: String(documentPageSize) })
  if (cursor) query.set('cursor', cursor)
  return `/documents?${query}`
}
