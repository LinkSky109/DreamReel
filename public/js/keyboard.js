/**
 * 键盘快捷键管理
 * 支持全局快捷键和上下文相关快捷键
 */

const shortcuts = []
let helpModal = null
let isHelpVisible = false
let lastKey = null
let lastKeyTime = 0
const SEQUENCE_TIMEOUT = 1000 // 1秒内按第二个键

/**
 * 注册快捷键
 * @param {Object} shortcut - { keys, description, action, scope, macKeys }
 */
export function registerShortcut({ keys, description, action, scope = 'global', macKeys }) {
  shortcuts.push({ keys, description, action, scope, macKeys })
}

/**
 * 初始化快捷键监听
 */
export function initKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeyDown)

  // 注册默认快捷键
  registerDefaultShortcuts()
}

/**
 * 处理按键事件
 */
function handleKeyDown(e) {
  // 如果焦点在输入框/文本域，只处理 Esc 和 Ctrl/Cmd 组合键
  const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable

  // Esc 关闭弹窗
  if (e.key === 'Escape') {
    closeAllModals()
    return
  }

  // ? 显示帮助
  if (e.key === '?' && !isInput) {
    e.preventDefault()
    toggleHelpModal()
    return
  }

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey
  const currentKey = e.key.toLowerCase()
  const now = Date.now()

  // 检查按键序列（如 "g h"）
  if (lastKey && now - lastKeyTime < SEQUENCE_TIMEOUT) {
    const sequence = `${lastKey} ${currentKey}`
    for (const shortcut of shortcuts) {
      const keys = isMac && shortcut.macKeys ? shortcut.macKeys : shortcut.keys
      if (keys === sequence && !isInput) {
        if (shortcut.scope === 'editor' && !isInEditor()) continue
        e.preventDefault()
        shortcut.action(e)
        lastKey = null
        return
      }
    }
  }

  // 记录可能的序列前缀（单字母、无修饰键）
  if (!ctrlOrCmd && !e.shiftKey && !e.altKey && currentKey.length === 1 && !isInput) {
    lastKey = currentKey
    lastKeyTime = now
  } else {
    lastKey = null
  }

  // 遍历所有快捷键
  for (const shortcut of shortcuts) {
    const keys = isMac && shortcut.macKeys ? shortcut.macKeys : shortcut.keys

    // 跳过按键序列（已在上面处理）
    if (keys.includes(' ')) continue

    const parts = keys.split('+')
    const key = parts[parts.length - 1].toLowerCase()
    const needsCtrl = parts.includes('Ctrl')
    const needsCmd = parts.includes('Cmd')
    const needsShift = parts.includes('Shift')
    const needsAlt = parts.includes('Alt')

    // 检查修饰键
    if (needsCtrl && !e.ctrlKey) continue
    if (needsCmd && !e.metaKey) continue
    if (needsShift && !e.shiftKey) continue
    if (needsAlt && !e.altKey) continue

    // 检查主键
    if (currentKey !== key) continue

    // 输入框中只处理带修饰键的快捷键
    if (isInput && !ctrlOrCmd && !needsAlt) continue

    // 检查作用域
    if (shortcut.scope === 'editor' && !isInEditor()) continue

    e.preventDefault()
    shortcut.action(e)
    lastKey = null
    return
  }
}

/**
 * 判断是否在编辑器页面
 */
function isInEditor() {
  return location.hash.startsWith('#/project/')
}

/**
 * 关闭所有弹窗
 */
function closeAllModals() {
  // 关闭帮助弹窗
  if (isHelpVisible) {
    toggleHelpModal()
    return
  }

  // 关闭其他 modal
  const modals = document.querySelectorAll('.modal-overlay, .modal')
  modals.forEach((modal) => {
    if (modal.style.display !== 'none') {
      modal.style.display = 'none'
    }
  })

  // 触发自定义事件
  document.dispatchEvent(new CustomEvent('modal-close'))
}

/**
 * 注册默认快捷键
 */
function registerDefaultShortcuts() {
  // 全局快捷键
  registerShortcut({
    keys: 'Ctrl+N',
    macKeys: 'Cmd+N',
    description: '新建项目',
    scope: 'global',
    action: () => {
      const btn = document.getElementById('createProjectBtn')
      if (btn) btn.click()
    },
  })

  registerShortcut({
    keys: 'Ctrl+K',
    macKeys: 'Cmd+K',
    description: '聚焦搜索框',
    scope: 'global',
    action: () => {
      const searchInput = document.getElementById('searchInput')
      if (searchInput) {
        searchInput.focus()
        searchInput.select()
      }
    },
  })

  registerShortcut({
    keys: 'g h',
    description: '回到首页',
    scope: 'global',
    action: () => {
      location.hash = ''
    },
  })

  registerShortcut({
    keys: 'g s',
    description: '打开统计页',
    scope: 'global',
    action: () => {
      location.hash = '#/stats'
    },
  })

  registerShortcut({
    keys: 'g p',
    description: '打开订阅页',
    scope: 'global',
    action: () => {
      location.hash = '#/pricing'
    },
  })

  // 编辑器快捷键
  registerShortcut({
    keys: 'Ctrl+S',
    macKeys: 'Cmd+S',
    description: '保存版本',
    scope: 'editor',
    action: () => {
      document.dispatchEvent(new CustomEvent('editor-save-version'))
    },
  })

  registerShortcut({
    keys: 'Ctrl+E',
    macKeys: 'Cmd+E',
    description: '导出视频',
    scope: 'editor',
    action: () => {
      document.dispatchEvent(new CustomEvent('editor-export'))
    },
  })

  registerShortcut({
    keys: 'Ctrl+G',
    macKeys: 'Cmd+G',
    description: '生成剧本',
    scope: 'editor',
    action: () => {
      document.dispatchEvent(new CustomEvent('editor-generate-script'))
    },
  })

  registerShortcut({
    keys: 'Ctrl+B',
    macKeys: 'Cmd+B',
    description: '批量生成视频',
    scope: 'editor',
    action: () => {
      document.dispatchEvent(new CustomEvent('editor-generate-all'))
    },
  })

  // 数字键切换标签页
  const tabs = [
    { key: '1', name: '剧本', event: 'editor-tab-script' },
    { key: '2', name: '角色', event: 'editor-tab-characters' },
    { key: '3', name: '镜头', event: 'editor-tab-shots' },
    { key: '4', name: '配音', event: 'editor-tab-dubbing' },
    { key: '5', name: '影评', event: 'editor-tab-analysis' },
    { key: '6', name: '协作', event: 'editor-tab-collab' },
    { key: '7', name: '版本', event: 'editor-tab-versions' },
  ]

  tabs.forEach((tab) => {
    registerShortcut({
      keys: tab.key,
      description: `切换到${tab.name}标签`,
      scope: 'editor',
      action: () => {
        document.dispatchEvent(new CustomEvent(tab.event))
      },
    })
  })
}

/**
 * 切换帮助弹窗
 */
export function toggleHelpModal() {
  if (isHelpVisible) {
    if (helpModal) {
      helpModal.remove()
      helpModal = null
    }
    isHelpVisible = false
    return
  }

  isHelpVisible = true
  helpModal = document.createElement('div')
  helpModal.className = 'modal-overlay'
  helpModal.id = 'keyboardHelpModal'
  helpModal.innerHTML = `
    <div class="modal keyboard-help-modal">
      <div class="modal-header">
        <h3>⌨️ 键盘快捷键</h3>
        <button class="modal-close" id="helpCloseBtn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="help-section">
          <h4>全局</h4>
          ${renderShortcutGroup('global')}
        </div>
        <div class="help-section">
          <h4>编辑器</h4>
          ${renderShortcutGroup('editor')}
        </div>
        <div class="help-tip">
          按 <kbd>Esc</kbd> 关闭此窗口，按 <kbd>?</kbd> 随时打开
        </div>
      </div>
    </div>
  `
  document.body.appendChild(helpModal)

  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) toggleHelpModal()
  })

  document.getElementById('helpCloseBtn').addEventListener('click', toggleHelpModal)
}

/**
 * 渲染快捷键组
 */
function renderShortcutGroup(scope) {
  const group = shortcuts.filter((s) => s.scope === scope)
  if (group.length === 0) return '<p style="color: var(--text-muted);">无</p>'

  return `
    <div class="shortcut-list">
      ${group.map((s) => `
        <div class="shortcut-item">
          <span class="shortcut-keys">${formatKeys(s)}</span>
          <span class="shortcut-desc">${s.description}</span>
        </div>
      `).join('')}
    </div>
  `
}

/**
 * 格式化按键显示
 */
function formatKeys(shortcut) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const keys = isMac && shortcut.macKeys ? shortcut.macKeys : shortcut.keys
  return keys.split('+').map((k) => `<kbd>${k}</kbd>`).join(' + ')
}

/**
 * 获取所有快捷键（用于展示）
 */
export function getAllShortcuts() {
  return [...shortcuts]
}
