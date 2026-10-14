import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summaryPageUrl } from '../src/features/documents/summary-page-url.ts'

test('requests one backend summary page with the returned cursor', () => {
  assert.equal(summaryPageUrl('document-1', null), '/documents/document-1/summaries?limit=9')
  assert.equal(summaryPageUrl('document-1', 'last-summary'), '/documents/document-1/summaries?limit=9&cursor=last-summary')
})
