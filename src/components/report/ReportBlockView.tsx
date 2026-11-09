import type { ComponentType } from 'react'
import { REPORT_BLOCKS } from '../../lib/reports/catalog'
import { AlertsPage } from '../../pages/AlertsPage'
import { ComparePage } from '../../pages/ComparePage'
import { DrillsPage } from '../../pages/DrillsPage'
import { DynamicLoadPage } from '../../pages/DynamicLoadPage'
import { GameVGamePage } from '../../pages/GameVGamePage'
import { LeaderboardPage } from '../../pages/LeaderboardPage'
import { OverviewPage } from '../../pages/OverviewPage'
import { PlayerProfilePage } from '../../pages/PlayerProfilePage'
import { RosterPage } from '../../pages/RosterPage'
import { SessionVGamePage } from '../../pages/SessionVGamePage'
import { SessionVSessionPage } from '../../pages/SessionVSessionPage'
import type { DrillSegment, Player, ReportBlock, Session } from '../../types/domain'
import { WeekStatusGrid } from '../attendance/WeekStatusGrid'
import { ReportSectionProvider } from './ReportSection'

export interface ReportData {
  sessions: Session[]
  segments: DrillSegment[]
  players: Player[]
}

/** The page behind each "page.section" kind prefix. */
const PAGES: Record<string, ComponentType> = {
  overview: OverviewPage,
  dynamic: DynamicLoadPage,
  svg: SessionVGamePage,
  svs: SessionVSessionPage,
  gvg: GameVGamePage,
  drills: DrillsPage,
  compare: ComparePage,
  profile: PlayerProfilePage,
  alerts: AlertsPage,
  leaderboard: LeaderboardPage,
  roster: RosterPage,
}

/**
 * Renders one report block. Page-section kinds mount the real page showing only that section,
 * with its own on-screen controls (player, period, metric…) — what's chosen there is what prints.
 */
export function ReportBlockView({ block, data }: { block: ReportBlock; data: ReportData }) {
  const def = REPORT_BLOCKS[block.kind]
  let content
  if (block.kind === 'week_attendance') {
    content = <WeekStatusGrid sessions={data.sessions} segments={data.segments} players={data.players} positions={block.positions} />
  } else {
    const [pageKey, section] = block.kind.split('.')
    const Page = PAGES[pageKey]
    content = (
      <ReportSectionProvider only={section}>
        <Page />
      </ReportSectionProvider>
    )
  }

  return (
    <section className="flex flex-col gap-2 print:break-inside-avoid">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {def.group} · {def.label}
      </p>
      {content}
    </section>
  )
}
