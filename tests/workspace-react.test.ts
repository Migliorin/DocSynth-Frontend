import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'
import { statusExamples } from '../src/features/documents/status-examples.ts'

test('renders the document workspace as a React page', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: DocumentWorkspace } = await server.ssrLoadModule('/src/features/documents/DocumentWorkspace.tsx')
    const markup = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/workspace?type=RDA'] }, createElement(DocumentWorkspace)))
    assert.match(markup, /Análise de RDA/)
    assert.match(markup, /Histórico de Resumos Salvos/)
    assert.doesNotMatch(markup, /<iframe/)
    assert.equal(statusExamples.length, 40)
    assert.equal(new Set(statusExamples.map((item: { id: string }) => item.id)).size, 40)
    assert.equal(new Set(statusExamples.map((item: { ocrStatus: string }) => item.ocrStatus)).size, 8)
  } finally {
    await server.close()
  }
})
