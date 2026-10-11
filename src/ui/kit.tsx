/**
 * Interface primitives. Visual language: graphite glass panels, hairline borders, mono
 * micro-labels and a single restrained ice-blue accent.
 */
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

export function Panel({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'pointer-events-auto rounded-2xl border border-white/[0.07] bg-graphite-900/72 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl backdrop-saturate-150',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('font-mono text-[10px] uppercase tracking-[0.18em] text-graphite-300', className)}>{children}</div>;
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="px-5 pb-3 pt-5">
      <Label className="text-ice-400/90">{eyebrow}</Label>
      <h2 className="mt-1.5 text-[19px] font-[550] leading-tight tracking-[-0.01em] text-paper">{title}</h2>
      {children && <p className="mt-1.5 text-[12.5px] leading-relaxed text-graphite-300">{children}</p>}
    </div>
  );
}

export function Group({ label, children, aside, className }: { label: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cx('border-t border-white/[0.06] px-5 py-3.5', className)}>
      <div className="mb-2.5 flex items-center justify-between">
        <Label>{label}</Label>
        {aside}
      </div>
      {children}
    </div>
  );
}

type BtnVariant = 'ghost' | 'subtle' | 'solid' | 'accent';
export function Button({
  children,
  variant = 'subtle',
  icon,
  active,
  className,
  size = 'md',
  ...rest
}: { variant?: BtnVariant; icon?: IconName; active?: boolean; size?: 'sm' | 'md' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-lg font-[500] transition-[background,color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-400/70 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-7 px-2.5 text-[11.5px]' : 'h-9 px-3.5 text-[12.5px]',
        variant === 'ghost' && 'text-graphite-300 hover:bg-white/[0.05] hover:text-paper',
        variant === 'subtle' && 'border border-white/[0.07] bg-white/[0.035] text-paper/90 hover:border-white/[0.12] hover:bg-white/[0.07]',
        variant === 'solid' && 'bg-paper text-graphite-950 hover:bg-white',
        variant === 'accent' && 'bg-ice-400 text-graphite-950 hover:bg-ice-300',
        active && 'border-ice-400/40 bg-ice-400/[0.12] text-ice-300 hover:border-ice-400/60 hover:bg-ice-400/[0.16]',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, active, className, ...rest }: { icon: IconName; label: string; active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'pointer-events-auto grid h-9 w-9 place-items-center rounded-xl text-graphite-300 transition-colors duration-200 hover:bg-white/[0.06] hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-400/70',
        active && 'bg-ice-400/[0.12] text-ice-300',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('group flex cursor-pointer items-center justify-between gap-3 py-1.5', disabled && 'cursor-not-allowed opacity-40')}>
      <span className="min-w-0">
        <span className="block text-[12.5px] text-paper/90">{label}</span>
        {hint && <span className="block text-[11px] text-graphite-400">{hint}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-[18px] w-8 shrink-0 rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-400/70',
          checked ? 'border-ice-400/60 bg-ice-400/30' : 'border-white/10 bg-white/[0.06]',
        )}
      >
        <span
          className={cx(
            'absolute top-[2px] h-3 w-3 rounded-full transition-[left,background] duration-200 ease-out',
            checked ? 'left-[16px] bg-ice-300 shadow-[0_0_10px_rgba(111,211,239,0.6)]' : 'left-[2px] bg-graphite-300',
          )}
        />
      </button>
    </label>
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  format,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cx('py-1.5', disabled && 'opacity-40')}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[12.5px] text-paper/90">
          {label}
        </label>
        <span className="font-mono text-[11px] tabular-nums text-graphite-300">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        id={id}
        type="range"
        className="a380-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--pct' as string]: `${pct}%` }}
      />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: { value: T; options: { value: T; label: string; icon?: IconName }[]; onChange: (v: T) => void; label?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-white/[0.07] bg-black/20 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md font-[500] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-400/70',
            size === 'sm' ? 'h-6 px-1.5 text-[10.5px]' : 'h-7 px-2 text-[11.5px]',
            value === o.value ? 'bg-white/[0.09] text-paper shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]' : 'text-graphite-400 hover:text-paper/90',
          )}
        >
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, unit, tone }: { label: string; value: ReactNode; unit?: string; tone?: 'ok' | 'warn' | 'bad' | 'dim' }) {
  return (
    <div className="min-w-0">
      <Label className="text-[9px] tracking-[0.16em]">{label}</Label>
      <div
        className={cx(
          'mt-0.5 truncate font-mono text-[13px] tabular-nums',
          tone === 'ok' && 'text-green-ok',
          tone === 'warn' && 'text-amber-warn',
          tone === 'bad' && 'text-red-warn',
          tone === 'dim' && 'text-graphite-400',
          !tone && 'text-paper',
        )}
      >
        {value}
        {unit && <span className="ml-0.5 text-[10px] text-graphite-400">{unit}</span>}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-graphite-300">{children}</kbd>;
}

export function StatusBadge({ status }: { status: 'verified' | 'approx' | 'unverified' }) {
  const map = {
    verified: ['Verified', 'text-green-ok border-green-ok/30 bg-green-ok/[0.08]'],
    approx: ['Approximation', 'text-ice-300 border-ice-400/30 bg-ice-400/[0.08]'],
    unverified: ['Unverified', 'text-amber-warn border-amber-warn/30 bg-amber-warn/[0.08]'],
  } as const;
  const [t, c] = map[status];
  return <span className={cx('inline-flex h-[18px] shrink-0 items-center rounded border px-1.5 font-mono text-[9px] uppercase tracking-[0.12em]', c)}>{t}</span>;
}

export function ScrollArea({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('a380-scroll min-h-0 overflow-y-auto overscroll-contain', className)}>{children}</div>;
}
