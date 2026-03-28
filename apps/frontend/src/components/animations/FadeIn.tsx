import { motion, useReducedMotion } from 'framer-motion';
import React from 'react';

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  once?: boolean;
}

const FadeIn: React.FC<FadeInProps> = ({
  children,
  delay = 0,
  duration = 0.5,
  className,
  once = true,
}) => {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once }}
      transition={{ duration, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default FadeIn;
