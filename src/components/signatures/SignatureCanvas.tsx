'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Draw-to-sign canvas.
 *
 * Pointer Events rather than separate mouse/touch handlers: one code path covers
 * mouse, finger and stylus, and gets pressure and palm rejection from the
 * browser for free.
 *
 * The canvas is backed at device pixel ratio so a signature drawn on a phone is
 * not a blurry mess in the PDF, and `touch-action: none` stops the page scrolling
 * out from under someone's finger mid-stroke.
 */

interface SignatureCanvasProps {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

export default function SignatureCanvas({ onChange, disabled = false }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  /** Sizes the backing store to the CSS box times DPR. */
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  useEffect(() => {
    setupCanvas();

    // Rotating a phone resizes the canvas, which clears it. Re-setting up keeps
    // the drawing surface correct; the stroke is lost, which is honest — a
    // stretched signature would be a different mark.
    const onResize = () => {
      setupCanvas();
      hasInk.current = false;
      setEmpty(true);
      onChange(null);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setupCanvas, onChange]);

  const positionOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    // Capture so a stroke that leaves the canvas still ends cleanly.
    e.currentTarget.setPointerCapture(e.pointerId);

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const { x, y } = positionOf(e);
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    e.preventDefault();

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const { x, y } = positionOf(e);
    ctx.lineTo(x, y);
    ctx.stroke();

    if (!hasInk.current) {
      hasInk.current = true;
      setEmpty(false);
    }
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // A dot counts: someone who taps once has still made a mark deliberately.
    onChange(hasInk.current ? canvas.toDataURL('image/png') : null);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          // touch-action:none is what stops the page scrolling while drawing.
          className={`w-full h-44 rounded-xl border-2 bg-white touch-none ${
            disabled ? 'border-slate-100 opacity-60' : 'border-dashed border-slate-300'
          }`}
          aria-label="Signature drawing area"
        />

        {empty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs text-slate-300 font-semibold">Draw your signature here</p>
          </div>
        )}

        {/* The line people expect to sign on. */}
        <div className="absolute bottom-6 left-6 right-6 border-b border-slate-200 pointer-events-none" />
      </div>

      <div className="flex items-center justify-between mt-2">
        <p className="text-[10px] text-slate-400">Use your finger, mouse or stylus.</p>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || empty}
          className="text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
