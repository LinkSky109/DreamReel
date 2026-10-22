/**
 * 角色音色固定（每部小说一份 voiceMap：角色名 → 音色ID，跨全集一致）。
 * 分配规则：按角色性别优先 + 名字哈希稳定选取，保证"同一角色永远是同一把声音"。
 * 旁白使用专属解说音色。
 */
import { updateNovelProject } from './novelProjectService.js'
import { getNovelProjectAsync, listCharactersAsync } from './novelAsyncReadService.js'
import { isGenericName } from '../utils/nameFilters.js'
import { listVoiceAssets } from './voiceLibraryService.js'

// 豆包语音合成 2.0（uranus_bigtts）中文音色——全部经 seed-tts-2.0 真实合成探测可用。
// 新增音色请先用 scripts/verify-voices.js 实测，避免把不可用 ID 放进目录。
export const VOICE_CATALOG = [
  // 男声
  { id: 'zh_male_m191_uranus_bigtts', name: '云舟 2.0', gender: '男', tags: ['稳重', '旁白'] },
  { id: 'zh_male_taocheng_uranus_bigtts', name: '小天 2.0', gender: '男', tags: ['青年'] },
  { id: 'zh_male_yangguangqingnian_uranus_bigtts', name: '阳光青年 2.0', gender: '男', tags: ['阳光'] },
  { id: 'zh_male_shaonianzixin_uranus_bigtts', name: '少年自信 2.0', gender: '男', tags: ['少年'] },
  { id: 'zh_male_ruyayichen_uranus_bigtts', name: '儒雅逸辰 2.0', gender: '男', tags: ['儒雅'] },
  { id: 'zh_male_wennuanahu_uranus_bigtts', name: '温暖阿虎 2.0', gender: '男', tags: ['温暖'] },
  // 女声
  { id: 'zh_female_vv_uranus_bigtts', name: 'Vivi 2.0', gender: '女', tags: ['通用'] },
  { id: 'zh_female_xiaohe_uranus_bigtts', name: '小何 2.0', gender: '女', tags: ['通用'] },
  { id: 'zh_female_wenrouxiaoya_uranus_bigtts', name: '温柔小雅 2.0', gender: '女', tags: ['温柔'] },
  { id: 'zh_female_shuangkuaisisi_uranus_bigtts', name: '爽快思思 2.0', gender: '女', tags: ['爽快'] },
  { id: 'zh_female_cancan_uranus_bigtts', name: '灿灿 2.0', gender: '女', tags: ['活泼'] },
  { id: 'zh_female_tianmeixiaoyuan_uranus_bigtts', name: '甜美小源 2.0', gender: '女', tags: ['甜美'] },
  { id: 'zh_female_qingxinnvsheng_uranus_bigtts', name: '清新女声 2.0', gender: '女', tags: ['清新'] },
  { id: 'zh_female_gaolengyujie_uranus_bigtts', name: '高冷御姐 2.0', gender: '女', tags: ['御姐'] },
  { id: 'zh_female_meilinvyou_uranus_bigtts', name: '魅力女友 2.0', gender: '女', tags: ['甜媚'] },
  { id: 'zh_female_tianmeitaozi_uranus_bigtts', name: '甜美桃子 2.0', gender: '女', tags: ['甜美'] },
]
export const NARRATOR_VOICE = 'zh_male_m191_uranus_bigtts' // 旁白：云舟（稳重大气）

function hashName(s) {
  let h = 0
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0
  return h
}

/** 取得/补齐该小说的 voiceMap（缺失的角色按性别+名字稳定分配并落盘） */
export async function ensureVoiceMap(novelId) {
  const project = await getNovelProjectAsync(novelId)
  const map = { ...(project.voiceMap || {}) }
  let changed = false
  if (!map['旁白']) {
    map['旁白'] = NARRATOR_VOICE
    changed = true
  }
  for (const c of await listCharactersAsync(novelId)) {
    if (!c.name || isGenericName(c.name) || map[c.name]) continue
    const g = String((c.card && c.card.gender) || '')
    const pool = VOICE_CATALOG.filter((v) => (g.includes('女') ? v.gender === '女' : g.includes('男') ? v.gender === '男' : true))
    const pick = pool[hashName(c.name) % pool.length] || VOICE_CATALOG[0]
    map[c.name] = pick.id
    changed = true
  }
  if (changed) await updateNovelProject(novelId, { voiceMap: map })
  return map
}

export function voiceFor(map, speaker) {
  if (!speaker) return map['旁白'] || NARRATOR_VOICE
  return map[speaker] || map['旁白'] || NARRATOR_VOICE
}

/** 手动设置某说话人的音色（支持任意自定义音色 ID，如声音复刻的 S_xxx / ICL_...） */
export async function setVoice(novelId, speaker, voiceId) {
  if (!speaker) throw new Error('缺少说话人')
  const project = await getNovelProjectAsync(novelId)
  const map = { ...(project.voiceMap || {}) }
  if (voiceId === null || voiceId === undefined || voiceId === '') delete map[speaker]
  else map[speaker] = String(voiceId).trim()
  await updateNovelProject(novelId, { voiceMap: map })
  return map
}

/** 清空并重新自动分配 */
export async function resetVoices(novelId) {
  await updateNovelProject(novelId, { voiceMap: {} })
  return ensureVoiceMap(novelId)
}

/** 供 UI 使用：当前映射 + 可选音色表 + 旁白音色 + 自建音色 */
export async function listVoiceAssignments(novelId) {
  const map = await ensureVoiceMap(novelId)
  const characters = (await listCharactersAsync(novelId))
    .filter((c) => c.name && !isGenericName(c.name))
    .map((c) => ({ name: c.name, gender: String((c.card && c.card.gender) || ''), voice: map[c.name] || '' }))
  return {
    narrator: map['旁白'] || NARRATOR_VOICE,
    catalog: VOICE_CATALOG,
    custom: listVoiceAssets(novelId).map((v) => ({
      id: v.speakerId,
      name: v.name,
      gender: v.gender || '',
      type: v.type,
      demoAudioUrl: v.demoAudioUrl || '',
    })),
    characters,
    map,
  }
}

export default { VOICE_CATALOG, NARRATOR_VOICE, ensureVoiceMap, voiceFor, setVoice, resetVoices, listVoiceAssignments }
