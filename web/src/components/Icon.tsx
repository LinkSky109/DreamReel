import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Check,
  CircleHelp,
  Clapperboard,
  Compass,
  Download,
  Drama,
  Ellipsis,
  FileText,
  Film,
  Folder,
  Globe,
  KeyRound,
  LayoutTemplate,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Play,
  Plus,
  Plug,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Sun,
  Trash2,
  TriangleAlert,
  Trophy,
  Upload,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  home: BookOpen,
  book: BookOpen,
  folder: Folder,
  template: LayoutTemplate,
  trophy: Trophy,
  film: Film,
  clapper: Clapperboard,
  theater: Drama,
  message: MessageSquare,
  store: Store,
  users: Users,
  building: Building2,
  plug: Plug,
  compass: Compass,
  chart: BarChart3,
  settings: Settings,
  trash: Trash2,
  plus: Plus,
  play: Play,
  search: Search,
  bell: Bell,
  help: CircleHelp,
  sun: Sun,
  moon: Moon,
  globe: Globe,
  close: X,
  check: Check,
  alert: TriangleAlert,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  more: Ellipsis,
  menu: Menu,
  user: User,
  logout: LogOut,
  key: KeyRound,
  shield: ShieldCheck,
  'file-text': FileText,
  sparkles: Sparkles,
  star: Star,
  download: Download,
  upload: Upload,
  refresh: RefreshCw,
  sliders: SlidersHorizontal,
}

type IconProps = {
  name: string
  size?: number
  className?: string
}

export function Icon({ name, size = 18, className }: IconProps) {
  const Component = ICONS[name] ?? Sparkles
  return (
    <Component
      size={size}
      strokeWidth={1.75}
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  )
}
