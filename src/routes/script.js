import { Router } from 'express'
import { scriptService } from '../services/scriptService.js'
import { projectService } from '../services/projectService.js'
import { versionService } from '../services/versionService.js'
import { contentModerationService } from '../services/contentModerationService.js'
import { notificationService, NOTIFICATION_TYPE } from '../services/notificationService.js'
import { webhookService } from '../services/webhookService.js'
import {} from '../models/shot.js'

const router = Router()

// 生成剧本
router.post('/generate', async (req, res) => {
  try {
    const { idea, targetDuration, style, platform, projectId } = req.body

    if (!idea) {
      return res.status(400).json({ error: 'idea is required' })
    }

    // 内容审核：检查用户输入
    const moderation = contentModerationService.moderate(idea, {
      userId: req.user?.id,
      projectId,
      context: 'script_generate_idea',
    })

    if (!moderation.passed) {
      return res.status(403).json({
        error: '内容审核未通过',
        moderation,
      })
    }

    const script = await scriptService.generateScript({ idea, targetDuration, style, platform, projectId, userId: req.user?.id })

    // 内容审核：检查生成的剧本
    const scriptText = [script.synopsis, ...script.shots.map((s) => `${s.description} ${s.dialogue} ${s.narration}`)].join(' ')
    const scriptModeration = contentModerationService.moderate(scriptText, {
      userId: req.user?.id,
      projectId,
      context: 'script_generated',
    })

    // 如果关联了项目，自动创建角色、同步分镜到镜头列表
    if (projectId) {
      try {
        const project = await projectService.getProject(projectId)

        // 创建角色
        const characters = scriptService.createCharactersFromScript(script.characters, projectId)
        for (const char of characters) {
          project.addCharacter(char)
        }

        // 将剧本分镜同步为项目镜头（清空旧镜头）
        project.shots = []
        for (const scriptShot of script.shots) {
          const characterIds = []
          // MVP：简单关联——如果分镜描述中提到角色名，则关联
          for (const char of project.characters) {
            if (scriptShot.description.includes(char.name) || scriptShot.dialogue.includes(char.name)) {
              characterIds.push(char.id)
            }
          }

          project.addShot({
            description: scriptShot.description,
            dialogue: scriptShot.dialogue,
            narration: scriptShot.narration,
            duration: scriptShot.duration,
            shotType: scriptShot.shotType,
            cameraMovement: scriptShot.cameraMovement,
            characterIds,
          })
        }

        await projectService.updateProject(projectId, { script, shots: project.shots })

        // 自动保存版本
        versionService.saveVersion(projectId, {
          label: '剧本生成',
          description: `AI 生成剧本：${idea.slice(0, 30)}`,
          auto: true,
        }).catch(() => {})

        // 发送通知
        notificationService.create({
          userId: req.user?.id || 'default',
          type: NOTIFICATION_TYPE.SCRIPT_COMPLETED,
          title: '剧本生成完成',
          message: `项目「${project.name}」的剧本已生成，共 ${script.shots.length} 个分镜`,
          projectId,
          data: { shotCount: script.shots.length },
        })

        // 触发 Webhook
        webhookService.triggerEvent(
          'script.completed',
          {
            projectId,
            projectName: project.name,
            shotCount: script.shots.length,
            idea,
          },
          req.user?.id || 'default'
        ).catch(() => {})
      } catch (projectError) {
        console.warn('Failed to update project with script:', projectError.message)
      }
    }

    // 返回剧本和审核结果
    res.json({
      ...script,
      moderation: scriptModeration,
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 修改剧本
router.post('/revise', async (req, res) => {
  try {
    const { script, feedback } = req.body
    if (!script || !feedback) {
      return res.status(400).json({ error: 'script and feedback are required' })
    }
    const revised = await scriptService.reviseScript({ script, feedback, projectId: req.body.projectId, userId: req.user?.id })
    res.json(revised)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// R22: 剧本改编（基于已有小说/IP 文本扩写为分镜）
router.post('/adapt', async (req, res) => {
  try {
    const { sourceText, adaptationType, targetDuration, style, platform, focus, projectId } = req.body

    if (!sourceText) {
      return res.status(400).json({ error: 'sourceText is required' })
    }

    const moderation = contentModerationService.moderate(sourceText, {
      userId: req.user?.id,
      projectId,
      context: 'script_adapt_source',
    })
    if (!moderation.passed) {
      return res.status(403).json({ error: '内容审核未通过', moderation })
    }

    const script = await scriptService.adaptScript({
      sourceText,
      adaptationType,
      targetDuration,
      style,
      platform,
      focus,
      projectId,
      userId: req.user?.id,
    })

    if (projectId) {
      try {
        const project = await projectService.getProject(projectId)
        const characters = scriptService.createCharactersFromScript(script.characters, projectId)
        for (const char of characters) project.addCharacter(char)
        project.shots = []
        for (const s of script.shots) {
          const characterIds = []
          for (const char of project.characters) {
            if (s.description.includes(char.name) || s.dialogue.includes(char.name)) {
              characterIds.push(char.id)
            }
          }
          project.addShot({
            description: s.description,
            dialogue: s.dialogue,
            narration: s.narration,
            duration: s.duration,
            shotType: s.shotType,
            cameraMovement: s.cameraMovement,
            characterIds,
          })
        }
        await projectService.updateProject(projectId, { script, shots: project.shots })
        versionService.saveVersion(projectId, {
          label: '剧本改编',
          description: `AI 改编剧本（${adaptationType}）`,
          auto: true,
        }).catch(() => {})
      } catch (e) {
        console.warn('adapt sync to project failed:', e.message)
      }
    }

    res.json(script)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
