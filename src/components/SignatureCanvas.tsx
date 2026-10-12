import { useRef, useState } from "react";
import type { PointerEvent } from "react";

interface SignatureCanvasProps {
  canvasRef: { current: HTMLCanvasElement | null };
  onSignatureChange: (hasSignature: boolean) => void;
  disabled?: boolean;
}

export default function SignatureCanvas({
  canvasRef,
  onSignatureChange,
  disabled = false,
}: SignatureCanvasProps) {
  const drawing = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = event.currentTarget.getContext("2d");
    const position = point(event);
    if (!ctx || !position) return;
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(position.x, position.y);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  };

  const continueDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext("2d");
    const position = point(event);
    if (!ctx || !position) return;
    ctx.lineTo(position.x, position.y);
    ctx.stroke();
    if (!hasSignature) {
      setHasSignature(true);
      onSignatureChange(true);
    }
  };

  const stopDrawing = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSignatureChange(false);
  };

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <canvas
          ref={(canvas) => {
            canvasRef.current = canvas;
          }}
          width={1200}
          height={260}
          aria-label="Draw your signature here"
          className={`block h-36 w-full touch-none ${disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair"}`}
          onPointerDown={startDrawing}
          onPointerMove={continueDrawing}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Sign using your mouse, trackpad, or touchscreen.</p>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasSignature}
          className="rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
