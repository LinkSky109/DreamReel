export interface StoredUser {
  id: string
  username?: string
  email?: string
  name?: string
}

export function currentUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem('dreamreel_user')
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredUser
    return parsed?.id ? parsed : null
  } catch {
    return null
  }
}

export function currentUserId(): string {
  return currentUser()?.id ?? 'default'
}
