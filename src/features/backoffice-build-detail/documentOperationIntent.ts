export interface DocumentOperationIntent {
  documentType: "permit" | "budget" | "plan" | "supporting";
  fileName: string;
  supersedesDocumentId?: string;
}

export class DocumentOperationIntentRegistry {
  private readonly keys = new Map<string, string>();

  constructor(
    private readonly createKey: () => string = () => crypto.randomUUID()
  ) {}

  confirm(input: DocumentOperationIntent) {
    this.keys.delete(documentOperationIntentFingerprint(input));
  }

  keyFor(input: DocumentOperationIntent) {
    const fingerprint = documentOperationIntentFingerprint(input);
    const existing = this.keys.get(fingerprint);
    if (existing) {
      return existing;
    }
    const created = this.createKey();
    this.keys.set(fingerprint, created);
    return created;
  }
}

export function documentOperationIntentFingerprint(
  input: DocumentOperationIntent
) {
  return JSON.stringify({
    documentType: input.documentType,
    fileName: input.fileName.trim(),
    supersedesDocumentId: input.supersedesDocumentId ?? null,
  });
}
