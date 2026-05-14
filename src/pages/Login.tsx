import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

// Legacy compat: /login pointed at the magic-link sign-in in mns/.
// New app uses Clerk's hosted UI at /sign-in.
export function Login() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const search = location.search ? location.search : ''
    navigate(`/sign-in${search}`, { replace: true })
  }, [navigate, location.search])

  return null
}
