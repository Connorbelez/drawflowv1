import { FolderIcon, PlusIcon } from "lucide-react";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardFrame,
  CardFrameAction,
  CardFrameDescription,
  CardFrameHeader,
  CardFrameTitle,
  CardPanel,
} from "#/components/ui/card.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx";

export default function Particle() {
  return (
    <CardFrame className="w-full">
      <CardFrameHeader>
        <CardFrameTitle>Project</CardFrameTitle>
        <CardFrameDescription>Manage your projects</CardFrameDescription>
        <CardFrameAction>
          <Button variant="outline">
            <PlusIcon />
            Add
          </Button>
        </CardFrameAction>
      </CardFrameHeader>
      <Card>
        <CardPanel>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderIcon />
              </EmptyMedia>
              <EmptyTitle>No projects yet</EmptyTitle>
              <EmptyDescription>
                Get started by adding your first project.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardPanel>
      </Card>
    </CardFrame>
  );
}
