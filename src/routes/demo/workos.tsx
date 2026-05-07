import { Link, createFileRoute, useLocation } from '@tanstack/react-router'
import { useAuth } from '@workos/authkit-tanstack-react-start/client'

import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

export const Route = createFileRoute('/demo/workos')({
  ssr: false,
  component: WorkOSDemo,
})

function WorkOSDemo() {
  const { user, loading, signOut } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">Loading session...</CardContent>
        </Card>
      </main>
    )
  }

  if (user) {
    const initials = [user.firstName, user.lastName]
      .filter(Boolean)
      .map((part) => part?.[0])
      .join('')
      .toUpperCase()

    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <Card className="p-2">
          <CardHeader className="items-center p-6 text-center">
            <Avatar size="lg">
              <AvatarImage src={user.profilePictureUrl ?? undefined} />
              <AvatarFallback>{initials || user.email[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <Badge variant="secondary" className="mt-2">
              Signed in
            </Badge>
            <CardTitle className="text-2xl">{[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 px-6 pb-6">
            <ProfileRow label="User ID" value={user.id} />
            <ProfileRow label="First name" value={user.firstName || 'N/A'} />
            <ProfileRow label="Last name" value={user.lastName || 'N/A'} />
            <Button variant="outline" onClick={() => signOut({ returnTo: '/' })}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Card className="p-2">
        <CardHeader className="p-6 text-center">
          <Badge variant="secondary" className="mx-auto w-fit">
            WorkOS AuthKit
          </Badge>
          <CardTitle className="text-3xl">Sign in required</CardTitle>
          <CardDescription>Authenticate to view your WorkOS profile details.</CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <Button
            className="w-full"
            size="lg"
            render={
              <Link
                to="/api/auth/sign-in"
                search={{ returnPathname: location.pathname }}
                reloadDocument
              />
            }
          >
            Sign in with AuthKit
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-medium">{value}</div>
    </div>
  )
}
