import React from 'react';
import type { NicheProfile } from './types';
import { NICHES } from './helpers';

export function NichePicker({ value, enabled, onChange }: { value: NicheProfile; enabled: NicheProfile[]; onChange: (niche: NicheProfile) => void }) {
  return (
    <fieldset className="niche-grid">
      <legend className="visually-hidden">What kind of person are you looking for?</legend>
      {NICHES.filter((niche) => enabled.includes(niche.id)).map((niche) => (
        <label key={niche.id} className={value === niche.id ? 'niche-card selected' : 'niche-card'}>
          <input type="radio" name="niche" value={niche.id} checked={value === niche.id} onChange={() => onChange(niche.id)} />
          <strong><span className="choice-indicator" aria-hidden="true">{value === niche.id ? '✓' : ''}</span>{niche.label}</strong>
          <span className="choice-description">{niche.finds}</span>
        </label>
      ))}
    </fieldset>
  );
}
