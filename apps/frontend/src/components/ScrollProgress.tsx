import { motion, useScroll, useSpring, useReducedMotion } from 'framer-motion';

const ScrollProgress = () => {
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  if (shouldReduceMotion) return null;

  return (
    <>
      {/* Glow layer */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[3px] z-50 origin-left blur-[4px] opacity-60"
        style={{
          scaleX,
          background: 'linear-gradient(90deg, #00f0ff, #bf5af2, #ff2d55, #30d158, #00f0ff)',
          backgroundSize: '200% 100%',
          animation: 'text-shimmer 3s ease-in-out infinite',
        }}
      />
      {/* Sharp bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[2px] z-50 origin-left"
        style={{
          scaleX,
          background: 'linear-gradient(90deg, #00f0ff, #bf5af2, #ff2d55, #30d158, #00f0ff)',
          backgroundSize: '200% 100%',
          animation: 'text-shimmer 3s ease-in-out infinite',
        }}
      />
    </>
  );
};

export default ScrollProgress;
