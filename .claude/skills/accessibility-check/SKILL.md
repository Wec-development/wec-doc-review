---
name: accessibility-check
description: Use before finishing any change in apps/web, to check the UI is accessible and clear.
---

# Accessibility check

1. Interactive elements are real <button>, <a href>, <input>/<textarea> with <label> — never clickable divs.
2. Everything works by keyboard: Tab order is logical, focus is visible, Enter/Space trigger actions.
3. Icon-only buttons have aria-label; decorative SVGs have aria-hidden="true".
4. Status is conveyed by text, not colour alone; contrast ≥ 4.5:1 for text.
5. Live status changes (extracting → extracted, review saved) are announced via an aria-live="polite" region.
6. Headings follow order (one h1 per page, then h2...). Page <title> names the screen.
7. A reviewer can tell what needs attention within 5 seconds: pending count and items are first on the page.
8. Report any issue found and fix it before running the pr-check skill.
