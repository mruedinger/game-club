# Style Overrides

This project centralizes global themes, typography, and layout primitives in `src/styles/base.css`.
The following page-scoped overrides remain and are intentionally localized:

- `src/pages/admin/index.astro`
  - Admin-only layout sizing (members card width, hero text width).
- `src/pages/auth/denied.astro`
  - Centered error card layout and copy sizing for the denied page.

If any of these styles should become global, migrate them into `src/styles/base.css`
and remove the page-local `<style>` blocks.
