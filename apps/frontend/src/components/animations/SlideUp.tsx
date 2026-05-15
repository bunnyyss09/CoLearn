import { motion, useReducedMotion } from 'framer-motion';
import React from 'react';

interface SlideUpProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  once?: boolean;
}

const SlideUp: React.FC<SlideUpProps> = ({
  children,
  delay = 0,
  duration = 0.7,
  className,
  once = true,
}) => {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, filter: 'blur(10px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once }}
      transition={{
        duration,
        delay,
        ease: [0.16, 1, 0.3, 1],
        filter: { duration: duration * 0.7 },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default SlideUp;
