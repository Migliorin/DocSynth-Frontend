import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSse } from '../public/sse.js'

test('parses fragmented UTF-8, CRLF, comments, and multiline data', async () => {
  const bytes = new TextEncoder().encode(': ping\r\ndata: {"content":"Olá"}\r\ndata: segunda\r\n\r\nevent: ignored\r\ndata: fim\r\n\r\n')
  const chunks = [bytes.slice(0, 28), bytes.slice(28, 29), bytes.slice(29, 46), bytes.slice(46)]
  const response = new Response(new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk))
      controller.close()
    },
  }))
  const events = []

  await readSse(response, (data) => events.push(data))

  assert.deepEqual(events, ['{"content":"Olá"}\nsegunda', 'fim'])
})

test('does not dispatch an event cut off before its blank line', async () => {
  const response = new Response('data: incomplete\n')
  const events = []

  await readSse(response, (data) => events.push(data))

  assert.deepEqual(events, [])
})
