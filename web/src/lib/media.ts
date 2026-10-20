const FALLBACK_IMAGES = [
  '/media/img/forest-light.jpg',
  '/media/img/night-mountain.jpg',
  '/media/img/fog-mountain.jpg',
  '/media/img/city-night.jpg',
  '/media/img/desert-dusk.jpg',
  '/media/img/lake-cabin.jpg',
  '/media/img/portrait-window.jpg',
  '/media/img/ocean-night.jpg',
  '/media/img/architecture.jpg',
]

function hash(value: string) {
  let result = 0
  for (const char of value) result = (result * 31 + char.codePointAt(0)!) >>> 0
  return result
}

/** 项目封面：优先真实 coverUrl，否则用原型剧照做稳定回退。 */
export function projectCover(project: { id: string; coverUrl?: string | null }) {
  if (project.coverUrl) return project.coverUrl
  return FALLBACK_IMAGES[hash(project.id) % FALLBACK_IMAGES.length]
}

export function fallbackImage(index = 0) {
  return FALLBACK_IMAGES[Math.abs(index) % FALLBACK_IMAGES.length]
}
