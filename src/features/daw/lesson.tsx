import { getInstrument, soundName } from './bank'
import { FX_PRESETS } from './fx'
import type { Update } from './Arrange'
import type { TourStep } from './Tour'
import type { Clip, DawProject, MidiNote, Track, TrackKind } from './types'

/** Ce dont la leçon a besoin pour agir dans le studio. */
export interface LessonApi {
  p: () => DawProject
  update: Update
  addTrack: (kind: TrackKind, partial?: Partial<Track>) => Track
  addLoop: (loopId: string, trackId: string | null, beat?: number) => void
  openEditor: (clipId: string) => void
  setPanel: (p: 'editor' | 'mixer' | 'fx' | 'keys' | null) => void
  setBrowser: (b: boolean) => void
  setBrowserFor: (id: string | null) => void
  setSelTrack: (id: string) => void
  setFxTarget: (id: string) => void
  plays: () => number
}

const uid = () => crypto.randomUUID()
const n = (p: number, t: number, d: number, v = 0.85): MidiNote => ({ id: uid(), p, t, d, v })
const KICK = 36
const SNARE = 38
const HAT = 42

export function lessonSteps(api: LessonApi): TourStep[] {
  const { p, update } = api
  const drums = () => p().tracks.find((t) => t.kind === 'drums')
  const dclip = () => drums()?.clips.find((c) => c.notes)
  const isBass = (t: Track) => t.kind === 'instrument' && /Basse/.test(getInstrument(t.instrument)?.cat ?? '')
  const bass = () => p().tracks.find(isBass)
  const bclip = () => bass()?.clips.find((c) => c.notes)
  const chords = () =>
    p().tracks.find((t) => t.kind === 'instrument' && !isBass(t) && t.clips.some((c) => (c.notes ?? []).some((a) => (c.notes ?? []).filter((b) => Math.abs(b.t - a.t) < 0.01).length >= 3)))
  const count = (c: Clip | undefined, pitch: number) => (c?.notes ?? []).filter((x) => x.p === pitch).length
  const setClip = (trackId: string, clip: Clip) => update((pp) => ({ ...pp, tracks: pp.tracks.map((t) => (t.id === trackId ? { ...t, clips: t.clips.some((c) => c.id === clip.id) ? t.clips.map((c) => (c.id === clip.id ? clip : c)) : [...t.clips, clip] } : t)) }))
  const newClip = (t: Track, bars: number, name: string) => {
    const c: Clip = { id: uid(), start: 0, name, length: bars * 4, notes: [] }
    setClip(t.id, c)
    api.setSelTrack(t.id)
    api.openEditor(c.id)
    return c
  }
  const addNotes = (trackId: string, clip: Clip, notes: MidiNote[]) => setClip(trackId, { ...clip, notes: [...(clip.notes ?? []), ...notes] })
  /** Allonge un clip à 4 mesures en répétant son motif. */
  const stretch = (t: Track, c: Clip) => {
    const L0 = c.length ?? 4
    const base = (c.notes ?? []).filter((x) => x.t < L0)
    const notes: MidiNote[] = []
    for (let k = 0; k * L0 < 16; k++) for (const x of base) if (x.t + k * L0 < 16) notes.push(k ? { ...x, id: uid(), t: x.t + k * L0 } : x)
    setClip(t.id, { ...c, length: 16, notes })
  }
  let mark = 0
  const markPlays = () => (mark = api.plays())
  const played = () => api.plays() > mark

  return [
    /* ------------------------------------------------------------ */
    {
      chapter: 'Préparer',
      title: 'On crée une musique ensemble !',
      before: () => {
        api.setBrowser(false)
        api.setPanel('editor')
      },
      text: (
        <>
          <p>
            On va fabriquer une vraie petite musique, à partir de rien : <b>un rythme de batterie</b>, <b>une basse</b>, <b>des accords de piano</b>, et si tu veux <b>ta voix</b>.
          </p>
          <p>
            À chaque étape, je te dis exactement quoi faire et je vérifie avec toi (tu verras une case verte ✓). Si tu bloques, clique sur <b>« Fais-le pour moi »</b> : je le fais et tu regardes.
          </p>
        </>
      ),
    },
    {
      chapter: 'Préparer',
      target: '.arr-ruler',
      title: 'Comment se lit le studio',
      text: (
        <>
          <p>
            Le temps avance <b>de gauche à droite</b>, comme une phrase. Les numéros en haut sont les <b>mesures</b> : 1, 2, 3…
          </p>
          <p>
            Une mesure, c’est 4 temps : compte « <b>1, 2, 3, 4</b> » en tapant du pied, c’est une mesure. Chaque instrument aura sa propre ligne, qu’on appelle une <b>piste</b>.
          </p>
        </>
      ),
    },
    {
      chapter: 'Préparer',
      target: '.dw-tempo',
      title: 'Le tempo',
      text: <p>Le tempo, c’est la vitesse de la musique, en battements par minute (BPM). 90, c’est tranquille, comme un pas qui se balade.</p>,
      task: (
        <>
          Clique dans la case <b>100 BPM</b>, efface et tape <b>90</b>.
        </>
      ),
      done: () => p().bpm === 90,
      doIt: () => update((pp) => ({ ...pp, bpm: 90 })),
    },

    /* ------------------------------------------------------------ */
    {
      chapter: 'Batterie',
      target: '.th.add',
      title: 'Une piste de batterie',
      text: <p>On commence toujours par le rythme : c’est lui qui donne envie de bouger la tête.</p>,
      task: (
        <>
          Clique sur le bouton <b>« 🥁 Batterie »</b>, en bas à gauche.
        </>
      ),
      done: () => !!drums(),
      doIt: () => api.addTrack('drums'),
    },
    {
      chapter: 'Batterie',
      target: '.arr-row[data-kind="drums"] .arr-lane',
      before: () => api.setBrowser(false),
      title: 'Une boîte pour les notes',
      text: (
        <p>
          La musique se range dans des <b>clips</b> : des boîtes colorées posées sur la piste. Pour en créer un, on double-clique dans la piste.
        </p>
      ),
      task: (
        <>
          <b>Double-clique</b> dans la ligne de la batterie, tout au début (sous le « 1 »).
        </>
      ),
      done: () => !!dclip(),
      doIt: () => {
        const t = drums()
        if (t) newClip(t, 1, 'Rythme')
      },
    },
    {
      chapter: 'Batterie',
      target: '.dpr',
      before: () => {
        const c = dclip()
        if (c) api.openEditor(c.id)
      },
      title: 'La grille de batterie',
      text: (
        <>
          <p>Le clip s’ouvre en bas, dans l’éditeur. Chaque ligne est un élément de la batterie (les noms sont à gauche : grosse caisse, caisse claire…).</p>
          <p>
            De gauche à droite, c’est le temps : les grands traits marquent les <b>temps 1, 2, 3, 4</b>, et chaque temps est coupé en 4 petites cases. Un clic sur une case = un coup. Un clic sur un coup = on l’efface.
          </p>
        </>
      ),
    },
    {
      chapter: 'Batterie',
      target: '.dpr',
      title: 'La grosse caisse',
      text: <p>La grosse caisse, c’est le « boum » grave. Elle tombe sur les temps forts.</p>,
      task: (
        <>
          Sur la ligne <b>Grosse caisse</b>, clique la case sous le <b>1</b> et la case sous le <b>.3</b>.
        </>
      ),
      done: () => count(dclip(), KICK) >= 2,
      doIt: () => {
        const t = drums()
        const c = dclip()
        if (t && c) addNotes(t.id, c, [n(KICK, 0, 0.25), n(KICK, 2, 0.25)])
      },
    },
    {
      chapter: 'Batterie',
      target: '.dpr',
      title: 'La caisse claire',
      text: <p>La caisse claire, c’est le « tchak » qui répond. Elle tombe entre les boums.</p>,
      task: (
        <>
          Sur la ligne <b>Caisse claire</b>, clique sous le <b>.2</b> et sous le <b>.4</b>.
        </>
      ),
      done: () => count(dclip(), SNARE) >= 2,
      doIt: () => {
        const t = drums()
        const c = dclip()
        if (t && c) addNotes(t.id, c, [n(SNARE, 1, 0.25), n(SNARE, 3, 0.25)])
      },
    },
    {
      chapter: 'Batterie',
      target: '.dpr',
      title: 'Le charleston',
      text: <p>Le charleston (« charley »), ce sont les petits « tss tss » qui font avancer le rythme.</p>,
      task: (
        <>
          Sur la ligne <b>Charley fermé</b>, clique <b>une case sur deux</b> tout le long (8 coups). Astuce : tu peux maintenir le clic et glisser.
        </>
      ),
      done: () => count(dclip(), HAT) >= 4,
      doIt: () => {
        const t = drums()
        const c = dclip()
        if (t && c) addNotes(t.id, c, Array.from({ length: 8 }, (_, k) => n(HAT, k * 0.5, 0.25, k % 2 ? 0.55 : 0.8)))
      },
    },
    {
      chapter: 'Batterie',
      target: '.dw-transport',
      before: markPlays,
      title: 'Écoute ton rythme !',
      text: <p>Le bouton ▶ lance la lecture, et le même bouton (■) l’arrête. La barre d’espace du clavier fait pareil.</p>,
      task: (
        <>
          Appuie sur <b>▶</b> (ou <kbd>Espace</kbd>), écoute, puis arrête.
        </>
      ),
      done: played,
    },
    {
      chapter: 'Batterie',
      target: '.arr-row[data-kind="drums"] .clip',
      title: 'Faire durer le rythme',
      text: <p>Ton rythme ne dure qu’une mesure. Pas besoin de tout recopier : en étirant le clip, il se répète tout seul.</p>,
      task: (
        <>
          Mets la souris sur le <b>bord droit</b> du clip (le curseur devient ↔), maintiens le clic et tire jusqu’au chiffre <b>5</b> de la règle.
        </>
      ),
      done: () => (dclip()?.length ?? 0) >= 15.9,
      doIt: () => {
        const t = drums()
        const c = dclip()
        if (t && c) stretch(t, c)
      },
    },
    {
      chapter: 'Batterie',
      target: '.dw-loop-btn',
      title: 'La boucle',
      text: <p>La boucle fait recommencer la lecture au début, encore et encore : parfait pour travailler. La bande orange au-dessus de la règle montre le passage qui tourne.</p>,
      task: (
        <>
          Allume la boucle avec le bouton <b>🔁</b>.
        </>
      ),
      done: () => p().loop.on,
      doIt: () => update((pp) => ({ ...pp, loop: { on: true, start: 0, end: 16 } })),
    },

    /* ------------------------------------------------------------ */
    {
      chapter: 'Basse',
      target: '.th.add',
      title: 'Une piste d’instrument',
      text: <p>Maintenant, la basse : la note grave qui donne la couleur du morceau. Pour tout ce qui joue des notes (piano, basse, guitare…), on ajoute une piste « Instrument ».</p>,
      task: (
        <>
          Clique sur <b>« 🎹 Instrument »</b>.
        </>
      ),
      done: () => p().tracks.some((t) => t.kind === 'instrument'),
      doIt: () => api.addTrack('instrument'),
    },
    {
      chapter: 'Basse',
      target: '.br',
      before: () => {
        const t = p().tracks.find((x) => x.kind === 'instrument')
        if (t) {
          api.setSelTrack(t.id)
          api.setBrowserFor(t.id)
        }
        api.setBrowser(true)
      },
      title: 'Choisir le son',
      text: <p>À droite, c’est la banque de sons. Le ▶ rond permet d’écouter un son avant de le choisir.</p>,
      task: (
        <>
          Clique sur la catégorie <b>« Basses »</b>, puis sur <b>« Basse électrique »</b>.
        </>
      ),
      done: () => !!bass(),
      doIt: () => {
        const t = p().tracks.find((x) => x.kind === 'instrument')
        if (t) update((pp) => ({ ...pp, tracks: pp.tracks.map((x) => (x.id === t.id ? { ...x, instrument: 'nb:bass-electric', name: soundName('nb:bass-electric') } : x)) }))
      },
    },
    {
      chapter: 'Basse',
      target: '.arr-row[data-kind="instrument"] .arr-lane',
      before: () => api.setBrowser(false),
      title: 'Un clip pour la basse',
      text: <p>Comme pour la batterie : un double-clic dans la piste crée un clip.</p>,
      task: (
        <>
          <b>Double-clique</b> au début de la piste de la basse.
        </>
      ),
      done: () => !!bclip(),
      doIt: () => {
        const t = bass()
        if (t) newClip(t, 2, 'Basse')
      },
    },
    {
      chapter: 'Basse',
      target: '.arr-row[data-kind="instrument"] .clip',
      title: 'Même longueur que la batterie',
      text: <p>On veut 4 mesures de basse, une note par mesure.</p>,
      task: (
        <>
          Tire le <b>bord droit</b> du clip de basse jusqu’au chiffre <b>5</b>.
        </>
      ),
      done: () => (bclip()?.length ?? 0) >= 15.9,
      doIt: () => {
        const t = bass()
        const c = bclip()
        if (t && c) setClip(t.id, { ...c, length: 16 })
      },
    },
    {
      chapter: 'Basse',
      target: '.dpr',
      before: () => {
        const c = bclip()
        if (c) api.openEditor(c.id)
      },
      title: 'Le clavier de notes',
      text: (
        <>
          <p>
            Pour un instrument, l’éditeur montre un <b>clavier de piano</b> à gauche : plus on monte, plus c’est aigu. Les noms (Do1, Do2…) repèrent chaque Do. La molette fait monter ou descendre.
          </p>
          <p>Clique pour poser une note, puis tire vers la droite (sans lâcher) pour qu’elle dure plus longtemps.</p>
        </>
      ),
      task: (
        <>
          Pose 4 notes longues, une par mesure : <b>Do1</b> (mesure 1), <b>Sol1</b> (mesure 2), <b>La1</b> (mesure 3), <b>Fa1</b> (mesure 4).
        </>
      ),
      done: () => (bclip()?.notes ?? []).length >= 4,
      doIt: () => {
        const t = bass()
        const c = bclip()
        if (t && c) addNotes(t.id, c, [n(36, 0, 4), n(43, 4, 4), n(45, 8, 4), n(41, 12, 4)])
      },
    },
    {
      chapter: 'Basse',
      target: '.dw-transport',
      before: markPlays,
      title: 'Écoute la batterie et la basse',
      text: <p>Les deux pistes jouent en même temps : ça commence à ressembler à une chanson !</p>,
      task: (
        <>
          Appuie sur <b>▶</b> pour écouter, puis arrête.
        </>
      ),
      done: played,
    },

    /* ------------------------------------------------------------ */
    {
      chapter: 'Accords',
      target: '.br',
      before: () => {
        api.setBrowserFor(null)
        api.setBrowser(true)
      },
      title: 'Des accords tout prêts',
      text: (
        <p>
          Un accord, c’est plusieurs notes jouées ensemble. Plutôt que de les poser une par une, on peut prendre une <b>boucle</b> toute prête : elle joue les mêmes notes que ta basse (Do, Sol, La, Fa).
        </p>
      ),
      task: (
        <>
          En haut de la banque, clique sur l’onglet <b>« Boucles »</b>, puis la catégorie <b>« Accords »</b>, puis <b>« Pop (Do Sol La- Fa) »</b>.
        </>
      ),
      done: () => !!chords(),
      doIt: () => api.addLoop('c-pop', null, 0),
    },
    {
      chapter: 'Accords',
      target: '.dw-transport',
      before: () => {
        markPlays()
        api.setBrowser(false)
      },
      title: 'Écoute ton morceau',
      text: <p>Batterie, basse et piano : c’est un vrai petit groupe. Une boucle, c’est comme un clip normal : tu peux l’ouvrir dans l’éditeur et changer ses notes.</p>,
      task: (
        <>
          Appuie sur <b>▶</b> et profite, puis arrête.
        </>
      ),
      done: played,
    },

    /* ------------------------------------------------------------ */
    {
      chapter: 'Mixage',
      target: '.mx-strips',
      before: () => api.setPanel('mixer'),
      title: 'Le mixeur',
      text: (
        <p>
          Le mixage, c’est régler le volume de chaque piste pour que tout s’entende bien. Une colonne = une piste. Le <b>curseur vertical</b> règle le volume, le bouton <b>Pan</b> place le son à gauche ou à droite, <b>Réverbe</b> ajoute de l’écho de salle.
        </p>
      ),
      task: (
        <>
          Baisse un peu le volume du <b>piano</b> : fais glisser son curseur vers le bas.
        </>
      ),
      done: () => p().tracks.some((t) => t.kind !== 'audio' && (t.volume < -6.4 || t.volume > -5.6)),
      doIt: () => {
        const t = chords() ?? p().tracks.find((x) => x.kind === 'instrument')
        if (t) update((pp) => ({ ...pp, tracks: pp.tracks.map((x) => (x.id === t.id ? { ...x, volume: -10 } : x)) }))
      },
    },
    {
      chapter: 'Mixage',
      target: '.fx-head',
      before: () => {
        const t = chords() ?? p().tracks.find((x) => x.kind === 'instrument')
        if (t) api.setFxTarget(t.id)
        api.setPanel('fx')
      },
      title: 'Les effets',
      text: <p>Les effets transforment le son : réverbe (comme dans une église), écho, son de radio… Le plus simple, ce sont les préréglages.</p>,
      task: (
        <>
          Clique sur <b>« Préréglages »</b> et choisis <b>« Large et brillant »</b>.
        </>
      ),
      done: () => p().tracks.some((t) => t.fx.length > 0),
      doIt: () => {
        const t = chords() ?? p().tracks.find((x) => x.kind === 'instrument')
        const pr = FX_PRESETS.find((x) => x.name === 'Large et brillant')!
        if (t) update((pp) => ({ ...pp, tracks: pp.tracks.map((x) => (x.id === t.id ? { ...x, fx: pr.chain() } : x)) }))
      },
    },

    /* ------------------------------------------------------------ */
    {
      chapter: 'Voix',
      target: '.th.add',
      before: () => api.setPanel('mixer'),
      title: 'Une piste pour chanter',
      text: <p>Pour enregistrer ta voix, il faut une piste « Voix », puis l’<b>armer</b> avec son bouton rond ● : ça veut dire « c’est ici que j’enregistre ». Le navigateur te demandera d’autoriser le micro.</p>,
      task: (
        <>
          Clique sur <b>« 🎙️ Voix »</b>, puis sur le <b>●</b> de cette nouvelle piste (il devient rouge).
        </>
      ),
      done: () => p().tracks.some((t) => t.kind === 'audio' && t.arm),
      doIt: () => {
        const t = p().tracks.find((x) => x.kind === 'audio')
        if (t) update((pp) => ({ ...pp, tracks: pp.tracks.map((x) => (x.id === t.id ? { ...x, arm: true } : x)) }))
        else api.addTrack('audio', { arm: true, fx: FX_PRESETS.find((x) => x.name === 'Voix pop')!.chain() })
      },
    },
    {
      chapter: 'Voix',
      target: '.dw-transport',
      title: 'Enregistre-toi',
      text: (
        <>
          <p>Si tu as un casque, mets-le : sinon le micro entend aussi la musique. Le décompte fait 4 bips avant de commencer.</p>
          <p>Ce n’est pas grave si ce n’est pas parfait : <kbd>Ctrl Z</kbd> efface, et tu peux recommencer autant que tu veux.</p>
        </>
      ),
      task: (
        <>
          Appuie sur le <b>● rouge</b>, attends les 4 bips, chante ou parle, puis appuie sur <b>■</b>. (Pas envie ? Clique sur « Passer ».)
        </>
      ),
      done: () => p().tracks.some((t) => t.clips.some((c) => c.audioId)),
    },

    /* ------------------------------------------------------------ */
    {
      chapter: 'Finir',
      target: '.dw-title',
      title: 'Donne-lui un nom',
      text: <p>Ta musique est enregistrée automatiquement, à chaque changement. Tu la retrouveras dans la page du studio.</p>,
      task: (
        <>
          Clique sur le titre en haut à gauche et écris le nom de ta musique.
        </>
      ),
      done: () => p().title.trim() !== '' && p().title !== 'Ma première musique',
    },
    {
      chapter: 'Finir',
      target: '.dw-export-btn',
      title: 'L’emporter partout',
      text: <p>Le bouton <b>Exporter</b> fabrique un fichier son (WAV) de ta musique, à écouter sur ton téléphone ou à envoyer à quelqu’un.</p>,
    },
    {
      chapter: 'Finir',
      title: 'Tu as créé ta première musique ! 🎉',
      text: (
        <>
          <p>Récapitulons : une <b>piste</b> par instrument, des <b>clips</b> pour ranger les notes, l’<b>éditeur</b> pour les poser, la <b>banque</b> pour les sons et les boucles, le <b>mixeur</b> pour les volumes.</p>
          <p>Pour aller plus loin : change les sons (clique sur le nom de l’instrument d’une piste), ajoute une mélodie avec une flûte ou un synthé, essaie les boucles de batterie… La leçon est toujours là avec le bouton <b>🎓</b>.</p>
        </>
      ),
    },
  ]
}
