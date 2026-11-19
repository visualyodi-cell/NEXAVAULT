import { useEffect, useRef } from 'react';

interface NovaParticlesFieldProps {
  reducedMotion?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
  phase: number;
  twinkleSpeed: number;
  depth: number;
  spriteIndex: 0 | 1 | 2 | 3; // 0: yellow spark, 1: purple spark, 2: yellow bokeh, 3: purple bokeh
}

function createGlowSprite(
  innerColor: string,
  midColor: string,
  outerColor: string,
  size = 64
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, innerColor);
    grad.addColorStop(0.28, midColor);
    grad.addColorStop(1, outerColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}

export function NovaParticlesField({
  reducedMotion = false,
}: NovaParticlesFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      reducedMotion ||
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // Pre-bake 4 glowing sprites (zero per-frame gradient allocations)
    const sprites: HTMLCanvasElement[] = [
      // 0: Bright golden-yellow spark
      createGlowSprite(
        'rgba(255, 255, 240, 1)',
        'rgba(253, 224, 71, 0.85)',
        'rgba(250, 204, 21, 0)'
      ),
      // 1: Bright lavender-purple spark
      createGlowSprite(
        'rgba(250, 245, 255, 1)',
        'rgba(192, 132, 252, 0.85)',
        'rgba(168, 85, 247, 0)'
      ),
      // 2: Large warm amber bokeh
      createGlowSprite(
        'rgba(254, 240, 138, 0.75)',
        'rgba(250, 204, 21, 0.34)',
        'rgba(234, 179, 8, 0)'
      ),
      // 3: Large violet-purple bokeh
      createGlowSprite(
        'rgba(216, 180, 254, 0.72)',
        'rgba(168, 85, 247, 0.32)',
        'rgba(139, 92, 246, 0)'
      ),
    ];

    let width = window.innerWidth || 1440;
    let height = window.innerHeight || 900;
    const dpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth || 1440;
      height = window.innerHeight || 900;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Seed 112 particles across full viewport (mix of large bokeh, medium orbs, crisp sparks)
    const count = 112;
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const randA = ((i * 73 + 19) % 1000) / 1000;
      const randB = ((i * 197 + 43) % 1000) / 1000;
      const randC = ((i * 313 + 71) % 1000) / 1000;
      const randD = ((i * 457 + 11) % 1000) / 1000;

      const isBokeh = i % 5 === 0;
      const isPurple = i % 2 === 1;
      const spriteIndex: 0 | 1 | 2 | 3 = isBokeh
        ? isPurple
          ? 3
          : 2
        : isPurple
        ? 1
        : 0;

      particles.push({
        x: randA * width,
        y: randB * height,
        vx: (randC - 0.5) * (isBokeh ? 10 : 18),
        vy: -(8 + randD * (isBokeh ? 14 : 24)),
        size: isBokeh ? 26 + randC * 28 : 7 + randD * 13,
        baseAlpha: isBokeh ? 0.24 + randA * 0.2 : 0.42 + randB * 0.44,
        phase: randA * Math.PI * 2,
        twinkleSpeed: 1.0 + randC * 1.8,
        depth: 0.4 + randD * 0.8,
        spriteIndex,
      });
    }

    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const onPointerMove = (e: PointerEvent) => {
      if (!width || !height) return;
      pointer.targetX = (e.clientX / width - 0.5) * 28;
      pointer.targetY = (e.clientY / height - 0.5) * 20;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', resize);

    let rafId = 0;
    let timerId = 0;
    let disposed = false;
    let lastTime = performance.now();
    const startTime = lastTime;

    const renderFrame = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.06, (now - lastTime) / 1000);
      lastTime = now;
      const elapsed = (now - startTime) / 1000;

      if (!prefersReduced) {
        pointer.x += (pointer.targetX - pointer.x) * Math.min(1, dt * 4);
        pointer.y += (pointer.targetY - pointer.y) * Math.min(1, dt * 4);
      }

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!prefersReduced) {
          p.x += (p.vx + Math.sin(elapsed * 0.7 + p.phase) * 7) * dt;
          p.y += p.vy * dt;

          const pad = p.size + 10;
          if (p.y < -pad) {
            p.y = height + pad;
            p.x = ((p.x + width * 0.37) % width + width) % width;
          }
          if (p.x < -pad) p.x = width + pad;
          else if (p.x > width + pad) p.x = -pad;
        }

        const twinkle = prefersReduced
          ? 1
          : 0.65 + 0.35 * Math.sin(elapsed * p.twinkleSpeed + p.phase);
        const alpha = Math.max(0.08, Math.min(0.95, p.baseAlpha * twinkle));

        const drawX = p.x + pointer.x * p.depth;
        const drawY = p.y + pointer.y * p.depth;

        ctx.globalAlpha = alpha;
        ctx.drawImage(
          sprites[p.spriteIndex],
          drawX - p.size / 2,
          drawY - p.size / 2,
          p.size,
          p.size
        );
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = () => {
      if (disposed) return;
      renderFrame(performance.now());
      if (prefersReduced) return;
      if (isSoftwareGl) {
        timerId = window.setTimeout(loop, 85);
      } else {
        rafId = window.requestAnimationFrame(loop);
      }
    };

    loop();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', resize);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="nova-particles-field"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-20 h-full w-full"
    />
  );
}
