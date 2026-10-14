import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  authenticatedFetch,
  clearSession,
  sessionProfileSnapshot,
  subscribeSession,
} from '../auth/session.ts'
import type { User } from '../auth/types.ts'

function parseProfile(raw: string | null): User | null {
  if (!raw) return null

  try {
    const user = JSON.parse(raw) as Partial<User>

    if (
      typeof user.name === 'string' &&
      typeof user.email === 'string' &&
      (user.role === 'ADMIN' || user.role === 'USER')
    ) {
      return user as User
    }
  } catch {
    /* Ignore an invalid cached profile. */
  }

  return null
}

export default function SiteHeader() {
  const navigate = useNavigate()
  const location = useLocation()

  const rawProfile = useSyncExternalStore(
    subscribeSession,
    sessionProfileSnapshot,
    () => null,
  )

  const user = useMemo(() => parseProfile(rawProfile), [rawProfile])

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  async function logout() {
    try {
      await authenticatedFetch('/auth/logout', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      })
    } catch (error) {
      console.error('Não foi possível confirmar o logout:', error)
    }

    clearSession()
    setMenuOpen(false)
    navigate('/login', { replace: true })
  }

  const registerPage =
    location.pathname === '/register' ||
    location.pathname === '/cadastro'

  return (
    <header className="sticky top-0 z-40 h-16 shrink-0 bg-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="max-w-7xl mx-auto h-full px-5 sm:px-6 lg:px-12 flex items-center justify-between gap-4">
        <Link
          to={user ? '/workspace' : '/login'}
          onClick={() => setMenuOpen(false)}
          className="font-headline-md text-headline-md font-semibold tracking-tight text-primary"
        >
          DocSynth
        </Link>

        {user ? (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="user-menu"
              className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-transparent hover:border-surface-container-high/60 text-on-surface transition-colors"
            >
              <span className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-on-primary text-[18px]">
                  person
                </span>
              </span>

              <span className="hidden sm:flex flex-col items-start text-left min-w-0 max-w-40">
                <span className="w-full truncate font-label-sm text-label-sm font-medium leading-none">
                  {user.name}
                </span>

                <span className="font-label-sm text-label-sm text-secondary mt-0.5">
                  {user.role === 'ADMIN' ? 'Admin' : 'User'}
                </span>
              </span>

              <span className="material-symbols-outlined text-on-surface-variant text-[16px]">
                expand_more
              </span>
            </button>

            {menuOpen && (
              <div
                id="user-menu"
                className="absolute right-0 mt-2 w-52 rounded-xl bg-surface-container-lowest shadow-xl border border-surface-container-high/70 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-surface-container-low">
                  <p className="font-label-sm text-label-sm font-semibold">
                    {user.name}
                  </p>

                  <p className="font-code-sm text-label-sm text-on-surface-variant truncate">
                    {user.email}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-error text-left hover:bg-surface-container-low"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    logout
                  </span>
                  Sair / Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 sm:gap-5 font-body-sm text-body-sm">
            <span className="hidden sm:inline text-on-surface-variant">
              {registerPage
                ? 'Já tem uma conta?'
                : 'Não tem uma conta?'}
            </span>

            <Link
              to={registerPage ? '/login' : '/cadastro'}
              className="font-medium text-secondary hover:underline"
            >
              {registerPage ? 'Entrar' : 'Criar conta'}
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}