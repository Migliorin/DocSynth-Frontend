import { Navigate, useSearchParams } from 'react-router'
import { hasSession } from '../../features/auth/session.ts'
import DocumentWorkspace from '../../features/documents/DocumentWorkspace.tsx'

export default function WorkspacePage() {
  const [params] = useSearchParams()
  return hasSession() ? <DocumentWorkspace key={params.get('type') === 'RDA' ? 'RDA' : 'PUR'} /> : <Navigate to="/login" replace />
}
