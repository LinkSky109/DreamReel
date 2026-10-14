import config from '../config/index.js'
import logger from '../utils/logger.js'
import { generateId } from '../utils/idGenerator.js'
import { storageService } from './storageService.js'
import { NovelCharacter } from '../models/NovelCharacter.js'
import { getLLMProvider } from '../providers/llmProviderFactory.js'
import { getNovelProject, updateNovelProject, writeNovelFile, assertEditable } from './novelProjectService.js'
import { listChunks } from './novelChunkService.js'

/** 常见姓氏（启发式用） */
const SURNAMES =
  '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹苏潘葛范彭鲁韦马苗方俞任袁柳史唐薛雷贺倪汤罗郝安常于傅康余顾孟黄萧尹姚邵汪毛米戴宋庞熊纪舒屈项祝董梁杜阮蓝季贾江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡凌霍虞万支柯管卢莫房解应宗丁宣邓郁单杭洪包左石崔吉龚程邢裴陆荣翁荀羊惠甄曲封松井段富巫乌焦巴牧山谷车侯全班仰秋仲伊宫宁仇甘厉祖武符刘景詹龙叶幸黎白蒲邰赖卓屠蒙池乔翟谭劳姬申冉雍桑桂牛寿通边燕冀浦尚温庄晏柴阎慕连茹艾容向古易慎戈廖庾居衡步都耿满弘匡国文寇广禄阙东欧沃利越隆师巩聂晁勾敖融冷辛那简饶空曾沙鞠丰巢关相查荆红游权益桓'

const STOPWORDS = new Set([
  '时间', '自己', '他们', '我们', '你们', '什么', '怎么', '为什么', '这里', '那里',
  '现在', '已经', '一个', '这个', '那个', '知道', '可以', '没有', '就是', '因为',
  '起来', '下来', '出去', '过来', '的话', '一声', '一样', '怎么', '于是', '终于',
])

function buildSampleText(chunks, maxChars) {
  let out = ''
  for (const c of chunks) {
    if (out.length >= maxChars) break
    out += `\n【${c.chapterTitle}】\n${c.text}\n`
  }
  return out.slice(0, maxChars)
}

const COMMON_WORDS = new Set([
  '那么', '东西', '都是', '都不', '那是', '都没', '都会', '应该', '任何', '居然', '周围', '越来越',
  '关系', '简单', '高级', '文明', '房间', '车厢', '武器', '金属', '那些', '满了', '相信', '车顶',
  '边的', '方的', '谁', '什么', '怎么', '已经', '现在', '一个', '这个', '那个', '自己', '他们',
  '我们', '你们', '这里', '那里', '知道', '可以', '没有', '就是', '因为', '起来', '下来', '出去',
  '过来', '的话', '一声', '一样', '于是', '终于', '只是', '感觉', '时候', '地方', '开始', '突然',
  '仿佛', '似乎', '好像', '依然', '只是', '整个', '所有', '继续', '终于', '立刻', '马上', '缓慢',
])

const PUNCT = new Set(['，', '。', '！', '？', '、', '：', '；', '“', '”', '「', '」', '『', '』', '…', '\n', ' ', '\u3000', '（', '）', '(', ')'])

/** 启发式：姓氏 + 1~2 字，结合"句子起始上下文"与词频筛选（无 LLM 时的离线基线） */
export function heuristicExtract(chunks, { minFreq = 6, maxCharacters = 40 } = {}) {
  const text = chunks.map((c) => c.text).join('\n')
  const two = new Map()
  const three = new Map()
  const strongTwo = new Map()
  const strongThree = new Map()

  const scan = (re, freq, strong) => {
    let m
    while ((m = re.exec(text)) !== null) {
      const name = m[0]
      freq.set(name, (freq.get(name) || 0) + 1)
      const prev = m.index === 0 ? '\n' : text[m.index - 1]
      if (PUNCT.has(prev)) strong.set(name, (strong.get(name) || 0) + 1)
    }
  }
  scan(new RegExp(`[${SURNAMES}][\\u4e00-\\u9fa5]`, 'g'), two, strongTwo)
  scan(new RegExp(`[${SURNAMES}][\\u4e00-\\u9fa5]{2}`, 'g'), three, strongThree)

  const chosen = new Map()
  const suppressed = new Set()
  for (const [name, c] of [...strongThree.entries()].sort((a, b) => b[1] - a[1])) {
    if (COMMON_WORDS.has(name) || STOPWORDS.has(name)) continue
    const prefix = name.slice(0, 2)
    if (c > (strongTwo.get(prefix) || 0)) {
      chosen.set(name, c)
      suppressed.add(prefix)
    }
  }
  for (const [name, c] of strongTwo.entries()) {
    if (suppressed.has(name) || COMMON_WORDS.has(name) || STOPWORDS.has(name)) continue
    if (!chosen.has(name)) chosen.set(name, c)
  }

  return [...chosen.entries()]
    .filter(([, c]) => c >= minFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCharacters)
    .map(([name]) => ({ name, aliases: [], description: '', card: {} }))
}

function buildLLMPrompt(sampleText) {
  return {
    systemPrompt:
      '你是中文小说角色抽取器。只输出 JSON，不要解释。合并同一角色的不同称呼（别名）到 aliases。不要臆造未出场角色。',
    userPrompt: `阅读下面的小说片段，抽取全部出场角色，严格输出 JSON：
{"characters":[{"name":"","aliases":[],"description":"","card":{"appearance":"外形","personality":"性格","voice":"声线描述","catchphrase":"口头禅","relations":"关系网","abilities":"能力","growth":"成长轨迹"}}]}

小说片段：
${sampleText}`,
    options: { temperature: 0.3, maxTokens: 4000 },
  }
}

function normalizeCharacters(list) {
  const byName = new Map()
  for (const raw of Array.isArray(list) ? list : []) {
    const name = (raw && raw.name ? String(raw.name) : '').trim()
    if (!name) continue
    const aliases = Array.isArray(raw.aliases) ? raw.aliases.map((a) => String(a).trim()).filter(Boolean) : []
    if (byName.has(name)) {
      const existing = byName.get(name)
      existing.aliases = [...new Set([...existing.aliases, ...aliases])]
    } else {
      byName.set(name, { name, aliases, description: raw.description || '', card: raw.card || {} })
    }
  }
  for (const c of byName.values()) {
    c.aliases = c.aliases.filter((a) => a && a !== c.name)
  }
  return [...byName.values()]
}

/**
 * 抽取角色（LLM 或启发式），并持久化
 * @param {string} novelId
 * @param {object} opts { provider?: 'llm'|'heuristic', maxChapters?, maxChars?, minFreq? }
 */
export async function extractCharacters(novelId, opts = {}) {
  const project = getNovelProject(novelId)
  assertEditable(project, 'characters')
  const chunks = listChunks(novelId)
  if (!chunks.length) throw new Error('尚未摄取正文，请先 ingest')

  const maxChapters = opts.maxChapters && opts.maxChapters > 0 ? opts.maxChapters : chunks.length
  const useChunks = chunks.slice(0, maxChapters)
  const configured = config.llm && config.llm.provider && config.llm.provider !== 'mock'
  const useLLM = opts.provider ? opts.provider === 'llm' : configured

  let characters
  let provider
  if (useLLM) {
    provider = 'llm'
    try {
      const sample = buildSampleText(useChunks, opts.maxChars || 60000)
      const llm = getLLMProvider()
      const { data } = await llm.generateJSON(buildLLMPrompt(sample))
      characters = normalizeCharacters(data && data.characters)
      logger.info(`LLM 抽取角色 ${characters.length} 个（provider=${llm.name}）`)
    } catch (error) {
      // LLM 失败（超时/解析/网络）→ 回退启发式，如实标注
      logger.warn(`LLM 抽取失败，回退启发式：${error.message}`)
      provider = 'heuristic-fallback'
      characters = normalizeCharacters(heuristicExtract(useChunks, { minFreq: opts.minFreq }))
    }
  } else {
    provider = 'heuristic'
    characters = normalizeCharacters(heuristicExtract(useChunks, { minFreq: opts.minFreq }))
    logger.info(`启发式抽取角色 ${characters.length} 个`)
  }

  // 清理旧角色
  if (storageService.data.novelCharacters) {
    for (const c of storageService.listNovelCharacters(novelId)) {
      delete storageService.data.novelCharacters[c.id]
    }
  }

  const saved = characters.map((c) =>
    storageService.createNovelCharacter(
      new NovelCharacter({
        novelId,
        name: c.name,
        aliases: c.aliases,
        description: c.description,
        card: c.card,
        provider,
      })
    )
  )

  writeNovelFile(novelId, 'characters/characters.json', JSON.stringify(saved, null, 2))

  // 备选集合：每次抽取生成一个候选集合，默认选中最新
  const set = storageService.createCharacterSet({
    id: generateId(),
    novelId,
    provider,
    createdAt: new Date().toISOString(),
    characterIds: saved.map((c) => c.id),
  })

  const updated = updateNovelProject(novelId, {
    status: 'extracted',
    counts: { ...project.counts, characters: saved.length },
    characterSets: [...(project.characterSets || []), set.id],
    selectedCharacterSet: set.id,
  })

  return { project: updated, provider, characters: saved, set }
}

/** 选定某个角色集合为当前生效 */
export function selectCharacterSet(novelId, setId) {
  const project = getNovelProject(novelId)
  assertEditable(project, 'characters')
  const set = storageService.getCharacterSet(setId)
  if (!set || set.novelId !== novelId) throw new Error(`character set not found: ${setId}`)
  return updateNovelProject(novelId, { selectedCharacterSet: setId })
}

/** 当前生效的角色集合（未选定则返回全部） */
export function listCharacters(novelId) {
  const project = storageService.getNovelProject(novelId)
  const all = storageService.listNovelCharacters(novelId)
  const setId = project && project.selectedCharacterSet
  if (setId) {
    const set = storageService.getCharacterSet(setId)
    if (set) {
      const ids = new Set(set.characterIds)
      return all.filter((c) => ids.has(c.id))
    }
  }
  return all
}

/** 备选集合列表（含字符数） */
export function listCharacterSets(novelId) {
  const project = storageService.getNovelProject(novelId)
  return (project?.characterSets || []).map((sid) => {
    const set = storageService.getCharacterSet(sid)
    return set ? { id: set.id, provider: set.provider, createdAt: set.createdAt, count: set.characterIds.length, selected: sid === project.selectedCharacterSet } : null
  }).filter(Boolean)
}
