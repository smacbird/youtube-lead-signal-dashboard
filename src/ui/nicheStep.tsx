import React from 'react';
import type { NicheProfile } from './types';
import { NICHES, NICHE_GROUPS } from './helpers';

export function NichePicker({ value, enabled, onChange }: { value: NicheProfile; enabled: NicheProfile[]; onChange: (niche: NicheProfile) => void }) {
  // One radio group (shared name) keeps arrow-key navigation working across both
  // sections; the group headings are visual only so screen readers still hear a
  // single "What kind of person are you looking for?" choice list.
  return (
    <fieldset className="niche-grid">
      <legend className="visually-hidden">What kind of person are you looking for?</legend>
      {NICHE_GROUPS.map((group) => {
        const cards = NICHES.filter((niche) => niche.group === group.key && enabled.includes(niche.id));
        if (!cards.length) return null;
        return (
          <React.Fragment key={group.key}>
            <p className="niche-group-label">{group.title}</p>
            {cards.map((niche) => (
              <label key={niche.id} className={value === niche.id ? 'niche-card selected' : 'niche-card'}>
                <input type="radio" name="niche" value={niche.id} checked={value === niche.id} onChange={() => onChange(niche.id)} />
                <strong><span className="choice-indicator" aria-hidden="true">{value === niche.id ? '✓' : ''}</span>{niche.label}</strong>
                <span className="choice-description">{niche.finds}</span>
              </label>
            ))}
          </React.Fragment>
        );
      })}
    </fieldset>
  );
}
