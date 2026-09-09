/**
 * ModelUpload — upload a 3D model (.glb/.gltf) and arm it for placement
 * (PRD §12.3, §16.2). On success the armed URL flows into every newly
 * placed tile until cleared. Storage-unconfigured servers surface a clear
 * inline notice (503) rather than failing silently.
 */

import { useRef, useState } from "react";
import { Box, Upload, CheckCircle2, AlertTriangle } from "lucide-react";

import { ARCHIVE_MESSAGE } from "../../services/api";
import { Button } from "../ui/button";

interface ModelUploadProps {
  armedUrl: string | null;
  armedName: string | null;
  onArm: (url: string | null, name: string | null) => void;
}

type Phase = "idle" | "uploading" | "success" | "error";

export function ModelUpload({ armedUrl, armedName, onArm }: ModelUploadProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (_file: File) => {
    setPhase("error");
    setMessage(ARCHIVE_MESSAGE);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void onFile(file);
    event.target.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-faint">
        3D Model
      </p>

      <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-300 flex items-start gap-1.5">
        <AlertTriangle className="size-3.5 shrink-0 text-amber-400 mt-0.5" />
        <span>{ARCHIVE_MESSAGE}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        disabled={true}
        onChange={handleChange}
        aria-label="Upload a 3D model"
      />

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={true}
        title={ARCHIVE_MESSAGE}
        className="w-full justify-start gap-2 opacity-60 cursor-not-allowed"
      >
        <Upload className="size-4" aria-hidden="true" />
        <span>Upload Disabled (Archived)</span>
      </Button>

      {phase === "success" && armedName && (
        <p className="flex items-start gap-1.5 px-1 text-[11px] text-[#7cffb2]" role="status">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="break-all">{message}</span>
        </p>
      )}

      {phase === "error" && (
        <p className="flex items-start gap-1.5 px-1 text-[11px] text-[#ff6b6b]" role="alert">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}

      {armedUrl && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onArm(null, null)}
          className="w-full justify-start gap-2"
        >
          <Box className="size-4" aria-hidden="true" />
          Clear armed model
        </Button>
      )}

      <p className="px-1 text-[10px] leading-relaxed text-faint">
        Uploaded models arm the next placement. Accepted: .glb, .gltf (max 25 MB).
      </p>
    </div>
  );
}
