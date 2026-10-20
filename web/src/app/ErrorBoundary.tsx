import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * 路由级错误边界（规范 §4.3 / §12）：
 * 渲染异常时展示可读错误页与重试，不残留上一页内容。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[render-error]', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="dr-page">
        <div className="dr-card dr-state" style={{ padding: 56 }}>
          <div className="dr-state-icon">
            <Icon name="alert" size={22} />
          </div>
          <div className="dr-state-title">页面未加载</div>
          <div style={{ maxWidth: 520, fontSize: 12 }}>
            {this.state.error.message || '渲染过程中发生未知错误。'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="dr-btn dr-btn-primary"
              onClick={() => this.setState({ error: null })}
            >
              重试
            </button>
            <Link className="dr-btn" to="/" onClick={() => this.setState({ error: null })}>
              返回工作台
            </Link>
          </div>
        </div>
      </div>
    )
  }
}
