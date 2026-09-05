# Echo

Independent URL: `/projects/echo/`.

[`echo.ts`](../../experiments/echo.ts) contains the ripple model, drawing,
pentatonic tones, and audio graph lifecycle. The manifest and entrypoint
here expose it as a standalone website.

Extend ripple shapes and note/preset data in the renderer. Audio must stay
off until explicit opt-in, and voices must remain bounded. Reuse
`holdGainAtTime` in `src/core/audio.ts` rather than assuming that
`AudioParam.cancelAndHoldAtTime` exists in every browser.

The shared suite covers consent, voice retirement, repeated sound toggles,
legacy automation support, and explicit cleanup on page navigation.
