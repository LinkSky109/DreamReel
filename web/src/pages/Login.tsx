import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { Icon } from '../components/Icon'
import './Login.css'

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useLang()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError(t('请输入邮箱和密码', 'Enter email and password'))
      return
    }
    setBusy(true)
    try {
      const result =
        mode === 'login'
          ? await api.login({ email: email.trim(), password })
          : await api.register({ username: username.trim(), email: email.trim(), password })
      localStorage.setItem('dreamreel_token', result.token)
      localStorage.setItem('dreamreel_user', JSON.stringify(result.user))
      window.dispatchEvent(new Event('dreamreel:auth'))
      queryClient.invalidateQueries({ queryKey: ['me'] })
      showToast(
        mode === 'login'
          ? t(`欢迎回来，${result.user.username}`, `Welcome back, ${result.user.username}`)
          : t(`注册成功，欢迎 ${result.user.username}`, `Welcome, ${result.user.username}`),
        'success'
      )
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dr-page auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-mark">
            <Icon name="clapper" size={17} />
          </span>
          <span>DreamReel 梦卷</span>
        </div>
        <h1>{t('登录 / 注册', 'Sign in / Sign up')}</h1>
        <p className="auth-lead">
          {t('登录后可保存项目、额度与团队协作记录。', 'Sign in to save projects, quota and collaboration history.')}
        </p>

        <div className="auth-tabs" role="tablist" aria-label={t('登录方式', 'Auth mode')}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'is-active' : ''}
            onClick={() => {
              setMode('login')
              setError('')
            }}
          >
            {t('登录', 'Sign in')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'is-active' : ''}
            onClick={() => {
              setMode('register')
              setError('')
            }}
          >
            {t('注册', 'Sign up')}
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' ? (
            <label className="auth-field">
              <span>{t('用户名', 'Username')}</span>
              <input
                className="dr-input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={t('至少 2 个字符', 'At least 2 characters')}
                autoComplete="username"
                required
              />
            </label>
          ) : null}
          <label className="auth-field">
            <span>{t('邮箱', 'Email')}</span>
            <input
              className="dr-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              required
            />
          </label>
          <label className="auth-field">
            <span>{t('密码', 'Password')}</span>
            <input
              className="dr-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>

          {error ? (
            <div className="auth-error" role="alert">
              <Icon name="alert" size={15} />
              {error}
            </div>
          ) : null}

          <button className="dr-btn dr-btn-primary auth-submit" type="submit" disabled={busy}>
            {busy
              ? t('处理中…', 'Working…')
              : mode === 'login'
                ? t('登录', 'Sign in')
                : t('注册并登录', 'Create account')}
          </button>
        </form>

        <p className="auth-help">
          {t('原型演示：任意邮箱与 4 位以上密码即可登录。', 'Demo: any email and a 4+ character password works.')}
        </p>

        <Link className="auth-guest" to="/">
          <Icon name="arrow-left" size={14} />
          {t('以游客身份继续', 'Continue as guest')}
        </Link>
      </div>
    </div>
  )
}
