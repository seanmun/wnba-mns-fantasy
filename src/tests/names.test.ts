import { describe, expect, it } from 'vitest'
import {
  birthDateOf,
  canonicalName,
  isRealPerson,
  normalizeName,
} from '../lib/players/names'

describe('normalizeName', () => {
  it('folds accents and drops punctuation', () => {
    expect(normalizeName('Azurá Stevens')).toBe('azura stevens')
    expect(normalizeName("A'ja Wilson")).toBe('aja wilson')
    expect(normalizeName('Olivia Nelson-Ododa')).toBe('olivia nelsonododa')
  })

  it('strips trailing suffixes so sources that omit them still match', () => {
    expect(normalizeName('Jaren Jackson Jr.')).toBe('jaren jackson')
    expect(normalizeName('Jaren Jackson')).toBe('jaren jackson')
    expect(normalizeName('Marvin Bagley III')).toBe('marvin bagley')
    expect(normalizeName('Gary Payton II')).toBe('gary payton')
  })

  it('keeps a lone surname that happens to look like a suffix', () => {
    // Never strip down to nothing.
    expect(normalizeName('Jr')).toBe('jr')
  })

  it('is stable and case-insensitive', () => {
    expect(normalizeName('  DeWanna   BONNER ')).toBe('dewanna bonner')
    expect(normalizeName(null)).toBe('')
  })
})

describe('canonicalName', () => {
  it('expands a short first name', () => {
    expect(canonicalName('Matt Thomas')).toBe('matthew thomas')
    expect(canonicalName('Matthew Thomas')).toBe('matthew thomas')
  })

  it('never touches the surname', () => {
    // "Matt" as a LAST name must survive — only the first name expands.
    expect(canonicalName('Jordan Matt')).toBe('jordan matt')
  })

  it('equals the plain key when no nickname applies', () => {
    expect(canonicalName('Napheesa Collier')).toBe(normalizeName('Napheesa Collier'))
  })

  it('applies after suffix stripping', () => {
    expect(canonicalName('Tim Hardaway Jr.')).toBe('timothy hardaway')
  })
})

describe('isRealPerson', () => {
  it('rejects the legacy draft-pick placeholder rows', () => {
    expect(isRealPerson('2027 Round 3 Pick ? (?) (DAL)')).toBe(false)
    expect(isRealPerson('2028 Round 1 Pick')).toBe(false)
  })

  it('accepts actual names', () => {
    expect(isRealPerson('Napheesa Collier')).toBe(true)
    expect(isRealPerson("A'ja Wilson")).toBe(true)
  })

  it('rejects empty and junk', () => {
    expect(isRealPerson('')).toBe(false)
    expect(isRealPerson(null)).toBe(false)
  })
})

describe('birthDateOf', () => {
  it('takes the calendar day out of ESPN timestamps', () => {
    expect(birthDateOf('1987-08-21T07:00Z')).toBe('1987-08-21')
    expect(birthDateOf('1996-08-08')).toBe('1996-08-08')
    expect(birthDateOf(null)).toBe(null)
  })
})
