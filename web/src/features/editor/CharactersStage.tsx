import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { Character, Project } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'

type Props = {
  project: Project
  onRefresh: () => void
  onNavigateStage: (stage: string) => void
}

export function CharactersStage({ project, onRefresh, onNavigateStage }: Props) {
  const { t } = useLang()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loginRequired, setLoginRequired] = useState(false)

  const characters = project.characters ?? []

  const createMutation = useMutation({
    mutationFn: () =>
      api.createCharacter({
        name: name.trim(),
        description: description.trim() || undefined,
        projectId: project.id,
      }),
    onSuccess: () => {
      setName('')
      setDescription('')
      setCreateOpen(false)
      setLoginRequired(false)
      onRefresh()
      showToast(t('角色已创建', 'Character created'))
    },
    onError: (error: Error) => {
      if (/401|未登录|unauthorized/i.test(error.message)) {
        setLoginRequired(true)
      }
      showToast(error.message, 'error')
    },
  })

  const lockMutation = useMutation({
    mutationFn: (character: Character) =>
      api.lockCharacter(character.id, {
        projectId: project.id,
        referenceImages: character.referenceImages ?? [],
      }),
    onSuccess: () => {
      onRefresh()
      showToast(t('角色已锁定，生成时会保持外观一致', 'Character locked'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <div className="ed-stage-body">
      <section className="dr-card ed-char-head">
        <div>
          <strong>{t('角色库', 'Characters')}</strong>
          <div className="dr-hint">
            {t(
              `${characters.length} 个角色；参考图来自「图片」页，锁定后用于跨镜头一致性。`,
              `${characters.length} characters. References come from the Images stage.`
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="dr-btn" onClick={() => onNavigateStage('images')}>
            <Icon name="template" size={15} />
            {t('生成参考图', 'Generate reference')}
          </button>
          <button type="button" className="dr-btn dr-btn-primary" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={15} />
            {t('新建角色', 'New character')}
          </button>
        </div>
      </section>

      {characters.length === 0 ? (
        <div className="dr-card dr-state" style={{ padding: 52 }}>
          <div className="dr-state-icon">
            <Icon name="user" size={22} />
          </div>
          <div className="dr-state-title">{t('还没有角色', 'No characters yet')}</div>
          <div>
            {t(
              '在「剧本」生成角色，或手动新建；再到「图片」页生成并应用参考图。',
              'Generate a script or create one manually.'
            )}
          </div>
          <button type="button" className="dr-btn dr-btn-primary" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={15} />
            {t('新建角色', 'New character')}
          </button>
        </div>
      ) : (
        <div className="ed-char-grid">
          {characters.map((character) => {
            const refs = character.referenceImages ?? []
            return (
              <article className="dr-card ed-char-card" key={character.id}>
                <div className="ed-char-avatar">
                  {refs[0] ? (
                    <img src={refs[0]} alt="" loading="lazy" onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }} />
                  ) : (
                    <Icon name="user" size={26} />
                  )}
                </div>
                <div className="ed-char-body">
                  <div className="ed-char-name">
                    {character.name}
                    {character.isLocked ? (
                      <span className="dr-status is-completed">
                        <span className="dr-dot" />
                        {t('已锁定', 'Locked')}
                      </span>
                    ) : null}
                  </div>
                  <p className="ed-char-desc">{character.description || t('暂无描述', 'No description')}</p>
                  <div className="ed-char-meta">
                    {t('参考图', 'References')}: {refs.length}
                  </div>
                </div>
                <div className="ed-char-actions">
                  {refs.length === 0 ? (
                    <button
                      type="button"
                      className="dr-btn"
                      onClick={() => onNavigateStage('images')}
                    >
                      {t('去添加参考图', 'Add reference')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="dr-btn dr-btn-primary"
                      disabled={lockMutation.isPending}
                      onClick={() => lockMutation.mutate(character)}
                    >
                      <Icon name="shield" size={15} />
                      {character.isLocked ? t('重新锁定', 'Re-lock') : t('锁定角色', 'Lock')}
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal
        open={createOpen}
        title={t('新建角色', 'New character')}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button type="button" className="dr-btn" onClick={() => setCreateOpen(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              type="button"
              className="dr-btn dr-btn-primary"
              disabled={createMutation.isPending || !name.trim()}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? t('创建中…', 'Creating…') : t('创建', 'Create')}
            </button>
          </>
        }
      >
        <div className="dr-field">
          <label className="dr-label" htmlFor="character-name">
            {t('角色名', 'Name')} <span aria-hidden="true">*</span>
          </label>
          <input
            id="character-name"
            className="dr-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('例如：林默', 'e.g. Lin Mo')}
          />
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="character-description">
            {t('描述', 'Description')}
          </label>
          <textarea
            id="character-description"
            className="dr-input"
            style={{ minHeight: 72, padding: '8px 10px', resize: 'vertical' }}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('外貌、性格、服装…', 'Appearance, personality, wardrobe…')}
          />
        </div>
        {loginRequired ? (
          <p className="dr-error">
            {t('创建角色需要登录。', 'Sign in to create characters.')}{' '}
            <a href="#/login" style={{ textDecoration: 'underline' }}>
              {t('去登录', 'Sign in')}
            </a>
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
