# ANNO 117 — Motion Design System

Version 0.1 · Design specification · 31 October 2026

## Purpose
A visually rich Roman-inspired second-screen planning tool for console players. Motion should clarify cause and effect, preserve the player's orientation and never delay controls.

## Principles
1. **Responsive first**: update data immediately; animate its visual presentation.
2. **Meaningful movement**: communicate relationships, status, and direction.
3. **Calm richness**: bronze glints, subtle depth, organic motion; avoid constant flashy effects.
4. **One-handed clarity**: maintain target sizes of at least 44×44 CSS pixels for important touch actions.
5. **Accessible by default**: respect prefers-reduced-motion; don't depend exclusively on color or movement to convey state.

## Tokens
| Token | Duration | Curve | Application |
|---|---:|---|---|
| press | 120ms | ease-out | buttons downscale to 0.97 |
| micro | 180ms | cubic-bezier(.2,.8,.2,1) | toggles, icons, highlights |
| standard | 280ms | cubic-bezier(.22,1,.36,1) | bars, number switches, list changes |
| enter | 360ms | cubic-bezier(.22,1,.36,1) | cards and detail panels |
| chain | 550ms | cubic-bezier(.4,0,.2,1) | connectors draw and nodes appear |
| ambient | 5000–9000ms | ease-in-out | extremely subtle, optional, paused when hidden |

## Component behavior
- **Buttons:** scale on press; brief bronze highlight on success, no delayed click.
- **Counter:** display latest value immediately; gentle translate+fade of numeric glyph / optional count easing below 350ms. Never animate essential digits while another input is pending.
- **Progress bars:** interpolate width over 280ms; status text updates immediately; achieved state glows once then rests.
- **Priority cards:** fade/translate 8px on appearance; use list reordering animation only if stable keys exist; completed cards remain accessible in All/Completed views.
- **Production chain:** reveal parent first, child nodes staggered 60–90ms, SVG connector stroke-dashoffset draws over 550ms, short pulse along active edges only on demand change; no perpetual pulse by default.
- **Navigation:** 240–320ms crossfade/translate with persistent header and bottom bar; no swipe conflict with scrolling.
- **Island switch:** update selected city immediately, crossfade art for 350ms, skeleton only if data actually loads.
- **Trade route:** one-time brief directional glint on updates; continuous ship movement only in an explicitly enabled animation mode; paused when inactive.
- **Saving:** show discreet saved confirmation after actual persistent write succeeds; never imply cloud sync.

## Design direction
Dark olive #17211D; surfaces #26342C, #304036; antique bronze #DDBA80; parchment #F3EBDC; muted sage #A9B9A9; success #A9C7A6; warnings #E6AF78. Roman inspiration through ornament and illustration, not through hard-to-read decorative text.

## Reduced motion
At `@media (prefers-reduced-motion: reduce)`, remove transforms, layout/number tweening, parallax, route movement, decorative fades, and connector drawing. Updates remain immediate with visible textual status.

## Performance and QA
- Prefer transform/opacity for movement; change width of small progress bars only.
- Avoid animating expensive blur/filter on large elements; avoid continuous background animations.
- Target usable 60fps on a representative iPhone Safari; test low-power mode, keyboard open, and page visibility.
- Verify: repeated rapid taps, zero values, negative/overproduction, multiple chains sharing a producer, switching islands mid-transition, trade route pause/resume, and screen reader/status announcements.
- Unit tests for data calculations; Playwright interaction snapshots for navigation and controls; manually test iPhone Safari and Home Screen PWA.

## Phasing
**MVP:** button press, navigation, balances, priority cards, chain connector on interaction, reduced motion.
**V1:** shared-element card transitions, illustrated island header crossfade, trade route motion and haptics where available.
**Later:** Island Storage projection animations, screenshot-assisted data entry. Do not implement Storage in the MVP.
