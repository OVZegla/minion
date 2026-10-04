import { NavLink } from 'react-router-dom'

/** Pensées à plat et Mes petits bonheurs partagent le même espace, en deux onglets. */
export function ThoughtsTabs() {
  return (
    <div className="seg" role="tablist">
      <NavLink to="/pensees" className={({ isActive }) => (isActive ? 'on' : '')} role="tab">
        Pensées à plat
      </NavLink>
      <NavLink to="/bonheurs" className={({ isActive }) => (isActive ? 'on' : '')} role="tab">
        Mes petits bonheurs
      </NavLink>
    </div>
  )
}
