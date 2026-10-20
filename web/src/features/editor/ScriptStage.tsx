import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { Project, ProjectScript, ScriptScene } from '../../domain/types'
import { Icon } from '../../components/Icon'
import type { SaveState } from './EditorPage'
import { downloadText, scriptToText } from './utils'

type Props = {
  project: Project
  onUpdated: (project: Project) => void
  onSaveState: (state: SaveState) => void
}

function normalizeScript(script?: ProjectScript): ProjectScript {
  return {
    synopsis: script?.synopsis ?? '',
    characters: script?.characters ?? [],
    shots: (script?.shots ?? []).map((scene) => ({
      description: scene.description ?? '',
      dialogue: scene.dialogue ?? '',
      narration: scene.narration ?? '',
      duration: scene.duration ?? 5,
      shotType: scene.shotType,
      cameraMovement: scene.cameraMovement,
    })),
  }
}

export function ScriptStage({ project, onUpdated, onSaveState }: Props) {
  const { t } = useLang()
  const [draft, setDraft] = useState<ProjectScript>(() => normalizeScript(project.script))
  const [dirty, setDirty] = useState(false)
  const [idea, setIdea] = useState('')
  const savedSnapshot = useRef(JSON.stringify(normalizeScript(project.script)))

  const scenes = draft.shots ?? []

  useEffect(() => {
    const incoming = normalizeScript(project.script)
    const incomingSnapshot = JSON.stringify(incoming)
    if (!dirty && incomingSnapshot !== savedSnapshot.current) {
      savedSnapshot.current = incomingSnapshot
      setDraft(incoming)
    }
  }, [project.script, dirty])

  const saveNow = async () => {
    onSaveState('saving')
    try {
      const updated = await api.updateProject(project.id, { script: draft })
      savedSnapshot.current = JSON.stringify(draft)
      setDirty(false)
      onUpdated(updated)
      onSaveState('saved')
    } catch (error) {
      onSaveState('error')
      showToast((error as Error).message, 'error')
    }
  }

  useEffect(() => {
    if (!dirty) return
    onSaveState('saving')
    const timer = window.setTimeout(() => {
      void saveNow()
    }, 800)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty])

  const generateMutation = useMutation({
    mutationFn: () =>
      api.generateScript({
        idea: idea.trim(),
        targetDuration: project.targetDuration,
        platform: project.platform,
        projectId: project.id,
      }),
    onSuccess: async (script) => {
      const normalized = normalizeScript(script)
      savedSnapshot.current = JSON.stringify(normalized)
      setDraft(normalized)
      setDirty(false)
      onSaveState('saved')
      try {
        const updated = await api.getProject(project.id)
        onUpdated(updated)
      } catch {
        // 项目刷新失败不影响剧本展示
      }
      showToast(
        t(
          `剧本生成完成：${script.shots?.length ?? 0} 个分镜，${script.characters?.length ?? 0} 个角色`,
          `Script ready: ${script.shots?.length ?? 0} scenes`
        )
      )
      setIdea('')
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const updateScene = (index: number, patch: Partial<ScriptScene>) => {
    const next = scenes.map((scene, sceneIndex) =>
      sceneIndex === index ? { ...scene, ...patch } : scene
    )
    setDraft({ ...draft, shots: next })
    setDirty(true)
  }

  const removeScene = (index: number) => {
    setDraft({ ...draft, shots: scenes.filter((_, sceneIndex) => sceneIndex !== index) })
    setDirty(true)
  }

  const addScene = () => {
    setDraft({
      ...draft,
      shots: [
        ...scenes,
        { description: '', dialogue: '', narration: '', duration: 5, shotType: 'medium', cameraMovement: 'static' },
      ],
    })
    setDirty(true)
  }

  const wordCount = useMemo(
    () =>
      [draft.synopsis ?? '', ...scenes.flatMap((scene) => [scene.description, scene.dialogue, scene.narration])]
        .join('')
        .replace(/\s/g, '').length,
    [draft, scenes]
  )

  return (
    <div className="ed-stage-body">
      <section className="ed-idea dr-card">
        <div className="ed-idea-icon">
          <Icon name="sparkles" size={18} />
        </div>
        <div className="ed-idea-main">
          <label className="dr-label" htmlFor="script-idea">
            {scenes.length > 0 ? t('重新生成剧本', 'Regenerate script') : t('一句话生成剧本', 'Script from one line')}
          </label>
          <input
            id="script-idea"
            className="dr-input"
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder={t('例如：一个宇航员在火星种花的故事', 'e.g. An astronaut growing flowers on Mars')}
          />
          {scenes.length > 0 ? (
            <span className="dr-hint">
              {t('重新生成会替换当前剧本与镜头，请先确认。', 'Regenerating replaces the current script and shots.')}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="dr-btn dr-btn-primary"
          disabled={generateMutation.isPending || !idea.trim()}
          onClick={() => {
            if (scenes.length > 0 && !window.confirm(t('重新生成会替换当前剧本与镜头，确定继续？', 'Replace the current script and shots?'))) {
              return
            }
            generateMutation.mutate()
          }}
        >
          {generateMutation.isPending ? t('生成中…', 'Generating…') : t('生成剧本', 'Generate')}
        </button>
      </section>

      {scenes.length === 0 ? (
        <div className="dr-card dr-state" style={{ padding: 56 }}>
          <div className="dr-state-icon">
            <Icon name="file-text" size={22} />
          </div>
          <div className="dr-state-title">{t('还没有剧本', 'No script yet')}</div>
          <div style={{ maxWidth: 460 }}>
            {t(
              '输入一句话创意，AI 会生成故事梗概、角色与分镜表；你也可以直接添加场次手写。',
              'Enter one line and AI will draft the synopsis, cast, and scenes — or add scenes manually.'
            )}
          </div>
          <button type="button" className="dr-btn" onClick={addScene}>
            <Icon name="plus" size={15} />
            {t('手动添加场次', 'Add scene manually')}
          </button>
        </div>
      ) : (
        <div className="ed-script-layout">
          <aside className="ed-script-outline" aria-label={t('场次大纲', 'Scene outline')}>
            <div className="ed-outline-head">
              <span>{t('场次', 'Scenes')}</span>
              <span className="dr-hint">{scenes.length}</span>
            </div>
            <div className="ed-outline-list">
              {scenes.map((scene, index) => (
                <a key={index} href={`#scene-${index}`} className="ed-outline-item">
                  <span className="ed-outline-no">S{String(index + 1).padStart(2, '0')}</span>
                  <span className="ed-outline-title">{scene.description || t('未命名场次', 'Untitled scene')}</span>
                </a>
              ))}
            </div>
            <div className="ed-outline-foot">
              <span className="dr-hint">
                {scenes.length} {t('场', 'scenes')} · {wordCount} {t('字', 'chars')}
              </span>
              <button type="button" className="dr-btn" onClick={addScene}>
                <Icon name="plus" size={14} />
                {t('添加场次', 'Add scene')}
              </button>
            </div>
          </aside>

          <div className="ed-script-paper">
            <div className="dr-field">
              <label className="dr-label" htmlFor="script-synopsis">
                {t('故事梗概', 'Synopsis')}
              </label>
              <textarea
                id="script-synopsis"
                className="dr-input"
                style={{ minHeight: 84, padding: '10px 12px', resize: 'vertical' }}
                value={draft.synopsis ?? ''}
                onChange={(event) => {
                  setDraft({ ...draft, synopsis: event.target.value })
                  setDirty(true)
                }}
                placeholder={t('一句话或一段话概括故事', 'Summarize the story')}
              />
            </div>

            {(draft.characters?.length ?? 0) > 0 ? (
              <div className="ed-cast">
                <div className="dr-label">{t('角色设定', 'Cast')}</div>
                <div className="ed-cast-row">
                  {draft.characters?.map((character) => (
                    <div className="ed-cast-card" key={character.name}>
                      <strong>{character.name}</strong>
                      <span>{character.description || t('暂无描述', 'No description')}</span>
                      {character.personality ? <em>{character.personality}</em> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="ed-scenes">
              {scenes.map((scene, index) => (
                <article className="ed-scene" id={`scene-${index}`} key={index}>
                  <header className="ed-scene-head">
                    <span className="ed-scene-no">S{String(index + 1).padStart(2, '0')}</span>
                    <input
                      className="dr-input ed-scene-title"
                      value={scene.description}
                      onChange={(event) => updateScene(index, { description: event.target.value })}
                      placeholder={t('场景 / 动作描述', 'Scene / action')}
                      aria-label={t(`第 ${index + 1} 场描述`, `Scene ${index + 1} description`)}
                    />
                    <button
                      type="button"
                      className="dr-icon-btn"
                      aria-label={t('删除场次', 'Delete scene')}
                      onClick={() => removeScene(index)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </header>

                  <div className="ed-scene-grid">
                    <div className="dr-field">
                      <label className="dr-label" htmlFor={`dialogue-${index}`}>
                        {t('对白', 'Dialogue')}
                      </label>
                      <input
                        id={`dialogue-${index}`}
                        className="dr-input"
                        value={scene.dialogue ?? ''}
                        onChange={(event) => updateScene(index, { dialogue: event.target.value })}
                        placeholder={t('说话人：台词', 'Speaker: line')}
                      />
                    </div>
                    <div className="dr-field">
                      <label className="dr-label" htmlFor={`narration-${index}`}>
                        {t('旁白', 'Narration')}
                      </label>
                      <input
                        id={`narration-${index}`}
                        className="dr-input"
                        value={scene.narration ?? ''}
                        onChange={(event) => updateScene(index, { narration: event.target.value })}
                        placeholder={t('旁白文本', 'Narration text')}
                      />
                    </div>
                    <div className="dr-field">
                      <label className="dr-label" htmlFor={`duration-${index}`}>
                        {t('时长（秒）', 'Duration (s)')}
                      </label>
                      <input
                        id={`duration-${index}`}
                        type="number"
                        min={1}
                        max={30}
                        className="dr-input"
                        value={scene.duration ?? 5}
                        onChange={(event) => updateScene(index, { duration: Number(event.target.value) || 5 })}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="ed-script-actions">
        <button type="button" className="dr-btn" onClick={() => void saveNow()} disabled={!dirty}>
          <Icon name="check" size={15} />
          {t('保存剧本', 'Save script')}
        </button>
        <button
          type="button"
          className="dr-btn"
          onClick={() =>
            downloadText(`${project.name}-剧本.txt`, scriptToText(draft, project.name))
          }
          disabled={scenes.length === 0}
        >
          <Icon name="download" size={15} />
          {t('导出 TXT', 'Export TXT')}
        </button>
        <span className="dr-hint">
          {t(
            '剧本文本与分镜镜头分别保存；修改剧本不会自动覆盖已生成的镜头。',
            'Script text and shots are saved separately.'
          )}
        </span>
      </div>
    </div>
  )
}
