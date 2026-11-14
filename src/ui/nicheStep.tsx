import React, { useState } from 'react';
import { apiJson } from './api';
import type { NicheProfile } from './types';
import { NICHES, NICHE_GROUPS } from './helpers';

type VolumeResult = { candidates: number; topical: number; engaged10: number; engaged50: number; commentSupply: number; sampledVideos: number; sampledComments: number; helpRequests: number; good: number; best: number; estimatedQuotaUnits: number; calls: { search: number; videos: number; commentPages: number }; query: string; daysBack: number; errors: Array<{ message: string }> };

export function NichePicker({ value, enabled, onChange, daysBack }: { value: NicheProfile; enabled: NicheProfile[]; onChange: (niche: NicheProfile) => void; daysBack: number }) {
  const [busy, setBusy] = useState<NicheProfile | null>(null);
  const [results, setResults] = useState<Partial<Record<NicheProfile, VolumeResult>>>({});
  const [errors, setErrors] = useState<Partial<Record<NicheProfile, string>>>({});
  async function check(niche: NicheProfile) {
    setBusy(niche);
    setErrors((previous) => ({ ...previous, [niche]: '' }));
    try {
      const result = await apiJson('/api/volume-check', { method: 'POST', body: JSON.stringify({ profileId: niche, daysBack }) }) as VolumeResult;
      setResults((previous) => ({ ...previous, [niche]: result }));
    } catch (error) {
      setErrors((previous) => ({ ...previous, [niche]: error instanceof Error ? error.message : 'Volume check failed.' }));
    } finally { setBusy(null); }
  }
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
              <div key={niche.id} className="niche-card-wrap">
                <label className={value === niche.id ? 'niche-card selected' : 'niche-card'}>
                  <input type="radio" name="niche" value={niche.id} checked={value === niche.id} onChange={() => onChange(niche.id)} />
                  <strong><span className="choice-indicator" aria-hidden="true">{value === niche.id ? '✓' : ''}</span>{niche.label}</strong>
                  <span className="choice-description">{niche.finds}</span>
                </label>
                <button type="button" className="link-button volume-button" disabled={busy !== null} onClick={() => check(niche.id)} aria-describedby={`volume-${niche.id}`}>{busy === niche.id ? 'Checking…' : 'Volume check · up to 103 units'}</button>
                <div id={`volume-${niche.id}`} className="volume-result" role="status">
                  {errors[niche.id] && <span>{errors[niche.id]}</span>}
                  {results[niche.id] && !errors[niche.id] && (() => { const r = results[niche.id]!; return <>
                    <strong>{r.topical} topically matched of {r.candidates} distinct videos · {r.engaged10} have 10+ comments · {r.engaged50} have 50+</strong>
                    <span>About {r.commentSupply.toLocaleString()} public comments indicated by video counts; not a count of readable, recent top-level comments.</span>
                    <span>Newest-page sample: {r.sampledComments} comments across {r.sampledVideos} videos · {r.helpRequests} possible help requests · {r.good} Good (Maybe) / {r.best} Best by current scoring.</span>
                    <span>Query: “{r.query}”. {r.daysBack}-day video window; sampled comments have no age cutoff (Step 3 has its own comment-age filter). Lexical topical fit and sampled lead counts are directional proxies, not projected leads. Attempts: {r.calls.search} search × 100 + {r.calls.videos} video lookup + {r.calls.commentPages} newest-first comment page(s) × 1 = about {r.estimatedQuotaUnits} YouTube units. This check does not retry; YouTube's final billed amount may still differ. No comments saved.</span>
                    {r.errors.map((error, index) => <span key={index}>Incomplete sample: {error.message}</span>)}
                  </>; })()}
                </div>
              </div>
            ))}
          </React.Fragment>
        );
      })}
    </fieldset>
  );
}
