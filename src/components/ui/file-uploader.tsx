import {
  CheckCircle2,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import React, { useRef, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";

interface FilePreviewProps {
  file: File;
  onRemove: () => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({ file, onRemove }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  React.useEffect(() => {
    if (
      file.type.startsWith("image/") &&
      typeof URL.createObjectURL === "function"
    ) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL?.(url);
    }
    setPreviewUrl(null);
    return undefined;
  }, [file]);

  return (
    <li className="flex min-w-0 items-center gap-3 rounded-lg border bg-background p-2 shadow-xs/5">
      {previewUrl ? (
        <img
          alt=""
          className="size-10 rounded-md border object-cover"
          src={previewUrl}
        />
      ) : (
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <FileText className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">{file.name}</div>
        <div className="text-muted-foreground text-xs">
          {formatFileSize(file.size)}
        </div>
      </div>
      <Button
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <X className="size-4" />
      </Button>
    </li>
  );
};

interface FileUploaderProps {
  accept?: string;
  actionLabel?: string;
  className?: string;
  description?: string;
  disabled?: boolean;
  files?: File[];
  helperText?: string;
  inputLabel?: string;
  inputTestId?: string;
  multiple?: boolean;
  onFilesChange?: (files: File[]) => void;
  onUpload?: (files: File[]) => Promise<void> | void;
  showUploadButton?: boolean;
  title?: string;
  variant?: "compact" | "default";
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  accept,
  actionLabel = "Upload",
  className,
  description = "Drop files here or browse from your device.",
  disabled = false,
  files,
  helperText = "PDF, image, spreadsheet, and document files are supported.",
  inputLabel = "Select files",
  inputTestId,
  multiple = true,
  onFilesChange,
  onUpload,
  showUploadButton = true,
  title = "Upload files",
  variant = "default",
}) => {
  const [internalSelectedFiles, setInternalSelectedFiles] = useState<File[]>(
    [],
  );
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFiles = files ?? internalSelectedFiles;

  const setSelectedFiles = (
    updater: File[] | ((currentFiles: File[]) => File[]),
  ) => {
    const nextFiles =
      typeof updater === "function" ? updater(selectedFiles) : updater;
    if (files === undefined) {
      setInternalSelectedFiles(nextFiles);
    }
    onFilesChange?.(nextFiles);
  };

  const handleFiles = (fileList: FileList) => {
    if (disabled) {
      return;
    }
    const fileArr = Array.from(fileList);
    setSelectedFiles((prev) => {
      const nextFiles = fileArr.filter(
        (file) =>
          !prev.some(
            (candidate) =>
              candidate.name === file.name && candidate.size === file.size,
          ),
      );
      return multiple ? [...prev, ...nextFiles] : nextFiles.slice(0, 1);
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      handleFiles(event.target.files);
    }
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      handleFiles(event.dataTransfer.files);
    }
  };

  async function handleUpload() {
    if (selectedFiles.length === 0 || uploading || disabled) {
      return;
    }
    setUploading(true);
    setProgress(25);
    try {
      if (onUpload) {
        await onUpload(selectedFiles);
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 240));
      }
      setProgress(100);
      setSelectedFiles([]);
    } catch {
      setProgress(0);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cn("grid w-full gap-3", className)}>
      <input
        accept={accept}
        aria-label={inputLabel}
        className="hidden"
        data-testid={inputTestId}
        disabled={disabled}
        multiple={multiple}
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
      <div
        className={cn(
          "group cursor-pointer rounded-xl border border-dashed bg-muted/45 p-4 shadow-xs/5 transition",
          variant === "compact"
            ? "flex min-h-20 items-center text-left"
            : "grid min-h-32 place-items-center text-center",
          "hover:border-foreground/35 hover:bg-muted/60 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
          isDragging && "border-primary bg-primary/10",
          disabled && "cursor-not-allowed opacity-60",
        )}
        onClick={() => {
          if (!disabled) {
            fileInputRef.current?.click();
          }
        }}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) {
            setIsDragging(true);
          }
        }}
        onDrop={handleDrop}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !disabled) {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        data-variant={variant}
      >
        <div
          className={cn(
            "flex max-w-md gap-2",
            variant === "compact"
              ? "flex-row items-start"
              : "flex-col items-center",
          )}
        >
          <span
            className={cn(
              "grid shrink-0 place-items-center rounded-full bg-background text-foreground shadow-xs/5 ring-1 ring-border",
              variant === "compact" ? "size-9" : "size-11",
            )}
          >
            <UploadCloud className="size-5" />
          </span>
          <div>
            <div className="font-semibold text-sm">{title}</div>
            <div className="mt-1 text-muted-foreground text-sm">
              {description}
            </div>
            {variant === "compact" ? (
              <div className="mt-1 text-muted-foreground text-xs">
                {helperText}
              </div>
            ) : null}
          </div>
          {variant === "default" ? (
            <div className="text-muted-foreground text-xs">{helperText}</div>
          ) : null}
        </div>
      </div>

      {selectedFiles.length > 0 ? (
        <ul className="grid gap-2">
          {selectedFiles.map((file, index) => (
            <FilePreview
              file={file}
              key={`${file.name}-${file.size}-${index}`}
              onRemove={() =>
                setSelectedFiles((current) =>
                  current.filter((_, candidateIndex) => candidateIndex !== index),
                )
              }
            />
          ))}
        </ul>
      ) : null}

      {uploading ? (
        <div
          aria-label="Upload progress"
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progress}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-200"
            style={{ width: `${Math.max(progress, 15)}%` }}
          />
        </div>
      ) : null}

      {showUploadButton ? (
        <Button
          className="justify-self-center"
          disabled={selectedFiles.length === 0 || uploading || disabled}
          onClick={() => void handleUpload()}
          type="button"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : selectedFiles.length > 0 ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <UploadCloud className="size-4" />
          )}
          {uploading ? "Uploading..." : actionLabel}
        </Button>
      ) : null}
    </div>
  );
};

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
