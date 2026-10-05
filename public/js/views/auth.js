import { api } from '../api.js'
import { showToast } from '../app.js'
import { i18n } from '../i18n.js'

/**
 * 认证页面（登录/注册）
 */
export function renderAuthPage(container) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">🎬</div>
        <h1 class="auth-title">${i18n.t('appName')}</h1>
        <p class="auth-subtitle">${i18n.t('appTagline')}</p>

        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">${i18n.t('login')}</button>
          <button class="auth-tab" data-tab="register">${i18n.t('register')}</button>
        </div>

        <!-- 登录表单 -->
        <form id="loginForm" class="auth-form">
          <div class="form-group">
            <label class="form-label">${i18n.t('email')}</label>
            <input type="email" class="form-input" id="loginEmail" placeholder="your@email.com" required />
          </div>
          <div class="form-group">
            <label class="form-label">${i18n.t('password')}</label>
            <input type="password" class="form-input" id="loginPassword" placeholder="••••••" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="loginBtn">${i18n.t('login')}</button>
        </form>

        <!-- 注册表单 -->
        <form id="registerForm" class="auth-form" style="display: none;">
          <div class="form-group">
            <label class="form-label">${i18n.t('username')}</label>
            <input type="text" class="form-input" id="regUsername" placeholder="至少 2 个字符" required />
          </div>
          <div class="form-group">
            <label class="form-label">${i18n.t('email')}</label>
            <input type="email" class="form-input" id="regEmail" placeholder="your@email.com" required />
          </div>
          <div class="form-group">
            <label class="form-label">${i18n.t('password')}</label>
            <input type="password" class="form-input" id="regPassword" placeholder="••••••" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="registerBtn">${i18n.t('register')}</button>
        </form>

        <div class="auth-footer">
          <a href="#/" class="auth-link">← 以游客身份继续</a>
        </div>
      </div>
    </div>
  `

  // Tab 切换
  const tabs = container.querySelectorAll('.auth-tab')
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')
      const isLogin = tab.dataset.tab === 'login'
      document.getElementById('loginForm').style.display = isLogin ? 'block' : 'none'
      document.getElementById('registerForm').style.display = isLogin ? 'none' : 'block'
    })
  })

  // 登录
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = document.getElementById('loginBtn')
    btn.disabled = true
    btn.textContent = '登录中...'

    try {
      const result = await api.login({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value,
      })
      localStorage.setItem('dreamreel_token', result.token)
      localStorage.setItem('dreamreel_user', JSON.stringify(result.user))
      showToast(`欢迎回来，${result.user.username}！`)
      window.location.hash = '#/'
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '登录'
    }
  })

  // 注册
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = document.getElementById('registerBtn')
    btn.disabled = true
    btn.textContent = '注册中...'

    try {
      const result = await api.register({
        username: document.getElementById('regUsername').value,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPassword').value,
      })
      localStorage.setItem('dreamreel_token', result.token)
      localStorage.setItem('dreamreel_user', JSON.stringify(result.user))
      showToast(`注册成功，欢迎 ${result.user.username}！`)
      window.location.hash = '#/'
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '注册并登录'
    }
  })
}

/**
 * 获取当前登录用户
 */
export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('dreamreel_user'))
  } catch {
    return null
  }
}

/**
 * 检查是否已登录
 */
export function isLoggedIn() {
  return !!localStorage.getItem('dreamreel_token')
}

/**
 * 登出
 */
export function logout() {
  localStorage.removeItem('dreamreel_token')
  localStorage.removeItem('dreamreel_user')
  showToast('已退出登录')
  window.location.hash = '#/'
}
