import { Navigate, Route, Routes } from 'react-router'
import AuthPage from '../../features/auth/AuthPage'
import SiteFooter from '../../features/shell/SiteFooter.tsx'
import SiteHeader from '../../features/shell/SiteHeader.tsx'
import WorkspacePage from '../pages/WorkspacePage.tsx'

export default function AppRoutes() {
  return (
    <div className="min-h-screen flex flex-col bg-background font-body-md text-on-surface antialiased">
      <SiteHeader />
      <div className="flex-1 flex flex-col">
        <Routes>
          <Route path="/login" element={<AuthPage key="login" />} />
          <Route path="/register" element={<AuthPage key="register" />} />
          <Route path="/cadastro" element={<AuthPage key="register" />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
      <SiteFooter />
    </div>
  )
}
