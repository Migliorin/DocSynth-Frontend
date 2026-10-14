import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { AuthResponse } from './types'
import { fetchUser, saveSession } from './session'

import { API } from '../../app/config/api'

const fieldClass = 'w-full h-11 px-3 bg-surface-container-lowest border border-surface-container-high rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary outline-none'

function AuthPage() {
  const register = ['/register', '/cadastro'].includes(useLocation().pathname)
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      const result: AuthResponse & { message?: string | string[] } = await response.json()
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(', ') : result.message ?? 'Não foi possível autenticar.')
      const storage = !register && remember ? localStorage : sessionStorage
      const user = await fetchUser(result.accessToken)
      saveSession(result, user, storage === localStorage)
      navigate('/workspace')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha de conexão com o servidor.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="flex-1 flex items-center justify-center px-5 py-12">
        <section className="w-full max-w-[480px] p-6 sm:p-10 bg-surface-container-lowest border border-surface-container-high/40 rounded-xl shadow-sm">
          <h1 className="font-display-lg-mobile text-display-lg-mobile sm:font-display-lg sm:text-display-lg text-primary tracking-tight">{register ? 'Criar conta' : 'Entrar na DocSynth'}</h1>
          <p className="mt-2 mb-7 font-body-md text-body-md text-on-surface-variant leading-relaxed">{register ? 'Crie sua conta para enviar documentos e salvar sínteses.' : 'Acesse seus documentos PUR e RDA e continue suas análises.'}</p>
          <form onSubmit={submit} className="flex flex-col gap-5">
            {register && <label className="flex flex-col gap-1.5 font-body-sm text-body-sm font-medium text-primary">Nome completo <span className="sr-only">obrigatório</span><input name="name" autoComplete="name" placeholder="Beatriz Silveira" required maxLength={120} className={fieldClass} /></label>}
            <label className="flex flex-col gap-1.5 font-body-sm text-body-sm font-medium text-primary">E-mail <span className="sr-only">obrigatório</span><input name="email" type="email" autoComplete="email" placeholder="nome@empresa.com.br" required className={fieldClass} /></label>
            <label className="flex flex-col gap-1.5 font-body-sm text-body-sm font-medium text-primary">Senha <span className="sr-only">obrigatório</span><span className="relative block"><input name="password" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} placeholder="••••••••••••" minLength={register ? 8 : undefined} pattern={register ? '(?=.*[A-Za-z])(?=.*[0-9]).{8,}' : undefined} title="Use ao menos 8 caracteres, uma letra e um número." required className={`${fieldClass} pr-12`} /><button type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-2 w-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary"><span className="material-symbols-outlined text-[20px]" aria-hidden="true">{visible ? 'visibility_off' : 'visibility'}</span></button></span>
              {register && <small className="font-label-md text-label-md font-normal text-on-surface-variant">Mínimo de 8 caracteres com letras e números.</small>}
            </label>
            {!register && <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant cursor-pointer"><input type="checkbox" name="remember" className="w-4 h-4 accent-primary" />Lembrar desta sessão por 30 dias</label>}
            {error && <p className="font-body-sm text-body-sm text-error" role="alert">{error}</p>}
            <button disabled={busy} className="w-full h-11 mt-1 bg-primary hover:bg-primary-container text-on-primary rounded-lg font-body-md text-body-md font-medium shadow-sm disabled:opacity-60 disabled:cursor-wait">{busy ? 'Aguarde…' : register ? 'Criar conta' : 'Entrar'}</button>
            {register && <p className="mt-1 text-center font-body-sm text-body-sm text-on-surface-variant">Já tem uma conta? <Link to="/login" className="font-semibold text-secondary hover:underline">Entrar</Link></p>}
          </form>
        </section>
      </main>
  )
}

export default AuthPage
