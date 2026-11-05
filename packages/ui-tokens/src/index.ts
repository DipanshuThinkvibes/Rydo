/** RYDO design tokens (docs/phase-0/03-design-system.md). Shared by mobile and web. */
export const colors = {
  ink: '#0B1426',
  ink2: '#1E2A44',
  ink3: '#16213A',
  lime: '#C8F560', // always with ink text
  limeHover: '#B5E84A',
  muted: '#5A6578',
  mutedOnDark: '#B8C2D6',
  surface: '#F5F7FA',
  surface2: '#EEF1F5',
  line: '#E5E9F0',
  lineStrong: '#DDE3EB',
  white: '#FFFFFF',
  danger: '#DC2626',
  successText: '#15803D',
  successBg: '#DCFCE7',
  warningText: '#92400E',
  warningBg: '#FEF3C7',
  womenOnlyText: '#9D174D',
  womenOnlyBg: '#FCE7F3',
  youAreHere: '#2F6BFF',
} as const;

export const radius = { chip: 999, input: 14, button: 16, card: 18, sheet: 28 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22 } as const;
export const font = { family: 'Manrope', weights: { regular: '400', semibold: '600', bold: '700', heavy: '800' } } as const;
export const touchTarget = 44;