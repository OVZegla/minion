/**
 * Banque de sons : instruments et batteries tirés de banques libres en ligne.
 *  - General MIDI « MusyngKite » (gleitz/midi-js-soundfonts, CC BY-SA 3.0)
 *  - VCSL, Versilian Community Sample Library (CC0), et pianos électriques Greg Sullivan (CC BY 3.0), via danigb/samples
 *  - Splendid Grand Piano (domaine public) et Salamander Grand Piano (CC BY 3.0, tonejs.github.io)
 *  - nbrosowsky/tonejs-instruments (CC BY 3.0)
 *  - Boîtes à rythmes : danigb/samples et Tonejs/audio
 *  - Synthétiseurs : générés dans le navigateur
 */

export const GM_BASE = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/'
export const DANIGB = 'https://danigb.github.io/samples/'
export const NB_BASE = 'https://nbrosowsky.github.io/tonejs-instruments/samples/'
export const TONE_AUDIO = 'https://tonejs.github.io/audio/'

export type Category =
  | 'Pianos'
  | 'Claviers électriques'
  | 'Orgues et clavecins'
  | 'Guitares'
  | 'Basses'
  | 'Cordes'
  | 'Cuivres'
  | 'Bois'
  | 'Voix et chœurs'
  | 'Synthés'
  | 'Nappes'
  | 'Basses synthé'
  | 'Mailloches et cloches'
  | 'Percussions'
  | 'Monde'
  | 'Effets'
  | 'Batteries'

export const CATEGORIES: { id: Category; emoji: string }[] = [
  { id: 'Pianos', emoji: '🎹' },
  { id: 'Claviers électriques', emoji: '🎛️' },
  { id: 'Orgues et clavecins', emoji: '⛪' },
  { id: 'Guitares', emoji: '🎸' },
  { id: 'Basses', emoji: '🎼' },
  { id: 'Cordes', emoji: '🎻' },
  { id: 'Cuivres', emoji: '🎺' },
  { id: 'Bois', emoji: '🎷' },
  { id: 'Voix et chœurs', emoji: '🎤' },
  { id: 'Synthés', emoji: '🌈' },
  { id: 'Nappes', emoji: '🌫️' },
  { id: 'Basses synthé', emoji: '🔊' },
  { id: 'Mailloches et cloches', emoji: '🔔' },
  { id: 'Percussions', emoji: '👏' },
  { id: 'Monde', emoji: '🌍' },
  { id: 'Effets', emoji: '✨' },
  { id: 'Batteries', emoji: '🥁' },
]

export interface SynthParams {
  osc: { type: OscillatorType; oct?: number; detune?: number; gain?: number }[]
  unison?: number
  spread?: number // cents
  noise?: number
  filter?: { type?: BiquadFilterType; cutoff: number; q?: number; env?: number; keytrack?: number }
  amp: { a: number; d: number; s: number; r: number }
  fenv?: { a: number; d: number; s: number; r: number }
  pitchEnv?: { amt: number; time: number }
  vibrato?: { rate: number; depth: number }
  gain?: number
}

export type Source =
  | { kind: 'gm'; name: string }
  | { kind: 'nb'; name: string; notes: string }
  | { kind: 'sfz'; path: string }
  | { kind: 'splendid' }
  | { kind: 'salamander' }
  | { kind: 'synth'; p: SynthParams }

export interface InstrumentDef {
  id: string
  name: string
  cat: Category
  src: Source
  release?: number
  gain?: number // dB
  oneShot?: boolean
  bank: string
}

/* ---------------- General MIDI (128) ---------------- */

const GM: [string, string, Category][] = [
  ['acoustic_grand_piano', 'Piano à queue', 'Pianos'],
  ['bright_acoustic_piano', 'Piano brillant', 'Pianos'],
  ['electric_grand_piano', 'Piano électrique à queue', 'Claviers électriques'],
  ['honkytonk_piano', 'Piano bastringue', 'Pianos'],
  ['electric_piano_1', 'Piano électrique Rhodes', 'Claviers électriques'],
  ['electric_piano_2', 'Piano électrique FM', 'Claviers électriques'],
  ['harpsichord', 'Clavecin', 'Orgues et clavecins'],
  ['clavinet', 'Clavinet', 'Claviers électriques'],
  ['celesta', 'Célesta', 'Mailloches et cloches'],
  ['glockenspiel', 'Glockenspiel', 'Mailloches et cloches'],
  ['music_box', 'Boîte à musique', 'Mailloches et cloches'],
  ['vibraphone', 'Vibraphone', 'Mailloches et cloches'],
  ['marimba', 'Marimba', 'Mailloches et cloches'],
  ['xylophone', 'Xylophone', 'Mailloches et cloches'],
  ['tubular_bells', 'Cloches tubulaires', 'Mailloches et cloches'],
  ['dulcimer', 'Tympanon', 'Monde'],
  ['drawbar_organ', 'Orgue à tirettes', 'Orgues et clavecins'],
  ['percussive_organ', 'Orgue percussif', 'Orgues et clavecins'],
  ['rock_organ', 'Orgue rock', 'Orgues et clavecins'],
  ['church_organ', 'Orgue d’église', 'Orgues et clavecins'],
  ['reed_organ', 'Harmonium', 'Orgues et clavecins'],
  ['accordion', 'Accordéon', 'Monde'],
  ['harmonica', 'Harmonica', 'Bois'],
  ['tango_accordion', 'Bandonéon', 'Monde'],
  ['acoustic_guitar_nylon', 'Guitare classique', 'Guitares'],
  ['acoustic_guitar_steel', 'Guitare folk', 'Guitares'],
  ['electric_guitar_jazz', 'Guitare jazz', 'Guitares'],
  ['electric_guitar_clean', 'Guitare électrique claire', 'Guitares'],
  ['electric_guitar_muted', 'Guitare étouffée', 'Guitares'],
  ['overdriven_guitar', 'Guitare saturée', 'Guitares'],
  ['distortion_guitar', 'Guitare distorsion', 'Guitares'],
  ['guitar_harmonics', 'Harmoniques de guitare', 'Guitares'],
  ['acoustic_bass', 'Contrebasse jazz', 'Basses'],
  ['electric_bass_finger', 'Basse aux doigts', 'Basses'],
  ['electric_bass_pick', 'Basse au médiator', 'Basses'],
  ['fretless_bass', 'Basse fretless', 'Basses'],
  ['slap_bass_1', 'Basse slap', 'Basses'],
  ['slap_bass_2', 'Basse slap 2', 'Basses'],
  ['synth_bass_1', 'Basse synthé classique', 'Basses synthé'],
  ['synth_bass_2', 'Basse synthé 2', 'Basses synthé'],
  ['violin', 'Violon', 'Cordes'],
  ['viola', 'Alto', 'Cordes'],
  ['cello', 'Violoncelle', 'Cordes'],
  ['contrabass', 'Contrebasse à l’archet', 'Cordes'],
  ['tremolo_strings', 'Cordes trémolo', 'Cordes'],
  ['pizzicato_strings', 'Cordes pizzicato', 'Cordes'],
  ['orchestral_harp', 'Harpe d’orchestre', 'Cordes'],
  ['timpani', 'Timbales', 'Percussions'],
  ['string_ensemble_1', 'Ensemble de cordes', 'Cordes'],
  ['string_ensemble_2', 'Cordes lentes', 'Cordes'],
  ['synth_strings_1', 'Cordes synthé', 'Nappes'],
  ['synth_strings_2', 'Cordes synthé 2', 'Nappes'],
  ['choir_aahs', 'Chœur « aah »', 'Voix et chœurs'],
  ['voice_oohs', 'Voix « ooh »', 'Voix et chœurs'],
  ['synth_choir', 'Chœur synthé', 'Voix et chœurs'],
  ['orchestra_hit', 'Coup d’orchestre', 'Effets'],
  ['trumpet', 'Trompette', 'Cuivres'],
  ['trombone', 'Trombone', 'Cuivres'],
  ['tuba', 'Tuba', 'Cuivres'],
  ['muted_trumpet', 'Trompette bouchée', 'Cuivres'],
  ['french_horn', 'Cor', 'Cuivres'],
  ['brass_section', 'Section de cuivres', 'Cuivres'],
  ['synth_brass_1', 'Cuivres synthé', 'Synthés'],
  ['synth_brass_2', 'Cuivres synthé 2', 'Synthés'],
  ['soprano_sax', 'Saxophone soprano', 'Bois'],
  ['alto_sax', 'Saxophone alto', 'Bois'],
  ['tenor_sax', 'Saxophone ténor', 'Bois'],
  ['baritone_sax', 'Saxophone baryton', 'Bois'],
  ['oboe', 'Hautbois', 'Bois'],
  ['english_horn', 'Cor anglais', 'Bois'],
  ['bassoon', 'Basson', 'Bois'],
  ['clarinet', 'Clarinette', 'Bois'],
  ['piccolo', 'Piccolo', 'Bois'],
  ['flute', 'Flûte traversière', 'Bois'],
  ['recorder', 'Flûte à bec', 'Bois'],
  ['pan_flute', 'Flûte de Pan', 'Monde'],
  ['blown_bottle', 'Bouteille soufflée', 'Effets'],
  ['shakuhachi', 'Shakuhachi', 'Monde'],
  ['whistle', 'Sifflement', 'Bois'],
  ['ocarina', 'Ocarina', 'Bois'],
  ['lead_1_square', 'Lead carré GM', 'Synthés'],
  ['lead_2_sawtooth', 'Lead dent-de-scie GM', 'Synthés'],
  ['lead_3_calliope', 'Lead calliope', 'Synthés'],
  ['lead_4_chiff', 'Lead chiff', 'Synthés'],
  ['lead_5_charang', 'Lead charang', 'Synthés'],
  ['lead_6_voice', 'Lead voix', 'Synthés'],
  ['lead_7_fifths', 'Lead quintes', 'Synthés'],
  ['lead_8_bass__lead', 'Lead basse', 'Basses synthé'],
  ['pad_1_new_age', 'Nappe new age', 'Nappes'],
  ['pad_2_warm', 'Nappe tiède', 'Nappes'],
  ['pad_3_polysynth', 'Nappe polysynth', 'Nappes'],
  ['pad_4_choir', 'Nappe chorale', 'Nappes'],
  ['pad_5_bowed', 'Nappe à l’archet', 'Nappes'],
  ['pad_6_metallic', 'Nappe métallique', 'Nappes'],
  ['pad_7_halo', 'Nappe halo', 'Nappes'],
  ['pad_8_sweep', 'Nappe balayée', 'Nappes'],
  ['fx_1_rain', 'Pluie', 'Effets'],
  ['fx_2_soundtrack', 'Bande originale', 'Effets'],
  ['fx_3_crystal', 'Cristal', 'Effets'],
  ['fx_4_atmosphere', 'Atmosphère', 'Effets'],
  ['fx_5_brightness', 'Éclat', 'Effets'],
  ['fx_6_goblins', 'Lutins', 'Effets'],
  ['fx_7_echoes', 'Échos', 'Effets'],
  ['fx_8_scifi', 'Science-fiction', 'Effets'],
  ['sitar', 'Sitar', 'Monde'],
  ['banjo', 'Banjo', 'Monde'],
  ['shamisen', 'Shamisen', 'Monde'],
  ['koto', 'Koto', 'Monde'],
  ['kalimba', 'Kalimba', 'Monde'],
  ['bagpipe', 'Cornemuse', 'Monde'],
  ['fiddle', 'Violon folk', 'Monde'],
  ['shanai', 'Shehnai', 'Monde'],
  ['tinkle_bell', 'Clochettes', 'Mailloches et cloches'],
  ['agogo', 'Agogo', 'Percussions'],
  ['steel_drums', 'Steel drum', 'Monde'],
  ['woodblock', 'Wood-block', 'Percussions'],
  ['taiko_drum', 'Taiko', 'Percussions'],
  ['melodic_tom', 'Tom mélodique', 'Percussions'],
  ['synth_drum', 'Tambour synthé', 'Percussions'],
  ['reverse_cymbal', 'Cymbale inversée', 'Effets'],
  ['guitar_fret_noise', 'Bruit de frette', 'Effets'],
  ['breath_noise', 'Souffle', 'Effets'],
  ['seashore', 'Bord de mer', 'Effets'],
  ['bird_tweet', 'Oiseaux', 'Effets'],
  ['telephone_ring', 'Sonnerie de téléphone', 'Effets'],
  ['helicopter', 'Hélicoptère', 'Effets'],
  ['applause', 'Applaudissements', 'Effets'],
  ['gunshot', 'Détonation', 'Effets'],
]

const SUSTAINED = /organ|strings|choir|oohs|pad_|lead_|brass|sax|oboe|horn|bassoon|clarinet|piccolo|flute|recorder|whistle|ocarina|violin|viola|cello|contrabass|accordion|harmonica|bagpipe|shanai|trumpet|trombone|tuba|fiddle|bottle|shakuhachi/

/* ---------------- VCSL et pianos électriques (danigb) ---------------- */

const SFZ: [string, string, Category, number?][] = [
  ['Zithers/grand-piano-steinway-b', 'Steinway B (VCSL)', 'Pianos'],
  ['Zithers/grand-piano-kawai', 'Piano à queue Kawai', 'Pianos'],
  ['Zithers/upright-piano-yamaha', 'Piano droit Yamaha', 'Pianos'],
  ['Zithers/upright-piano-knight', 'Piano droit Knight', 'Pianos'],
  ['TX81Z/tx81z-fm-piano', 'Piano FM (TX81Z)', 'Claviers électriques'],
  ['TX81Z/tx81z-piano-1', 'Piano numérique (TX81Z)', 'Claviers électriques'],
  ['TX81Z/tx81z-clavisynth', 'Clavisynth (TX81Z)', 'Synthés'],
  ['Zithers/harpsichord-flemish-8', 'Clavecin flamand', 'Orgues et clavecins'],
  ['Zithers/harpsichord-flemish-full', 'Clavecin flamand plein jeu', 'Orgues et clavecins'],
  ['Zithers/harpsichord-french', 'Clavecin français', 'Orgues et clavecins'],
  ['Zithers/harpsichord-italian', 'Clavecin italien', 'Orgues et clavecins'],
  ['Zithers/harpsichord-english-normal', 'Clavecin anglais', 'Orgues et clavecins'],
  ['Zithers/harpsichord-english-lute', 'Clavecin jeu de luth', 'Orgues et clavecins'],
  ['Edge-blown Aerophones/pipe-organ-loud', 'Grand orgue', 'Orgues et clavecins'],
  ['Edge-blown Aerophones/pipe-organ-quiet', 'Orgue doux', 'Orgues et clavecins'],
  ['Edge-blown Aerophones/pipe-organ-loud-pedal', 'Pédalier d’orgue', 'Orgues et clavecins'],
  ['Edge-blown Aerophones/renaissance-organ-8', 'Orgue Renaissance', 'Orgues et clavecins'],
  ['Edge-blown Aerophones/renaissance-organ-full', 'Orgue Renaissance plein jeu', 'Orgues et clavecins'],
  ['Composite Chordophones/concert-harp', 'Harpe de concert', 'Cordes'],
  ['Composite Chordophones/folk-harp', 'Harpe celtique', 'Cordes'],
  ['Composite Chordophones/strumstick', 'Strumstick', 'Guitares'],
  ['Zithers/psaltery-bowed-and-plucked-pluck', 'Psaltérion pincé', 'Monde'],
  ['Zithers/psaltery-bowed-and-plucked-longbow', 'Psaltérion à l’archet', 'Cordes'],
  ['Zithers/dan-tranh-normal', 'Đàn tranh', 'Monde'],
  ['Zithers/dan-tranh-tremolo', 'Đàn tranh trémolo', 'Monde'],
  ['Zithers/dan-tranh-vibrato', 'Đàn tranh vibrato', 'Monde'],
  ['Reed Aerophones/tenor-saxophone-vibrato', 'Sax ténor vibrato (VCSL)', 'Bois'],
  ['Reed Aerophones/tenor-saxophone-nonvibrato', 'Sax ténor droit (VCSL)', 'Bois'],
  ['Reed Aerophones/tenor-saxophone-staccato', 'Sax ténor staccato', 'Bois'],
  ['Reed Aerophones/saxello-vibrato', 'Saxello', 'Bois'],
  ['Edge-blown Aerophones/baroque-alto-recorder-sustain', 'Flûte à bec alto baroque', 'Bois'],
  ['Edge-blown Aerophones/baroque-soprano-recorder-sustain', 'Flûte à bec soprano', 'Bois'],
  ['Edge-blown Aerophones/baroque-tenor-recorder-susvib', 'Flûte à bec ténor', 'Bois'],
  ['Edge-blown Aerophones/baroque-bass-recorder-sustain', 'Flûte à bec basse', 'Bois'],
  ['Edge-blown Aerophones/ocarina-typical-susvib', 'Ocarina en terre', 'Bois'],
  ['Edge-blown Aerophones/ocarina-small-sustain', 'Petit ocarina', 'Bois'],
  ['Free Aerophones/harmonicahohnerspecial20c-normal', 'Harmonica diatonique', 'Bois'],
  ['Free Aerophones/harmonicahohnerspecial20c-vib', 'Harmonica vibrato', 'Bois'],
  ['Free Aerophones/harmonicahohnersuper64-normal', 'Harmonica chromatique', 'Bois'],
  ['Lip Aerophones/didgeridoo', 'Didgeridoo', 'Monde'],
  ['Struck Idiophones/marimba', 'Marimba en bois', 'Mailloches et cloches'],
  ['Struck Idiophones/vibraphone-soft-mallets', 'Vibraphone doux', 'Mailloches et cloches'],
  ['Struck Idiophones/vibraphone-hard-mallets', 'Vibraphone brillant', 'Mailloches et cloches'],
  ['Struck Idiophones/vibraphone-bowed', 'Vibraphone à l’archet', 'Mailloches et cloches'],
  ['Struck Idiophones/xylophone-medium-mallets', 'Xylophone de concert', 'Mailloches et cloches'],
  ['Struck Idiophones/xylophone-soft-mallets', 'Xylophone doux', 'Mailloches et cloches'],
  ['Struck Idiophones/glockenspiel', 'Glockenspiel de concert', 'Mailloches et cloches'],
  ['Struck Idiophones/tubular-bells-1', 'Cloches d’église', 'Mailloches et cloches'],
  ['Struck Idiophones/tubular-glockenspiel', 'Carillon tubulaire', 'Mailloches et cloches'],
  ['Struck Idiophones/hand-chimes', 'Carillons à main', 'Mailloches et cloches'],
  ['Struck Idiophones/hand-bells-nepalese', 'Cloches népalaises', 'Mailloches et cloches'],
  ['Friction Idiophones/wine-glasses-slow', 'Verres chantants', 'Mailloches et cloches'],
  ['Struck Idiophones/balafon-soft-mallet', 'Balafon', 'Monde'],
  ['Struck Idiophones/balafon-hard-mallet', 'Balafon brillant', 'Monde'],
  ['Plucked Idiophones/kalimba-kenya', 'Kalimba du Kenya', 'Monde'],
  ['Plucked Idiophones/kalimba-tanzania', 'Kalimba de Tanzanie', 'Monde'],
  ['Plucked Idiophones/mbira-dzavadzimu-nyamaropa-zimbabwe-low-b', 'Mbira du Zimbabwe', 'Monde'],
  ['Plucked Idiophones/nyunga-nyunga-mozambique-low-f', 'Nyunga nyunga', 'Monde'],
  ['Struck Idiophones/slit-drum', 'Tambour à fente', 'Percussions'],
  ['Struck Membranophones/timpani-2-scale', 'Timbales d’orchestre', 'Percussions'],
  ['Struck Membranophones/timpani-1-roll', 'Roulement de timbales', 'Percussions'],
  ['Struck Membranophones/bongos', 'Bongos', 'Percussions'],
  ['Struck Membranophones/conga', 'Congas', 'Percussions'],
  ['Struck Idiophones/cajon', 'Cajón', 'Percussions'],
  ['Struck Membranophones/darbuka', 'Darbouka', 'Percussions'],
  ['Struck Membranophones/frame-drum', 'Tambour sur cadre', 'Percussions'],
  ['Struck Membranophones/bass-drum-1', 'Grosse caisse d’orchestre', 'Percussions'],
  ['Struck Membranophones/snare-drum-modern-1', 'Caisse claire de concert', 'Percussions'],
  ['Struck Membranophones/snare-drum-rope-tension', 'Caisse claire ancienne', 'Percussions'],
  ['Struck Membranophones/tom-1', 'Toms acoustiques', 'Percussions'],
  ['Struck Idiophones/hihat-cymbal', 'Charleston acoustique', 'Percussions'],
  ['Struck Idiophones/suspended-cymbal-1', 'Cymbale suspendue', 'Percussions'],
  ['Struck Idiophones/clash-cymbals-1', 'Cymbales frappées', 'Percussions'],
  ['Struck Idiophones/gong-1', 'Gong', 'Percussions'],
  ['Struck Idiophones/tambourine-1', 'Tambourin', 'Percussions'],
  ['Struck Idiophones/shaker-small', 'Petit shaker', 'Percussions'],
  ['Struck Idiophones/shaker-large', 'Grand shaker', 'Percussions'],
  ['Struck Idiophones/cabasa', 'Cabasa', 'Percussions'],
  ['Struck Idiophones/claps', 'Mains qui claquent', 'Percussions'],
  ['Struck Idiophones/claves', 'Claves', 'Percussions'],
  ['Struck Idiophones/cowbells', 'Cloches de vache', 'Percussions'],
  ['Struck Idiophones/agogo-bells', 'Agogo en métal', 'Percussions'],
  ['Struck Idiophones/woodblock', 'Wood-block de concert', 'Percussions'],
  ['Struck Idiophones/guiro', 'Güiro', 'Percussions'],
  ['Struck Idiophones/triangles', 'Triangles', 'Percussions'],
  ['Struck Idiophones/sleigh-bells', 'Grelots', 'Percussions'],
  ['Struck Idiophones/mark-trees', 'Carillon à tiges', 'Percussions'],
  ['Struck Idiophones/bell-tree-stroke', 'Arbre à cloches', 'Percussions'],
  ['Struck Idiophones/vibraslap', 'Vibraslap', 'Percussions'],
  ['Struck Idiophones/anvil', 'Enclume', 'Percussions'],
  ['Struck Idiophones/brake-drum', 'Tambour de frein', 'Percussions'],
  ['Struck Idiophones/ratchet', 'Crécelle', 'Effets'],
  ['Struck Idiophones/slapstick', 'Fouet', 'Effets'],
  ['Struck Idiophones/flexatone', 'Flexatone', 'Effets'],
  ['Other Membranophones/ocean-drum', 'Tambour océan', 'Effets'],
  ['Free Aerophones/siren', 'Sirène', 'Effets'],
  ['Edge-blown Aerophones/train-whistle-toy', 'Sifflet de train', 'Effets'],
  ['Edge-blown Aerophones/ball-whistle', 'Sifflet à bille', 'Effets'],
]

const SFZ_SUSTAIN = /organ|recorder|ocarina|harmonica|sax|didgeridoo|bowed|longbow|wine|tremolo|vibrato|roll/

/* ---------------- Tone.js instruments (nbrosowsky) ---------------- */

const NB: [string, string, Category, string][] = [
  ['piano', 'Piano de salon', 'Pianos', 'A1 C2 D#2 F#2 A2 C3 D#3 F#3 A3 C4 D#4 F#4 A4 C5 D#5 F#5 A5 C6 D#6 F#6 A6 C7'],
  ['guitar-acoustic', 'Guitare acoustique', 'Guitares', 'D2 F2 G#2 B2 D3 F3 G#3 B3 D4 F4 G#4 B4 D5'],
  ['guitar-nylon', 'Guitare nylon', 'Guitares', 'B1 D2 F#2 A2 C#3 E3 G3 A#5 B3 D#4 F#4 A4 C#5 E5 G#5'],
  ['guitar-electric', 'Guitare électrique', 'Guitares', 'C#2 E2 F#2 A2 C3 D#3 F#3 A3 C4 D#4 F#4 A4 C5 D#5 F#5 A5 C6'],
  ['bass-electric', 'Basse électrique', 'Basses', 'C#1 E1 G1 A#1 C#2 E2 G2 A#2 C#3 E3 G3 A#3 C#4 E4 G4 A#4'],
  ['cello', 'Violoncelle solo', 'Cordes', 'C2 D#2 G2 A2 C3 D#3 F#3 A3 C4 D#4 F#4 A4 C5'],
  ['violin', 'Violon solo', 'Cordes', 'G4 A3 C4 E4 A4 C5 E5 G5 A5 C6 E6 G6 A6 C7'],
  ['contrabass', 'Contrebasse', 'Cordes', 'F#1 G1 A#1 C2 D2 E2 F#2 G#2 A2 C#3 E3 G#3 B3'],
  ['harp', 'Harpe', 'Cordes', 'E1 G1 B1 D2 F2 A2 C3 E3 G3 B3 D4 F4 A4 C5 E5 G5 B5 D6 F6 A6 B6 D7 F7'],
  ['flute', 'Flûte', 'Bois', 'C4 E4 A4 C5 E5 A5 C6 E6 A6 C7'],
  ['clarinet', 'Clarinette solo', 'Bois', 'D3 F3 A#3 D4 F4 A#4 D5 F5 A#5 D6 F#6'],
  ['bassoon', 'Basson solo', 'Bois', 'G2 A2 C3 G3 A3 C4 E4 G4 A4 C5'],
  ['saxophone', 'Saxophone', 'Bois', 'C#3 E3 G3 A#3 C#4 E4 G4 A#4 C#5 E5 G5'],
  ['trumpet', 'Trompette solo', 'Cuivres', 'F3 A3 C4 D#4 F4 G4 A#4 D5 F5 A5 C6'],
  ['trombone', 'Trombone solo', 'Cuivres', 'A#1 C#2 D#2 F2 G#2 A#2 C3 D3 D#3 F3 G#3 A#3 C4 D4 F4'],
  ['french-horn', 'Cor d’harmonie', 'Cuivres', 'A1 C2 D#2 G2 A3 D3 F3 C4 D5 F5'],
  ['tuba', 'Tuba solo', 'Cuivres', 'F1 A#1 D#2 F2 A#2 D3 F3 A#3 D4'],
  ['organ', 'Orgue Hammond', 'Orgues et clavecins', 'C1 D#1 F#1 A1 C2 D#2 F#2 A2 C3 D#3 F#3 A3 C4 D#4 F#4 A4 C5 D#5 F#5 A5 C6'],
  ['harmonium', 'Harmonium indien', 'Orgues et clavecins', 'C2 D#2 F#2 A2 C3 D#3 F#3 A3 C4 D#4 G#4 C5'],
  ['xylophone', 'Xylophone en bois', 'Mailloches et cloches', 'G4 C5 G5 C6 G6 C7 G7 C8'],
]
const NB_SUSTAIN = /cello|violin|contrabass|flute|clarinet|bassoon|saxophone|trumpet|trombone|horn|tuba|organ|harmonium/

/* ---------------- Synthétiseurs ---------------- */

const env = (a: number, d: number, s: number, r: number) => ({ a, d, s, r })

const SYNTHS: [string, string, Category, SynthParams][] = [
  ['supersaw', 'Supersaw', 'Synthés', { osc: [{ type: 'sawtooth' }], unison: 7, spread: 28, filter: { cutoff: 5200, q: 0.6, env: 1800 }, amp: env(0.01, 0.3, 0.8, 0.35), fenv: env(0.01, 0.4, 0.4, 0.3), gain: -6 }],
  ['lead-saw', 'Lead dent-de-scie', 'Synthés', { osc: [{ type: 'sawtooth' }, { type: 'sawtooth', detune: 9 }], filter: { cutoff: 2400, q: 2, env: 2600 }, amp: env(0.005, 0.2, 0.75, 0.2), fenv: env(0.005, 0.25, 0.3, 0.2), vibrato: { rate: 5.5, depth: 8 }, gain: -6 }],
  ['lead-square', 'Lead carré', 'Synthés', { osc: [{ type: 'square' }, { type: 'square', oct: 1, gain: 0.3 }], filter: { cutoff: 3200, q: 1, env: 1200 }, amp: env(0.005, 0.15, 0.7, 0.15), fenv: env(0.005, 0.2, 0.4, 0.2), gain: -9 }],
  ['chip', 'Lead 8-bit', 'Synthés', { osc: [{ type: 'square' }], amp: env(0.001, 0.05, 0.6, 0.05), gain: -12 }],
  ['soft-lead', 'Lead doux', 'Synthés', { osc: [{ type: 'triangle' }, { type: 'sine', oct: 1, gain: 0.25 }], amp: env(0.03, 0.2, 0.8, 0.3), vibrato: { rate: 5, depth: 12 }, gain: -3 }],
  ['whistle', 'Sifflet synthé', 'Synthés', { osc: [{ type: 'sine', oct: 1 }], amp: env(0.04, 0.1, 0.9, 0.2), vibrato: { rate: 5.5, depth: 18 }, noise: 0.03, gain: -4 }],
  ['pluck', 'Pluck', 'Synthés', { osc: [{ type: 'sawtooth' }, { type: 'square', detune: -7, gain: 0.5 }], filter: { cutoff: 400, q: 3, env: 5200 }, amp: env(0.002, 0.35, 0, 0.25), fenv: env(0.001, 0.18, 0, 0.1), gain: -6 }],
  ['bell', 'Cloche synthé', 'Synthés', { osc: [{ type: 'sine' }, { type: 'sine', oct: 2, detune: 14, gain: 0.5 }, { type: 'triangle', oct: 3, gain: 0.15 }], amp: env(0.001, 1.6, 0, 1.2), gain: -6 }],
  ['stab', 'Stab house', 'Synthés', { osc: [{ type: 'sawtooth' }, { type: 'sawtooth', detune: 12 }, { type: 'square', oct: -1, gain: 0.4 }], filter: { cutoff: 900, q: 4, env: 3800 }, amp: env(0.002, 0.25, 0.1, 0.15), fenv: env(0.001, 0.2, 0.05, 0.1), gain: -8 }],
  ['brass-synth', 'Cuivres analogiques', 'Synthés', { osc: [{ type: 'sawtooth' }, { type: 'sawtooth', detune: 6 }], unison: 2, spread: 10, filter: { cutoff: 700, q: 1.2, env: 3000 }, amp: env(0.05, 0.3, 0.8, 0.25), fenv: env(0.08, 0.4, 0.5, 0.3), gain: -8 }],
  ['organ-synth', 'Orgue synthé', 'Synthés', { osc: [{ type: 'sine' }, { type: 'sine', oct: 1, gain: 0.6 }, { type: 'sine', oct: 2, gain: 0.35 }, { type: 'square', oct: 1, gain: 0.08 }], amp: env(0.005, 0.05, 1, 0.08), vibrato: { rate: 6.5, depth: 6 }, gain: -6 }],
  ['arp', 'Arpège brillant', 'Synthés', { osc: [{ type: 'square' }, { type: 'sawtooth', oct: 1, gain: 0.4 }], filter: { cutoff: 1800, q: 5, env: 2200 }, amp: env(0.001, 0.18, 0.2, 0.12), fenv: env(0.001, 0.12, 0.1, 0.1), gain: -10 }],
  ['pad-warm', 'Nappe chaude', 'Nappes', { osc: [{ type: 'sawtooth' }, { type: 'sawtooth', detune: 11 }, { type: 'triangle', oct: -1, gain: 0.5 }], filter: { cutoff: 1200, q: 0.8, env: 600 }, amp: env(0.6, 1, 0.85, 1.4), fenv: env(1.2, 2, 0.6, 1.5), gain: -10 }],
  ['pad-glass', 'Nappe de verre', 'Nappes', { osc: [{ type: 'triangle' }, { type: 'sine', oct: 2, gain: 0.3 }, { type: 'sine', oct: 1, detune: 7, gain: 0.4 }], amp: env(0.8, 1, 0.8, 1.8), vibrato: { rate: 0.6, depth: 6 }, gain: -6 }],
  ['pad-air', 'Nappe aérienne', 'Nappes', { osc: [{ type: 'sawtooth' }], unison: 5, spread: 22, noise: 0.04, filter: { cutoff: 600, q: 1.5, env: 2600 }, amp: env(1.4, 1, 0.9, 2.4), fenv: env(2.5, 3, 0.5, 2), gain: -10 }],
  ['pad-dark', 'Nappe sombre', 'Nappes', { osc: [{ type: 'sawtooth', oct: -1 }, { type: 'square', detune: 5, gain: 0.5 }], filter: { cutoff: 420, q: 2, env: 300 }, amp: env(0.9, 1, 0.9, 2), fenv: env(1.5, 2, 0.6, 2), gain: -6 }],
  ['strings-synth', 'Cordes analogiques', 'Nappes', { osc: [{ type: 'sawtooth' }], unison: 4, spread: 16, filter: { cutoff: 2600, q: 0.5 }, amp: env(0.35, 0.5, 0.9, 0.8), vibrato: { rate: 4.8, depth: 5 }, gain: -10 }],
  ['bass-808', 'Basse 808', 'Basses synthé', { osc: [{ type: 'sine' }, { type: 'triangle', gain: 0.15 }], pitchEnv: { amt: 12, time: 0.05 }, amp: env(0.002, 1.8, 0.35, 0.4), gain: 0 }],
  ['sub', 'Sub-basse', 'Basses synthé', { osc: [{ type: 'sine' }], amp: env(0.005, 0.1, 1, 0.12), gain: 0 }],
  ['acid', 'Basse acide', 'Basses synthé', { osc: [{ type: 'sawtooth' }], filter: { cutoff: 260, q: 14, env: 2400 }, amp: env(0.002, 0.2, 0.7, 0.08), fenv: env(0.002, 0.22, 0.1, 0.1), gain: -8 }],
  ['reese', 'Basse Reese', 'Basses synthé', { osc: [{ type: 'sawtooth' }, { type: 'sawtooth', detune: 18 }, { type: 'sine', oct: -1, gain: 0.5 }], filter: { cutoff: 700, q: 1.5, env: 200 }, amp: env(0.005, 0.2, 0.9, 0.15), gain: -8 }],
  ['round-bass', 'Basse ronde', 'Basses synthé', { osc: [{ type: 'triangle' }, { type: 'sine', oct: -1, gain: 0.7 }], filter: { cutoff: 900, q: 1 }, amp: env(0.004, 0.3, 0.7, 0.1), gain: -2 }],
  ['pluck-bass', 'Basse pincée', 'Basses synthé', { osc: [{ type: 'square' }, { type: 'sine', oct: -1, gain: 0.6 }], filter: { cutoff: 300, q: 4, env: 1800 }, amp: env(0.002, 0.35, 0.2, 0.1), fenv: env(0.001, 0.15, 0.05, 0.1), gain: -6 }],
  ['wobble', 'Basse wobble', 'Basses synthé', { osc: [{ type: 'sawtooth' }, { type: 'square', detune: 8 }], filter: { cutoff: 500, q: 6, env: 900 }, amp: env(0.01, 0.2, 0.9, 0.15), fenv: env(0.15, 0.15, 0.2, 0.2), vibrato: { rate: 3, depth: 4 }, gain: -8 }],
]

/* ---------------- Assemblage ---------------- */

export const INSTRUMENTS: InstrumentDef[] = [
  { id: 'splendid', name: 'Grand piano Steinway', cat: 'Pianos', src: { kind: 'splendid' }, release: 0.35, bank: 'Splendid Grand Piano' },
  { id: 'salamander', name: 'Piano Salamander', cat: 'Pianos', src: { kind: 'salamander' }, release: 0.4, bank: 'Salamander Grand Piano' },
  { id: 'sfz:gs-e-pianos/Wurlitzer EP200/wurlitzer-ep200', name: 'Wurlitzer', cat: 'Claviers électriques', src: { kind: 'sfz', path: 'gs-e-pianos/Wurlitzer EP200/wurlitzer-ep200' }, release: 0.3, bank: 'Greg Sullivan E-Pianos' },
  { id: 'sfz:gs-e-pianos/CP80/cp80', name: 'Yamaha CP80', cat: 'Claviers électriques', src: { kind: 'sfz', path: 'gs-e-pianos/CP80/cp80' }, release: 0.3, bank: 'Greg Sullivan E-Pianos' },
  { id: 'sfz:gs-e-pianos/Pianet T/pianet-t', name: 'Pianet T', cat: 'Claviers électriques', src: { kind: 'sfz', path: 'gs-e-pianos/Pianet T/pianet-t' }, release: 0.25, bank: 'Greg Sullivan E-Pianos' },
  ...SFZ.map(([path, name, cat]): InstrumentDef => ({ id: `sfz:vcsl/${path}`, name, cat, src: { kind: 'sfz', path: `vcsl/${path}` }, release: SFZ_SUSTAIN.test(path) ? 0.3 : 1.2, oneShot: cat === 'Percussions' || cat === 'Effets', bank: 'VCSL' })),
  ...NB.map(([name, label, cat, notes]): InstrumentDef => ({ id: `nb:${name}`, name: label, cat, src: { kind: 'nb', name, notes }, release: NB_SUSTAIN.test(name) ? 0.25 : 0.8, bank: 'Tone.js instruments' })),
  ...GM.map(([name, label, cat]): InstrumentDef => ({ id: `gm:${name}`, name: label, cat, src: { kind: 'gm', name }, release: SUSTAINED.test(name) ? 0.25 : 0.9, bank: 'General MIDI' })),
  ...SYNTHS.map(([id, name, cat, p]): InstrumentDef => ({ id: `synth:${id}`, name, cat, src: { kind: 'synth', p }, release: p.amp.r, bank: 'Synthé Minion' })),
]

/* ---------------- Batteries ---------------- */

/** Pads de batterie, notés selon la norme General MIDI. */
export const PADS: { p: number; name: string; short: string }[] = [
  { p: 49, name: 'Crash', short: 'CR' },
  { p: 51, name: 'Ride', short: 'RD' },
  { p: 46, name: 'Charley ouvert', short: 'OH' },
  { p: 42, name: 'Charley fermé', short: 'HH' },
  { p: 48, name: 'Tom aigu', short: 'T1' },
  { p: 45, name: 'Tom médium', short: 'T2' },
  { p: 41, name: 'Tom grave', short: 'T3' },
  { p: 39, name: 'Clap', short: 'CP' },
  { p: 37, name: 'Cerclage', short: 'RS' },
  { p: 38, name: 'Caisse claire', short: 'SD' },
  { p: 36, name: 'Grosse caisse', short: 'BD' },
  { p: 56, name: 'Cloche', short: 'CB' },
  { p: 54, name: 'Tambourin', short: 'TB' },
  { p: 70, name: 'Shaker', short: 'SH' },
  { p: 75, name: 'Claves', short: 'CL' },
  { p: 62, name: 'Conga aiguë', short: 'CH' },
  { p: 64, name: 'Conga grave', short: 'CL' },
]

export interface KitDef {
  id: string
  name: string
  bank: string
  pads: Record<number, string> // hauteur → url
}

const dm = (dir: string, map: Record<number, string>) => {
  const pads: Record<number, string> = {}
  for (const [p, s] of Object.entries(map)) pads[+p] = `${DANIGB}drum-machines/${dir}/${s}.m4a`
  return pads
}
const tone = (dir: string) => ({
  36: `${TONE_AUDIO}drum-samples/${dir}/kick.mp3`,
  38: `${TONE_AUDIO}drum-samples/${dir}/snare.mp3`,
  42: `${TONE_AUDIO}drum-samples/${dir}/hihat.mp3`,
  48: `${TONE_AUDIO}drum-samples/${dir}/tom1.mp3`,
  45: `${TONE_AUDIO}drum-samples/${dir}/tom2.mp3`,
  41: `${TONE_AUDIO}drum-samples/${dir}/tom3.mp3`,
})

export const KITS: KitDef[] = [
  { id: 'kit:tr808', name: 'TR-808', bank: 'Roland TR-808', pads: dm('TR-808', { 36: 'kick/bd2550', 38: 'snare/sd5025', 39: 'clap/cp', 42: 'hihat-close/ch', 46: 'hihat-open/oh25', 41: 'tom-low/lt25', 45: 'mid-tom/mt25', 48: 'tom-hi/ht25', 49: 'cymbal/cy5050', 56: 'cowbell/cb', 37: 'rimshot/rs', 75: 'clave/cl', 70: 'maraca/ma', 62: 'conga-hi/hc25', 64: 'conga-low/lc25' }) },
  { id: 'kit:tr808-long', name: '808 longue', bank: 'Roland TR-808', pads: dm('TR-808', { 36: 'kick/bd7575', 38: 'snare/sd7550', 39: 'clap/cp', 42: 'hihat-close/ch', 46: 'hihat-open/oh75', 41: 'tom-low/lt75', 45: 'mid-tom/mt75', 48: 'tom-hi/ht75', 49: 'cymbal/cy7575', 56: 'cowbell/cb', 37: 'rimshot/rs', 75: 'clave/cl', 70: 'maraca/ma' }) },
  { id: 'kit:lm2', name: 'LinnDrum', bank: 'Linn LM-2', pads: dm('LM-2', { 36: 'kick', 38: 'snare-m', 39: 'clap', 42: 'hhclosed', 46: 'hhopen', 41: 'tom-l', 45: 'tom-m', 48: 'tom-h', 49: 'crash', 51: 'ride', 56: 'cowbell', 37: 'stick-m', 54: 'tambourine', 70: 'cabasa', 62: 'conga-h', 64: 'conga-l' }) },
  { id: 'kit:rz1', name: 'Casio RZ-1', bank: 'Casio RZ-1', pads: dm('Casio-RZ1', { 36: 'kick', 38: 'snare', 39: 'clap', 42: 'hihat-closed', 46: 'hihat-open', 41: 'tom-3', 45: 'tom-2', 48: 'tom-1', 49: 'crash', 51: 'ride', 56: 'cowbell', 75: 'clave' }) },
  { id: 'kit:cr8000', name: 'CR-8000', bank: 'Roland CR-8000', pads: dm('Roland-CR-8000', { 36: 'Cr8kbass', 38: 'Cr8ksnar', 39: 'Cr8kclap', 42: 'Cr8kchat', 46: 'Cr8kohat', 41: 'Cr8klotm', 48: 'Cr8khitm', 49: 'Cr8kcymb', 56: 'Cr8kcowb', 37: 'Cr8krim', 75: 'Cr8kclav', 62: 'Cr8kmcng', 64: 'Cr8klcng' }) },
  { id: 'kit:drumtraks', name: 'Drumtraks', bank: 'Sequential Circuits', pads: dm('Sequential-Circuits-Drumtraks', { 36: 'DT_Kick', 38: 'DT_Snare', 39: 'DT_Clap', 42: 'DT_Closedhat', 46: 'DT_Openhat', 41: 'DT_Tom02', 48: 'DT_Tom01', 49: 'DT_Crash', 51: 'DT_Ride', 56: 'DT_Cowbell', 37: 'DT_Rimshot', 54: 'DT_Tamborine', 70: 'DT_Cabasa' }) },
  { id: 'kit:mfb512', name: 'MFB-512', bank: 'MFB', pads: dm('MFB-512', { 36: '512bdrum', 38: '512snare', 39: '512clap', 42: '512hhcl', 46: '512hhop', 41: '512lotom', 45: '512mdtom', 48: '512hitom', 49: '512cymb' }) },
  { id: 'kit:mr10', name: 'Yamaha MR-10', bank: 'Yamaha MR-10', pads: dm('Yamaha-MR10', { 36: 'kick', 38: 'snare', 37: 'shortsn', 42: 'chihat', 46: 'ohihat', 41: 'lowtom', 45: 'midtom', 48: 'hitom', 49: 'crash', 51: 'cymbal', 70: 'shaker', 54: 'brush' }) },
  { id: 'kit:808mini', name: '808 mini', bank: '808 mini', pads: dm('808-mini', { 36: 'kick', 38: 'snare-1', 37: 'snare-3', 42: 'hhclosed-1', 46: 'hhopen-1', 41: 'tom-low', 45: 'tom-mid', 48: 'tom-high', 49: 'crash', 51: 'ride' }) },
  { id: 'kit:sk1', name: 'Casio SK-1', bank: 'Casio SK-1', pads: dm('Casio-SK1', { 36: 'kick', 38: 'snare', 42: 'hithat', 46: 'hihat-open', 41: 'tom-low', 48: 'tom-hi' }) },
  { id: 'kit:acoustic', name: 'Batterie acoustique', bank: 'Tone.js', pads: tone('acoustic-kit') },
  { id: 'kit:breakbeat8', name: 'Breakbeat', bank: 'Tone.js', pads: tone('breakbeat8') },
  { id: 'kit:breakbeat9', name: 'Breakbeat brut', bank: 'Tone.js', pads: tone('breakbeat9') },
  { id: 'kit:breakbeat13', name: 'Breakbeat vinyle', bank: 'Tone.js', pads: tone('breakbeat13') },
  { id: 'kit:cr78', name: 'CR-78', bank: 'Tone.js', pads: tone('CR78') },
  { id: 'kit:kpr77', name: 'KPR-77', bank: 'Tone.js', pads: tone('KPR77') },
  { id: 'kit:linn', name: 'Linn', bank: 'Tone.js', pads: tone('LINN') },
  { id: 'kit:r8', name: 'R-8', bank: 'Tone.js', pads: tone('R8') },
  { id: 'kit:stark', name: 'Stark', bank: 'Tone.js', pads: tone('Stark') },
  { id: 'kit:techno', name: 'Techno', bank: 'Tone.js', pads: tone('Techno') },
  { id: 'kit:4op', name: 'FM 4-op', bank: 'Tone.js', pads: tone('4OP-FM') },
  { id: 'kit:kit3', name: 'Kit lo-fi', bank: 'Tone.js', pads: tone('Kit3') },
  { id: 'kit:kit8', name: 'Kit synthé', bank: 'Tone.js', pads: tone('Kit8') },
  { id: 'kit:bongos', name: 'Bongos', bank: 'Tone.js', pads: tone('Bongos') },
  { id: 'kit:cheeba1', name: 'Cheebacabra', bank: 'Tone.js', pads: tone('TheCheebacabra1') },
  { id: 'kit:cheeba2', name: 'Cheebacabra 2', bank: 'Tone.js', pads: tone('TheCheebacabra2') },
]

const BY_ID = new Map<string, InstrumentDef>(INSTRUMENTS.map((i) => [i.id, i]))
const KIT_BY_ID = new Map<string, KitDef>(KITS.map((k) => [k.id, k]))

export const getInstrument = (id: string) => BY_ID.get(id)
export const getKit = (id: string) => KIT_BY_ID.get(id)
export const soundName = (id: string) => BY_ID.get(id)?.name ?? KIT_BY_ID.get(id)?.name ?? 'Instrument'
export const categoryEmoji = (c: Category) => CATEGORIES.find((x) => x.id === c)?.emoji ?? '🎵'
export function soundEmoji(id: string) {
  if (KIT_BY_ID.has(id)) return '🥁'
  const i = BY_ID.get(id)
  return i ? categoryEmoji(i.cat) : '🎵'
}

/** Pads présents dans un kit (dans l'ordre d'affichage de l'éditeur). */
export const kitPads = (kit: KitDef) => PADS.filter((p) => kit.pads[p.p])
