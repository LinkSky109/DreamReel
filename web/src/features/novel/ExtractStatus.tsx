import { useLang } from '../../lib/i18n'
import type { NovelExtractJobs } from '../../domain/types'
import './ExtractStatus.css'

export function hasActiveJobs(jobs?: NovelExtractJobs) {
  if (!jobs) return false
  return (['characters', 'world', 'both'] as const).some((key) => {
    const job = jobs[key]
    return job && !job.finishedAt
  })
}

export function ExtractStatus({ jobs }: { jobs?: NovelExtractJobs }) {
  const { t } = useLang()
  const entries = (['both', 'characters', 'world'] as const).flatMap((key) => {
    const job = jobs?.[key]
    return job ? ([[key, job]] as const) : []
  })

  if (!entries.length) return null

  return (
    <div className="dr-extract-status">
      {entries.map(([key, job]) => {
        const settled = (job.done ?? 0) + (job.failed ?? 0)
        const pct = job.total ? Math.round((settled / job.total) * 100) : 0
        return (
          <div key={key} className="dr-extract-job">
            <span className="dr-extract-job-label">
              {key === 'both'
                ? t('合并（角色+世界观）', 'Combined (characters + world)')
                : key === 'characters'
                  ? t('角色', 'Characters')
                  : t('世界观', 'World')}
            </span>
            <span>
              {t('完成', 'Done')} {job.done}/{job.total} · {t('失败', 'Failed')} {job.failed} ·{' '}
              {job.finishedAt ? t('已结束', 'Finished') : t(`进行中 ${pct}%`, `Running ${pct}%`)}
            </span>
            <div className="dr-extract-chips">
              {(job.tasks ?? []).map((task, index) => (
                <span
                  key={`${task.label}-${index}`}
                  className={`dr-extract-chip is-${task.status}`}
                  title={task.error || ''}
                >
                  {task.status === 'done' ? '✓' : task.status === 'failed' ? '✗' : task.status === 'running' ? '…' : '·'}{' '}
                  {task.label}
                  {task.ms ? ` ${(task.ms / 1000).toFixed(1)}s` : ''}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
