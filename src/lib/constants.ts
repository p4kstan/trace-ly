/** Default page size for paginated queries */
export const ROWS_PER_PAGE = 50;

/** Max events on free plan */
export const FREE_PLAN_EVENT_LIMIT = 10_000;

/** Chart tooltip shared styles (dark theme) */
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(225, 14%, 8%)",
  border: "1px solid hsl(225, 10%, 14%)",
  borderRadius: "8px",
  color: "hsl(210, 20%, 96%)",
  fontSize: "12px",
  boxShadow: "0 8px 24px -8px hsl(0 0% 0% / 0.4)",
} as const;

/** Chart color palette */
export const CHART_COLORS = [
  "hsl(199, 89%, 48%)",
  "hsl(152, 69%, 46%)",
  "hsl(265, 80%, 60%)",
  "hsl(38, 92%, 50%)",
  "hsl(346, 77%, 50%)",
] as const;
