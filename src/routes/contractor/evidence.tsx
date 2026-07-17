import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { normalizeEvidenceFileForUpload } from "#/lib/evidence-image-normalization.ts";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "#/lib/fairLendConfig.ts";

export const Route = createFileRoute("/contractor/evidence")({
  staticData: {
    breadcrumb: { label: "Evidence", to: "/contractor/evidence" },
  },
  component: ContractorEvidence,
});

/**
 * Contractor evidence history + feedback (PRD §8.7). Supporting context only -
 * never auto-satisfies completion or draw requirements.
 */
function ContractorEvidence() {
  const workosOrganizationId = FAIRLEND_WORKOS_ORGANIZATION_ID;
  const evidence = useQuery(api.contractorEvidence.listContractorEvidence, {
    workosOrganizationId,
  });
  const workItems = useQuery(api.contractorWorkspace.listContractorWorkItems, {});
  const generateUploadUrl = useMutation(
    api.contractorEvidence.generateContractorEvidenceUploadUrl
  );
  const uploadEvidence = useMutation(
    api.contractorEvidence.uploadContractorSupportingEvidence
  );
  const [uploading, setUploading] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const selectedWorkItem = workItems?.find(
    (item) => item.assignmentId === selectedAssignmentId
  );

  const submitEvidence = async () => {
    if (!(file && selectedWorkItem)) {
      setUploadMessage("Choose an assigned scope and a file before uploading.");
      return;
    }
    setUploading(true);
    setUploadMessage(null);
    try {
      const uploadFile = await normalizeEvidenceFileForUpload(file);
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        body: uploadFile,
        headers: {
          "Content-Type": uploadFile.type || "application/octet-stream",
        },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Storage upload failed for ${uploadFile.name}.`);
      }
      const { storageId } = (await response.json()) as { storageId: string };
      await uploadEvidence({
        assignmentType: selectedWorkItem.objectType,
        buildAssignmentId:
          selectedWorkItem.objectType === "build"
            ? (selectedWorkItem.assignmentId as Id<"milestoneContractorAssignments">)
            : undefined,
        caption: caption.trim() || uploadFile.name,
        fileName: uploadFile.name,
        milestoneKey: selectedWorkItem.milestoneKey,
        mimeType: uploadFile.type || "application/octet-stream",
        proposalAssignmentId:
          selectedWorkItem.objectType === "proposal"
            ? (selectedWorkItem.assignmentId as Id<"proposalMilestoneContractorAssignments">)
            : undefined,
        sizeBytes: uploadFile.size,
        storageId: storageId as Id<"_storage">,
        submilestoneKey: selectedWorkItem.submilestoneKey ?? undefined,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        workosOrganizationId,
      });
      setCaption("");
      setFile(null);
      setTags("");
      setUploadMessage("Evidence uploaded.");
    } catch (error) {
      setUploadMessage(
        error instanceof Error ? error.message : "Evidence upload failed."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-semibold text-2xl">Evidence</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
              Supporting context you have submitted against assigned scope. This
              is informational only - it does not satisfy completion or draw
              requirements.
            </p>
          </div>
        </header>

        <Frame>
          <FramePanel className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-xs font-medium uppercase">
                    Assigned scope
                  </span>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    disabled={uploading || workItems === undefined}
                    value={selectedAssignmentId}
                    onChange={(event) =>
                      setSelectedAssignmentId(event.target.value)
                    }
                  >
                    <option value="">
                      {workItems === undefined
                        ? "Loading assigned scopes..."
                        : "Choose assigned scope"}
                    </option>
                    {(workItems ?? []).map((item) => (
                      <option key={item._id} value={item.assignmentId}>
                        {item.objectType === "proposal" ? "Planning" : "Build"} -{" "}
                        {item.parentName} - {item.milestoneName}
                        {item.submilestoneName ? ` / ${item.submilestoneName}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-xs font-medium uppercase">
                    Evidence file
                  </span>
                  <Input
                    accept="image/jpeg,image/png,image/heic,image/webp,application/pdf"
                    disabled={uploading}
                    nativeInput
                    type="file"
                    onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-xs font-medium uppercase">
                    Caption
                  </span>
                  <Input
                    disabled={uploading}
                    placeholder="Forms poured, rough-in complete, delivery staged"
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-xs font-medium uppercase">
                    Tags
                  </span>
                  <Input
                    disabled={uploading}
                    placeholder="photo, foundation, delivery"
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                  />
                </label>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-xs">
                  Contractor evidence is supporting context only. It does not
                  complete milestones or release draw funds.
                </p>
                <Button
                  disabled={uploading || !(file && selectedWorkItem)}
                  onClick={submitEvidence}
                  type="button"
                >
                  {uploading ? "Uploading..." : "Upload evidence"}
                </Button>
              </div>
              {uploadMessage ? (
                <p className="text-muted-foreground text-sm">{uploadMessage}</p>
              ) : null}
            </div>
          </FramePanel>
        </Frame>

        <Frame>
          <FramePanel className="p-0">
            {evidence === undefined ? (
              <p className="p-5 text-muted-foreground text-sm">Loading evidence...</p>
            ) : evidence.length === 0 ? (
              <div className="p-5">
                <p className="text-muted-foreground text-sm">
                  You have not submitted any evidence yet. Upload images or PDFs
                  against your assigned milestones above.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {evidence.map((item) => (
                  <li key={item._id} className="flex items-center justify-between p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.caption}</p>
                      <p className="text-muted-foreground text-xs">
                        {item.fileName} · {item.milestoneKey} ·{" "}
                        {humanize(item.feedbackState)}
                      </p>
                    </div>
                    {item.feedbackNote ? (
                      <span className="ml-3 max-w-[12rem] truncate text-xs text-muted-foreground">
                        {item.feedbackNote}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </FramePanel>
        </Frame>
      </div>
    </main>
  );
}

function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
