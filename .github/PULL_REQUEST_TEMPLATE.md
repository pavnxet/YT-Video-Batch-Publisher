## What does this change?

<!-- A sentence or two on what the pull request does and why. -->

## Related issue

<!-- Closes #123 -->

## How was it tested?

<!-- Which tests did you run, and did you try it against a real Studio page? -->

- [ ] `npm run ci` passes (build + validate + tests)
- [ ] I added or updated a test for this change
- [ ] I tried it manually in the browser

## Checklist

- [ ] I edited files under `src/` only — not `dist/`, which is generated
- [ ] No new runtime dependencies were added
- [ ] Any new selectors live in `src/core/selectors.js` with fallbacks
- [ ] Anything new and async accepts an `AbortSignal`
- [ ] Options are matched by label, not by DOM position
- [ ] I updated the docs (`docs/`, `README.md`) if behaviour changed

## Screenshots

<!-- For UI changes, before and after. Delete this section if it does not apply. -->
