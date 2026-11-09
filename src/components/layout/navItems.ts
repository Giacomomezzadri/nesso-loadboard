import {
  AlertTriangle,
  BarChart3,
  Dumbbell,
  Flag,
  Gauge,
  type LucideIcon,
  ScanSearch,
  Settings,
  ShieldCheck,
  Swords,
  Trophy,
  Upload,
  UserCircle,
  Users,
  Users2,
  CalendarRange,
  FileText,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  /** True if this page needs multi-session history to be meaningful. */
  needsHistory?: boolean
  /** Only rendered for an Admin — the account registry lives off the data nav. */
  adminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Overview', icon: Gauge },
  { path: '/dynamic-load', label: 'Dynamic Load', icon: BarChart3, needsHistory: true },
  { path: '/session-v-game', label: 'Session v Game', icon: Swords },
  { path: '/session-v-session', label: 'Session v Session', icon: CalendarRange, needsHistory: true },
  { path: '/game-v-game', label: 'Game v Game', icon: Flag, needsHistory: true },
  { path: '/drills', label: 'Drills', icon: Dumbbell },
  { path: '/compare', label: 'Compare', icon: Users2 },
  { path: '/players', label: 'Player Profile', icon: UserCircle },
  { path: '/alerts', label: 'Alerts & Flags', icon: AlertTriangle, needsHistory: true },
  { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { path: '/quality', label: 'Data Quality', icon: ScanSearch },
  { path: '/roster', label: 'Roster & Positions', icon: Users },
  { path: '/sessions', label: 'Import / Sessions', icon: Upload },
  { path: '/report', label: 'Report', icon: FileText },
  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/admin', label: 'Account', icon: ShieldCheck, adminOnly: true },
]
