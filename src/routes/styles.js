import { Router } from 'express'
import { styleService } from '../services/styleService.js'

const router = Router()

// 列出所有风格预设
router.get('/', (req, res) => {
  try {
    const { search } = req.query
    const styles = styleService.listStyles({ search })
    res.json({ total: styles.length, items: styles })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 获取单个风格详情
router.get('/:styleId', (req, res) => {
  try {
    const style = styleService.getStyleSummary(req.params.styleId)
    res.json(style)
  } catch (error) {
    res.status(404).json({ error: error.message })
  }
})

// 预览风格修饰后的 prompt
router.post('/preview', (req, res) => {
  try {
    const { prompt, styleId } = req.body
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' })
    }
    const styledPrompt = styleService.applyStyleToPrompt(prompt, styleId || 'none')
    const style = styleId && styleId !== 'none' ? styleService.getStyle(styleId) : null
    res.json({
      original: prompt,
      styled: styledPrompt,
      style: style ? { id: style.id, name: style.name } : null,
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
