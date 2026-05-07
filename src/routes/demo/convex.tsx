import { useCallback, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Check, Circle, Plus, Trash2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'

export const Route = createFileRoute('/demo/convex')({
  ssr: false,
  component: ConvexTodos,
})

function ConvexTodos() {
  const todos = useQuery(api.todos.list)
  const addTodo = useMutation(api.todos.add)
  const toggleTodo = useMutation(api.todos.toggle)
  const removeTodo = useMutation(api.todos.remove)
  const [newTodo, setNewTodo] = useState('')

  const handleAddTodo = useCallback(async () => {
    const text = newTodo.trim()
    if (!text) {
      return
    }

    await addTodo({ text })
    setNewTodo('')
  }, [addTodo, newTodo])

  const handleToggleTodo = useCallback(
    async (id: Id<'todos'>) => {
      await toggleTodo({ id })
    },
    [toggleTodo],
  )

  const handleRemoveTodo = useCallback(
    async (id: Id<'todos'>) => {
      await removeTodo({ id })
    },
    [removeTodo],
  )

  const completedCount = todos?.filter((todo) => todo.completed).length ?? 0
  const totalCount = todos?.length ?? 0

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Card className="p-2">
        <CardHeader className="p-6">
          <Badge variant="secondary" className="w-fit">
            Convex
          </Badge>
          <CardTitle className="text-3xl font-semibold">Realtime todos</CardTitle>
          <CardDescription>Mutations and live queries rendered with shadcn form controls.</CardDescription>
          {totalCount > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="outline">{completedCount} completed</Badge>
              <Badge variant="outline">{totalCount - completedCount} remaining</Badge>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4 px-6 pb-6">
          <div className="flex gap-2">
            <Input
              value={newTodo}
              onChange={(event) => setNewTodo(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleAddTodo()
                }
              }}
              placeholder="What needs to be done?"
            />
            <Button onClick={handleAddTodo} disabled={!newTodo.trim()}>
              <Plus />
              Add
            </Button>
          </div>

          {!todos ? (
            <EmptyState title="Loading todos..." description="Waiting for Convex sync." />
          ) : todos.length === 0 ? (
            <EmptyState title="No todos yet" description="Add your first todo above." />
          ) : (
            <div className="overflow-hidden rounded-lg border">
              {todos.map((todo) => (
                <div key={todo._id} className="flex items-center gap-3 border-b p-3 last:border-b-0">
                  <Button variant={todo.completed ? 'default' : 'outline'} size="icon" onClick={() => handleToggleTodo(todo._id)}>
                    {todo.completed ? <Check /> : <Circle />}
                  </Button>
                  <span className={todo.completed ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>
                    {todo.text}
                  </span>
                  <Button variant="destructive" size="icon" onClick={() => handleRemoveTodo(todo._id)}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>

        <CardFooter className="border-t px-6 py-4 text-xs text-muted-foreground">
          Real-time updates stay subscribed through Convex.
        </CardFooter>
      </Card>
    </main>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <Circle className="mx-auto mb-3 size-8 text-muted-foreground" />
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
