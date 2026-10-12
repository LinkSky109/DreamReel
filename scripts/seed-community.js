import { storageService } from '../src/services/storageService.js'
import { User } from '../src/models/user.js'
import { Review } from '../src/models/review.js'

/**
 * 影评社区（Wave 2）演示数据种子。
 *
 * 原 src/app.js 的 seedData() 会先 clearAll() 再写入，运行在主服务上会清空开发库，
 * 因此这里改为幂等 upsert（按固定 id 覆盖），不做 clearAll。
 *
 * 用法：npm run seed:community
 */

const users = [
  new User({
    id: 'usr_a',
    name: 'Alice',
    preferenceTags: ['sci-fi', 'action'],
    scoreStyle: { story: 8, visual: 9, performance: 7, soundtrack: 6 },
  }),
  new User({
    id: 'usr_b',
    name: 'Bob',
    preferenceTags: ['drama', 'romance'],
    scoreStyle: { story: 9, visual: 6, performance: 8, soundtrack: 7 },
  }),
  new User({
    id: 'usr_c',
    name: 'Carol',
    role: 'admin',
    preferenceTags: ['sci-fi', 'noir'],
    scoreStyle: { story: 7, visual: 8, performance: 9, soundtrack: 8 },
  }),
]

const now = Date.now()
const reviews = [
  new Review({
    id: 'rev_1',
    userId: 'usr_a',
    movieId: 'mov_inception',
    title: 'Inception - Mind-bending masterpiece',
    content: 'A layered dream narrative...',
    storyScore: 9,
    visualScore: 10,
    performanceScore: 8,
    soundtrackScore: 9,
    movieTags: ['sci-fi', 'action', 'thriller'],
    likeCount: 42,
    commentCount: 15,
    favoriteCount: 8,
    createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  }),
  new Review({
    id: 'rev_2',
    userId: 'usr_b',
    movieId: 'mov_titanic',
    title: 'Titanic - Timeless romance',
    content: 'The love story transcends...',
    storyScore: 8,
    visualScore: 9,
    performanceScore: 7,
    soundtrackScore: 10,
    movieTags: ['drama', 'romance', 'history'],
    likeCount: 35,
    commentCount: 10,
    favoriteCount: 12,
    createdAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
  }),
  new Review({
    id: 'rev_3',
    userId: 'usr_a',
    movieId: 'mov_blade_runner',
    title: 'Blade Runner 2049 - Visual poetry',
    content: 'Every frame is a painting...',
    storyScore: 7,
    visualScore: 10,
    performanceScore: 8,
    soundtrackScore: 9,
    movieTags: ['sci-fi', 'noir', 'drama'],
    likeCount: 28,
    commentCount: 8,
    favoriteCount: 5,
    createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
  }),
]

for (const user of users) {
  storageService.createUser(user)
}

for (const review of reviews) {
  storageService.createReview(review)
}

storageService._flush()

// eslint-disable-next-line no-console
console.log(`[seed:community] upserted ${users.length} users, ${reviews.length} reviews`)
