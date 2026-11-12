import React from 'react';

export type StepState = 'done' | 'current' | 'upcoming';

export const STEPS = [
  { n: 1, title: 'Choose what you are looking for' },
  { n: 2, title: 'Run the scan' },
  { n: 3, title: 'Review your leads' },
  { n: 4, title: 'Reply' },
];

const stateText: Record<StepState, string> = { done: 'Finished', current: 'You are here', upcoming: 'Next' };

export function AppHeader({ leadCount, onSettings, settingsOpen, onSignOut, onReset, menuOpen, onToggleMenu }: { leadCount: number | null; onSettings: () => void; settingsOpen: boolean; onSignOut: () => void; onReset: () => void; menuOpen: boolean; onToggleMenu: () => void }) {
  return (
    <header className="app-header">
      <button type="button" className="header-button menu-toggle" aria-expanded={menuOpen} aria-controls="app-sidebar" onClick={onToggleMenu}>{menuOpen ? 'Close menu' : 'Menu'}</button>
      <div className="brand">
        <strong>Best Leads System AI</strong>
        <span>Find people on YouTube asking for help, and reply to them yourself.</span>
      </div>
      {leadCount !== null && (
        <p className="header-leads" aria-live="polite"><strong>{leadCount}</strong> lead{leadCount === 1 ? '' : 's'} found</p>
      )}
      <nav className="header-menu" aria-label="Account and tools">
        <button type="button" className="header-button header-reset" onClick={onReset} title="Clear this screen and start over. Saved scans are kept.">Reset for new scan</button>
        <button type="button" className="header-button" aria-expanded={settingsOpen} aria-controls="settings-panel" onClick={onSettings}>Settings</button>
        <button type="button" className="header-button" onClick={onSignOut}>Sign out</button>
      </nav>
    </header>
  );
}

export function StepProgress({ states, activeStep, onNavigate }: { states: StepState[]; activeStep: number; onNavigate: (step: number) => void }) {
  return (
    <nav className="step-progress" aria-label="Your progress">
      <ol>
        {STEPS.map((step, index) => (
          <li key={step.n} className={`progress-step ${activeStep === step.n ? 'current' : states[index]}`}>
            <button type="button" onClick={() => onNavigate(step.n)} aria-current={activeStep === step.n ? 'step' : undefined} aria-label={`Go to step ${step.n}: ${step.title}`}>
              <span className="progress-number" aria-hidden="true">{states[index] === 'done' ? '✓' : step.n}</span>
              <span className="progress-text">
                <strong>{step.title}</strong>
                <small>{stateText[activeStep === step.n ? 'current' : states[index]]}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function StepSection({ n, state, help, children, aside, collapsed = false, summary, onChange, badgeText }: { n: number; state: StepState; help: string; children: React.ReactNode; aside?: React.ReactNode; collapsed?: boolean; summary?: string; onChange?: () => void; badgeText?: string }) {
  const step = STEPS[n - 1];
  return (
    <section id={`step-${n}`} className={`step-section ${state}${collapsed ? ' collapsed' : ''}`} aria-labelledby={`step-${n}-title`}>
      {collapsed ? (
        <div className="step-compact">
          <h2 id={`step-${n}-title`} tabIndex={-1}>Step {n} · {summary || step.title}</h2>
          <button type="button" className="quiet-button" onClick={onChange} aria-label={`Change step ${n}: ${step.title}`}>Change</button>
        </div>
      ) : <><div className="step-heading">
        <div>
          <span className="step-badge">Step {n} of 4 · {badgeText || stateText[state]}</span>
          <h2 id={`step-${n}-title`} tabIndex={-1}>{step.title}</h2>
          <p className="step-help">{help}</p>
        </div>
        {aside}
      </div>
      {children}</>}
    </section>
  );
}

export function StatCard({ label, value, note, emphasis, muted }: { label: string; value: string | number; note?: string; emphasis?: boolean; muted?: boolean }) {
  return (
    <div className={`stat-card${emphasis ? ' emphasis' : ''}${muted ? ' muted' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
