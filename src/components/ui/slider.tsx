import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Slider = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="range"
      className={cn('w-full', className)}
      {...props}
    />
  ),
);
Slider.displayName = 'Slider';
