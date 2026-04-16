import { memo, useEffect, useRef } from 'react';
import '3px-grid/dist/pixel-grid.full.css';

type PixelGridAnimationType = 'loading' | 'error' | 'idle';

interface PixelGridIndicatorProps {
  type: PixelGridAnimationType;
}

const ANIMATION_CONFIGS = {
  loading: {
    name: 'wave-lr',
    delays: [0, 120, 240, 0, 120, 240, 0, 120, 240],
    duration: 200,
    colors: [
      'cyan',
      'cyan',
      'cyan',
      'cyan',
      'cyan',
      'cyan',
      'cyan',
      'cyan',
      'cyan',
    ],
  },
  error: {
    name: 'center-out',
    delays: [240, 120, 240, 120, 0, 120, 240, 120, 240],
    duration: 200,
    colors: ['red', 'red', 'red', 'red', 'red', 'red', 'red', 'red', 'red'],
  },
  idle: {
    name: 'frost',
    delays: [240, 120, 240, 120, 0, 120, 240, 120, 240],
    duration: 200,
    colors: [
      'blue',
      'cyan',
      'blue',
      'cyan',
      'white',
      'cyan',
      'blue',
      'cyan',
      'blue',
    ],
  },
};

export const PixelGridIndicator = memo(function PixelGridIndicator({
  type,
}: PixelGridIndicatorProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    if (!gridRef.current) return;

    // Dynamically import PixelGrid
    // @ts-ignore - no type definitions available for 3px-grid
    import('3px-grid/dist/pixel-grid.js').then((module) => {
      // @ts-ignore
      const PixelGrid = (module as any).default || module;

      if (gridRef.current && !instanceRef.current) {
        const config = ANIMATION_CONFIGS[type];
        instanceRef.current = PixelGrid.create(gridRef.current, {
          animation: config,
          autoplay: true,
        });
      }
    });

    return () => {
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
    };
  }, [type]);

  return (
    <div
      ref={gridRef}
      className="pixel-grid"
      style={{
        width: 10,
        height: 10,
        transform: 'scale(1.1)',
      }}
    />
  );
});
