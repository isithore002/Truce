export type PayStep = 'idle' | 'signing' | 'simulating' | 'sending' | 'confirmed';

const STEPS: { id: Exclude<PayStep, 'idle'>; label: string }[] = [
  { id: 'signing', label: 'Signing' },
  { id: 'simulating', label: 'Simulating' },
  { id: 'sending', label: 'Sending' },
  { id: 'confirmed', label: 'Confirmed' },
];

export function PayProgress({ step, failed, scheduled }: { step: PayStep; failed?: boolean; scheduled?: boolean }) {
  if (step === 'idle') return null;
  const at = STEPS.findIndex((s) => s.id === step);
  const steps = scheduled ? STEPS.map((s) => (s.id === 'sending' ? { ...s, label: 'Scheduling' } : s.id === 'confirmed' ? { ...s, label: 'Scheduled' } : s)) : STEPS;
  const current = steps[at]?.label;
  return (
    <div className="stack stack--sm">
      <ol className="progress" aria-label="Payment progress">
        {steps.map((s, i) => {
          const state = i < at || (i === at && s.id === 'confirmed') ? 'done' : i === at ? (failed ? 'error' : 'active') : 'todo';
          return (
            <li key={s.id} data-state={state} aria-current={i === at ? 'step' : undefined}>
              {s.label}
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">{failed ? `Stopped at ${current}.` : `${current}.`}</p>
    </div>
  );
}
