'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
type Size = 'default' | 'sm' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  default:
    'bg-[#7b8866] text-[#120F17] hover:bg-[#9aab82] font-semibold',
  outline:
    'border border-[#7b8866]/60 text-[#7b8866] hover:bg-[#7b8866] hover:text-[#120F17] hover:border-[#7b8866]',
  ghost:
    'text-[#7b8866] hover:bg-[#7b8866]/10 hover:text-white',
  destructive:
    'bg-red-500/80 text-white hover:bg-red-500 border border-red-500/30',
  secondary:
    'bg-[#1e1b28] text-white border border-[#7b8866]/20 hover:border-[#7b8866]/50 hover:bg-[#252030]',
};

const sizes: Record<Size, string> = {
  default: 'h-10 px-5 py-2 text-sm',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-12 px-8 text-base',
  icon: 'h-10 w-10 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b8866]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[#120F17]',
        'disabled:pointer-events-none disabled:opacity-30',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = 'Button';
