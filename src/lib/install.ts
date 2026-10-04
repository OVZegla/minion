import { useEffect, useState } from 'react'

/**
 * Installation en un clic (Edge / Chrome) : le navigateur annonce que l'app est installable
 * via « beforeinstallprompt » ; on garde l'événement pour l'utiliser sur notre propre bouton.
 */
interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

// à enregistrer le plus tôt possible : l'événement peut arriver avant l'affichage de l'app
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallEvent
  notify()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  notify()
})

export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return {
    canInstall: !!deferred && !isInstalled(),
    installed: isInstalled(),
    install: async () => {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      notify()
      return outcome === 'accepted'
    },
  }
}

/** iPhone / iPad : Minion s'utilise directement dans Safari (pas d'installation proposée). */
export function isIOS() {
  if (typeof navigator === 'undefined') return false
  if (location.search.includes('ios')) return true // pour tester sur ordinateur
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
