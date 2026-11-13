/**
 * Derived body-composition values from an ISAK anthropometric profile.
 *
 * Every equation here is for males (the squads using this are male); a female squad
 * would need the female coefficients of each one.
 *
 * - Plicometria: sum of the 8 ISAK skinfolds, mm — only when all 8 were measured.
 * - Massa grassa %: body density from the log of 4 skinfolds (biceps, triceps,
 *   subscapular, iliac crest) — Durnin & Rahaman (1967) for boys under 17, Durnin &
 *   Womersley (1974) age bands from 17 — converted to % fat with Siri (1961).
 * - Massa muscolare kg: Lee et al. (2000) anthropometric skeletal-muscle equation, with
 *   arm, thigh and calf girths corrected for their skinfold; ethnicity term set to 0.
 */

/** Plausible ranges — anything outside is a typo, not a measurement. Also enforced by the API. */
export const BODY_VALUE_RANGES = {
  fatMassPct: [1, 60],
  skinfoldMm: [5, 400],
  muscleMassKg: [10, 150],
} as const

export const FAT_MASS_METHOD = 'durnin-womersley+siri'
export const MUSCLE_MASS_METHOD = 'lee-2000'

export type SkinfoldKey = 'triceps' | 'subscapular' | 'biceps' | 'iliacCrest' | 'supraspinale' | 'abdominal' | 'thigh' | 'calf'
export const ISAK_SKINFOLDS: SkinfoldKey[] = ['triceps', 'subscapular', 'biceps', 'iliacCrest', 'supraspinale', 'abdominal', 'thigh', 'calf']

export interface ProfileInput {
  ageYears?: number
  heightCm?: number
  skinfoldsMm: Partial<Record<SkinfoldKey, number>>
  /** Relaxed arm girth, mid-thigh girth and max calf girth, cm. */
  armGirthCm?: number
  thighGirthCm?: number
  calfGirthCm?: number
}

export interface DerivedBodyValues {
  skinfoldMm?: number
  fatMassPct?: number
  muscleMassKg?: number
  /** Why a value could not be computed, in Italian for the import preview. */
  missing: string[]
}

const round1 = (v: number) => Math.round(v * 10) / 10

/** [c, m] of density = c − m·log10(Σ4 skinfolds), by age band (males). */
function densityCoefficients(age: number): [number, number] {
  if (age < 17) return [1.1533, 0.0643] // Durnin & Rahaman 1967, adolescent boys
  if (age < 20) return [1.162, 0.063]
  if (age < 30) return [1.1631, 0.0632]
  if (age < 40) return [1.1422, 0.0544]
  if (age < 50) return [1.162, 0.07]
  return [1.1715, 0.0779]
}

export function deriveBodyValues(p: ProfileInput): DerivedBodyValues {
  const missing: string[] = []
  const sf = p.skinfoldsMm
  const out: DerivedBodyValues = { missing }

  const all8 = ISAK_SKINFOLDS.map((k) => sf[k])
  if (all8.every((v) => v !== undefined)) out.skinfoldMm = round1(all8.reduce((a, b) => a! + b!, 0)!)
  else missing.push('plicometria: mancano alcune delle 8 pliche')

  const four = [sf.biceps, sf.triceps, sf.subscapular, sf.iliacCrest]
  if (p.ageYears === undefined) missing.push('massa grassa: manca l’età (data di nascita)')
  else if (four.some((v) => v === undefined)) missing.push('massa grassa: servono bicipite, tricipite, sottoscapolare e cresta iliaca')
  else {
    const [c, m] = densityCoefficients(p.ageYears)
    const density = c - m * Math.log10(four.reduce((a, b) => a! + b!, 0)!)
    out.fatMassPct = round1(495 / density - 450)
  }

  const muscleInputs = [p.heightCm, p.ageYears, p.armGirthCm, p.thighGirthCm, p.calfGirthCm, sf.triceps, sf.thigh, sf.calf]
  if (muscleInputs.some((v) => v === undefined)) {
    missing.push('massa muscolare: servono altezza, età, circonferenze di braccio, coscia e polpaccio e le relative pliche')
  } else {
    // Girth corrected for subcutaneous fat: girth − π·skinfold (skinfold mm → cm).
    const corrected = (girth: number, skinfold: number) => girth - (Math.PI * skinfold) / 10
    const cag = corrected(p.armGirthCm!, sf.triceps!)
    const ctg = corrected(p.thighGirthCm!, sf.thigh!)
    const ccg = corrected(p.calfGirthCm!, sf.calf!)
    const heightM = p.heightCm! / 100
    const male = 1
    const ethnicity = 0
    const sm = heightM * (0.00744 * cag ** 2 + 0.00088 * ctg ** 2 + 0.00441 * ccg ** 2) + 2.4 * male - 0.048 * p.ageYears! + ethnicity + 7.8
    out.muscleMassKg = round1(sm)
  }

  return out
}
