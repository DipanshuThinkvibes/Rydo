/** Plain-language names for the codes the API sends. */
export const FEEDBACK_LABEL: Record<string, string> = {
  USABILITY: "App usability and interface",
  MATCHING: "Ride matching and suggestions",
  COMMUNICATION: "Chat and notifications",
  COST_SHARING: "Cost sharing",
  GENERAL: "General comments and ideas",
};

export const ISSUE_LABEL: Record<string, string> = {
  UNSAFE_DRIVING: "Unsafe driving",
  HARASSMENT: "Harassment or conduct",
  LATE_OR_NO_SHOW: "Late or no-show",
  ROUTE: "Route problem",
  COST: "Cost or payment question",
  APP_BUG: "App problem",
  OTHER: "Other",
};

export const ISSUE_TONE = { OPEN: "warning", IN_PROGRESS: "ink", RESOLVED: "success" } as const;
