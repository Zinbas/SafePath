export interface ValidationIssue {
  field: string;
  message: string;
}

/** Thrown for any invalid input. `issues` lists every problem found (not just the first). */
export class HazardValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(`Invalid hazard input: ${issues.map((issue) => `${issue.field}: ${issue.message}`).join('; ')}`);
    this.name = 'HazardValidationError';
    this.issues = issues;
  }
}

/** Thrown when inserting a hazard whose `id` already exists in the store. */
export class DuplicateHazardIdError extends Error {
  readonly hazardId: string;

  constructor(hazardId: string) {
    super(`A hazard with id "${hazardId}" already exists.`);
    this.name = 'DuplicateHazardIdError';
    this.hazardId = hazardId;
  }
}
