"use client";

import {
  AtSign,
  Bell,
  Check,
  Image,
  Paperclip,
  Plus,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import { type CollaborationTagOption, type CollaborationTagReference, CollaborationRichTextEditor } from "../../build-collaboration/CollaborationRichTextEditor.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  AUDIENCE_OPTIONS,
  ENTITIES,
  PARTICIPANTS,
  type AudienceId,
  type FeedFilter,
  type Participant,
  type ParticipantId,
} from "./-interactive-familiar-feed-contracts.ts";
import {
  audienceLabel,
  entityById,
  entityIcon,
  participantById,
  richTextHasContent,
  toggleInList,
} from "./-interactive-familiar-feed-utils.tsx";
import { ParticipantAvatar } from "./-interactive-familiar-feed-detail.tsx";

export function FeedToolbar({
  feedFilter,
  lastEvent,
  onFilterChange,
  onSearchChange,
  searchQuery,
  visibleCount,
}: {
  feedFilter: FeedFilter;
  lastEvent: string;
  onFilterChange: (filter: FeedFilter) => void;
  onSearchChange: (query: string) => void;
  searchQuery: string;
  visibleCount: number;
}) {
  const filters: Array<{ id: FeedFilter; label: string }> = [
    { id: "all", label: "All updates" },
    { id: "following", label: "Following" },
    { id: "mentions", label: "Mentions" },
    { id: "pinned", label: "Pinned" },
    { id: "actionable", label: "Assigned to me" },
  ];
  return (
    <Frame>
      <FramePanel className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap gap-2">
            {filters.map((filter) => (
              <Button
                className="rounded-full"
                key={filter.id}
                onClick={() => onFilterChange(filter.id)}
                size="sm"
                variant={feedFilter === filter.id ? "secondary" : "ghost"}
              >
                {filter.label}
              </Button>
            ))}
          </div>
          <div className="flex min-w-0 items-center gap-2 lg:w-72">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              aria-label="Search collaboration"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search updates and work…"
              type="search"
              value={searchQuery}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
          <p className="flex items-center gap-2 text-muted-foreground">
            <Bell className="size-3.5 text-primary" />
            {lastEvent}
          </p>
          <Badge variant="outline">{visibleCount} feed entries</Badge>
        </div>
      </FramePanel>
    </Frame>
  );
}
export function Composer({
  attachedEntityIds,
  audienceId,
  body,
  customAudienceIds,
  effectiveRecipients,
  entityIds,
  excludedMentionIds,
  expanded,
  mentionIds,
  onAudienceChange,
  onBodyChange,
  onCancel,
  onCustomAudienceChange,
  onEntityToggle,
  onExpand,
  onPickerModeChange,
  onPost,
  pickerMode,
  tagOptions,
  viewer,
}: {
  attachedEntityIds: string[];
  audienceId: AudienceId;
  body: string;
  customAudienceIds: ParticipantId[];
  effectiveRecipients: ParticipantId[];
  entityIds: string[];
  excludedMentionIds: ParticipantId[];
  expanded: boolean;
  mentionIds: ParticipantId[];
  onAudienceChange: (audienceId: AudienceId) => void;
  onBodyChange: (body: string, references: CollaborationTagReference[]) => void;
  onCancel: () => void;
  onCustomAudienceChange: (participantIds: ParticipantId[]) => void;
  onEntityToggle: (entityId: string) => void;
  onExpand: () => void;
  onPickerModeChange: (mode: "entities" | null) => void;
  onPost: () => void;
  pickerMode: "entities" | null;
  tagOptions: CollaborationTagOption[];
  viewer: Participant;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[auto_1fr] gap-3 p-4">
        <ParticipantAvatar participant={viewer} />
        <div className="min-w-0">
          <CardTitle className="text-sm">
            Share an update as {viewer.name}
          </CardTitle>
          <CardDescription className="text-xs">
            Audience and referenced work determine who can read everything
            underneath.
          </CardDescription>
        </div>
      </CardHeader>
      <CardPanel className="p-4 pt-0">
        {expanded ? (
          <CollaborationRichTextEditor
            ariaLabel="Prototype post composer"
            editorMinHeightClass="[&_.ProseMirror]:min-h-28"
            onChange={onBodyChange}
            placeholder="Share an update. Type @ to tag a person or anything in this Build."
            tagOptions={tagOptions}
            value={body}
          />
        ) : (
          <button
            className="min-h-20 w-full rounded-lg border bg-background px-3 py-3 text-left text-muted-foreground text-sm"
            onClick={onExpand}
            type="button"
          >
            What should people involved in this Build know?
          </button>
        )}

        {expanded ? (
          <div className="mt-3 grid gap-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <p className="mb-1.5 font-medium text-xs">Audience</p>
                <Select
                  onValueChange={(value) =>
                    onAudienceChange(value as AudienceId)
                  }
                  value={audienceId}
                >
                  <SelectTrigger aria-label="Post audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-muted-foreground text-xs">
                  {AUDIENCE_OPTIONS.find((option) => option.id === audienceId)
                    ?.summary ?? ""}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="font-medium text-xs">
                  Effective audience · {effectiveRecipients.length} people
                </p>
                <div className="mt-2 flex -space-x-2">
                  {effectiveRecipients.slice(0, 6).map((participantId) => (
                    <div
                      className="rounded-full border-2 border-background"
                      key={participantId}
                    >
                      <ParticipantAvatar
                        participant={participantById(participantId)}
                        small
                      />
                    </div>
                  ))}
                </div>
                {entityIds.length > 0 ? (
                  <p className="mt-2 text-muted-foreground text-xs">
                    Limited by the access rules of tagged or attached Build
                    work.
                  </p>
                ) : null}
              </div>
            </div>

            {audienceId === "custom" ? (
              <PickerGrid
                activeIds={customAudienceIds}
                onToggle={(participantId) =>
                  onCustomAudienceChange(
                    toggleInList(customAudienceIds, participantId)
                  )
                }
                participants={PARTICIPANTS}
                title="Choose recipients"
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                <AtSign />
                Type @ to tag anything
              </Badge>
              <Button
                onClick={() =>
                  onPickerModeChange(
                    pickerMode === "entities" ? null : "entities"
                  )
                }
                size="sm"
                variant={pickerMode === "entities" ? "secondary" : "ghost"}
              >
                <Paperclip />
                Attach Build item
              </Button>
              <Button
                onClick={() => {
                  if (!attachedEntityIds.includes("evidence-204")) {
                    onEntityToggle("evidence-204");
                  }
                }}
                size="sm"
                variant="ghost"
              >
                <Image />
                Evidence
              </Button>
            </div>

            {pickerMode === "entities" ? (
              <EntityPicker
                activeIds={attachedEntityIds}
                onToggle={onEntityToggle}
                viewerId={viewer.id}
              />
            ) : null}

            {mentionIds.length > 0 || entityIds.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {mentionIds.map((participantId) => (
                  <Badge key={participantId} variant="info">
                    <AtSign />
                    {participantById(participantId).name}
                  </Badge>
                ))}
                {entityIds.map((entityId) => {
                  const attached = attachedEntityIds.includes(entityId);
                  return (
                    <Badge key={entityId} variant="secondary">
                      {attached ? (
                        entityIcon(entityById(entityId).kind)
                      ) : (
                        <AtSign />
                      )}
                      {entityById(entityId).label}
                      {attached ? (
                        <button
                          aria-label={`Remove ${entityById(entityId).label}`}
                          onClick={() => onEntityToggle(entityId)}
                          type="button"
                        >
                          <X />
                        </button>
                      ) : null}
                    </Badge>
                  );
                })}
              </div>
            ) : null}

            <MentionAccessWarning participantIds={excludedMentionIds} />
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            <Users />
            {audienceLabel(audienceId)}
          </Badge>
          {expanded ? (
            <>
              <Button
                className="ml-auto"
                onClick={onCancel}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !richTextHasContent(body) || effectiveRecipients.length === 0
                }
                onClick={onPost}
                size="sm"
              >
                <Send />
                Post update
              </Button>
            </>
          ) : (
            <Button className="ml-auto" onClick={onExpand} size="sm">
              Compose
            </Button>
          )}
        </div>
      </CardPanel>
    </Card>
  );
}

export function MentionAccessWarning({
  participantIds,
}: {
  participantIds: ParticipantId[];
}) {
  if (participantIds.length === 0) {
    return null;
  }
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs">
      <p className="font-medium">
        {participantIds
          .map((participantId) => participantById(participantId).name)
          .join(", ")}{" "}
        will not be notified.
      </p>
      <p className="mt-1 text-muted-foreground">
        A mention never grants access. Change the audience or remove the
        mention.
      </p>
    </div>
  );
}

function PickerGrid({
  activeIds,
  onToggle,
  participants,
  title,
}: {
  activeIds: ParticipantId[];
  onToggle: (participantId: ParticipantId) => void;
  participants: Participant[];
  title: string;
}) {
  return (
    <Frame>
      <FramePanel className="p-3">
        <p className="mb-2 font-medium text-xs">{title}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {participants.map((participant) => {
            const active = activeIds.includes(participant.id);
            return (
              <Button
                className="h-auto justify-start px-2 py-2 text-left"
                key={participant.id}
                onClick={() => onToggle(participant.id)}
                variant={active ? "secondary" : "ghost"}
              >
                <ParticipantAvatar participant={participant} small />
                <span className="min-w-0">
                  <span className="block truncate text-xs">
                    {participant.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {participant.roleLabel}
                  </span>
                </span>
                {active ? <Check className="ml-auto" /> : null}
              </Button>
            );
          })}
        </div>
      </FramePanel>
    </Frame>
  );
}

function EntityPicker({
  activeIds,
  onToggle,
  viewerId,
}: {
  activeIds: string[];
  onToggle: (entityId: string) => void;
  viewerId: ParticipantId;
}) {
  return (
    <Frame>
      <FramePanel className="p-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-xs">Attach work from this Build</p>
          <Badge variant="outline">Permission-filtered</Badge>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {ENTITIES.filter((entity) => entity.visibleTo.includes(viewerId)).map(
            (entity) => {
              const active = activeIds.includes(entity.id);
              return (
                <Button
                  className="h-auto justify-start px-3 py-2 text-left"
                  key={entity.id}
                  onClick={() => onToggle(entity.id)}
                  variant={active ? "secondary" : "ghost"}
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                    {entityIcon(entity.kind)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs">
                      {entity.label}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {entity.summary}
                    </span>
                  </span>
                  {active ? <Check /> : <Plus />}
                </Button>
              );
            }
          )}
        </div>
      </FramePanel>
    </Frame>
  );
}
