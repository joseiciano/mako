const enabledValues = new Set(['1', 'true'])

function readDotEnvValue(dotEnvText, key) {
  let value
  for (const line of dotEnvText.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (match?.[1] === key) {
      value = match[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return value
}

/**
 * Fakes are off unless `LOCAL_FAKES` is `1` or `true`, set in the shell or in
 * the repo `.env` (the shell wins). Anything else, including unset, is off.
 */
export function isFakesEnabled(environment, dotEnvText = '') {
  const value = environment.LOCAL_FAKES ?? readDotEnvValue(dotEnvText, 'LOCAL_FAKES')
  return enabledValues.has(String(value ?? '').trim().toLowerCase())
}
