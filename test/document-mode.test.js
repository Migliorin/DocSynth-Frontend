import { test } from 'node:test'
import assert from 'node:assert/strict'

test('RDA tab uses RDA copy, navigation and upload type', async () => {
  const elements = new Map()
  const calls = []
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      id,
      listeners: {},
      firstElementChild: { textContent: '' },
      parentElement: { addEventListener() {} },
      addEventListener(name, listener) { this.listeners[name] = listener },
      setAttribute(name, value) { this[name] = value },
      removeAttribute(name) { delete this[name] },
      querySelector() { return { disabled: false } },
    })
    return elements.get(id)
  }
  globalThis.document = {
    getElementById: element,
    querySelectorAll: () => [],
    addEventListener() {},
  }
  globalThis.window = {
    location: {
      href: 'http://localhost/modelo.html?api=http%3A%2F%2Flocalhost%3A3000&type=RDA',
      search: '?api=http%3A%2F%2Flocalhost%3A3000&type=RDA',
    },
  }
  globalThis.sessionStorage = {
    getItem: (key) => key === 'docsynth-token' ? 'token' : null,
    setItem(key, value) { this[key] = value },
  }
  globalThis.localStorage = { getItem: () => null }
  globalThis.fetch = (url, options) => {
    calls.push({ url, options })
    return new Promise(() => {})
  }

  await import('../public/document-flow.js')

  assert.equal(elements.get('analysis-heading').textContent, 'Análise de RDA')
  assert.equal(elements.get('upload-submit-label').textContent, 'Enviar PDF RDA')
  assert.equal(elements.get('summary-type-label').textContent, 'Síntese RDA')
  assert.equal(elements.get('tab-rda')['aria-current'], 'page')
  assert.match(elements.get('tab-pur').href, /type=PUR/)
  assert.match(elements.get('tab-rda').href, /type=RDA/)
  assert.match(elements.get('tab-pur').href, /api=http%3A%2F%2Flocalhost%3A3000/)
  assert.equal(sessionStorage['docsynth-document-type'], 'RDA')

  const file = Object.assign(new Blob(['%PDF-'], { type: 'application/pdf' }), { name: 'rda.pdf' })
  elements.get('file-selector').files = [file]
  elements.get('doc-id').value = 'RDA de exemplo'
  elements.get('doc-desc').value = 'Contexto'
  const form = elements.get('upload-form')
  form.listeners.submit({ preventDefault() {}, currentTarget: form })
  assert.equal(calls.at(-1).options.body.get('type'), 'RDA')
})
