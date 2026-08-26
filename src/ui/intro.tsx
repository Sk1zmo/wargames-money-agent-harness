"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-driven intro machinery.
 *
 * Everything here is generated in the browser: no video file, no model, no
 * external request. That is a deliberate constraint rather than a limitation.
 * A landing sequence that depends on a multi-megabyte asset fails exactly when
 * the network is worst, and this page's whole claim is that it is an instrument
 * you can trust to work.
 */

/** Marks children visible once they enter the viewport, once. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Without IntersectionObserver the content simply shows. Progressive
    // enhancement, not a hard dependency.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      data-visible={visible}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/**
 * The deck background: a slow radar sweep over a grid.
 *
 * Drawn on canvas because it is a few hundred bytes of code against a video
 * that would be megabytes, and it stays sharp at any viewport. It stops
 * entirely under reduced-motion and when the tab is hidden, so it is not
 * burning a laptop battery in a background tab.
 */
export function DeckBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let angle = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.52;
      const maxR = Math.hypot(w, h) * 0.42;

      // Range rings.
      ctx.strokeStyle = "rgba(56, 189, 248, 0.09)";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i += 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, (maxR / 4) * i, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Sweep wedge.
      const grad = ctx.createConicGradient?.(angle, cx, cy);
      if (grad) {
        grad.addColorStop(0, "rgba(56, 189, 248, 0.16)");
        grad.addColorStop(0.06, "rgba(56, 189, 248, 0.03)");
        grad.addColorStop(0.35, "rgba(56, 189, 248, 0)");
        grad.addColorStop(1, "rgba(56, 189, 248, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Leading edge.
      ctx.strokeStyle = "rgba(56, 189, 248, 0.28)";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
      ctx.stroke();

      if (!reduced) angle += 0.0035;
      if (running) raf = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      running = !document.hidden;
      if (running) raf = requestAnimationFrame(draw);
      else cancelAnimationFrame(raf);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

/** Types a string out, once, when it becomes visible. */
export function Typewriter({ text, speed = 26 }: { text: string; speed?: number }) {
  const [shown, setShown] = useState("");
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduced =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(text);
      return;
    }

    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  // The full text is always in the accessibility tree; only the visual
  // presentation is progressive.
  return (
    <span ref={ref}>
      <span aria-hidden>{shown}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Scroll progress 0..1 across the whole document, for parallax. */
export function useScrollProgress(): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(max <= 0 ? 0 : Math.min(1, window.scrollY / max));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return progress;
}
