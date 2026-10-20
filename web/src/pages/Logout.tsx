import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

export function LogoutPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    try {
      localStorage.removeItem('dreamreel_token')
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event('dreamreel:auth'))
    queryClient.clear()
    navigate('/login', { replace: true })
  }, [navigate, queryClient])

  return null
}
