import { useState } from 'react'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { Project, SubtitleStyle } from '../../domain/types'
import { Icon } from '../../components/Icon'
import type { SaveState } from './EditorPage'
import { subtitlePreviewStyle } from './audio'

type Props = {
  project: Project
  onUpdated: (project: Project) => void
  onSaveState: (state: SaveState) => void
}

const FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'PingFang SC', 'Microsoft YaHei', 'SimHei']

export function SubtitleStyleCard({ project, onUpdated, onSaveState }: Props) {
  const { t } = useLang()
  const [style, setStyle] = useState<SubtitleStyle>({
    fontFamily: 'Arial',
    fontSize: 24,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    position: 'bottom',
    bold: false,
    italic: false,
    shadow: true,
    bilingual: false,
    secondaryLanguage: 'en',
    ...(project.subtitleStyle ?? {}),
  })
  const [saving, setSaving] = useState(false)

  const patch = (next: Partial<SubtitleStyle>) => setStyle((current) => ({ ...current, ...next }))

  const save = async () => {
    setSaving(true)
    onSaveState('saving')
    try {
      const updated = await api.updateProject(project.id, { subtitleStyle: style })
      onUpdated(updated)
      onSaveState('saved')
      showToast(t('字幕样式已保存', 'Subtitle style saved'))
    } catch (error) {
      onSaveState('error')
      showToast((error as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const previewPosition =
    style.position === 'top'
      ? { top: 10 }
      : style.position === 'center'
        ? { top: '50%', transform: 'translate(-50%, -50%)' }
        : { bottom: 10 }

  return (
    <section className="dr-card ed-subtitle-card">
      <div className="ed-section-title-row">
        <strong>{t('字幕样式', 'Subtitle style')}</strong>
        <button type="button" className="dr-btn dr-btn-primary" disabled={saving} onClick={() => void save()}>
          <Icon name="check" size={15} />
          {saving ? t('保存中…', 'Saving…') : t('保存字幕样式', 'Save style')}
        </button>
      </div>

      <div className="ed-subtitle-controls">
        <div className="dr-field">
          <label className="dr-label" htmlFor="subtitle-font">
            {t('字体', 'Font')}
          </label>
          <select
            id="subtitle-font"
            className="dr-select"
            value={style.fontFamily}
            onChange={(event) => patch({ fontFamily: event.target.value })}
          >
            {FONTS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="subtitle-size">
            {t('字号', 'Size')} {style.fontSize}px
          </label>
          <input
            id="subtitle-size"
            type="range"
            min={14}
            max={48}
            value={style.fontSize}
            onChange={(event) => patch({ fontSize: Number(event.target.value) })}
          />
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="subtitle-color">
            {t('字体颜色', 'Text color')}
          </label>
          <input
            id="subtitle-color"
            type="color"
            className="ed-color-input"
            value={style.fontColor}
            onChange={(event) => patch({ fontColor: event.target.value })}
          />
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="subtitle-stroke">
            {t('描边颜色', 'Stroke color')}
          </label>
          <input
            id="subtitle-stroke"
            type="color"
            className="ed-color-input"
            value={style.strokeColor}
            onChange={(event) => patch({ strokeColor: event.target.value })}
          />
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="subtitle-stroke-width">
            {t('描边宽度', 'Stroke')} {style.strokeWidth}px
          </label>
          <input
            id="subtitle-stroke-width"
            type="range"
            min={0}
            max={6}
            value={style.strokeWidth}
            onChange={(event) => patch({ strokeWidth: Number(event.target.value) })}
          />
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="subtitle-position">
            {t('位置', 'Position')}
          </label>
          <select
            id="subtitle-position"
            className="dr-select"
            value={style.position}
            onChange={(event) => patch({ position: event.target.value as SubtitleStyle['position'] })}
          >
            <option value="bottom">{t('底部', 'Bottom')}</option>
            <option value="top">{t('顶部', 'Top')}</option>
            <option value="center">{t('居中', 'Center')}</option>
          </select>
        </div>
      </div>

      <div className="ed-subtitle-checks">
        {[
          { key: 'bold' as const, label: t('粗体', 'Bold') },
          { key: 'italic' as const, label: t('斜体', 'Italic') },
          { key: 'shadow' as const, label: t('阴影', 'Shadow') },
          { key: 'bilingual' as const, label: t('双语', 'Bilingual') },
        ].map((item) => (
          <label className="ed-check" key={item.key}>
            <input
              type="checkbox"
              checked={Boolean(style[item.key])}
              onChange={(event) => patch({ [item.key]: event.target.checked })}
            />
            {item.label}
          </label>
        ))}
        {style.bilingual ? (
          <select
            className="dr-select"
            value={style.secondaryLanguage}
            onChange={(event) => patch({ secondaryLanguage: event.target.value })}
            aria-label={t('第二语言', 'Secondary language')}
          >
            <option value="en">English</option>
            <option value="zh">{t('中文', 'Chinese')}</option>
            <option value="ja">{t('日语', 'Japanese')}</option>
          </select>
        ) : null}
      </div>

      <div className="ed-subtitle-preview" aria-label={t('字幕预览', 'Subtitle preview')}>
        <span
          className="ed-subtitle-preview-text"
          style={{
            ...subtitlePreviewStyle(style),
            left: '50%',
            transform:
              style.position === 'center' ? 'translate(-50%, -50%)' : 'translateX(-50%)',
            ...previewPosition,
          }}
        >
          {t('字幕预览', 'Subtitle preview')}
          {style.bilingual ? (
            <>
              <br />
              <small style={{ opacity: 0.8 }}>Subtitle preview</small>
            </>
          ) : null}
        </span>
      </div>
    </section>
  )
}
