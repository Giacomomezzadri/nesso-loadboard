import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { REPORT_BLOCK_KINDS, REPORT_BLOCKS, newReportBlock } from '../../lib/reports/catalog'
import { cn } from '../../lib/utils'
import type { Position, ReportBlock, ReportBlockKind, ReportTemplate } from '../../types/domain'

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'GK', label: 'Portieri' },
  { value: 'DEF', label: 'Difensori' },
  { value: 'MID', label: 'Centrocampisti' },
  { value: 'FWD', label: 'Attaccanti' },
  { value: 'UNSPECIFIED', label: 'Non assegnati' },
]

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function BlockRow({
  block,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  block: ReportBlock
  index: number
  count: number
  onChange: (block: ReportBlock) => void
  onMove: (to: number) => void
  onRemove: () => void
}) {
  const def = REPORT_BLOCKS[block.kind]
  const positions = block.positions ?? []
  const togglePosition = (pos: Position) =>
    onChange({ ...block, positions: positions.includes(pos) ? positions.filter((p) => p !== pos) : [...positions, pos] })

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-page/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">
            {index + 1}. {def.label}
          </p>
          <p className="text-xs text-ink-muted">{def.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="Sposta su" className="rounded p-1 text-ink-secondary hover:bg-ink/5 disabled:opacity-30">
            <ArrowUp className="size-3.5" />
          </button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label="Sposta giù" className="rounded p-1 text-ink-secondary hover:bg-ink/5 disabled:opacity-30">
            <ArrowDown className="size-3.5" />
          </button>
          <button type="button" onClick={onRemove} aria-label="Rimuovi blocco" className="rounded p-1 text-ink-secondary hover:bg-status-critical/10 hover:text-status-critical">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      {def.options.positions && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="mr-1 text-ink-muted">Righe:</span>
          {POSITIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => togglePosition(p.value)}
              className={cn(
                'rounded-md border px-2 py-0.5',
                positions.includes(p.value) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-ink-secondary hover:bg-ink/5',
              )}
            >
              {p.label}
            </button>
          ))}
          <span className="ml-1 text-ink-muted">{positions.length === 0 ? '(nessuno scelto = tutti)' : ''}</span>
        </div>
      )}
    </li>
  )
}

/** Settings section: the team name for report headers and the report templates (editors/admins only — the page's fieldset disables it for viewers). */
export function ReportTemplatesEditor({
  teamName,
  templates,
  onChange,
}: {
  teamName: string
  templates: ReportTemplate[]
  onChange: (patch: { teamName?: string; reportTemplates?: ReportTemplate[] }) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newKind, setNewKind] = useState<ReportBlockKind>(REPORT_BLOCK_KINDS[0])
  const selected = templates.find((t) => t.id === selectedId) ?? templates[0]

  const setTemplates = (next: ReportTemplate[]) => onChange({ reportTemplates: next })
  const updateSelected = (patch: Partial<ReportTemplate>) =>
    setTemplates(templates.map((t) => (t.id === selected.id ? { ...t, ...patch } : t)))
  const addTemplate = () => {
    const template: ReportTemplate = { id: crypto.randomUUID(), name: `Report ${templates.length + 1}`, blocks: [] }
    setTemplates([...templates, template])
    setSelectedId(template.id)
  }
  const removeTemplate = () => {
    if (!window.confirm(`Eliminare il modello "${selected.name}"?`)) return
    setTemplates(templates.filter((t) => t.id !== selected.id))
    setSelectedId(null)
  }

  return (
    <section className="flex flex-col gap-3 panel p-4">
      <p className="text-sm font-medium text-ink">Report</p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-secondary">Nome della squadra (intestazione dei PDF)</span>
        <input
          type="text"
          value={teamName}
          onChange={(e) => onChange({ teamName: e.target.value })}
          placeholder="es. Nesso FC — Primavera"
          className="rounded-md border border-border bg-page px-3 py-1.5 text-ink"
        />
      </label>

      <div className="flex flex-wrap items-end gap-2">
        {templates.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-secondary">Modello</span>
            <select
              value={selected.id}
              onChange={(e) => setSelectedId(e.target.value)}
              className="min-w-48 rounded-md border border-border bg-page px-3 py-1.5 text-ink"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" onClick={addTemplate} className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-ink-secondary hover:bg-ink/5 hover:text-ink">
          <Plus className="size-4" /> Nuovo modello
        </button>
      </div>

      {selected && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Nome del modello</span>
              <input
                type="text"
                value={selected.name}
                onChange={(e) => updateSelected({ name: e.target.value })}
                className="rounded-md border border-border bg-page px-3 py-1.5 text-ink"
              />
            </label>
            <button type="button" onClick={removeTemplate} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-status-critical hover:bg-status-critical/10">
              <Trash2 className="size-3.5" /> Elimina modello
            </button>
          </div>

          {selected.blocks.length === 0 ? (
            <p className="text-xs text-ink-muted">Nessun blocco: aggiungine uno qui sotto.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {selected.blocks.map((block, i) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  index={i}
                  count={selected.blocks.length}
                  onChange={(b) => updateSelected({ blocks: selected.blocks.map((x) => (x.id === b.id ? b : x)) })}
                  onMove={(to) => updateSelected({ blocks: move(selected.blocks, i, to) })}
                  onRemove={() => updateSelected({ blocks: selected.blocks.filter((x) => x.id !== block.id) })}
                />
              ))}
            </ol>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as ReportBlockKind)}
              className="rounded-md border border-border bg-page px-3 py-1.5 text-sm text-ink"
            >
              {REPORT_BLOCK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {REPORT_BLOCKS[k].label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => updateSelected({ blocks: [...selected.blocks, newReportBlock(newKind)] })}
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-ink-secondary hover:bg-ink/5 hover:text-ink"
            >
              <Plus className="size-4" /> Aggiungi blocco
            </button>
          </div>
        </div>
      )}
      <p className="text-xs text-ink-muted">Le modifiche ai modelli si applicano con «Salva impostazioni». I report si generano dalla pagina Report.</p>
    </section>
  )
}
