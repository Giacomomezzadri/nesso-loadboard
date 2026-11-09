import type { DrillSegment, Player, ReportBlock, Session } from '../../types/domain'
import { WeekStatusGrid } from '../attendance/WeekStatusGrid'

export interface ReportData {
  sessions: Session[]
  segments: DrillSegment[]
  players: Player[]
}

/** Renders one report block from its kind and options — the one place to wire a new kind in. */
export function ReportBlockView({ block, data }: { block: ReportBlock; data: ReportData }) {
  switch (block.kind) {
    case 'week_attendance':
      return <WeekStatusGrid sessions={data.sessions} segments={data.segments} players={data.players} positions={block.positions} />
  }
}
