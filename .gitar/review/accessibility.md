# Accessibility review (Merge Forward track)

For changes under `apps/web`:
- Every input has a visible `<label>`; groups use `fieldset`/`legend`.
- Meaning is never carried by color alone (approach preference uses icon + text + color).
- Tap targets are at least 44px; focus is visible.
- Dynamic results (catches, saves, errors) are announced through an `aria-live` region.
- Motion respects `prefers-reduced-motion`; contrast meets WCAG AA in light and dark mode.
- Anything the camera does must also be possible by typing (the manual badge-number entry).
