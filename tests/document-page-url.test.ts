import assert from 'node:assert/strict'
import { test } from 'node:test'
import { documentPageSize, documentPageUrl } from '../src/features/documents/document-page-url.ts'
import { statusExamples } from '../src/features/documents/status-examples.ts'

test('requests one backend page with the cursor for next or previous navigation', () => {
  assert.equal(documentPageUrl('PUR'), '/documents?type=PUR&limit=25')
  assert.equal(documentPageUrl('PUR', 'cursor/with+symbols'), '/documents?type=PUR&limit=25&cursor=cursor%2Fwith%2Bsymbols')
  assert.equal(documentPageUrl('RDA', null), '/documents?type=RDA&limit=25')
})

test('preview pages replace the visible documents', () => {
  const first = statusExamples.slice(0, documentPageSize)
  const second = statusExamples.slice(documentPageSize, documentPageSize * 2)
  assert.equal(first.length, 25)
  assert.equal(second.length, 15)
  assert.equal(first.some((item) => second.some((next) => next.id === item.id)), false)
})
