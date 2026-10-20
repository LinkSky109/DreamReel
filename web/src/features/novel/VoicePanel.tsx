import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { NovelVoiceOption } from '../../domain/types'
import { Modal } from '../../components/Modal'
import { AuthAudio } from '../../components/AuthAudio'
import './VoicePanel.css'

type BuilderMode = 'clone' | 'design'

export function VoicePanel({ novelId }: { novelId: string }) {
  const { t } = useLang()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ name: string; url: string; duration?: string | number } | null>(null)
  const [customSpeaker, setCustomSpeaker] = useState<string | null>(null)
  const [customValue, setCustomValue] = useState('')
  const [builderOpen, setBuilderOpen] = useState(false)
  const [mode, setMode] = useState<BuilderMode>('clone')
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [cloneText, setCloneText] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [speakerId, setSpeakerId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [builderMsg, setBuilderMsg] = useState('')

  const voicesQuery = useQuery({
    queryKey: ['novel-voices', novelId],
    queryFn: () => api.getNovelVoices(novelId),
  })

  const data = voicesQuery.data
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['novel-voices', novelId] })

  const saveVoice = async (speaker: string, voice: string) => {
    setBusy(`save-${speaker}`)
    try {
      await api.setNovelVoice(novelId, { speaker, voice })
      showToast(t(`「${speaker}」音色已保存`, `${speaker} voice saved`), 'success')
      refresh()
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const onSelect = (speaker: string, value: string) => {
    if (value === '__custom__') {
      setCustomSpeaker(speaker)
      setCustomValue(data?.map[speaker] ?? '')
      return
    }
    void saveVoice(speaker, value)
  }

  const doPreview = async (speaker: string, voice: string) => {
    if (!voice) {
      showToast(t('请先选择音色', 'Choose a voice first'), 'error')
      return
    }
    setBusy(`preview-${speaker}`)
    try {
      const result = await api.previewNovelVoice(novelId, { voice })
      setPreview({ name: speaker, url: result.audioUrl, duration: result.duration })
    } catch (error) {
      showToast(t('试听失败：', 'Preview failed: ') + (error as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const reset = async () => {
    setBusy('reset')
    try {
      await api.resetNovelVoices(novelId)
      showToast(t('已重置为自动分配', 'Reset to auto assignment'), 'success')
      refresh()
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const options = (voice: string) => {
    const catalog: NovelVoiceOption[] = data?.catalog ?? []
    const custom = data?.custom ?? []
    const known = [...catalog, ...custom].some((item) => item.id === voice)
    return (
      <>
        <option value="">{t('（默认）', '(default)')}</option>
        {catalog.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}（{item.gender}）
          </option>
        ))}
        {custom.length ? (
          <optgroup label={t('自建音色', 'Custom voices')}>
            {custom.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}（{item.type === 'design' ? t('设计', 'design') : t('复刻', 'clone')}）
              </option>
            ))}
          </optgroup>
        ) : null}
        {voice && !known ? <option value={voice}>{t('自定义：', 'Custom: ')}{voice}</option> : null}
        <option value="__custom__">{t('自定义 ID…', 'Custom ID…')}</option>
      </>
    )
  }

  const readBase64 = (file: File) =>
    new Promise<{ base64: string; format: string }>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error(t('读取音频失败', 'Failed to read audio')))
      reader.onload = () => {
        const match = String(reader.result ?? '').match(/^data:([^;]+);base64,(.*)$/)
        if (!match) return reject(new Error(t('音频格式无法识别', 'Unsupported audio format')))
        const format = (match[1].split('/')[1] || '').replace('mpeg', 'mp3').replace('x-wav', 'wav')
        resolve({ base64: match[2], format })
      }
      reader.readAsDataURL(file)
    })

  const submitBuilder = async () => {
    if (!name.trim()) {
      setBuilderMsg(t('请填音色名称', 'Enter a voice name'))
      return
    }
    setBusy('builder')
    setBuilderMsg('')
    try {
      if (mode === 'clone') {
        if (!audioFile) {
          setBuilderMsg(t('请选择音频样本', 'Choose an audio sample'))
          return
        }
        const { base64, format } = await readBase64(audioFile)
        await api.cloneNovelVoice(novelId, {
          name: name.trim(),
          gender: gender.trim(),
          audioBase64: base64,
          format,
          text: cloneText.trim(),
          assignTo: assignTo || undefined,
        })
        showToast(t(`音色「${name.trim()}」已复刻`, `Voice "${name.trim()}" cloned`), 'success')
      } else {
        if (!speakerId.trim()) {
          setBuilderMsg(t('音色设计需填已购买的 speaker_id', 'speaker_id is required for voice design'))
          return
        }
        await api.designNovelVoice(novelId, {
          name: name.trim(),
          gender: gender.trim(),
          speakerId: speakerId.trim(),
          textPrompt: prompt.trim(),
          assignTo: assignTo || undefined,
        })
        showToast(t(`音色「${name.trim()}」已生成`, `Voice "${name.trim()}" designed`), 'success')
      }
      setBuilderOpen(false)
      setName('')
      setGender('')
      setAssignTo('')
      setCloneText('')
      setAudioFile(null)
      setSpeakerId('')
      setPrompt('')
      refresh()
    } catch (error) {
      setBuilderMsg(`❌ ${(error as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  if (voicesQuery.isLoading) return <div className="dr-skeleton" style={{ height: 140 }} />
  if (voicesQuery.isError) {
    return (
      <div className="dr-card dr-state">
        <p>{t('音色加载失败', 'Failed to load voices')}：{(voicesQuery.error as Error).message}</p>
        <button className="dr-btn" type="button" onClick={() => voicesQuery.refetch()}>
          {t('重试', 'Retry')}
        </button>
      </div>
    )
  }

  return (
    <section className="dr-card dr-voice-card">
      <div className="dr-voice-head">
        <div>
          <h2>{t('角色音色（固定，跨全集一致）', 'Character voices')}</h2>
          <p className="dr-novel-note">
            {t(
              '每个角色固定一把声音，旁白单独一轨；可选内置/自建音色或自定义 ID。',
              'Each character keeps one voice; narrator is separate. Built-in, custom or raw IDs supported.'
            )}
          </p>
        </div>
        <div className="dr-voice-actions">
          <button className="dr-btn dr-btn-primary" type="button" onClick={() => setBuilderOpen(true)}>
            {t('新建音色', 'New voice')}
          </button>
          <button className="dr-btn" type="button" disabled={Boolean(busy)} onClick={reset}>
            {t('重置为自动分配', 'Reset to auto')}
          </button>
        </div>
      </div>

      <div className="dr-voice-rows">
        <div className="dr-voice-row">
          <strong>{t('旁白', 'Narrator')}</strong>
          <select
            className="dr-input"
            value={data?.narrator ?? ''}
            disabled={Boolean(busy)}
            onChange={(event) => onSelect('旁白', event.target.value)}
          >
            {options(data?.narrator ?? '')}
          </select>
          <button className="dr-btn" type="button" disabled={Boolean(busy)} onClick={() => doPreview('旁白', data?.narrator ?? '')}>
            {t('试听', 'Preview')}
          </button>
        </div>

        {(data?.characters ?? []).map((character) => (
          <div className="dr-voice-row" key={character.name}>
            <strong title={character.name}>
              {character.name}
              {character.gender ? <span>·{character.gender}</span> : null}
            </strong>
            <select
              className="dr-input"
              value={character.voice}
              disabled={Boolean(busy)}
              onChange={(event) => onSelect(character.name, event.target.value)}
            >
              {options(character.voice)}
            </select>
            <button className="dr-btn" type="button" disabled={Boolean(busy)} onClick={() => doPreview(character.name, character.voice)}>
              {t('试听', 'Preview')}
            </button>
          </div>
        ))}
        {!(data?.characters ?? []).length ? (
          <p className="dr-novel-note">{t('暂无角色，先抽取角色后再分配音色。', 'No characters yet; extract characters first.')}</p>
        ) : null}
      </div>

      {preview ? (
        <div className="dr-voice-preview">
          <AuthAudio src={preview.url} />
          <span>
            {preview.name} {t('试听', 'preview')}
            {preview.duration ? `（${preview.duration}s）` : ''}
          </span>
        </div>
      ) : null}

      {(data?.custom ?? []).length ? (
        <p className="dr-novel-note">
          {t('自建音色：', 'Custom voices: ')}
          {data?.custom.map((voice) => `${voice.name}（${voice.type === 'design' ? t('设计', 'design') : t('复刻', 'clone')}）`).join('、')}
        </p>
      ) : null}

      <Modal
        open={customSpeaker !== null}
        title={t('自定义音色 ID', 'Custom voice ID')}
        onClose={() => setCustomSpeaker(null)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setCustomSpeaker(null)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              onClick={() => {
                if (customSpeaker) void saveVoice(customSpeaker, customValue.trim())
                setCustomSpeaker(null)
              }}
            >
              {t('保存', 'Save')}
            </button>
          </>
        }
      >
        <label className="dr-field">
          <span>{t('音色 ID（如 S_xxx / ICL_...）', 'Voice ID (e.g. S_xxx / ICL_...)')}</span>
          <input className="dr-input" value={customValue} onChange={(event) => setCustomValue(event.target.value)} />
        </label>
      </Modal>

      <Modal
        open={builderOpen}
        title={t('新建音色', 'New voice')}
        onClose={() => (!busy ? setBuilderOpen(false) : undefined)}
        width={620}
        footer={
          <>
            <button className="dr-btn" type="button" disabled={Boolean(busy)} onClick={() => setBuilderOpen(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button className="dr-btn dr-btn-primary" type="button" disabled={Boolean(busy)} onClick={submitBuilder}>
              {busy === 'builder' ? t('生成中…', 'Generating…') : t('生成并保存', 'Generate')}
            </button>
          </>
        }
      >
        <div className="dr-voice-builder">
          <div className="dr-voice-builder-row">
            <select className="dr-input" value={mode} onChange={(event) => setMode(event.target.value as BuilderMode)}>
              <option value="clone">{t('声音复刻（上传音频样本）', 'Voice clone (audio sample)')}</option>
              <option value="design">{t('音色设计（文本描述）', 'Voice design (text prompt)')}</option>
            </select>
            <input className="dr-input" placeholder={t('音色名称', 'Voice name')} value={name} onChange={(event) => setName(event.target.value)} />
            <input className="dr-input dr-voice-gender" placeholder={t('性别(男/女)', 'Gender')} value={gender} onChange={(event) => setGender(event.target.value)} />
          </div>
          <div className="dr-voice-builder-row">
            <select className="dr-input" value={assignTo} onChange={(event) => setAssignTo(event.target.value)}>
              <option value="">{t('生成后不指派', 'Do not assign')}</option>
              <option value="旁白">{t('指派给：旁白', 'Assign to narrator')}</option>
              {(data?.characters ?? []).map((character) => (
                <option key={character.name} value={character.name}>
                  {t('指派给：', 'Assign to: ')}
                  {character.name}
                </option>
              ))}
            </select>
          </div>

          {mode === 'clone' ? (
            <div className="dr-voice-builder-row">
              <input
                type="file"
                accept="audio/*"
                onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}
              />
              <input
                className="dr-input"
                placeholder={t('参考文本（选填）', 'Reference text (optional)')}
                value={cloneText}
                onChange={(event) => setCloneText(event.target.value)}
              />
            </div>
          ) : (
            <div className="dr-voice-builder-row">
              <input
                className="dr-input"
                placeholder={t('已购买的 speaker_id', 'Purchased speaker_id')}
                value={speakerId}
                onChange={(event) => setSpeakerId(event.target.value)}
              />
              <input
                className="dr-input"
                placeholder={t('音色描述', 'Voice description')}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>
          )}

          <p className="dr-novel-note">
            {t(
              '计费提醒：声音复刻首次合成、音色设计槽位均可能产生费用；复刻后 7 天未合成会自动清理。',
              'Billing: cloning and design slots may incur charges; unused clones are cleaned after 7 days.'
            )}
          </p>
          {builderMsg ? <p className="dr-voice-builder-msg">{builderMsg}</p> : null}
        </div>
      </Modal>
    </section>
  )
}
