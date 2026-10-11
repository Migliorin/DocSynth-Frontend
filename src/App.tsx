import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const isRegister = () => ['/register', '/cadastro'].includes(window.location.pathname)

function App() {
  const [register, setRegister] = useState(isRegister)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function navigate(path: string) {
    window.history.pushState({}, '', path)
    setRegister(path !== '/login')
    setError('')
  }

  useEffect(() => {
    const onPopState = () => setRegister(isRegister())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const remember = values.remember === 'on'
    try {
      const response = await fetch(`${API}/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, remember }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message ?? 'Não foi possível autenticar.')
      const storage = !register && remember ? localStorage : sessionStorage
      localStorage.removeItem('docsynth-token')
      localStorage.removeItem('docsynth-user')
      sessionStorage.removeItem('docsynth-token')
      sessionStorage.removeItem('docsynth-user')
      storage.setItem('docsynth-token', result.accessToken)
      storage.setItem('docsynth-user', JSON.stringify(result.user))
      window.location.assign('/workspace')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha de conexão com o servidor.')
    } finally {
      setBusy(false)
    }
  }

  if (window.location.pathname === '/workspace') {
    const token = sessionStorage.getItem('docsynth-token') ?? localStorage.getItem('docsynth-token')
    if (!token) {
      window.location.replace('/login')
      return null
    }
    return <main className="prototype"><iframe className="prototype__frame" src={`/modelo.html?api=${encodeURIComponent(API)}`} title="DocSynth — análise de documentos" /></main>
  }

  return (
    <div className="auth-page">
      <header className="auth-header">
        <a className="brand" href="/login" onClick={(e) => { e.preventDefault(); navigate('/login') }}>DocSynth</a>
        <div className="header-action">
          <span>{register ? 'Já tem uma conta?' : 'Não tem uma conta?'}</span>
          <a href={register ? '/login' : '/cadastro'} onClick={(e) => { e.preventDefault(); navigate(register ? '/login' : '/cadastro') }}>{register ? 'Entrar' : 'Criar conta'}</a>
        </div>
      </header>
      <main className="auth-main">
        <section className={`auth-card ${register ? 'auth-card--register' : ''}`}>
          {register && <div className="eyebrow">✦ &nbsp; NOVO ACESSO · DOCSYNTH</div>}
          <h1>{register ? 'Criar Conta' : 'Entrar na DocSynth'}</h1>
          <p className="intro">{register ? 'Preencha seus dados para acessar o workspace técnico.' : 'Acesse o console analítico de PUR, RDA e síntese de relatórios de validação técnica.'}</p>
          <form onSubmit={submit}>
            {register && <label>Nome Completo <b>*</b><input name="name" autoComplete="name" placeholder="Beatriz Silveira" required maxLength={120} /></label>}
            <label>E-mail de Trabalho <b>*</b><input name="email" type="email" autoComplete="email" placeholder="nome@empresa.com.br" required /></label>
            <label>{register ? 'Senha' : 'Senha'} <b>*</b><span className="password-field"><input name="password" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} placeholder="••••••••••••" minLength={register ? 8 : undefined} pattern={register ? '(?=.*[A-Za-z])(?=.*[0-9]).{8,}' : undefined} title="Use ao menos 8 caracteres, uma letra e um número." required /><button type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVisible(!visible)}>{visible ? '◉' : '◎'}</button></span>
              {register && <small>Mínimo de 8 caracteres com letras e números.</small>}
            </label>
            {!register && <div className="form-options"><label className="check-label"><input type="checkbox" name="remember" />Lembrar desta sessão por 30 dias</label><span>♢ &nbsp;Segura</span></div>}
            {register && <label className="check-label terms"><input type="checkbox" required /> <span>Concordo com os <a href="#termos">Termos de Serviço</a> e <a href="#privacidade">Privacidade</a>.</span></label>}
            {error && <p className="error-message" role="alert">{Array.isArray(error) ? error.join(', ') : error}</p>}
            <button className="submit-button" disabled={busy}>{busy ? 'Aguarde…' : register ? 'Criar Conta  →' : 'Acessar Plataforma  →'}</button>
            {register && <p className="inline-login">Já possui conta? <a href="/login" onClick={(e) => { e.preventDefault(); navigate('/login') }}>Entrar na plataforma</a></p>}
          </form>
        </section>
        {!register && <footer className="secure-footer"><span>♙ &nbsp;Ambiente Protegido · TLS 1.3 Strict · DocSynth Engine v2.4</span><small>Auditoria PUR/RDA em conformidade com ISO/IEC 27001</small></footer>}
      </main>
      <footer className="site-footer"><span>© 2025 DocSynth Labs. Todos os direitos reservados.</span><span>Privacidade · Termos · Status</span></footer>
    </div>
  )
}

export default App
