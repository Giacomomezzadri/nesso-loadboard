import type { ReportBlock, ReportBlockKind } from '../../types/domain'

export interface ReportBlockDef {
  /** The page it comes from — groups the choices in Settings. */
  group: string
  label: string
  description: string
  /** Which of ReportBlock's options the Settings editor offers for this kind. */
  options: { positions?: boolean }
}

/**
 * Every block a report can contain, one per chart/table of the app. To add one: a new
 * ReportBlockKind in types/domain.ts, an entry here, and its rendering in
 * components/report/ReportBlockView.tsx (for a page section, wrap that section in the page
 * with useReportSection().show('<section>')).
 */
export const REPORT_BLOCKS: Record<ReportBlockKind, ReportBlockDef> = {
  'overview.summary': { group: 'Overview', label: 'Riepilogo sessione', description: 'Sessione selezionata con giocatori, distanza e HSR medie, Vmax.', options: {} },
  'overview.alerts': { group: 'Overview', label: 'Alert della sessione (sintesi)', description: 'Elenco degli alert della sessione selezionata.', options: {} },
  'overview.calendar': { group: 'Overview', label: 'Calendario', description: 'Calendario di pianificazione con le sessioni svolte.', options: {} },
  week_attendance: { group: 'Overview', label: 'Presenze della settimana', description: 'Griglia giocatori × giorni da partita a partita, con la situazione di ognuno.', options: { positions: true } },
  'overview.microcycle': { group: 'Overview', label: 'Completamento microciclo — squadra', description: '% del microciclo tipo per ogni giocatore, sulla metrica scelta.', options: {} },

  'dynamic.td': { group: 'Dynamic Load', label: 'Distanza totale nel tempo', description: 'Media squadra per sessione con media mobile.', options: {} },
  'dynamic.hsr': { group: 'Dynamic Load', label: 'Distanza > 19.8 km/h nel tempo', description: 'Media squadra per sessione con media mobile.', options: {} },
  'dynamic.sprint': { group: 'Dynamic Load', label: 'Distanza > 25.2 km/h nel tempo', description: 'Media squadra per sessione con media mobile.', options: {} },
  'dynamic.mechw': { group: 'Dynamic Load', label: 'Mechanical Work nel tempo', description: 'Media squadra per sessione con media mobile.', options: {} },
  'dynamic.tl': { group: 'Dynamic Load', label: 'Training Load nel tempo', description: 'Media squadra di RPE × minuti per sessione, con media mobile.', options: {} },
  'dynamic.acwr': { group: 'Dynamic Load', label: 'Training Load — ACWR', description: 'Carico acuto (7 giorni) su cronico (media settimanale di 28 giorni) per giocatore.', options: {} },
  'dynamic.microcycle': { group: 'Dynamic Load', label: 'Microciclo per giocatore', description: 'Ogni metrica di carico come % del microciclo tipo, per ruolo.', options: {} },

  'svg.training-vs-game': { group: 'Session v Game', label: 'Allenamento vs Gara', description: "L'allenamento scelto contro il modello gara, squadra e giocatori.", options: {} },
  'svg.intensity': { group: 'Session v Game', label: 'Intensità (per minuto)', description: 'Valori al minuto: allenamento contro gara.', options: {} },
  'svg.weekly-model': { group: 'Session v Game', label: 'Modello prestativo settimanale', description: 'Carico dall\'ultima partita contro il target settimanale.', options: {} },
  'svg.drills': { group: 'Session v Game', label: 'Riepilogo per drill', description: 'Media squadra di ogni drill dell\'allenamento scelto.', options: {} },

  'svs.similar_weeks': { group: 'Session v Session', label: 'Settimane simili', description: 'Giocatore contro mediana squadra nelle settimane con lo stesso numero di allenamenti.', options: {} },
  'svs.table': { group: 'Session v Session', label: 'Sessione vs storico', description: 'Ogni giocatore nella sessione selezionata contro la sua mediana.', options: {} },

  'gvg.head_to_head': { group: 'Game v Game', label: 'Partita vs Partita', description: 'Media squadra di due partite a confronto.', options: {} },
  'gvg.minutes': { group: 'Game v Game', label: 'Minuti giocati', description: 'Minuti di ogni giocatore nelle due partite.', options: {} },
  'gvg.by_group': { group: 'Game v Game', label: 'Confronto per sede / esito', description: 'Media squadra delle partite raggruppate.', options: {} },

  'drills.heatmap': { group: 'Drills', label: 'Tabella per drill', description: 'Heatmap dei giocatori nel drill scelto della sessione selezionata.', options: {} },

  'compare.volume': { group: 'Compare', label: 'Confronto giocatori — Volume', description: 'Fino a 3 giocatori contro la mediana squadra.', options: {} },
  'compare.high_speed': { group: 'Compare', label: 'Confronto giocatori — Alta velocità', description: 'Fino a 3 giocatori contro la mediana squadra.', options: {} },
  'compare.mechanical': { group: 'Compare', label: 'Confronto giocatori — Meccanico', description: 'Fino a 3 giocatori contro la mediana squadra.', options: {} },

  'compare.internal': { group: 'Compare', label: 'Confronto giocatori — Carico interno', description: 'Training Load e RPE di fino a 3 giocatori contro la mediana squadra.', options: {} },

  'profile.tiles': { group: 'Player Profile', label: 'Riquadri giocatore', description: 'Sessioni e presenze, minuti in partita, distanza settimanale, Vmax.', options: {} },
  'profile.jump_tests': { group: 'Player Profile', label: 'Test di salto', description: 'Ultimo CMJ e Drop Jump con asimmetrie.', options: {} },
  'profile.body': { group: 'Player Profile', label: 'Composizione corporea', description: 'Massa grassa, plicometria e massa muscolare con la variazione dall\'ultima misurazione.', options: {} },
  'profile.alerts': { group: 'Player Profile', label: 'Alert del giocatore', description: 'Alert del giocatore nella sessione selezionata.', options: {} },
  'profile.microcycle': { group: 'Player Profile', label: 'Microciclo del giocatore', description: 'Completamento del microciclo attuale, metrica per metrica.', options: {} },
  'profile.weekly_model': { group: 'Player Profile', label: 'Modello settimanale del giocatore', description: 'Carico dall\'ultima partita contro il target.', options: {} },
  'profile.trend': { group: 'Player Profile', label: 'Andamento nel tempo', description: 'Metrica scelta del giocatore contro la mediana squadra.', options: {} },
  'profile.history': { group: 'Player Profile', label: 'Storico sessioni', description: 'Tabella delle sessioni del giocatore.', options: {} },

  'alerts.table': { group: 'Alerts & Flags', label: 'Tabella alert', description: 'Tutti gli alert della sessione selezionata.', options: {} },

  'leaderboard.ranking': { group: 'Leaderboard', label: 'Classifica', description: 'Classifica sulla metrica e sul periodo scelti.', options: {} },
  'leaderboard.scatter': { group: 'Leaderboard', label: 'Scatterplot', description: 'Due variabili a confronto per tutti i giocatori.', options: {} },

  'roster.table': { group: 'Roster', label: 'Tabella roster', description: 'Giocatori con dati fisici, sprint e minuti in partita.', options: {} },
}

export const REPORT_BLOCK_KINDS = Object.keys(REPORT_BLOCKS) as ReportBlockKind[]

/** Kinds grouped by page, in catalog order — for the Settings picker. */
export const REPORT_BLOCK_GROUPS: { group: string; kinds: ReportBlockKind[] }[] = REPORT_BLOCK_KINDS.reduce<
  { group: string; kinds: ReportBlockKind[] }[]
>((groups, kind) => {
  const group = REPORT_BLOCKS[kind].group
  const existing = groups.find((g) => g.group === group)
  if (existing) existing.kinds.push(kind)
  else groups.push({ group, kinds: [kind] })
  return groups
}, [])

export function newReportBlock(kind: ReportBlockKind): ReportBlock {
  return { id: crypto.randomUUID(), kind }
}
