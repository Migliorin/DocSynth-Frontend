import { test } from 'node:test'
import assert from 'node:assert/strict'

function element(tagName) {
  return {
    tagName,
    children: [],
    attributes: {},
    style: {},
    classList: { add() {} },
    append(...children) { this.children.push(...children) },
    replaceChildren(...children) { this.children = children },
    setAttribute(name, value) { this.attributes[name] = value },
    get textContent() { return this.children.map((child) => child.textContent).join('') },
    set textContent(value) { this.children = [{ textContent: value }] },
  }
}

globalThis.document = {
  createElement: element,
  createTextNode: (textContent) => ({ textContent }),
}
globalThis.window = { location: { href: 'http://localhost/' } }
await import('../public/markdown.js')

test('renders Markdown tables with alignment, inline formatting and literal pipes', () => {
  const container = element('div')
  window.renderMarkdown(container, 'Introdução\n| Item | Valor |\n| :--- | ---: |\n| **Um** | 12 |\n| A \\| B | `x|y` |\nDepois')

  assert.deepEqual(container.children.map((child) => child.tagName), ['p', 'div', 'p'])
  const wrapper = container.children[1]
  const table = wrapper.children[0]
  assert.equal(wrapper.attributes.role, 'region')
  assert.equal(table.tagName, 'table')
  assert.equal(table.children[0].children[0].children[0].textContent, 'Item')
  assert.equal(table.children[0].children[0].children[1].style.textAlign, 'right')
  assert.ok(table.children[1].children[0].children[0].children.some((child) => child.tagName === 'strong'))
  assert.equal(table.children[1].children[1].children[0].textContent, 'A | B')
  assert.equal(table.children[1].children[1].children[1].textContent, 'x|y')
})

test('keeps incomplete tables and HTML input as text', () => {
  const container = element('div')
  window.renderMarkdown(container, '| Cabeçalho |\n| dado |\n<script>alert(1)</script>')

  assert.deepEqual(container.children.map((child) => child.tagName), ['p'])
  assert.match(container.textContent, /<script>alert\(1\)<\/script>/)
})

test('accepts tables without outer pipes and does not interpret HTML cells', () => {
  const container = element('div')
  window.renderMarkdown(container, 'Nome | Valor\n--- | :---:\n<script>alert(1)</script> | 4')

  const table = container.children[0].children[0]
  assert.equal(table.tagName, 'table')
  assert.equal(table.children[1].children[0].children[0].textContent, '<script>alert(1)</script>')
  assert.equal(table.children[1].children[0].children[1].style.textAlign, 'center')
})

test('formats a table as its Markdown arrives in stream fragments', () => {
  const container = element('div')
  let content = 'Introdução\n'
  for (const fragment of ['| Item | Val', 'or |\n| :--', '- | ---:', ' |\n| Um | 1', '2 |']) {
    content += fragment
    window.renderMarkdown(container, content, true)
    assert.deepEqual(container.children.map((child) => child.tagName), ['p', 'div'])
    assert.equal(container.children[1].children[0].tagName, 'table')
    assert.doesNotMatch(container.children[0].textContent, /\|/)
  }
  const table = container.children[1].children[0]
  assert.equal(table.children[1].children[0].children[1].textContent, '12')
  window.renderMarkdown(container, content)
  assert.equal(container.children[1].children[0].tagName, 'table')
})

test('leaves prose containing a pipe as text while streaming', () => {
  const container = element('div')
  window.renderMarkdown(container, 'A | B pode indicar alternativas.\nContinuação', true)
  assert.deepEqual(container.children.map((child) => child.tagName), ['p'])

  window.renderMarkdown(container, 'Nome | Valor\n--- | :--', true)
  assert.equal(container.children[0].children[0].tagName, 'table')
})
