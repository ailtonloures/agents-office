import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { createOfficeRenderer, type OfficeRenderer } from '../pixel/officeRenderer';
import {
  computeRenderScale,
  computeZoom,
  MAX_ZOOM,
  representativeTimeMs,
  SCENE_HEIGHT,
  SCENE_WIDTH,
} from '../pixel/sceneView';

export interface PixelOfficeProps {
  className?: string;
  style?: CSSProperties;
  /** Highest integer zoom (default 6). The zoom is `floor(containerWidth / 320)`, capped. */
  maxZoom?: number;
  /** Draw one representative frame instead of animating (also forced by prefers-reduced-motion). */
  staticFrame?: boolean;
  /** Overrides the translated `a11y.heroScene` label. */
  ariaLabel?: string;
}

const BASE_URL = `${import.meta.env.BASE_URL}sprites/`;
const FALLBACK_SRC = `${BASE_URL}office-static.png`;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type Status = 'loading' | 'ready' | 'failed';

/**
 * The animated hero office: a canvas that plays the scene of `officeLogic` with sprites of the
 * default skin. Pauses off screen and in background tabs, shows a still frame for reduced
 * motion, and falls back to a static image when the canvas or the sprites cannot be used.
 */
export function PixelOffice({
  className,
  style,
  maxZoom = MAX_ZOOM,
  staticFrame = false,
  ariaLabel,
}: PixelOfficeProps) {
  const { t } = useI18n();
  const label = ariaLabel ?? t('a11y.heroScene');
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const rescaleRef = useRef<(() => void) | null>(null);

  // Zoom follows the container width.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => {
      const next = computeZoom(wrap.clientWidth, maxZoom);
      setZoom(next);
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [maxZoom]);

  // Renderer, loop and visibility handling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      setStatus('failed');
      return;
    }

    let disposed = false;
    let renderer: OfficeRenderer | null = null;
    let raf = 0;
    let visible = true;
    let scale = 0;
    const origin = performance.now();
    const motion = typeof matchMedia === 'function' ? matchMedia(REDUCED_MOTION_QUERY) : null;
    let reduced = staticFrame || (motion?.matches ?? false);
    let stillTime = -1;

    const resize = () => {
      const next = computeRenderScale(zoomRef.current, window.devicePixelRatio);
      if (next === scale) return false;
      scale = next;
      canvas.width = SCENE_WIDTH * scale;
      canvas.height = SCENE_HEIGHT * scale;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      return true;
    };

    const paintStill = () => {
      if (!renderer) return;
      if (stillTime < 0) stillTime = representativeTimeMs();
      renderer.draw(ctx, stillTime);
    };

    const frame = () => {
      raf = 0;
      if (disposed || !renderer) return;
      renderer.draw(ctx, performance.now() - origin);
      raf = requestAnimationFrame(frame);
    };

    const sync = () => {
      if (disposed || !renderer) return;
      const run = visible && !document.hidden && !reduced;
      if (run && raf === 0) raf = requestAnimationFrame(frame);
      if (!run && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (reduced) paintStill();
    };

    const onVisibility = () => sync();
    const onMotion = () => {
      reduced = staticFrame || (motion?.matches ?? false);
      sync();
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) visible = last.isIntersecting;
        sync();
      });
      observer.observe(canvas);
    }
    document.addEventListener('visibilitychange', onVisibility);
    motion?.addEventListener('change', onMotion);

    resize();
    createOfficeRenderer(BASE_URL)
      .then((r) => {
        if (disposed) return;
        renderer = r;
        setStatus('ready');
        sync();
        if (!reduced && raf === 0 && visible && !document.hidden)
          raf = requestAnimationFrame(frame);
      })
      .catch(() => {
        if (!disposed) setStatus('failed');
      });

    // Re-scale (zoom or DPR change); a still frame needs a repaint.
    const rescale = () => {
      if (resize() && reduced) paintStill();
    };
    rescaleRef.current = rescale;
    window.addEventListener('resize', rescale);

    return () => {
      disposed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      motion?.removeEventListener('change', onMotion);
      window.removeEventListener('resize', rescale);
      rescaleRef.current = null;
    };
  }, [staticFrame]);

  useEffect(() => {
    zoomRef.current = zoom;
    rescaleRef.current?.();
  }, [zoom]);

  const cssWidth = SCENE_WIDTH * zoom;
  const sizeStyle: CSSProperties = {
    width: cssWidth,
    maxWidth: '100%',
    aspectRatio: `${SCENE_WIDTH} / ${SCENE_HEIGHT}`,
    height: 'auto',
  };

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ display: 'flex', justifyContent: 'center', width: '100%', ...style }}
      role="img"
      aria-label={label}
    >
      {status === 'failed' ? (
        <img className="pixel" src={FALLBACK_SRC} alt="" style={sizeStyle} draggable={false} />
      ) : (
        <canvas
          ref={canvasRef}
          className="pixel"
          width={SCENE_WIDTH}
          height={SCENE_HEIGHT}
          style={{ ...sizeStyle, display: 'block', background: 'transparent' }}
        />
      )}
    </div>
  );
}
