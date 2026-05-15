import React, { useMemo } from 'react';

interface AnimatedBackgroundProps {
  isDark: boolean;
}

const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({ isDark }) => {
  // Generate particles once
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 8}s`,
      duration: `${6 + Math.random() * 8}s`,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.4 + 0.1,
    })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Perspective grid with vanishing point */}
      <div className="absolute inset-0 grid-atmosphere" />

      {/* Aurora orbs */}
      <div
        className={`absolute -top-1/4 -left-1/4 w-[60vw] h-[60vh] rounded-full animate-orb-1 ${
          isDark
            ? 'bg-[radial-gradient(ellipse,rgba(0,240,255,0.08),transparent_60%)]'
            : 'bg-[radial-gradient(ellipse,rgba(0,240,255,0.06),transparent_60%)]'
        }`}
      />
      <div
        className={`absolute -bottom-1/4 -right-1/4 w-[50vw] h-[50vh] rounded-full animate-orb-2 ${
          isDark
            ? 'bg-[radial-gradient(ellipse,rgba(191,90,242,0.08),transparent_60%)]'
            : 'bg-[radial-gradient(ellipse,rgba(191,90,242,0.05),transparent_60%)]'
        }`}
      />
      <div
        className={`absolute top-1/3 left-1/2 -translate-x-1/2 w-[40vw] h-[40vh] rounded-full animate-morph-blob ${
          isDark
            ? 'bg-[radial-gradient(ellipse,rgba(48,209,88,0.05),transparent_60%)]'
            : 'bg-[radial-gradient(ellipse,rgba(48,209,88,0.04),transparent_60%)]'
        }`}
      />

      {/* Scan line */}
      <div className={`absolute inset-x-0 top-0 h-1/2 animate-scan ${
        isDark
          ? 'bg-gradient-to-b from-transparent via-[rgba(0,240,255,0.04)] to-transparent'
          : 'bg-gradient-to-b from-transparent via-[rgba(0,240,255,0.03)] to-transparent'
      }`} />

      {/* Horizon lines */}
      <div className="absolute left-0 right-0 top-24 h-px bg-gradient-to-r from-transparent via-[rgba(0,240,255,0.2)] to-transparent" />
      <div className="absolute left-0 right-0 bottom-20 h-px bg-gradient-to-r from-transparent via-[rgba(191,90,242,0.15)] to-transparent" />
      <div className="absolute top-0 bottom-0 left-1/4 w-px bg-gradient-to-b from-transparent via-[rgba(0,240,255,0.06)] to-transparent" />
      <div className="absolute top-0 bottom-0 right-1/4 w-px bg-gradient-to-b from-transparent via-[rgba(191,90,242,0.06)] to-transparent" />

      {/* Floating particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.left,
            bottom: '-5%',
            width: p.size,
            height: p.size,
            background: p.id % 3 === 0
              ? 'rgba(0, 240, 255, 0.6)'
              : p.id % 3 === 1
              ? 'rgba(191, 90, 242, 0.6)'
              : 'rgba(48, 209, 88, 0.5)',
            boxShadow: `0 0 ${p.size * 3}px currentColor`,
            opacity: isDark ? p.opacity : p.opacity * 0.5,
            animation: `particle-float ${p.duration} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}

      {/* Noise texture */}
      <div className="absolute inset-0 noise-overlay" />

      {/* Vignette */}
      <div className={`absolute inset-0 ${
        isDark
          ? 'bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(7,4,17,0.7)_75%)]'
          : 'bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(255,255,255,0.5)_75%)]'
      }`} />
    </div>
  );
};

export default AnimatedBackground;
