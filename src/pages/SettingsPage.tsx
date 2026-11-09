import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ReportTemplatesEditor } from '../components/report/ReportTemplatesEditor'
import { putSettings } from '../lib/db/repo'
import { useAuth } from '../state/AuthContext'
import { queryKeys, useSettingsQuery } from '../state/queries'
import type { AppSettings, ZoneNumber } from '../types/domain'

const ALL_ZONES: ZoneNumber[] = [3, 4, 5, 6]

function ZoneCheckboxGroup({
  label,
  value,
  onChange,
}: {
  label: string
  value: ZoneNumber[]
  onChange: (zones: ZoneNumber[]) => void
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-ink-secondary">{label}</span>
      <div className="flex gap-3">
        {ALL_ZONES.map((zone) => (
          <label key={zone} className="flex items-center gap-1 text-xs text-ink">
            <input
              type="checkbox"
              checked={value.includes(zone)}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, zone].sort() : value.filter((z) => z !== zone))
              }
              className="accent-accent"
            />
            Z{zone}
          </label>
        ))}
      </div>
    </label>
  )
}

export function SettingsPage() {
  const { data: settings } = useSettingsQuery()
  const { canEdit } = useAuth()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings && !draft) setDraft(settings)
  }, [settings, draft])

  if (!draft) return null

  const update = (patch: Partial<AppSettings>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
    setSaved(false)
  }

  const handleSave = async () => {
    await putSettings(draft)
    queryClient.invalidateQueries({ queryKey: queryKeys.settings })
    setSaved(true)
  }

  return (
    <fieldset disabled={!canEdit} className="flex max-w-2xl flex-col gap-6 border-0 p-0">
      <p className="text-sm text-ink-secondary">
        Soglie usate da tutte le pagine (Drills, Alerts, Session v Game, Leaderboard). Nessun valore è hardcoded.
        {!canEdit && ' Sola lettura per il tuo ruolo.'}
      </p>

      <section className="flex flex-col gap-3 panel p-4">
        <p className="text-sm font-semibold text-ink">Soglie di velocità (km/h)</p>
        <div className="grid grid-cols-3 gap-3">
          {(['zone4MinKmh', 'zone5MinKmh', 'zone6MinKmh'] as const).map((key, i) => (
            <label key={key} className="flex flex-col gap-1 text-xs text-ink-secondary">
              Zona {i + 4}
              <input
                type="number"
                step="0.1"
                value={draft.speedZonesKmh[key]}
                onChange={(e) =>
                  update({ speedZonesKmh: { ...draft.speedZonesKmh, [key]: Number(e.target.value) } })
                }
                className="rounded-md border border-border bg-page px-2 py-1 text-ink"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 panel p-4">
        <p className="text-sm font-semibold text-ink">Mechanical Work &amp; Acc/Dec</p>
        <ZoneCheckboxGroup
          label="Zone incluse nel Mechanical Work"
          value={draft.mechanicalWork.includeZonesForMechWork}
          onChange={(zones) => update({ mechanicalWork: { ...draft.mechanicalWork, includeZonesForMechWork: zones } })}
        />
        <ZoneCheckboxGroup
          label="Acc. moderate"
          value={draft.mechanicalWork.accModerateZones}
          onChange={(zones) => update({ mechanicalWork: { ...draft.mechanicalWork, accModerateZones: zones } })}
        />
        <ZoneCheckboxGroup
          label="Acc. alte"
          value={draft.mechanicalWork.accHighZones}
          onChange={(zones) => update({ mechanicalWork: { ...draft.mechanicalWork, accHighZones: zones } })}
        />
        <ZoneCheckboxGroup
          label="Dec. moderate"
          value={draft.mechanicalWork.decModerateZones}
          onChange={(zones) => update({ mechanicalWork: { ...draft.mechanicalWork, decModerateZones: zones } })}
        />
        <ZoneCheckboxGroup
          label="Dec. alte"
          value={draft.mechanicalWork.decHighZones}
          onChange={(zones) => update({ mechanicalWork: { ...draft.mechanicalWork, decHighZones: zones } })}
        />
      </section>

      <section className="flex flex-col gap-3 panel p-4">
        <p className="text-sm font-semibold text-ink">Sprint &amp; drill "di gara"</p>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-secondary">Zone che contano come sprint</span>
          <div className="flex gap-3">
            {([5, 6] as const).map((zone) => (
              <label key={zone} className="flex items-center gap-1 text-xs text-ink">
                <input
                  type="checkbox"
                  checked={draft.sprintDefinition.entriesZonesForSprintCount.includes(zone)}
                  onChange={(e) => {
                    const current = draft.sprintDefinition.entriesZonesForSprintCount
                    const next = e.target.checked ? [...current, zone] : current.filter((z) => z !== zone)
                    update({ sprintDefinition: { entriesZonesForSprintCount: next.sort() } })
                  }}
                  className="accent-accent"
                />
                Z{zone}
              </label>
            ))}
          </div>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-secondary">Parole chiave per riconoscere un drill "di gara" (separate da virgola)</span>
          <input
            type="text"
            value={draft.gameDrillKeywords.join(', ')}
            onChange={(e) => update({ gameDrillKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            className="rounded-md border border-border bg-page px-2 py-1.5 text-ink"
          />
        </label>
      </section>

      <section className="flex flex-col gap-3 panel p-4">
        <p className="text-sm font-semibold text-ink">RPE &amp; trend</p>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            RPE minimo
            <input
              type="number"
              value={draft.rpeScale.min}
              onChange={(e) => update({ rpeScale: { ...draft.rpeScale, min: Number(e.target.value) } })}
              className="rounded-md border border-border bg-page px-2 py-1 text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            RPE massimo
            <input
              type="number"
              value={draft.rpeScale.max}
              onChange={(e) => update({ rpeScale: { ...draft.rpeScale, max: Number(e.target.value) } })}
              className="rounded-md border border-border bg-page px-2 py-1 text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            Finestra media mobile (giorni)
            <input
              type="number"
              value={draft.rollingWindowDays}
              onChange={(e) => update({ rollingWindowDays: Number(e.target.value) })}
              className="rounded-md border border-border bg-page px-2 py-1 text-ink"
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3 panel p-4">
        <p className="text-sm font-semibold text-ink">Soglie di alert</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            Deficit velocità max (%)
            <input
              type="number"
              value={draft.alertThresholds.maxSpeedDeficitPct}
              onChange={(e) =>
                update({ alertThresholds: { ...draft.alertThresholds, maxSpeedDeficitPct: Number(e.target.value) } })
              }
              className="rounded-md border border-border bg-page px-2 py-1 text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            Mech. work alto (% sopra mediana)
            <input
              type="number"
              value={Math.round(draft.alertThresholds.highMechWorkRelative * 100)}
              onChange={(e) =>
                update({
                  alertThresholds: { ...draft.alertThresholds, highMechWorkRelative: Number(e.target.value) / 100 },
                })
              }
              className="rounded-md border border-border bg-page px-2 py-1 text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            Volume alto (% sopra mediana)
            <input
              type="number"
              value={Math.round(draft.alertThresholds.highVolumeRelative * 100)}
              onChange={(e) =>
                update({
                  alertThresholds: { ...draft.alertThresholds, highVolumeRelative: Number(e.target.value) / 100 },
                })
              }
              className="rounded-md border border-border bg-page px-2 py-1 text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            Training Load alto (% sopra mediana)
            <input
              type="number"
              value={Math.round(draft.alertThresholds.highSRpeRelative * 100)}
              onChange={(e) =>
                update({
                  alertThresholds: { ...draft.alertThresholds, highSRpeRelative: Number(e.target.value) / 100 },
                })
              }
              className="rounded-md border border-border bg-page px-2 py-1 text-ink"
            />
          </label>
        </div>
      </section>

      <ReportTemplatesEditor
        teamName={draft.teamName ?? ''}
        templates={draft.reportTemplates ?? []}
        onChange={update}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
        >
          <Check className="size-4" /> Salva impostazioni
        </button>
        {saved && <span className="text-xs text-status-good">Salvato.</span>}
      </div>
    </fieldset>
  )
}
