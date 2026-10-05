/**
 * BGM 背景音乐库
 * 按情绪分类，支持 AI 推荐
 * 音频文件存放于 storage/audio/bgm/
 */

export const BGM_LIBRARY = [
  // 紧张/悬疑
  { id: 'tension-01', name: '紧张追逐', emotion: 'tension', bpm: 140, duration: 60, tags: ['紧张', '追逐', '动作'], filename: 'tension-01.mp3' },
  { id: 'tension-02', name: '悬疑推理', emotion: 'tension', bpm: 90, duration: 60, tags: ['悬疑', '推理', '神秘'], filename: 'tension-02.mp3' },
  { id: 'tension-03', name: '危机时刻', emotion: 'tension', bpm: 160, duration: 45, tags: ['危机', '紧张', '高潮'], filename: 'tension-03.mp3' },

  // 温馨/治愈
  { id: 'warm-01', name: '温暖午后', emotion: 'warm', bpm: 80, duration: 60, tags: ['温馨', '治愈', '日常'], filename: 'warm-01.mp3' },
  { id: 'warm-02', name: '家庭时光', emotion: 'warm', bpm: 70, duration: 60, tags: ['家庭', '温馨', '回忆'], filename: 'warm-02.mp3' },
  { id: 'warm-03', name: '初恋心情', emotion: 'warm', bpm: 95, duration: 50, tags: ['甜蜜', '恋爱', '青春'], filename: 'warm-03.mp3' },

  // 史诗/大气
  { id: 'epic-01', name: '史诗征程', emotion: 'epic', bpm: 120, duration: 60, tags: ['史诗', '大气', '战斗'], filename: 'epic-01.mp3' },
  { id: 'epic-02', name: '英雄崛起', emotion: 'epic', bpm: 130, duration: 55, tags: ['英雄', '励志', '高潮'], filename: 'epic-02.mp3' },
  { id: 'epic-03', name: '宇宙浩瀚', emotion: 'epic', bpm: 100, duration: 60, tags: ['科幻', '宇宙', '宏大'], filename: 'epic-03.mp3' },

  // 悲伤/抒情
  { id: 'sad-01', name: '离别之痛', emotion: 'sad', bpm: 60, duration: 60, tags: ['悲伤', '离别', '抒情'], filename: 'sad-01.mp3' },
  { id: 'sad-02', name: '孤独回忆', emotion: 'sad', bpm: 65, duration: 55, tags: ['孤独', '回忆', '忧郁'], filename: 'sad-02.mp3' },

  // 轻快/活泼
  { id: 'light-01', name: '快乐时光', emotion: 'light', bpm: 120, duration: 50, tags: ['快乐', '活泼', '喜剧'], filename: 'light-01.mp3' },
  { id: 'light-02', name: '俏皮日常', emotion: 'light', bpm: 110, duration: 45, tags: ['俏皮', '日常', '轻松'], filename: 'light-02.mp3' },
  { id: 'light-03', name: '阳光明媚', emotion: 'light', bpm: 105, duration: 55, tags: ['阳光', '积极', '希望'], filename: 'light-03.mp3' },

  // 恐怖/诡异
  { id: 'horror-01', name: '暗夜低语', emotion: 'horror', bpm: 70, duration: 60, tags: ['恐怖', '诡异', '黑暗'], filename: 'horror-01.mp3' },
  { id: 'horror-02', name: '幽灵出没', emotion: 'horror', bpm: 80, duration: 50, tags: ['幽灵', '惊悚', '悬疑'], filename: 'horror-02.mp3' },

  // 浪漫/爱情
  { id: 'romantic-01', name: '浪漫之夜', emotion: 'romantic', bpm: 75, duration: 60, tags: ['浪漫', '爱情', '夜晚'], filename: 'romantic-01.mp3' },
  { id: 'romantic-02', name: '心动瞬间', emotion: 'romantic', bpm: 90, duration: 50, tags: ['心动', '恋爱', '甜蜜'], filename: 'romantic-02.mp3' },

  // 电子/未来
  { id: 'electronic-01', name: '赛博都市', emotion: 'electronic', bpm: 128, duration: 60, tags: ['电子', '赛博', '未来'], filename: 'electronic-01.mp3' },
  { id: 'electronic-02', name: '科技感', emotion: 'electronic', bpm: 115, duration: 55, tags: ['科技', '未来', '极简'], filename: 'electronic-02.mp3' },
]

export const BGM_EMOTIONS = [
  { id: 'all', name: '全部', icon: '🎵' },
  { id: 'tension', name: '紧张悬疑', icon: '😰' },
  { id: 'warm', name: '温馨治愈', icon: '☀️' },
  { id: 'epic', name: '史诗大气', icon: '⚔️' },
  { id: 'sad', name: '悲伤抒情', icon: '😢' },
  { id: 'light', name: '轻快活泼', icon: '😊' },
  { id: 'horror', name: '恐怖诡异', icon: '👻' },
  { id: 'romantic', name: '浪漫爱情', icon: '💕' },
  { id: 'electronic', name: '电子未来', icon: '🤖' },
]

/**
 * 根据剧本关键词推荐 BGM 情绪
 */
export function recommendBgmEmotion(scriptText) {
  const text = (scriptText || '').toLowerCase()
  const emotionScores = {
    tension: 0, warm: 0, epic: 0, sad: 0, light: 0, horror: 0, romantic: 0, electronic: 0,
  }

  const keywords = {
    tension: ['紧张', '追逐', '战斗', '危机', '悬疑', '推理', '神秘', '冒险', 'tension', 'chase', 'battle'],
    warm: ['温馨', '家庭', '日常', '治愈', '温暖', '回忆', 'family', 'warm', 'daily'],
    epic: ['史诗', '英雄', '宇宙', '宏大', '征程', '战斗', 'epic', 'hero', 'cosmos'],
    sad: ['悲伤', '离别', '孤独', '忧郁', '死亡', 'sad', 'lonely', 'departure'],
    light: ['快乐', '喜剧', '活泼', '阳光', '希望', '轻松', 'happy', 'comedy', 'sunny'],
    horror: ['恐怖', '诡异', '幽灵', '黑暗', '惊悚', 'horror', 'ghost', 'dark'],
    romantic: ['浪漫', '爱情', '心动', '恋爱', '甜蜜', 'romantic', 'love', 'romance'],
    electronic: ['科幻', '未来', '科技', '赛博', '电子', 'ai', 'scifi', 'future', 'cyber'],
  }

  for (const [emotion, words] of Object.entries(keywords)) {
    for (const word of words) {
      if (text.includes(word)) {
        emotionScores[emotion]++
      }
    }
  }

  const maxScore = Math.max(...Object.values(emotionScores))
  if (maxScore === 0) return 'warm' // 默认温馨

  return Object.entries(emotionScores).find(([, score]) => score === maxScore)[0]
}

export default BGM_LIBRARY
