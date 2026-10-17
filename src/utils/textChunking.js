/**
 * 按"字符预算 + 章数上限"把章节切片分组，保证每个 chunk 至少被完整读取一次。
 * 修复固定 chunkSize 分组时因单组超长而丢弃组内后续章节的问题。
 * @param {Array<{chapterTitle:string,text:string}>} chunks
 * @param {{chunkSize?:number, maxChars?:number, format?:(c:object)=>string}} opts
 * @returns {Array<{sample:string, titles:string[]}>}
 */
export function groupChunks(chunks, { chunkSize = 16, maxChars = 24000, format } = {}) {
  const fmt = format || ((c) => `【${c.chapterTitle}】\n${c.text}`)
  const groups = []
  let i = 0
  while (i < chunks.length) {
    let sample = ''
    const titles = []
    while (i < chunks.length) {
      const piece = fmt(chunks[i])
      // 章节原子性：加入会超限就先收尾；绝不把一章切成两片（单章超限时整章自成一片）
      if (sample && (sample.length + piece.length > maxChars || titles.length >= chunkSize)) break
      sample += piece
      titles.push(chunks[i].chapterTitle)
      i++
    }
    groups.push({ sample, titles })
  }
  return groups
}

export default groupChunks
