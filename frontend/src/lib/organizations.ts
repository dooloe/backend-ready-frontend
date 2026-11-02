export function isDemoOrganization(name: string, description = "") {
  return /\bdemo\b|demonstration/i.test(`${name} ${description}`);
}
