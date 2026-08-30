"use client";

import type { JSONContent } from "@tiptap/react";
import {
  useAction,
  useConvexConnectionState,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ChevronDown,
  Download,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  Send,
  WifiOff,
} from "lucide-react";
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  abandonGovernedCollaborationAssets,
  uploadGovernedCollaborationAssets,
} from "#/features/build-collaboration/build-collaboration-asset-upload.ts";
import {
  CollaborationRichTextEditor,
  CollaborationRichTextPreview,
} from "#/features/build-collaboration/CollaborationRichTextEditor.tsx";
import {
  emptyDocument,
  formatTimestamp,
  plainTextFromDocument,
  roleLabel,
} from "#/features/build-collaboration/model.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const POST_PAGE_SIZE = 10;
const RESPONSE_PAGE_SIZE = 20;
const LENDER_UPLOAD_SCOPE = "assigned-lender-build";

type LenderPostEntry = Extract<
  FunctionReturnType<
    typeof api.lender_portal.listLenderBuildCollaborationPosts
  >["page"][number],
  { kind: "post" }
>;
type LenderResponse = FunctionReturnType<
  typeof api.lender_portal.listLenderBuildCollaborationResponses
>["page"][number];

function composerValidationError({
  mode,
  pending,
  plainText,
  postId,
  writable,
}: {
  mode: "post" | "response";
  pending: boolean;
  plainText: string;
  postId?: Id<"buildCollaborationPosts">;
  writable: boolean;
}) {
  if (!writable || pending) {
    return null;
  }
  if (!plainText) {
    return mode === "post"
      ? "Write a Build update before publishing."
      : "Write a response before publishing.";
  }
  if (mode === "response" && !postId) {
    return "The collaboration post is unavailable.";
  }
  return;
}

export function LenderBuildCollaboration({
  buildId,
}: {
  buildId: Id<"activeBuilds">;
}) {
  const posts = usePaginatedQuery(
    api.lender_portal.listLenderBuildCollaborationPosts,
    { buildId },
    { initialNumItems: POST_PAGE_SIZE }
  );
  const lifecycle = useQuery(
    api.lender_portal.getLenderBuildCollaborationLifecycleState,
    { buildId }
  );
  const connection = useConvexConnectionState();
  const [browserOnline, setBrowserOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const newPostButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const markOnline = () => setBrowserOnline(true);
    const markOffline = () => setBrowserOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  const online = browserOnline && connection.isWebSocketConnected;
  const writable = online && lifecycle?.state === "open";
  const blockedMessage = online
    ? lifecycle === undefined
      ? "Collaboration access is still loading."
      : "This Build collaboration archive is read-only."
    : "Reconnect before publishing. Offline work stays private.";
  const visiblePosts = posts.results.filter(isPostEntry);

  return (
    <div data-testid="lender-build-collaboration">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-semibold text-sm">Collaboration</h2>
          <p className="mt-1 text-muted-foreground text-xs">
            Participant-visible Build-wide updates.
          </p>
        </div>
        <Button
          disabled={!writable}
          onClick={() => setComposerOpen((current) => !current)}
          ref={newPostButtonRef}
          size="sm"
          type="button"
          variant={composerOpen ? "outline" : "default"}
        >
          <Plus aria-hidden="true" />
          {composerOpen ? "Close composer" : "New post"}
        </Button>
      </div>

      {writable ? null : (
        <p
          aria-live="polite"
          className="mt-3 flex items-center gap-2 text-muted-foreground text-xs"
          role="status"
        >
          {online ? null : <WifiOff aria-hidden="true" className="size-3.5" />}
          {blockedMessage}
        </p>
      )}

      {composerOpen ? (
        <LenderCollaborationComposer
          buildId={buildId}
          mode="post"
          onCancel={() => {
            setComposerOpen(false);
            requestAnimationFrame(() => newPostButtonRef.current?.focus());
          }}
          onPublished={() => {
            setComposerOpen(false);
            requestAnimationFrame(() => newPostButtonRef.current?.focus());
          }}
          writable={writable}
        />
      ) : null}

      <div className="mt-4 divide-y border-y">
        {posts.status === "LoadingFirstPage" ? (
          <LoadingStatus label="Loading Build updates…" />
        ) : visiblePosts.length === 0 ? (
          <p className="text-pretty py-5 text-muted-foreground text-sm">
            No participant-visible updates have been posted. Use New post to
            share the first Build update.
          </p>
        ) : (
          visiblePosts.map((entry) => (
            <LenderCollaborationPost
              buildId={buildId}
              entry={entry}
              key={entry.post._id}
              writable={writable}
            />
          ))
        )}
      </div>

      {posts.status === "CanLoadMore" || posts.status === "LoadingMore" ? (
        <Button
          className="mt-4"
          disabled={posts.status === "LoadingMore"}
          onClick={() => posts.loadMore(POST_PAGE_SIZE)}
          size="sm"
          type="button"
          variant="outline"
        >
          {posts.status === "LoadingMore" ? (
            <Loader2
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : null}
          Load more updates
        </Button>
      ) : null}
    </div>
  );
}

function LenderCollaborationPost({
  buildId,
  entry,
  writable,
}: {
  buildId: Id<"activeBuilds">;
  entry: LenderPostEntry;
  writable: boolean;
}) {
  const [threadOpen, setThreadOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyParent, setReplyParent] = useState<LenderResponse>();
  const replyButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <article className="py-5">
      <div className="flex gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MessageCircle aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="font-medium text-sm">
              {entry.post.authorDisplayNameSnapshot}
              <span className="ml-2 font-normal text-muted-foreground text-xs">
                {roleLabel(entry.post.authorRole)}
              </span>
            </p>
            <time
              className="text-muted-foreground text-xs tabular-nums"
              dateTime={new Date(entry.post.createdAt).toISOString()}
            >
              {formatTimestamp(entry.post.createdAt)}
            </time>
          </div>
          <CollaborationRichTextPreview
            ariaLabel="Build update"
            className="mt-2"
            tagOptions={[]}
            value={entry.revision.tiptapJson}
          />
          <AttachmentList attachments={entry.attachments} buildId={buildId} />
          <Separator className="my-4" />
          <Collapsible onOpenChange={setThreadOpen} open={threadOpen}>
            <div className="flex flex-wrap items-center gap-2">
              <CollapsibleTrigger
                render={
                  <Button size="sm" type="button" variant="ghost">
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "transition-transform",
                        threadOpen && "rotate-180"
                      )}
                    />
                    <span className="tabular-nums">
                      {entry.post.commentCount}
                    </span>{" "}
                    response
                    {entry.post.commentCount === 1 ? "" : "s"}
                  </Button>
                }
              />
              {writable ? (
                <Button
                  onClick={() => {
                    setThreadOpen(true);
                    setReplyParent(undefined);
                    setReplyOpen(true);
                  }}
                  ref={replyButtonRef}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Reply
                </Button>
              ) : null}
            </div>
            <CollapsibleContent>
              <LenderCollaborationThread
                buildId={buildId}
                onReply={(response) => {
                  setReplyParent(response);
                  setReplyOpen(true);
                }}
                postId={entry.post._id}
                writable={writable}
              />
              {replyOpen ? (
                <LenderCollaborationComposer
                  buildId={buildId}
                  mode="response"
                  onCancel={() => {
                    setReplyOpen(false);
                    setReplyParent(undefined);
                    requestAnimationFrame(() =>
                      replyButtonRef.current?.focus()
                    );
                  }}
                  onPublished={() => {
                    setReplyOpen(false);
                    setReplyParent(undefined);
                    requestAnimationFrame(() =>
                      replyButtonRef.current?.focus()
                    );
                  }}
                  parentComment={replyParent}
                  postId={entry.post._id}
                  writable={writable}
                />
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </article>
  );
}

function LenderCollaborationThread({
  buildId,
  onReply,
  postId,
  writable,
}: {
  buildId: Id<"activeBuilds">;
  onReply: (response: LenderResponse) => void;
  postId: Id<"buildCollaborationPosts">;
  writable: boolean;
}) {
  const responses = usePaginatedQuery(
    api.lender_portal.listLenderBuildCollaborationResponses,
    { buildId, postId },
    { initialNumItems: RESPONSE_PAGE_SIZE }
  );

  return (
    <div className="mt-3 border-l pl-4">
      {responses.status === "LoadingFirstPage" ? (
        <LoadingStatus label="Loading responses…" />
      ) : responses.results.length === 0 ? (
        <p className="py-3 text-muted-foreground text-sm">No responses yet.</p>
      ) : (
        <div className="divide-y">
          {responses.results.map((response) => (
            <article
              className="py-4"
              key={response.comment._id}
              style={{
                marginInlineStart:
                  String(Math.min(response.comment.logicalDepth, 3) * 0.75) +
                  "rem",
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-sm">
                  {response.comment.authorDisplayNameSnapshot}
                  <span className="ml-2 font-normal text-muted-foreground text-xs">
                    {roleLabel(response.comment.authorRole)}
                  </span>
                </p>
                <time
                  className="text-muted-foreground text-xs tabular-nums"
                  dateTime={new Date(response.comment.createdAt).toISOString()}
                >
                  {formatTimestamp(response.comment.createdAt)}
                </time>
              </div>
              {response.revision ? (
                <CollaborationRichTextPreview
                  ariaLabel="Build update response"
                  className="mt-1.5"
                  tagOptions={[]}
                  value={response.revision.tiptapJson}
                />
              ) : (
                <p className="mt-1.5 text-muted-foreground text-sm">
                  This response is unavailable.
                </p>
              )}
              <AttachmentList
                attachments={response.attachments}
                buildId={buildId}
              />
              {writable && response.comment.contentState === "active" ? (
                <Button
                  className="mt-2"
                  onClick={() => onReply(response)}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  Reply
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {responses.status === "CanLoadMore" ||
      responses.status === "LoadingMore" ? (
        <Button
          className="my-3"
          disabled={responses.status === "LoadingMore"}
          onClick={() => responses.loadMore(RESPONSE_PAGE_SIZE)}
          size="sm"
          type="button"
          variant="outline"
        >
          {responses.status === "LoadingMore" ? (
            <Loader2
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : null}
          Load more responses
        </Button>
      ) : null}
    </div>
  );
}

function LenderCollaborationComposer({
  buildId,
  mode,
  onCancel,
  onPublished,
  parentComment,
  postId,
  writable,
}: {
  buildId: Id<"activeBuilds">;
  mode: "post" | "response";
  onCancel: () => void;
  onPublished: () => void;
  parentComment?: LenderResponse;
  postId?: Id<"buildCollaborationPosts">;
  writable: boolean;
}) {
  const publishPost = useMutation(
    api.lender_portal.publishLenderBuildCollaborationPost
  );
  const addResponse = useMutation(
    api.lender_portal.addLenderBuildCollaborationResponse
  );
  const beginUpload = useMutation(
    api.lender_portal.beginLenderBuildCollaborationAssetUpload
  );
  const registerUpload = useMutation(
    api.lender_portal.registerLenderBuildCollaborationAssetUploadedStorage
  );
  const finalizeAndScan = useAction(
    api.lender_portal.finalizeAndScanLenderBuildCollaborationAssetUpload
  );
  const abandonAssets = useMutation(
    api.lender_portal.abandonLenderBuildCollaborationAssets
  );
  const [document, setDocument] = useState<JSONContent>(emptyDocument);
  const [html, setHtml] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const fileInputId = useId();
  let heading = "Reply to this update";
  if (mode === "post") {
    heading = "New Build update";
  } else if (parentComment) {
    heading = `Reply to ${parentComment.comment.authorDisplayNameSnapshot}`;
  }
  const uploadContextKind = mode === "post" ? "composer" : "post";
  const uploadContextRecordId = mode === "response" ? postId : undefined;
  const publicationCopy =
    mode === "post"
      ? {
          failure: "Unable to publish the Build update.",
          failureReason: "Lender post publication failed after asset upload.",
          success: "Build update published.",
        }
      : {
          failure: "Unable to publish the response.",
          failureReason:
            "Lender response publication failed after asset upload.",
          success: "Response published.",
        };

  const publishContent = async (
    plainText: string,
    attachmentAssetIds: Id<"buildCollaborationAssets">[]
  ) => {
    if (mode === "post") {
      await publishPost({
        attachmentAssetIds,
        buildId,
        plainText,
        tiptapJson: JSON.stringify(document),
      });
      return;
    }
    if (!postId) {
      throw new Error("The collaboration post is unavailable.");
    }
    await addResponse({
      attachmentAssetIds,
      buildId,
      parentCommentId: parentComment?.comment._id,
      plainText,
      postId,
      tiptapJson: JSON.stringify(document),
    });
  };

  const submit = async () => {
    const plainText = plainTextFromDocument(document);
    const validationError = composerValidationError({
      mode,
      pending,
      plainText,
      postId,
      writable,
    });
    if (validationError === null) {
      return;
    }
    if (validationError) {
      setError(validationError);
      return;
    }
    setPending(true);
    setError(undefined);
    let uploadedAssetIds: Id<"buildCollaborationAssets">[] = [];
    try {
      uploadedAssetIds = await uploadGovernedCollaborationAssets(files, {
        abandonAssets: ({ organizationId: _organizationId, ...args }) =>
          abandonAssets(args),
        beginUpload: ({ organizationId: _organizationId, ...args }) =>
          beginUpload({
            ...args,
            contextKind: uploadContextKind,
            contextRecordId: uploadContextRecordId,
          }),
        buildId,
        contextKind: uploadContextKind,
        contextRecordId: uploadContextRecordId,
        finalizeAndScan: ({ organizationId: _organizationId, ...args }) =>
          finalizeAndScan(args),
        organizationId: LENDER_UPLOAD_SCOPE,
        registerUpload: ({ organizationId: _organizationId, ...args }) =>
          registerUpload(args),
      });
      await publishContent(plainText, uploadedAssetIds);
      setDocument(emptyDocument());
      setHtml("");
      setFiles([]);
      toast.success(publicationCopy.success);
      onPublished();
    } catch (caught) {
      await abandonGovernedCollaborationAssets({
        abandonAssets: ({ organizationId: _organizationId, ...args }) =>
          abandonAssets(args),
        assetIds: uploadedAssetIds,
        buildId,
        organizationId: LENDER_UPLOAD_SCOPE,
        reason: publicationCopy.failureReason,
      });
      const message =
        caught instanceof Error ? caught.message : publicationCopy.failure;
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className={cn(
        "mt-4 border-primary/40 border-l-2 pl-4",
        mode === "post" && "mb-5"
      )}
    >
      <h3 className="font-medium text-sm">{heading}</h3>
      <div className="mt-3 space-y-3">
        <CollaborationRichTextEditor
          ariaLabel={heading}
          editorMinHeightClass="[&_.ProseMirror]:min-h-24"
          onChange={setHtml}
          onDocumentChange={(nextDocument) => {
            setDocument(nextDocument);
            if (plainTextFromDocument(nextDocument)) {
              setError(undefined);
            }
          }}
          placeholder={
            mode === "post"
              ? "Share a participant-visible Build update."
              : "Write a response."
          }
          tagOptions={[]}
          value={html}
        />
        <div className="space-y-1.5">
          <label
            className="flex items-center gap-2 font-medium text-xs"
            htmlFor={fileInputId}
          >
            <Paperclip aria-hidden="true" className="size-3.5" />
            Attach files
          </label>
          <Input
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            disabled={pending}
            id={fileInputId}
            multiple
            nativeInput
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setFiles(Array.from(event.target.files ?? []))
            }
            type="file"
          />
          {files.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {files.length} file{files.length === 1 ? "" : "s"} will be hashed
              and scanned before publication.
            </p>
          ) : null}
        </div>
        {error ? (
          <p
            aria-live="assertive"
            className="text-destructive text-xs"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!writable || pending}
            onClick={submit}
            size="sm"
            type="button"
          >
            {pending ? (
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Send aria-hidden="true" />
            )}
            {pending
              ? files.length > 0
                ? "Scanning and publishing…"
                : "Publishing…"
              : "Publish"}
          </Button>
          <Button
            disabled={pending}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function AttachmentList({
  attachments,
  buildId,
}: {
  attachments: LenderPostEntry["attachments"] | LenderResponse["attachments"];
  buildId: Id<"activeBuilds">;
}) {
  const authorizeDownload = useMutation(
    api.lender_portal.authorizeLenderBuildCollaborationAssetDownload
  );
  if (attachments.length === 0) {
    return null;
  }
  return (
    <ul aria-label="Attachments" className="mt-3 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <li key={attachment.assetId}>
          <Button
            onClick={async () => {
              try {
                const url = await authorizeDownload({
                  assetId: attachment.assetId,
                  buildId,
                });
                window.open(url, "_blank", "noopener,noreferrer");
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Unable to open the attachment."
                );
              }
            }}
            size="xs"
            type="button"
            variant="outline"
          >
            <Download aria-hidden="true" />
            {attachment.fileName}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function LoadingStatus({ label }: { label: string }) {
  return (
    <p
      aria-live="polite"
      className="flex items-center gap-2 py-5 text-muted-foreground text-sm"
      role="status"
    >
      <Loader2
        aria-hidden="true"
        className="size-4 animate-spin motion-reduce:animate-none"
      />
      {label}
    </p>
  );
}

function isPostEntry(
  entry: FunctionReturnType<
    typeof api.lender_portal.listLenderBuildCollaborationPosts
  >["page"][number]
): entry is LenderPostEntry {
  return entry.kind === "post";
}
