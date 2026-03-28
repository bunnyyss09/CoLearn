import React from 'react';

interface AnimatedBackgroundProps {
  isDark: boolean;
}

const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({ isDark }) => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Top-left blob */}
      <div
        className={`absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl animate-float ${
          isDark ? 'bg-brand-600/20' : 'bg-brand-300/30'
        }`}
      />
      {/* Top-right blob */}
      <div
        className={`absolute -top-20 right-10 w-80 h-80 rounded-full blur-3xl animate-float-delayed ${
          isDark ? 'bg-accent-500/15' : 'bg-accent-400/20'
        }`}
      />
      {/* Bottom-center blob */}
      <div
        className={`absolute bottom-10 left-1/3 w-72 h-72 rounded-full blur-3xl animate-pulse-glow ${
          isDark ? 'bg-brand-500/10' : 'bg-brand-200/30'
        }`}
      />
      {/* Extra small accent blob */}
      <div
        className={`absolute top-1/2 right-1/4 w-48 h-48 rounded-full blur-3xl animate-float ${
          isDark ? 'bg-brand-400/10' : 'bg-accent-400/15'
        }`}
        style={{ animationDelay: '-7s' }}
      />
    </div>
  );
};

export default AnimatedBackground;
