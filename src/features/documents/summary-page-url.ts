export const historyPageSize = 9;

export function summaryPageUrl(id: string, cursor: string | null) {
  const params = new URLSearchParams({ limit: String(historyPageSize) });
  if (cursor) params.set('cursor', cursor);
  return `/documents/${id}/summaries?${params}`;
}
