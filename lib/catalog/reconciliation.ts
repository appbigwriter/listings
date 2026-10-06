import { hash } from './model';
export function submissionMatches(payload:{attributes?:Record<string,unknown>}|null,remote:{attributes?:Record<string,unknown>}) {
  const expected=payload?.attributes;
  // Absence or a different response cannot prove a failed send. Keep it blocked for investigation.
  return Boolean(expected && Object.keys(expected).length && remote.attributes && Object.entries(expected).every(([field,value])=>field in remote.attributes! && hash(value)===hash(remote.attributes![field])));
}
