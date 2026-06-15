import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

export const Route = createFileRoute("/demo/tanstack-query")({
  component: TanStackQueryDemo,
});

function TanStackQueryDemo() {
  const { data } = useQuery({
    queryKey: ["todos"],
    queryFn: () =>
      Promise.resolve([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
        { id: 3, name: "Charlie" },
      ]),
    initialData: [],
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Card className="p-2">
        <CardHeader className="p-6">
          <Badge className="w-fit" variant="secondary">
            TanStack Query
          </Badge>
          <CardTitle className="font-semibold text-3xl">
            Cached query demo
          </CardTitle>
          <CardDescription>
            Simple async data rendered through shadcn card primitives.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 px-6 pb-6">
          {data.map((todo) => (
            <div
              className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3"
              key={todo.id}
            >
              <span className="font-medium">{todo.name}</span>
              <Badge variant="outline">#{todo.id}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
