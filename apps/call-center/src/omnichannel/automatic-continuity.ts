const blockers = {
  "verify-patient": "institutional-assertion-contract",
  "active-journeys": "active-journeys-contract",
  "authorize-journey": "access-grant-contract",
} as const;

export const automaticContinuityActions = Object.keys(blockers);

export function automaticContinuityBlocker(action: string) {
  return Object.hasOwn(blockers, action) ? blockers[action as keyof typeof blockers] : undefined;
}
