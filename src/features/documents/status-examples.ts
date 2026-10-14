import type { DocumentDto } from './types.ts'

const templates = [
  { id: 'example-queued', title: 'Escopo do portal', originalName: 'escopo_portal.pdf', description: 'Aguardando processamento', size: 420_000, ocrStatus: 'QUEUED' },
  { id: 'example-extracting', title: 'Requisitos de acesso', originalName: 'requisitos_acesso.pdf', description: 'Leitura do PDF em andamento', size: 1_800_000, ocrStatus: 'EXTRACTING' },
  { id: 'example-extracted', title: 'Fluxo de aprovação', originalName: 'fluxo_aprovacao.pdf', description: 'Texto extraído, pronto para síntese', size: 750_000, ocrStatus: 'EXTRACTED' },
  { id: 'example-summarizing', title: 'Matriz de dependências', originalName: 'matriz_dependencias.pdf', description: 'Síntese sendo gerada', size: 2_300_000, ocrStatus: 'SUMMARIZING' },
  { id: 'example-completed', title: 'Plano de migração', originalName: 'plano_migracao.pdf', description: 'Síntese concluída', size: 1_200_000, ocrStatus: 'COMPLETED' },
  { id: 'example-failed', title: 'Escopo da integração', originalName: 'escopo_integracao.pdf', description: 'Falha ao processar o PDF', size: 980_000, ocrStatus: 'FAILED' },
  { id: 'example-cancelling', title: 'Regras de retenção', originalName: 'regras_retencao.pdf', description: 'Cancelamento solicitado', size: 610_000, ocrStatus: 'CANCELLING' },
  { id: 'example-cancelled', title: 'Glossário técnico', originalName: 'glossario_tecnico.pdf', description: 'Processamento cancelado', size: 350_000, ocrStatus: 'CANCELLED' },
] satisfies Pick<DocumentDto, 'id' | 'title' | 'originalName' | 'description' | 'size' | 'ocrStatus'>[]

export const statusExamples = Array.from({ length: 40 }, (_, index) => {
  const example = templates[index % templates.length]
  return { ...example, id: `${example.id}-${index + 1}`, title: `${example.title} ${String(index + 1).padStart(2, '0')}` }
})
