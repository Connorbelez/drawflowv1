import { Link, useLocation } from '@tanstack/react-router'
import { useAuth } from '@workos/authkit-tanstack-react-start/client'

import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'

export default function SignInButton({ large }: { large?: boolean }) {
  const { user, loading, signOut } = useAuth()
  const location = useLocation()

  if (user) {
    const initials = [user.firstName, user.lastName]
      .filter(Boolean)
      .map((part) => part?.[0])
      .join('')
      .toUpperCase()

    return (
      <div className="flex items-center gap-2">
        <Avatar className="size-7">
          <AvatarImage src={user.profilePictureUrl ?? undefined} />
          <AvatarFallback>{initials || user.email[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <Button variant="outline" size={large ? 'lg' : 'sm'} onClick={() => signOut({ returnTo: '/' })}>
          Sign out
        </Button>
      </div>
    )
  }

  return (
    <Button
      size={large ? 'lg' : 'sm'}
      render={
        <Link
          to="/api/auth/sign-in"
          search={{ returnPathname: location.pathname }}
          reloadDocument
        />
      }
      disabled={loading}
    >
      Sign in {large && 'with AuthKit'}
    </Button>
  )
}
