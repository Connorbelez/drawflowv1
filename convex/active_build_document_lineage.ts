import type { Doc, Id, MutationCtx } from "./types";

const GOVERNING_DOCUMENT_TYPES = new Set(["budget", "permit", "plan"]);

function compareProposalDocuments(
  left: Doc<"proposalDocuments">,
  right: Doc<"proposalDocuments">,
) {
  return (
    left.documentType.localeCompare(right.documentType) ||
    left.createdAt - right.createdAt ||
    left.updatedAt - right.updatedAt ||
    left._creationTime - right._creationTime ||
    String(left._id).localeCompare(String(right._id))
  );
}

export async function copyProposalDocumentsToActiveBuild(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    documents: Doc<"proposalDocuments">[];
    now: number;
    organizationId: string;
    proposalId: Id<"buildProposals">;
  },
) {
  const documentsByType = new Map<
    Doc<"proposalDocuments">["documentType"],
    Doc<"proposalDocuments">[]
  >();
  for (const document of [...input.documents].sort(compareProposalDocuments)) {
    const documents = documentsByType.get(document.documentType) ?? [];
    documents.push(document);
    documentsByType.set(document.documentType, documents);
  }

  for (const documents of documentsByType.values()) {
    const governing = GOVERNING_DOCUMENT_TYPES.has(documents[0]!.documentType);
    let priorDocumentId: Id<"buildDocuments"> | undefined;
    for (const [index, document] of documents.entries()) {
      const superseded = governing && index < documents.length - 1;
      const documentId = await ctx.db.insert("buildDocuments", {
        brokerageId: input.brokerageId,
        buildId: input.buildId,
        contractorVisible: document.contractorVisible,
        createdAt: document.createdAt,
        documentType: document.documentType,
        fileName: document.fileName,
        mimeType: document.mimeType,
        organizationId: input.organizationId,
        proposalId: input.proposalId,
        sizeBytes: document.sizeBytes,
        status: superseded ? "superseded" : document.status,
        storageId: document.storageId,
        ...(governing && priorDocumentId
          ? { supersedesDocumentId: priorDocumentId }
          : {}),
        ...(superseded ? { supersededAt: input.now } : {}),
        updatedAt: input.now,
        uploadedByWorkosUserId: document.uploadedByWorkosUserId,
        version: index + 1,
      });
      if (governing && priorDocumentId) {
        await ctx.db.patch(priorDocumentId, {
          supersededByDocumentId: documentId,
          updatedAt: input.now,
        });
      }
      priorDocumentId = documentId;
    }
  }
}
