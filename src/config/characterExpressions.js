/**
 * 角色表情与动作库
 * 12种预设表情 + 10种动作模板
 * 镜头中选择后自动组合到 prompt
 */

export const EXPRESSIONS = [
  { id: 'happy', name: '开心', emoji: '😊', promptWord: 'happy' },
  { id: 'angry', name: '愤怒', emoji: '😠', promptWord: 'angry' },
  { id: 'sad', name: '悲伤', emoji: '😢', promptWord: 'sad' },
  { id: 'surprised', name: '惊讶', emoji: '😲', promptWord: 'surprised' },
  { id: 'scared', name: '恐惧', emoji: '😨', promptWord: 'scared' },
  { id: 'disgusted', name: '厌恶', emoji: '😒', promptWord: 'disgusted' },
  { id: 'calm', name: '平静', emoji: '😐', promptWord: 'calm' },
  { id: 'thinking', name: '思考', emoji: '🤔', promptWord: 'thinking' },
  { id: 'smiling', name: '微笑', emoji: '🙂', promptWord: 'smiling' },
  { id: 'crying', name: '哭泣', emoji: '😭', promptWord: 'crying' },
  { id: 'nervous', name: '紧张', emoji: '😰', promptWord: 'nervous' },
  { id: 'determined', name: '坚定', emoji: '😤', promptWord: 'determined' },
]

export const ACTIONS = [
  { id: 'walking', name: '行走', emoji: '🚶', promptWord: 'walking' },
  { id: 'running', name: '奔跑', emoji: '🏃', promptWord: 'running' },
  { id: 'sitting', name: '坐下', emoji: '🪑', promptWord: 'sitting' },
  { id: 'standing-up', name: '站起', emoji: '🧍', promptWord: 'standing up' },
  { id: 'turning', name: '转身', emoji: '🔄', promptWord: 'turning around' },
  { id: 'waving', name: '挥手', emoji: '👋', promptWord: 'waving' },
  { id: 'nodding', name: '点头', emoji: '😌', promptWord: 'nodding' },
  { id: 'shaking-head', name: '摇头', emoji: '🙅', promptWord: 'shaking head' },
  { id: 'hugging', name: '拥抱', emoji: '🤗', promptWord: 'hugging' },
  { id: 'pointing', name: '指向', emoji: '👉', promptWord: 'pointing' },
]

export const POSITIONS = [
  { id: 'center', name: '画面中央', promptWord: 'in the center' },
  { id: 'left', name: '左侧', promptWord: 'on the left' },
  { id: 'right', name: '右侧', promptWord: 'on the right' },
  { id: 'foreground', name: '前景', promptWord: 'in the foreground' },
  { id: 'background', name: '背景', promptWord: 'in the background' },
]

/**
 * 构建角色表情动作的 prompt 片段
 * @param {Object} characterAction - { expression, action, position }
 * @param {string} characterName
 */
export function buildCharacterActionPrompt(characterName, characterAction = {}) {
  const parts = []
  const { expression, action, position } = characterAction

  if (expression) {
    const expr = EXPRESSIONS.find((e) => e.id === expression)
    if (expr) parts.push(expr.promptWord)
  }

  if (action) {
    const act = ACTIONS.find((a) => a.id === action)
    if (act) parts.push(act.promptWord)
  }

  if (parts.length === 0 && !position) return ''

  let prompt = characterName
  if (parts.length > 0) {
    prompt += ` is ${parts.join(' and ')}`
  }
  if (position) {
    const pos = POSITIONS.find((p) => p.id === position)
    if (pos) prompt += `, ${pos.promptWord}`
  }

  return prompt
}

export default { EXPRESSIONS, ACTIONS, POSITIONS, buildCharacterActionPrompt }
