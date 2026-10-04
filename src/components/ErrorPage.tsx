import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'

/** Erreur expliquée simplement, avec une porte de sortie. */
export function ErrorPage() {
  const err = useRouteError()
  const navigate = useNavigate()
  const notFound = isRouteErrorResponse(err) && err.status === 404
  if (!notFound) console.error(err)
  return (
    <div className="page narrow empty" style={{ paddingTop: '18vh' }}>
      <span className="hand">{notFound ? 'Page introuvable' : 'Oups, un petit accroc'}</span>
      <p style={{ marginBottom: 20 }}>
        {notFound
          ? 'Cette page n’existe pas (ou plus).'
          : 'Quelque chose ne s’est pas passé comme prévu. Tes contenus déjà enregistrés sont en sécurité.'}
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={() => window.location.reload()}>
          Recharger
        </button>
        <button className="btn primary" onClick={() => navigate('/')}>
          Retour à l’accueil
        </button>
      </div>
    </div>
  )
}
