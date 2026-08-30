"use client";

import {
  Clock3,
  Eye,
  FileText,
  Flag,
  HardHat,
  Image,
  Star,
} from "lucide-react";
import type {
  CollaborationTagOption,
  CollaborationTagReference,
} from "../../build-collaboration/CollaborationRichTextEditor.tsx";
import type { MilestoneSheetData } from "../MilestoneDetailSheet.tsx";
import {
  AUDIENCE_OPTIONS,
  ENTITIES,
  HTML_CONTENT_PATTERN,
  PARTICIPANTS,
  STATUS_COLUMNS,
  type ActionStatus,
  type AudienceId,
  type BuildEntity,
  type FeedPost,
  type ParticipantId,
} from "./-interactive-familiar-feed-contracts.ts";

export function participantById(id: ParticipantId) {
  const participant = PARTICIPANTS.find((candidate) => candidate.id === id);
  if (!participant) {
    throw new Error(`Unknown prototype participant: ${id}`);
  }
  return participant;
}

export function entityById(id: string) {
  const entity = ENTITIES.find((candidate) => candidate.id === id);
  if (!entity) {
    throw new Error(`Unknown prototype entity: ${id}`);
  }
  return entity;
}

export function buildEntityToReference(
  entity: BuildEntity
): CollaborationTagReference {
  return {
    eyebrow: entityKindLabel(entity.kind),
    id: entity.id,
    kind: entity.kind,
    label: entity.label,
    summary: entity.summary,
  };
}

export function canReferenceBeUsedInPost(
  option: CollaborationTagOption,
  post: FeedPost,
  posts: FeedPost[]
) {
  if (option.kind === "participant") {
    return true;
  }
  const postRecipients = PARTICIPANTS.filter((participant) =>
    canParticipantViewPost(participant.id, post)
  ).map((participant) => participant.id);
  if (option.kind === "action_item") {
    const owningPost = posts.find((candidate) =>
      candidate.actionItems.some((actionItem) => actionItem.id === option.id)
    );
    return Boolean(
      owningPost &&
        postRecipients.every((participantId) =>
          canParticipantViewPost(participantId, owningPost)
        )
    );
  }
  const entity = entityById(option.id);
  return postRecipients.every((participantId) =>
    entity.visibleTo.includes(participantId)
  );
}

export function toMilestoneSheetData(entity: BuildEntity): MilestoneSheetData {
  return {
    canStartWork: false,
    column:
      entity.kind === "submilestone" ? "Awaiting sign-off" : "Evidence review",
    contractors: [
      {
        initials: "MR",
        name: "Marco Ruiz",
        role: "Concrete contractor",
      },
      { initials: "AC", name: "Alex Chen", role: "Builder PM" },
    ],
    drawGroupKey: "draw-3",
    milestoneKey: entity.id,
    name: entity.label,
    recentEvents: [
      {
        _id: `${entity.id}-event-1`,
        actor: "Maya Singh",
        createdAt: Date.now() - 1000 * 60 * 75,
        title: entity.summary,
      },
      {
        _id: `${entity.id}-event-2`,
        actor: "Alex Chen",
        createdAt: Date.now() - 1000 * 60 * 60 * 28,
        title: "Linked to Draw 3 collaboration thread",
      },
    ],
    requestedAmountCents: 18_400_000,
    submittedAt: Date.now() - 1000 * 60 * 60 * 20,
  };
}

export function entityKindLabel(kind: BuildEntity["kind"]) {
  if (kind === "site_visit") {
    return "Site Visit";
  }
  if (kind === "submilestone") {
    return "Sub-milestone";
  }
  if (kind === "evidence") {
    return "Evidence Package";
  }
  return titleCase(kind);
}

export function richTextHasContent(value: string | undefined) {
  return richTextToPlainText(value ?? "").trim().length > 0;
}

export function richTextToPlainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRichText(value: string) {
  if (HTML_CONTENT_PATTERN.test(value)) {
    return value;
  }
  let content = escapeHtml(value);
  for (const participant of PARTICIPANTS) {
    const label = `@${escapeHtml(participant.name)}`;
    content = content.replaceAll(
      label,
      `<span class="rounded bg-primary/10 px-1 font-medium text-primary ring-1 ring-primary/15" data-type="collaboration-reference" data-reference-id="${participant.id}" data-reference-kind="participant" data-label="${escapeHtml(participant.name)}" data-eyebrow="${escapeHtml(participant.roleLabel)}" data-summary="${escapeHtml(`${participant.roleLabel} on this Build`)}">${label}</span>`
    );
  }
  return `<p>${content}</p>`;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function resolveAudienceParticipantIds(
  audienceId: AudienceId,
  customAudienceIds: ParticipantId[]
): ParticipantId[] {
  if (audienceId === "all") {
    return PARTICIPANTS.map((participant) => participant.id);
  }
  if (audienceId === "custom") {
    return customAudienceIds;
  }
  return PARTICIPANTS.filter((participant) => {
    if (audienceId === "builder") {
      return ["builder", "builder_staff"].includes(participant.role);
    }
    if (audienceId === "lender") {
      return ["broker", "lender", "lender_admin"].includes(participant.role);
    }
    if (audienceId === "builder_lender") {
      return [
        "broker",
        "builder",
        "builder_staff",
        "lender",
        "lender_admin",
      ].includes(participant.role);
    }
    if (audienceId === "homeowner_builder") {
      return ["builder", "builder_staff", "homeowner"].includes(
        participant.role
      );
    }
    return ["builder", "builder_staff", "contractor"].includes(
      participant.role
    );
  }).map((participant) => participant.id);
}

export function canParticipantViewPost(participantId: ParticipantId, post: FeedPost) {
  return resolveAudienceParticipantIds(
    post.audienceId,
    post.customAudienceIds ?? []
  ).includes(participantId);
}

export function audienceLabel(audienceId: AudienceId) {
  return (
    AUDIENCE_OPTIONS.find((option) => option.id === audienceId)?.label ??
    "Unknown audience"
  );
}

export function statusLabel(status: ActionStatus) {
  return STATUS_COLUMNS.find((column) => column.id === status)?.label ?? status;
}

export function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function toggleInList<T>(items: T[], item: T) {
  return items.includes(item)
    ? items.filter((candidate) => candidate !== item)
    : [...items, item];
}

export function entityIcon(kind: BuildEntity["kind"]) {
  if (kind === "document") {
    return <FileText />;
  }
  if (kind === "site_visit") {
    return <Eye />;
  }
  if (kind === "material") {
    return <HardHat />;
  }
  if (kind === "evidence") {
    return <Image />;
  }
  if (kind === "draw") {
    return <Clock3 />;
  }
  if (kind === "submilestone") {
    return <Flag />;
  }
  return <Star />;
}
