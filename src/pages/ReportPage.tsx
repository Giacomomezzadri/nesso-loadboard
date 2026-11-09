import { FileText, Printer } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ReportBlockView } from '../components/report/ReportBlockView'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../state/AuthContext'
import { useAllSegmentsQuery, usePlayersQuery, useSessionsQuery, useSettingsQuery } from '../state/queries'

const GENERATED_AT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * Renders a report template as an A4-friendly page; "Scarica PDF" opens the browser's print
 * dialog ("Salva come PDF"), so charts stay vector and text stays selectable. Whatever the
 * on-screen blocks show (e.g. the week picked with the arrows) is what gets printed.
 */
export function ReportPage() {
  const { data: settings } = useSettingsQuery()
  const { data: sessions = [], isLoading: loadingSessions } = useSessionsQuery()
  const { data: segments = [], isLoading: loadingSegments } = useAllSegmentsQuery()
  const { data: players = [] } = usePlayersQuery()
  const { canEdit } = useAuth()
  const [templateId, setTemplateId] = useState('')

  if (!settings || loadingSessions || loadingSegments) return null

  const templates = settings.reportTemplates ?? []
  if (templates.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nessun modello di report"
        description={
          canEdit
            ? 'Crea un modello in Settings → Report scegliendo i blocchi da includere.'
            : 'Un editor o un admin deve prima creare un modello in Settings → Report.'
        }
      />
    )
  }

  const template = templates.find((t) => t.id === templateId) ?? templates[0]
  const teamName = settings.teamName?.trim()

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-secondary">
          Modello
          <select
            value={template.id}
            onChange={(e) => setTemplateId(e.target.value)}
            className="min-w-56 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          {canEdit && (
            <Link to="/settings" className="text-xs text-ink-secondary underline-offset-2 hover:text-ink hover:underline">
              Modifica modelli
            </Link>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            disabled={template.blocks.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-50"
          >
            <Printer className="size-4" /> Scarica PDF
          </button>
        </div>
      </div>
      <p className="no-print -mt-2 text-xs text-ink-muted">
        Nella finestra di stampa scegli «Salva come PDF». Viene stampato quello che vedi qui sotto: i blocchi legati a
        una sessione usano quella selezionata in alto, e in ogni blocco puoi scegliere giocatore, periodo o metrica.
      </p>

      <header className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-primary pb-2">
        <div>
          {teamName && <p className="font-display text-2xl font-bold leading-tight text-ink">{teamName}</p>}
          <p className="text-sm font-medium text-ink-secondary">{template.name}</p>
        </div>
        <p className="text-xs text-ink-muted">Generato il {GENERATED_AT.format(new Date())}</p>
      </header>

      {template.blocks.length === 0 ? (
        <p className="text-sm text-ink-muted">Questo modello non ha ancora blocchi.</p>
      ) : (
        template.blocks.map((block) => <ReportBlockView key={block.id} block={block} data={{ sessions, segments, players }} />)
      )}
    </div>
  )
}
