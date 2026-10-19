/** Only exact reviewed fictional artifact SHA-256 values cross to the Next child.
 * This is a visibility allowlist, never issuer proof or payment authority. */
export function validatedJudgeSourceAllowlist(env) {
  const raw = env.JUDGE_SYNTHETIC_SOURCE_SHAS;
  if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) return undefined;
  if (typeof raw !== 'string' || raw.length > 210) throw Error('RUNTIME_JUDGE_SOURCE_ALLOWLIST_INVALID');
  const parts = raw.split(',').map(value => value.trim());
  if (parts.length < 1 || parts.length > 3 ||
      parts.some(value => !/^[a-f0-9]{64}$/.test(value)) ||
      new Set(parts).size !== parts.length) throw Error('RUNTIME_JUDGE_SOURCE_ALLOWLIST_INVALID');
  return parts.join(',');
}
