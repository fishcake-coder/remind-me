type IconProps = { size?: number; className?: string };

export function GripIcon({ size = 24, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {[7, 12, 17].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.35" />))}
    </svg>
  );
}

export function CheckIcon({ size = 18, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 12 4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon({ size = 18, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsIcon({ size = 18, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 8.25A3.75 3.75 0 1 0 12 15.75 3.75 3.75 0 0 0 12 8.25Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19.2 13.1a7.6 7.6 0 0 0 0-2.2l2-1.55-2-3.46-2.47 1a8.1 8.1 0 0 0-1.9-1.1L14.47 3h-4l-.36 2.79a8.1 8.1 0 0 0-1.9 1.1l-2.47-1-2 3.46 2 1.55a7.6 7.6 0 0 0 0 2.2l-2 1.55 2 3.46 2.47-1a8.1 8.1 0 0 0 1.9 1.1l.36 2.79h4l.36-2.79a8.1 8.1 0 0 0 1.9-1.1l2.47 1 2-3.46-2-1.55Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
