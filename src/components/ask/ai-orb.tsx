'use client';
import { useEffect, useRef } from 'react';

/**
 * The animated AI orb (Lottie). The player (~45 KB) and the animation load only where the
 * orb is shown; until then — and for people who prefer less motion — a still frame is shown.
 */
export function AiOrb({ size = 40, className = '' }: { size?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let anim: { destroy: () => void } | null = null;
    let dead = false;
    (async () => {
      try {
        const [{ default: lottie }, data] = await Promise.all([
          import('lottie-web/build/player/lottie_light'),
          fetch('/brand/ai-orb.json').then((r) => r.json()),
        ]);
        if (dead || !box.current) return;
        box.current.innerHTML = '';
        anim = lottie.loadAnimation({ container: box.current, renderer: 'svg', loop: true, autoplay: true, animationData: data,
          rendererSettings: { viewBoxOnly: true, preserveAspectRatio: 'xMidYMid slice' } });
      } catch { /* keep the still image */ }
    })();
    return () => { dead = true; anim?.destroy(); };
  }, []);
  // the orb fills the middle ~62% of the frame: scale the box up so it fills `size`
  return (
    <span className={`relative inline-block shrink-0 overflow-hidden rounded-full ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <div ref={box} className="absolute" style={{ width: size * 1.6, height: size * 1.6, left: -size * 0.3, top: -size * 0.3 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ai-orb.webp" alt="" style={{ position: 'absolute', left: size * 0.3, top: size * 0.3, width: size, height: size }} />
      </div>
    </span>
  );
}
