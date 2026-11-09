import { createContext, useContext, type ReactNode } from 'react'

const ReportSectionContext = createContext<string | null>(null)

/** Renders a page as a report block: only its section `only` shows, see useReportSection. */
export function ReportSectionProvider({ only, children }: { only: string; children: ReactNode }) {
  return <ReportSectionContext.Provider value={only}>{children}</ReportSectionContext.Provider>
}

/**
 * For pages that double as report blocks. On the page itself every section shows; inside a
 * report block only the chosen one does, and page-level chrome (intros, links) is hidden.
 */
export function useReportSection() {
  const only = useContext(ReportSectionContext)
  return {
    inReport: only !== null,
    show: (section: string) => only === null || only === section,
  }
}
