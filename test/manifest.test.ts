import { describe, expect, it } from 'vitest';
import { createIdentity, fingerprint, signManifest, verifyManifest, type RunManifest } from '../src/core/manifest.js';

const manifest: RunManifest = {
  smaltflRun: 0,
  flow: { id: 'nyc-taxis', hash: 'f'.repeat(64) },
  plan: 'p'.repeat(64),
  parameters: { month: '2024-01' },
  engine: { smaltdb: '0.9.0', smaltfl: '0.1.0' },
  nodes: [{ node: 0, origin: 'trips', op: 'table', key: 'k'.repeat(64), status: 'built', content: 'c'.repeat(64), rows: 10 }],
  outputs: {},
  previous: null,
};

describe('identity cards and signed manifests', () => {
  it('signs a manifest that anyone with the card can check', async () => {
    const owner = await createIdentity('Owner');
    expect(owner.card.fingerprint).toBe(await fingerprint(owner.card.key));
    expect(owner.privateKey.extractable).toBe(false);
    const signed = await signManifest(manifest, owner);
    expect(await verifyManifest(signed)).toEqual({ ok: true });
    expect(await verifyManifest(signed, owner.card)).toEqual({ ok: true });
  });

  it('detects a changed manifest, a forged card and the wrong signer', async () => {
    const owner = await createIdentity('Owner');
    const other = await createIdentity('Mallory');
    const signed = await signManifest(manifest, owner);
    expect(await verifyManifest({ ...signed, manifest: { ...manifest, parameters: { month: '2024-02' } } })).toEqual({ ok: false, reason: "the signature doesn't match the manifest" });
    expect(await verifyManifest({ ...signed, signer: { ...owner.card, key: other.card.key } })).toEqual({ ok: false, reason: "the signer's fingerprint doesn't match its key" });
    expect(await verifyManifest({ ...signed, signer: other.card })).toEqual({ ok: false, reason: "the signature doesn't match the manifest" });
    const verdict = await verifyManifest(signed, other.card);
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.reason).toMatch(/^signed by Owner \([0-9a-f]{16}\), not by Mallory$/);
  });

  it('keeps who a card is when only its name changes', async () => {
    const owner = await createIdentity('Owner');
    const signed = await signManifest(manifest, owner);
    expect(await verifyManifest({ ...signed, signer: { ...owner.card, name: 'Renamed' } }, owner.card)).toEqual({ ok: true });
  });
});
