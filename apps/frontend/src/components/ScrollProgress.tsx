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
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 bg-gradient-brand z-50 origin-left"
      style={{ scaleX }}
    />
  );
};

export default ScrollProgress;
