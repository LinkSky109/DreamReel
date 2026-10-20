import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VoicePanel } from './VoicePanel'
import { LangProvider } from '../../lib/i18n'

const getNovelVoices = vi.fn()
const setNovelVoice = vi.fn()
const resetNovelVoices = vi.fn()
const previewNovelVoice = vi.fn()
const cloneNovelVoice = vi.fn()
const designNovelVoice = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    getNovelVoices: (id: string) => getNovelVoices(id),
    setNovelVoice: (id: string, body: unknown) => setNovelVoice(id, body),
    resetNovelVoices: (id: string) => resetNovelVoices(id),
    previewNovelVoice: (id: string, body: unknown) => previewNovelVoice(id, body),
    cloneNovelVoice: (id: string, body: unknown) => cloneNovelVoice(id, body),
    designNovelVoice: (id: string, body: unknown) => designNovelVoice(id, body),
  },
}))

vi.mock('../../components/AuthAudio', () => ({
  AuthAudio: () => <div data-testid="auth-audio" />,
}))

const voices = {
  narrator: 'zh_male_m191_uranus_bigtts',
  catalog: [
    { id: 'zh_male_m191_uranus_bigtts', name: '云舟 2.0', gender: '男' },
    { id: 'zh_female_vv_uranus_bigtts', name: 'Vivi 2.0', gender: '女' },
  ],
  custom: [],
  characters: [
    { name: '林川', gender: '男', voice: 'zh_male_m191_uranus_bigtts' },
    { name: '赵五', gender: '男', voice: 'zh_male_m191_uranus_bigtts' },
  ],
  map: { 旁白: 'zh_male_m191_uranus_bigtts', 林川: 'zh_male_m191_uranus_bigtts' },
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LangProvider>
        <VoicePanel novelId="n1" />
      </LangProvider>
    </QueryClientProvider>
  )
}

describe('VoicePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getNovelVoices.mockResolvedValue(voices)
    setNovelVoice.mockResolvedValue({})
    resetNovelVoices.mockResolvedValue({})
    previewNovelVoice.mockResolvedValue({ audioUrl: '/storage/a.mp3', duration: 3 })
    cloneNovelVoice.mockResolvedValue({ voice: {} })
    designNovelVoice.mockResolvedValue({ voice: {} })
  })

  it('渲染旁白与角色音色', async () => {
    renderPanel()
    expect(await screen.findByText('旁白')).toBeInTheDocument()
    expect(screen.getByText('林川')).toBeInTheDocument()
    expect(screen.getByText('赵五')).toBeInTheDocument()
  })

  it('切换角色音色调用保存', async () => {
    const user = userEvent.setup()
    renderPanel()
    const row = (await screen.findByText('赵五')).closest('.dr-voice-row') as HTMLElement
    await user.selectOptions(row.querySelector('select') as HTMLSelectElement, 'zh_female_vv_uranus_bigtts')
    await waitFor(() =>
      expect(setNovelVoice).toHaveBeenCalledWith('n1', {
        speaker: '赵五',
        voice: 'zh_female_vv_uranus_bigtts',
      })
    )
  })

  it('试听合成并展示播放器', async () => {
    const user = userEvent.setup()
    renderPanel()
    const row = (await screen.findByText('林川')).closest('.dr-voice-row') as HTMLElement
    await user.click(Array.from(row.querySelectorAll('button')).find((b) => b.textContent === '试听') as HTMLElement)
    await waitFor(() => expect(previewNovelVoice).toHaveBeenCalledWith('n1', { voice: 'zh_male_m191_uranus_bigtts' }))
    expect(await screen.findByTestId('auth-audio')).toBeInTheDocument()
  })

  it('重置为自动分配', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByRole('button', { name: '重置为自动分配' }))
    await waitFor(() => expect(resetNovelVoices).toHaveBeenCalledWith('n1'))
  })

  it('音色设计提交名称/speaker/描述', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByRole('button', { name: '新建音色' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getAllByRole('combobox')[0] as HTMLSelectElement, 'design')
    await user.type(within(dialog).getByPlaceholderText('音色名称'), '低沉旁白')
    await user.type(within(dialog).getByPlaceholderText('已购买的 speaker_id'), 'speaker_1')
    await user.type(within(dialog).getByPlaceholderText('音色描述'), '低沉有力')
    await user.click(within(dialog).getByRole('button', { name: '生成并保存' }))
    await waitFor(() =>
      expect(designNovelVoice).toHaveBeenCalledWith(
        'n1',
        expect.objectContaining({ name: '低沉旁白', speakerId: 'speaker_1', textPrompt: '低沉有力' })
      )
    )
  })

  it('自定义 ID 保存', async () => {
    const user = userEvent.setup()
    renderPanel()
    const row = (await screen.findByText('林川')).closest('.dr-voice-row') as HTMLElement
    await user.selectOptions(row.querySelector('select') as HTMLSelectElement, '__custom__')
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText(/音色 ID/)
    await user.clear(input)
    await user.type(input, 'S_custom')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(setNovelVoice).toHaveBeenCalledWith('n1', { speaker: '林川', voice: 'S_custom' })
    )
  })
})
