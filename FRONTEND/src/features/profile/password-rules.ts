/** Mirrors the API password policy (Identity options): 8+ characters with upper, lower and a digit. */
export function passwordProblems(value: string): string[] {
  const problems: string[] = []
  if (value.length < 8) problems.push('length')
  if (!/[A-Z]/.test(value)) problems.push('upper')
  if (!/[a-z]/.test(value)) problems.push('lower')
  if (!/[0-9]/.test(value)) problems.push('digit')
  return problems
}
