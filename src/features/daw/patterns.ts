import { FX_PRESETS, newEffect } from './fx'
import { noteToMidi } from './samples'
import { TRACK_COLORS, type Clip, type DawProject, type MidiNote, type Track, type TrackKind } from './types'

const uid = () => crypto.randomUUID()

/* ---------------- Petits outils d'écriture ---------------- */

/** Batterie en pas de double croche : « x » frappe, « o » note fantôme, « . » silence. */
function steps(rows: Record<number, string>, accent = 0.9): MidiNote[] {
  const out: MidiNote[] = []
  for (const [p, s] of Object.entries(rows)) {
    const str = s.replace(/\s|\|/g, '')
    for (let i = 0; i < str.length; i++) {
      const c = str[i]
      if (c === '.' || c === '-') continue
      out.push({ id: uid(), p: +p, t: i / 4, d: 0.25, v: c === 'x' ? accent : c === 'X' ? 1 : 0.5 })
    }
  }
  return out
}

/** Suite de notes : « C3:1 E3:0.5 -:1 » (nom:durée, « - » pour un silence). */
function seq(s: string, start = 0, v = 0.8): MidiNote[] {
  const out: MidiNote[] = []
  let t = start
  for (const tok of s.trim().split(/\s+/)) {
    const [n, d] = tok.split(':')
    const dur = parseFloat(d ?? '1')
    if (n !== '-') {
      for (const one of n.split('+')) out.push({ id: uid(), p: noteToMidi(one), t, d: dur * 0.95, v })
    }
    t += dur
  }
  return out
}

/** Accords tenus : « C4+E4+G4:4 … » */
const chords = (s: string, v = 0.7) => seq(s, 0, v)

const CH: Record<string, string> = {
  C: 'C3+G3+C4+E4',
  Cmaj7: 'C3+E4+G4+B4',
  G: 'G2+D3+B3+D4',
  'G/B': 'B2+D3+G3+D4',
  Am: 'A2+E3+A3+C4',
  Am7: 'A2+G3+C4+E4',
  F: 'F2+C3+A3+C4',
  Fmaj7: 'F2+A3+C4+E4',
  Em7: 'E2+D3+G3+B3',
  Dm7: 'D3+C4+F4+A4',
  G7: 'G2+F3+B3+D4',
  E: 'E2+B2+G#3+B3',
  Dm: 'D3+A3+D4+F4',
}
const prog = (names: string[], dur = 4, v = 0.65) => chords(names.map((n) => `${CH[n]}:${dur}`).join(' '), v)

/** Accords rythmés en croches (piano pop). */
function pulse(names: string[], pattern = 'x.x.x.x.', v = 0.6): MidiNote[] {
  const out: MidiNote[] = []
  names.forEach((n, bar) => {
    const notes = CH[n].split('+').slice(1)
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] !== 'x') continue
      for (const nn of notes) out.push({ id: uid(), p: noteToMidi(nn), t: bar * 4 + i * 0.5, d: 0.45, v: i % 4 === 0 ? v + 0.1 : v })
    }
  })
  return out
}

/** Arpège montant sur chaque accord. */
function arp(names: string[], div = 0.25, v = 0.6): MidiNote[] {
  const out: MidiNote[] = []
  names.forEach((n, bar) => {
    const ns = CH[n].split('+').slice(1).map(noteToMidi)
    const order = [...ns, ns[0] + 12, ...ns.slice(1).reverse()]
    for (let i = 0; i < 4 / div; i++) out.push({ id: uid(), p: order[i % order.length], t: bar * 4 + i * div, d: div * 0.9, v })
  })
  return out
}

/* ---------------- Bibliothèque de boucles ---------------- */

export type LoopCat = 'Batterie' | 'Basse' | 'Accords' | 'Arpèges' | 'Mélodies'

export interface Loop {
  id: string
  name: string
  cat: LoopCat
  sound: string
  kind: TrackKind
  bars: number
  bpm: number
  notes: () => MidiNote[]
}

const BD = 36,
  SD = 38,
  CP = 39,
  RS = 37,
  HH = 42,
  OH = 46,
  CR = 49,
  RD = 51,
  T1 = 48,
  T2 = 45,
  T3 = 41,
  SH = 70,
  CB = 56

const D = (id: string, name: string, sound: string, bars: number, bpm: number, rows: Record<number, string>): Loop => ({ id, name, cat: 'Batterie', sound, kind: 'drums', bars, bpm, notes: () => steps(rows) })

export const LOOPS: Loop[] = [
  D('d-pop', 'Pop', 'kit:lm2', 1, 100, { [BD]: 'x.......x.x.....', [SD]: '....x.......x...', [HH]: 'x.x.x.x.x.x.x.x.' }),
  D('d-rock', 'Rock', 'kit:acoustic', 2, 120, { [CR]: 'x...............................', [BD]: 'x.....x.x.......x.....x.x...x...', [SD]: '....x.......x.......x.......x.xx', [HH]: '..x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.' }),
  D('d-boombap', 'Boom bap', 'kit:breakbeat8', 1, 90, { [BD]: 'x......x..x.....', [SD]: '....x.......x...', [HH]: 'x.x.x.x.x.x.x.xo' }),
  D('d-trap', 'Trap', 'kit:tr808', 2, 140, { [BD]: 'x......x..x.....x.......x.x.....', [CP]: '........x...............x.......', [HH]: 'x.x.x.x.xxx.x.x.x.x.x.x.x.xxxxxx', [OH]: '..............x...............x.' }),
  D('d-house', 'House', 'kit:tr808', 1, 122, { [BD]: 'x...x...x...x...', [CP]: '....x.......x...', [HH]: 'x.o.x.o.x.o.x.o.', [OH]: '..x...x...x...x.' }),
  D('d-lofi', 'Lo-fi', 'kit:kit3', 1, 78, { [BD]: 'x......x.x......', [SD]: '....x.......x...', [HH]: 'x.xox.xox.xox.xo' }),
  D('d-reggaeton', 'Dembow', 'kit:tr808', 1, 95, { [BD]: 'x...x...x...x...', [SD]: '...x..x....x..x.', [HH]: 'x.x.x.x.x.x.x.x.' }),
  D('d-funk', 'Funk', 'kit:drumtraks', 1, 104, { [BD]: 'x.x....x..x.....', [SD]: '....x..o.o..x..o', [HH]: 'xxxxxxxxxxxxxxx.', [OH]: '...............x' }),
  D('d-disco', 'Disco', 'kit:lm2', 1, 118, { [BD]: 'x...x...x...x...', [SD]: '....x.......x...', [HH]: 'x.x.x.x.x.x.x.x.', [OH]: '..x...x...x...x.' }),
  D('d-bossa', 'Bossa nova', 'kit:cr8000', 2, 130, { [BD]: 'x..xx..xx..xx..xx..xx..xx..xx..x', [RS]: 'x..x..x...x..x....x..x..x..x....', [HH]: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.' }),
  D('d-ballad', 'Ballade', 'kit:acoustic', 1, 72, { [BD]: 'x.......x.......', [SD]: '....x.......x...', [HH]: 'x.x.x.x.x.x.x.x.' }),
  D('d-afro', 'Afrobeat', 'kit:rz1', 1, 104, { [BD]: 'x..x...x..x.....', [RS]: '....x..x....x...', [SH]: 'x.xxx.xxx.xxx.xx', [CB]: 'x...x.x...x.x...' }),
  D('d-dnb', 'Drum & bass', 'kit:breakbeat13', 1, 172, { [BD]: 'x.........x.....', [SD]: '....x.......x...', [HH]: 'x.x.x.x.x.x.x.x.' }),
  D('d-halftime', 'Demi-temps', 'kit:808mini', 1, 80, { [BD]: 'x.....x.........', [SD]: '........x.......', [HH]: 'x.x.x.x.x.x.x.x.' }),
  D('d-synthpop', 'Synth-pop 80s', 'kit:lm2', 1, 116, { [BD]: 'x...x...x...x...', [SD]: '....x.......x...', [CP]: '....x.......x...', [HH]: 'xxxxxxxxxxxxxxxx' }),
  D('d-ride', 'Jazz ride', 'kit:acoustic', 1, 140, { [RD]: 'x...x.xxx...x.xx', [HH]: '....x.......x...', [BD]: 'x...............' }),
  D('d-fill', 'Roulement de toms', 'kit:acoustic', 1, 100, { [SD]: 'xxxx............', [T1]: '....xxx.........', [T2]: '.......xxx......', [T3]: '..........xxxx..', [BD]: '..............x.', [CR]: '..............x.' }),
  D('d-shaker', 'Percus légères', 'kit:lm2', 1, 100, { [SH]: 'xoxoxoxoxoxoxoxo', [54]: '....x.......x...', [62]: '..x.....x.x.....', [64]: 'x.....x.......x.' }),

  { id: 'b-pop', name: 'Basse pop', cat: 'Basse', sound: 'nb:bass-electric', kind: 'instrument', bars: 4, bpm: 100, notes: () => seq('C2:1.5 C2:0.5 C2:1 G2:1 G1:1.5 G1:0.5 G1:1 D2:1 A1:1.5 A1:0.5 A1:1 E2:1 F1:1.5 F1:0.5 F1:1 C2:1') },
  { id: 'b-sad', name: 'Basse mélancolique', cat: 'Basse', sound: 'gm:electric_bass_finger', kind: 'instrument', bars: 4, bpm: 84, notes: () => seq('A1:2 A1:1 E2:1 F1:2 F1:1 C2:1 C2:2 C2:1 G2:1 G1:2 G1:1 B1:1') },
  { id: 'b-808', name: 'Basse 808', cat: 'Basse', sound: 'synth:bass-808', kind: 'instrument', bars: 2, bpm: 140, notes: () => seq('A1:1.75 A1:0.75 -:0.5 A1:1 C2:1.5 G1:1.5 E1:1', 0, 0.9) },
  { id: 'b-house', name: 'Basse house', cat: 'Basse', sound: 'synth:pluck-bass', kind: 'instrument', bars: 1, bpm: 122, notes: () => seq('-:0.5 A1:0.5 -:0.5 A1:0.5 -:0.5 A1:0.5 -:0.5 C2:0.5') },
  { id: 'b-funk', name: 'Basse funk', cat: 'Basse', sound: 'gm:slap_bass_1', kind: 'instrument', bars: 1, bpm: 104, notes: () => seq('E1:0.5 E2:0.25 -:0.25 E1:0.25 E1:0.25 G1:0.5 A1:0.5 E2:0.25 -:0.25 D2:0.5 B1:0.5') },
  { id: 'b-walk', name: 'Walking bass', cat: 'Basse', sound: 'gm:acoustic_bass', kind: 'instrument', bars: 4, bpm: 140, notes: () => seq('D2:1 F2:1 A2:1 C3:1 G1:1 B1:1 D2:1 F2:1 C2:1 E2:1 G2:1 B2:1 C3:1 B2:1 A2:1 G2:1') },
  { id: 'b-acid', name: 'Basse acide', cat: 'Basse', sound: 'synth:acid', kind: 'instrument', bars: 1, bpm: 128, notes: () => seq('A1:0.25 A1:0.25 A2:0.25 A1:0.25 C2:0.25 A1:0.25 G2:0.25 A1:0.25 A1:0.25 E2:0.25 A1:0.25 A2:0.25 G1:0.25 A1:0.25 C2:0.25 D2:0.25') },
  { id: 'b-lofi', name: 'Basse lo-fi', cat: 'Basse', sound: 'synth:round-bass', kind: 'instrument', bars: 4, bpm: 78, notes: () => seq('F1:2.5 F1:1.5 E1:2.5 E1:1.5 D1:2.5 D1:1.5 C1:2 G1:2') },

  { id: 'c-pop', name: 'Pop (Do Sol La- Fa)', cat: 'Accords', sound: 'splendid', kind: 'instrument', bars: 4, bpm: 100, notes: () => prog(['C', 'G', 'Am', 'F']) },
  { id: 'c-pulse', name: 'Piano pop rythmé', cat: 'Accords', sound: 'splendid', kind: 'instrument', bars: 4, bpm: 100, notes: () => pulse(['C', 'G', 'Am', 'F']) },
  { id: 'c-sad', name: 'Mélancolie (La- Fa Do Sol)', cat: 'Accords', sound: 'nb:piano', kind: 'instrument', bars: 4, bpm: 84, notes: () => prog(['Am', 'F', 'C', 'G']) },
  { id: 'c-lofi', name: 'Lo-fi jazzy', cat: 'Accords', sound: 'sfz:gs-e-pianos/Wurlitzer EP200/wurlitzer-ep200', kind: 'instrument', bars: 4, bpm: 78, notes: () => prog(['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'], 4, 0.55) },
  { id: 'c-jazz', name: 'Jazz ii-V-I', cat: 'Accords', sound: 'gm:electric_piano_1', kind: 'instrument', bars: 4, bpm: 120, notes: () => prog(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']) },
  { id: 'c-andalouse', name: 'Cadence andalouse', cat: 'Accords', sound: 'nb:guitar-nylon', kind: 'instrument', bars: 4, bpm: 96, notes: () => pulse(['Am', 'G', 'F', 'E'], 'x..x..x.', 0.6) },
  { id: 'c-pad', name: 'Nappe rêveuse', cat: 'Accords', sound: 'synth:pad-warm', kind: 'instrument', bars: 4, bpm: 90, notes: () => prog(['Cmaj7', 'Am7', 'Fmaj7', 'G'], 4, 0.6) },
  { id: 'c-stab', name: 'Stabs house', cat: 'Accords', sound: 'synth:stab', kind: 'instrument', bars: 2, bpm: 122, notes: () => chords('-:0.5 A3+C4+E4:0.5 -:1 A3+C4+E4:0.5 -:0.5 G3+B3+D4:0.5 -:0.5 -:0.5 F3+A3+C4:0.5 -:1 F3+A3+C4:0.5 -:0.5 G3+B3+D4:0.5 -:0.5') },
  { id: 'c-strings', name: 'Cordes cinéma', cat: 'Accords', sound: 'gm:string_ensemble_1', kind: 'instrument', bars: 4, bpm: 80, notes: () => prog(['Am', 'F', 'C', 'G'], 4, 0.6) },
  { id: 'c-guitar', name: 'Guitare folk', cat: 'Accords', sound: 'nb:guitar-acoustic', kind: 'instrument', bars: 4, bpm: 96, notes: () => pulse(['C', 'G/B', 'Am', 'F'], 'x.xx.xx.') },
  { id: 'c-organ', name: 'Orgue gospel', cat: 'Accords', sound: 'nb:organ', kind: 'instrument', bars: 4, bpm: 84, notes: () => prog(['C', 'F', 'Am', 'G'], 4, 0.55) },

  { id: 'a-up', name: 'Arpège lumineux', cat: 'Arpèges', sound: 'synth:arp', kind: 'instrument', bars: 4, bpm: 120, notes: () => arp(['C', 'G', 'Am', 'F']) },
  { id: 'a-harp', name: 'Harpe en cascade', cat: 'Arpèges', sound: 'nb:harp', kind: 'instrument', bars: 4, bpm: 90, notes: () => arp(['Am', 'F', 'C', 'G'], 0.5) },
  { id: 'a-pluck', name: 'Pluck électro', cat: 'Arpèges', sound: 'synth:pluck', kind: 'instrument', bars: 2, bpm: 124, notes: () => arp(['Am', 'F'], 0.25, 0.55) },
  { id: 'a-musicbox', name: 'Boîte à musique', cat: 'Arpèges', sound: 'gm:music_box', kind: 'instrument', bars: 4, bpm: 96, notes: () => arp(['C', 'Am', 'F', 'G'], 0.5, 0.5) },

  { id: 'm-simple', name: 'Mélodie douce', cat: 'Mélodies', sound: 'synth:soft-lead', kind: 'instrument', bars: 4, bpm: 100, notes: () => seq('E4:1 G4:1 C5:1.5 B4:0.5 A4:2 G4:2 F4:1 A4:1 C5:1 D5:1 E5:3 -:1') },
  { id: 'm-bell', name: 'Clochettes trap', cat: 'Mélodies', sound: 'synth:bell', kind: 'instrument', bars: 2, bpm: 140, notes: () => seq('E5:0.5 C5:0.5 A4:0.5 E5:0.5 D5:1 C5:1 B4:0.5 G4:0.5 B4:0.5 D5:0.5 C5:2') },
  { id: 'm-flute', name: 'Flûte du matin', cat: 'Mélodies', sound: 'nb:flute', kind: 'instrument', bars: 4, bpm: 90, notes: () => seq('G4:1 A4:0.5 B4:0.5 D5:2 B4:1 A4:1 G4:2 E4:1 G4:1 A4:1.5 G4:0.5 E4:4') },
  { id: 'm-sax', name: 'Phrase de sax', cat: 'Mélodies', sound: 'nb:saxophone', kind: 'instrument', bars: 2, bpm: 96, notes: () => seq('A4:0.5 C5:0.5 D5:0.5 E5:1.5 D5:0.5 C5:0.5 A4:2 G4:0.5 A4:1.5') },
]

export const LOOP_CATS: { id: LoopCat; emoji: string }[] = [
  { id: 'Batterie', emoji: '🥁' },
  { id: 'Basse', emoji: '🎸' },
  { id: 'Accords', emoji: '🎹' },
  { id: 'Arpèges', emoji: '✨' },
  { id: 'Mélodies', emoji: '🎶' },
]

/* ---------------- Pistes et projets ---------------- */

export function newTrack(kind: TrackKind, index: number, partial: Partial<Track> = {}): Track {
  const defaults: Record<TrackKind, { name: string; instrument: string }> = {
    audio: { name: 'Voix', instrument: '' },
    instrument: { name: 'Piano', instrument: 'splendid' },
    drums: { name: 'Batterie', instrument: 'kit:tr808' },
  }
  return {
    id: uid(),
    kind,
    name: defaults[kind].name,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    instrument: defaults[kind].instrument,
    volume: kind === 'drums' ? -6 : kind === 'audio' ? -2 : -6,
    pan: 0,
    send: kind === 'audio' ? 0.15 : 0.1,
    mute: false,
    solo: false,
    arm: false,
    fx: [],
    clips: [],
    ...partial,
  }
}

export function loopClip(l: Loop, start: number, repeat = 1): Clip {
  const one = l.notes()
  const notes: MidiNote[] = []
  for (let r = 0; r < repeat; r++) for (const n of one) notes.push({ ...n, id: uid(), t: n.t + r * l.bars * 4 })
  return { id: uid(), start, name: l.name, length: l.bars * 4 * repeat, notes }
}

export function newProject(partial: Partial<DawProject> = {}): DawProject {
  const t = Date.now()
  return {
    id: uid(),
    createdAt: t,
    updatedAt: t,
    title: 'Nouveau morceau',
    bpm: 100,
    timeSig: [4, 4],
    loop: { on: false, start: 0, end: 16 },
    metronome: false,
    countIn: 1,
    masterVolume: 0,
    masterFx: [],
    reverbSize: 0.45,
    tracks: [],
    ...partial,
  }
}

const loop = (id: string) => LOOPS.find((l) => l.id === id)!
function fromLoops(ids: string[], bars: number, names: string[]): Track[] {
  return ids.map((id, i) => {
    const l = loop(id)
    return newTrack(l.kind, i, { name: names[i], instrument: l.sound, clips: [loopClip(l, 0, Math.max(1, Math.round(bars / l.bars)))] })
  })
}
const vox = (i: number) => newTrack('audio', i, { name: 'Voix', arm: true, fx: FX_PRESETS.find((p) => p.name === 'Voix pop')!.chain() })

export const TEMPLATES: { id: string; name: string; emoji: string; description: string; build: () => DawProject }[] = [
  { id: 'empty', name: 'Projet vide', emoji: '✨', description: 'Une piste voix, et tout le reste à imaginer.', build: () => newProject({ tracks: [newTrack('audio', 0)] }) },
  {
    id: 'voice',
    name: 'Enregistrer ma voix',
    emoji: '🎤',
    description: 'Une piste voix prête (effets pop), métronome et décompte.',
    build: () => newProject({ title: 'Ma voix', metronome: true, tracks: [vox(0)] }),
  },
  {
    id: 'pop',
    name: 'Pop',
    emoji: '🌸',
    description: 'Batterie, piano, basse et une piste pour chanter.',
    build: () => newProject({ title: 'Chanson pop', bpm: 100, loop: { on: true, start: 0, end: 16 }, tracks: [...fromLoops(['d-pop', 'c-pulse', 'b-pop'], 4, ['Batterie', 'Piano', 'Basse']), vox(3)] }),
  },
  {
    id: 'lofi',
    name: 'Lo-fi',
    emoji: '☕',
    description: 'Rythme feutré, Wurlitzer jazzy et basse ronde.',
    build: () => {
      const tr = fromLoops(['d-lofi', 'c-lofi', 'b-lofi'], 4, ['Batterie', 'Wurlitzer', 'Basse'])
      tr[1].fx = FX_PRESETS.find((p) => p.name === 'Cassette lo-fi')!.chain()
      tr[0].fx = [newEffect('lofi', { bits: 10, mix: 0.4 }), newEffect('filter', { freq: 6000 })]
      return newProject({ title: 'Lo-fi du dimanche', bpm: 78, loop: { on: true, start: 0, end: 16 }, tracks: [...tr, vox(3)] })
    },
  },
  {
    id: 'trap',
    name: 'Trap',
    emoji: '💎',
    description: 'Charleston rapide, 808 qui gronde, clochettes.',
    build: () => newProject({ title: 'Trap', bpm: 140, loop: { on: true, start: 0, end: 16 }, tracks: [...fromLoops(['d-trap', 'b-808', 'm-bell'], 4, ['Batterie', '808', 'Mélodie']), vox(3)] }),
  },
  {
    id: 'house',
    name: 'House',
    emoji: '💿',
    description: 'Quatre temps, stabs et basse sur le contretemps.',
    build: () => newProject({ title: 'House', bpm: 122, loop: { on: true, start: 0, end: 8 }, tracks: fromLoops(['d-house', 'c-stab', 'b-house', 'a-pluck'], 2, ['Batterie', 'Stabs', 'Basse', 'Pluck']) }),
  },
  {
    id: 'hiphop',
    name: 'Hip-hop',
    emoji: '🎧',
    description: 'Boom bap à 90, Rhodes et basse aux doigts.',
    build: () => newProject({ title: 'Boom bap', bpm: 90, loop: { on: true, start: 0, end: 16 }, tracks: [...fromLoops(['d-boombap', 'c-jazz', 'b-sad'], 4, ['Batterie', 'Rhodes', 'Basse']), vox(3)] }),
  },
  {
    id: 'ballad',
    name: 'Ballade piano',
    emoji: '🕯️',
    description: 'Grand piano, cordes et voix, tout en douceur.',
    build: () => newProject({ title: 'Ballade', bpm: 72, loop: { on: true, start: 0, end: 16 }, tracks: [...fromLoops(['c-sad', 'c-strings', 'd-ballad'], 4, ['Piano', 'Cordes', 'Batterie']), vox(3)] }),
  },
]
