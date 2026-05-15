import { CircleAlertIcon } from "lucide-react";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Field, FieldLabel } from "#/components/ui/field.tsx";
import { Form } from "#/components/ui/form.tsx";
import { Frame, FrameFooter } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";

const frameworkOptions = [
  { label: "Next.js", value: "next" },
  { label: "Vite", value: "vite" },
  { label: "Remix", value: "remix" },
  { label: "Astro", value: "astro" },
];

export default function Particle() {
  return (
    <Frame className="w-full max-w-xs">
      <Card>
        <CardHeader>
          <CardTitle>Create project</CardTitle>
          <CardDescription>
            Deploy your new project in one-click.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <Form className="flex w-full flex-col gap-4">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input placeholder="Name of your project" type="text" />
            </Field>
            <Field>
              <FieldLabel>Framework</FieldLabel>
              <Select defaultValue="next" items={frameworkOptions}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {frameworkOptions.map(({ label, value }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
            <Button className="w-full" type="submit">
              Deploy
            </Button>
          </Form>
        </CardPanel>
      </Card>
      <FrameFooter>
        <div className="flex gap-1 text-muted-foreground text-xs">
          <CircleAlertIcon className="size-3 h-lh shrink-0" />
          <p>This will take a few seconds to complete.</p>
        </div>
      </FrameFooter>
    </Frame>
  );
}
