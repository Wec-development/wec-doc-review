---
name: ui-design-tokens
description: Use when styling anything in apps/web — colours, typography, spacing, badges, layout.
---

# Design tokens and styling

1. Styling: CSS Modules (*.module.css) plus global CSS variables in apps/web/src/styles/tokens.css. No inline style objects except truly dynamic values. No extra styling libraries.
2. Fonts: Inter for UI, JetBrains Mono for field names, quotes and document text (fallback: system-ui / monospace).
3. Colour tokens:
   --bg #F6F6F4; --surface #FFFFFF; --border #E3E3E0; --text #1A1A1A; --text-muted #5C5C5C; --accent #2347A8;
   status — pending bg #FFF1D6 / text #8A4B00; approved bg #E3F4E8 / text #1E6B3A; corrected bg #E4ECFB / text #234A9E;
   carried-over bg #EEEEEC / text #3D3D3D; gap & failed bg #FDE7E7 / text #A12828; evidence highlight #FFE3A3.
4. Spacing scale 4/8/12/16/24/32 px; radius 8 px (controls) and 12 px (cards); one shadow at most.
5. Status badges always include a text label (Pending, Approved, Corrected, Carried over, Gap, Failed) — never colour alone.
6. Touch targets ≥ 44 px for primary actions; text contrast ≥ 4.5:1.
7. Layout is responsive: value list and document text side by side on wide screens, stacked under 900 px.
8. No gradients, emoji or decorative effects — clarity first.
