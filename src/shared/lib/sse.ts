export async function readSse(response: Response, onData: (data: string) => void) {
  if (!response.ok || !response.body) throw new Error(`Falha no stream (${response.status}).`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []

  function line(value: string) {
    if (!value) {
      if (data.length) onData(data.join('\n'))
      data = []
      return
    }
    if (value.startsWith(':')) return
    const colon = value.indexOf(':')
    const field = colon < 0 ? value : value.slice(0, colon)
    if (field === 'data') data.push(value.slice(colon < 0 ? value.length : colon + 1).replace(/^ /, ''))
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split(/\r\n|\r|\n/)
      if (done) {
        if (lines.at(-1) === '') lines.pop()
        buffer = ''
      } else buffer = lines.pop() ?? ''
      lines.forEach(line)
      if (done) break
    }
  } finally {
    reader.releaseLock()
  }
}
