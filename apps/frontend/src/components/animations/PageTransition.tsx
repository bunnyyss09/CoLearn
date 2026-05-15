import { motion, useReducedMotion } from 'framer-motion';
import React from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
}

const PageTransition: React.FC<PageTransitionProps> = ({ children }) => {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, filter: 'blur(12px)', scale: 0.98 }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }}
      exit={{ opacity: 0, y: -16, filter: 'blur(12px)', scale: 0.98 }}
      transition={{
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
        opacity: { duration: 0.4 },
        scale: { duration: 0.5 },
      }}
      className="min-h-screen"
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
