import type { ReportBlock, ReportBlockKind } from '../../types/domain'

export interface ReportBlockDef {
  label: string
  description: string
  /** Which of ReportBlock's options the Settings editor offers for this kind. */
  options: { positions?: boolean }
}

/**
 * Every block a report can contain. To add one: a new ReportBlockKind in types/domain.ts,
 * an entry here, and its rendering in components/report/ReportBlockView.tsx.
 */
export const REPORT_BLOCKS: Record<ReportBlockKind, ReportBlockDef> = {
  week_attendance: {
    label: 'Presenze della settimana',
    description: 'Griglia giocatori × giorni da partita a partita, con la situazione di ognuno.',
    options: { positions: true },
  },
}

export const REPORT_BLOCK_KINDS = Object.keys(REPORT_BLOCKS) as ReportBlockKind[]

export function newReportBlock(kind: ReportBlockKind): ReportBlock {
  return { id: crypto.randomUUID(), kind }
}
