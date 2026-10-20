import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { NAV_ITEMS } from '../app/nav'
import { Icon } from './Icon'
import { useLang } from '../lib/i18n'

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { t, navLabel } = useLang()

  const projectsQuery = useQuery({
    queryKey: ['projects', 'palette'],
    queryFn: () => api.listProjects({ limit: 8, sort: 'lastAccessedAt' }),
    enabled: open,
    staleTime: 30_000,
  })

  const go = (path: string) => {
    onClose()
    navigate(path)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dr-scrim" />
        <Dialog.Content className="dr-palette" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{t('命令面板', 'Command palette')}</Dialog.Title>
          <Command label={t('命令面板', 'Command palette')} loop>
            <Command.Input
              autoFocus
              className="dr-palette-input"
              placeholder={t('搜索页面、项目或动作…', 'Search pages, projects, or actions…')}
            />
            <Command.List className="dr-palette-list">
              <Command.Empty>
                <div className="dr-state" style={{ padding: 28 }}>
                  <div className="dr-state-title">{t('没有匹配结果', 'No matches')}</div>
                  <div>{t('换个关键词，或先创建项目。', 'Try another keyword, or create a project.')}</div>
                </div>
              </Command.Empty>

              <Command.Group heading={t('页面', 'Pages')}>
                {NAV_ITEMS.map((item) => (
                  <Command.Item
                    key={item.path}
                    className="dr-palette-item"
                    value={`${item.label} ${item.labelEn} ${item.path}`}
                    onSelect={() => go(item.path)}
                  >
                    <Icon name={item.icon} size={14} />
                    <span>{navLabel(item)}</span>
                    <small>{item.path}</small>
                  </Command.Item>
                ))}
              </Command.Group>

              {(projectsQuery.data?.items.length ?? 0) > 0 ? (
                <Command.Group heading={t('项目', 'Projects')}>
                  {projectsQuery.data?.items.map((project) => (
                    <Command.Item
                      key={project.id}
                      className="dr-palette-item"
                      value={`${project.name} ${project.id}`}
                      onSelect={() => go(`/project/${project.id}`)}
                    >
                      <Icon name="folder" size={14} />
                      <span>{project.name}</span>
                      <small>{t('项目', 'Project')}</small>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              <Command.Group heading={t('动作', 'Actions')}>
                <Command.Item
                  className="dr-palette-item"
                  value="新建项目 new project create"
                  onSelect={() => go('/projects?create=1')}
                >
                  <Icon name="plus" size={14} />
                  <span>{t('新建项目', 'New project')}</span>
                  <small>N</small>
                </Command.Item>
                <Command.Item
                  className="dr-palette-item"
                  value="小说剧场 novel theater"
                  onSelect={() => go('/novels')}
                >
                  <Icon name="book" size={14} />
                  <span>{t('打开小说剧场', 'Open Novel Theater')}</span>
                  <small>{t('核心', 'CORE')}</small>
                </Command.Item>
                <Command.Item
                  className="dr-palette-item"
                  value="全部功能 more all features"
                  onSelect={() => go('/more')}
                >
                  <Icon name="more" size={14} />
                  <span>{t('全部功能', 'All features')}</span>
                  <small>/more</small>
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
