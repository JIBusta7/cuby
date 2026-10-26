import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Tone = 'sun' | 'white' | 'grape' | 'coral' | 'mint' | 'ocean' | 'night' | 'ghost';
type Size = 'xl' | 'lg' | 'md' | 'sm';

const TONES: Record<Tone, string> = {
  sun: 'bg-sun text-night',
  white: 'bg-white text-night',
  grape: 'bg-grape text-white',
  coral: 'bg-coral text-night',
  mint: 'bg-mint text-night',
  ocean: 'bg-ocean text-white',
  night: 'bg-night-3 text-white',
  ghost: 'bg-white/10 text-white',
};

const SIZES: Record<Size, string> = {
  xl: 'h-24 px-14 text-4xl rounded-[28px] gap-5',
  lg: 'h-[72px] px-9 text-2xl rounded-3xl gap-4',
  md: 'h-14 px-6 text-lg rounded-2xl gap-3',
  sm: 'h-11 px-4 text-base rounded-xl gap-2',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  size?: Size;
  /** Tecla que dispara el botón (se muestra como pista). */
  hotkey?: string;
  icon?: ReactNode;
}

export function Button({ tone = 'white', size = 'md', hotkey, icon, className = '', children, ...rest }: Props) {
  return (
    <button
      type="button"
      className={`chunk inline-flex items-center justify-center font-display font-bold tracking-tight whitespace-nowrap select-none disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer ${TONES[tone]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      <span>{children}</span>
      {hotkey && <KeyCap className="ml-1">{hotkey}</KeyCap>}
    </button>
  );
}

export function KeyCap({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex min-w-8 h-8 items-center justify-center rounded-lg border-2 border-current/30 bg-black/10 px-2 font-display text-sm font-bold opacity-80 ${className}`}
    >
      {children}
    </kbd>
  );
}
