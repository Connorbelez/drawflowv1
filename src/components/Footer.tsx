import { Badge } from './ui/badge'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-20 border-t px-4 py-10 text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
        <p className="text-sm">&copy; {year} drawFlow. All rights reserved.</p>
        <Badge variant="secondary">Built with shadcn/ui</Badge>
      </div>
    </footer>
  )
}
