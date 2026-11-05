# RYDO — Design system (from prototype v2)

Status: Phase 0 draft, 2026-11-05. Taken from the [clickable prototype](https://claude.ai/artifact/FSjkGmBZCtRNy61Ajd3ThR). In Phase 1 these tokens go into `packages/ui-tokens` and feed both the mobile app (React Native) and the web admin (Next.js + Tailwind), so both look like one product.

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| `ink` | #0B1426 | Text, primary buttons, dark surfaces, route lines |
| `ink-2` | #1E2A44 | Hover on ink, dark cards |
| `ink-3` | #16213A | Cards on dark (driver mode) |
| `lime` | #C8F560 | Brand accent: active tab, selected chips, key CTAs. **Always with `ink` text, never white** |
| `lime-hover` | #B5E84A | Hover/pressed lime |
| `muted` | #5A6578 | Secondary text (passes 4.5:1 on white) |
| `muted-on-dark` | #B8C2D6 | Secondary text on ink |
| `surface` | #F5F7FA | Page background |
| `surface-2` | #EEF1F5 | Inputs, chips, icon tiles |
| `line` | #E5E9F0 | Card borders, dividers |
| `line-strong` | #DDE3EB | Input / ghost-button borders |
| `danger` | #DC2626 | SOS and destructive actions only |
| `success-text` | #15803D on #DCFCE7 | Confirmed, verified, approved |
| `warning-text` | #92400E on #FEF3C7 | Delayed, in progress |
| `women-only` | #9D174D on #FCE7F3 | Women-only tag |
| `you-are-here` | #2F6BFF | Rider's own location dot on maps |

Driver mode (mobile) uses a dark theme: background `ink`, cards `ink-3`, accents `lime`. Rider mode and the web admin use the light theme.

## Type

Font: **Manrope** (Google Fonts, free for commercial use), weights 400–800. Bundled in the app; self-hosted on the web.

| Style | Size / weight | Use |
| --- | --- | --- |
| Display | 28–40 / 800, tracking −1 | Welcome, "Rahul accepted", "Your ride is live" |
| Title | 20–26 / 800 | Screen titles |
| Heading | 15–18 / 800 | Card titles, names |
| Body | 14–15 / 600 | Body text |
| Small | 12–13 / 600–700 | Meta, captions, tags |
| Label | 12–13 / 800, tracking 0.4, uppercase | Section labels ("WHEN", "YOUR RIDE PIN") |

## Shape and spacing

| Token | Value |
| --- | --- |
| Spacing scale | 4, 8, 10, 12, 14, 16, 18, 22 px |
| Radius | chip 999 · input/button 14–16 · card 18–20 · sheet 28 (top corners) · phone frame 40 |
| Touch target | ≥ 44 × 44 px |
| Primary button | 54–56 px high, radius 16 |
| Shadow | Floating controls only: `0 4px 14px rgba(11,20,38,.16)`; sheets: `0 -10px 30px rgba(11,20,38,.12)` |

## Components (both clients)

Button (primary ink, lime, ghost, danger) · icon button · segmented control · chip / filter / toggle chip · switch · stepper · input + label · OTP / PIN boxes · card · bottom sheet (mobile) / side panel (web) · list row · avatar with initials · tag (status colours above) · map marker set (you, pickup, office, car, other cars) · countdown ring · toast · tab bar (mobile) / sidebar (web).

## States every screen needs

Loading (skeletons), empty (with one next action), error (with retry), offline (cached data + banner), permission denied (location, notifications), and **stale location** ("last seen 2 min ago") on every live map.

## Writing

Short, plain, second person ("Rahul arrives in 4 min"). Numbers with units. Amounts show `[est.]` until pricing is decided. Brand name is **RYDO** in the wordmark.
