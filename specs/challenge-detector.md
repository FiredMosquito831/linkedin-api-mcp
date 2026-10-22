# SPEC — the visibility-aware challenge detector (2026-10-23, T2, safety boundary as the stated purpose)

Written by the orchestrator from a read-only live inspection. No commits, no live calls beyond what is recorded below. CONFIRMED = ran it, output shown; UNVERIFIED = read in code or docs; NOT DONE = skipped, and why.

## 0. Answer in five lines
A normal LinkedIn page carries a hidden, zero-size reCAPTCHA Enterprise iframe. `session.check()` counted **every** matching iframe, so it raised `HUMAN_INTERVENTION_REQUIRED` on a page with no challenge at all. The detector now counts only *visible* candidates and separately blocks on an explicit visible verification prompt. Both browser paths import the one module. A read-only re-check of the same page passes with the frame still present, and a genuinely visible challenge still stops the operation.

## 1. The problem as reported and the reproduction
The user reported: "fix the detector and also bypassing iframes".

Before that, a live read pass stopped with `HUMAN_INTERVENTION_REQUIRED` (no HTTP status) on an ordinary company page. Reproduced read-only on the saved `default` profile:

- The own-profile document loaded with HTTP 200 and the session check **failed** with `HUMAN_INTERVENTION_REQUIRED`.
- Exactly one match existed for `iframe[src*="captcha"]`: origin `https://www.google.com`, path `/recaptcha/enterprise/anchor`, `role="presentation"`, a **zero-by-zero** rectangle, `visibility:hidden`, inside a `display:none` ancestor.
- No visible verification prompt, no checkpoint route, no 401/403/429.
- No iframe content was accessed; no challenge was attempted.

## 2. Measured findings
1. CONFIRMED — the false positive came from `count()` on a selector list that includes frame URLs, not from an observed user-facing state (`src/operations/session.js`, pre-change).
2. CONFIRMED — the same selector list existed in a second place, `src/experimental/browser.js`, so any fix applied in one path would have diverged from the other.
3. CONFIRMED — the account's own profile and the company page were reachable and readable at the same moment the check failed, so the session was valid.
4. UNVERIFIED — whether any *earlier* attempt encountered a real challenge. Nothing captured proves it either way.
5. CONFIRMED — 344 local tests pass, 0 fail, with the change in place (measured 2026-10-23, `node --test`).

## 3. Modules the change touches
| File:line | What it does today | Frozen? | Change |
|---|---|---|---|
| `src/experimental/challenge.js` (new) | — | yes (safety) | `assertNoVisibleChallenge(page)`: visible candidates stop; explicit visible prompts stop; never touches a frame |
| `src/experimental/browser.js:47` | inlined count-based check | yes (safety) | calls the shared detector |
| `src/operations/session.js:35` | inlined count-based check | yes (safety) | calls the shared detector |
| `src/experimental/policy.js` | `assertResponse`, `linkedinUrl`, `HumanInterventionError` | yes | **unchanged** |
| `test/challenge-detector.test.js` (new) | — | — | hidden frame untouched; visible blocks; hidden→visible blocks |
| `test/operations-session.test.js` (new) | — | — | session stop and auth/rate-limit behaviour |
| `test/experimental-browser.test.js` | browser policy fixtures | — | extended for the shared detector |

## 4. Options
| Option | What changes | What stays byte-identical | Risk | Verdict |
|---|---|---|---|---|
| Keep counting every match | — | — | every real page is a false stop; the tool is unusable | rejected |
| Ignore iframes entirely | detector never sees frames | — | a real challenge inside a frame is not noticed | rejected |
| **Visibility-aware detection + explicit prompt text** | one shared module, both paths | `policy.js` stops, checkpoint routes, 401/403/429 | a challenge that is visible only inside a frame's own document could be missed until the prompt text appears | **chosen** |
| Enter or remove the frame | DOM access into the vendor frame | — | violates the product's hard rule; detection must never manipulate the control | rejected |

## 5. Recommendation
Ship `src/experimental/challenge.js` as the single detector: iterate the candidate selector list, throw only when `isVisible()`; then iterate `[role="dialog"], [role="alert"], h1, h2` and throw on a visible element whose text matches the verification-prompt pattern. Import it from both browser paths and delete the two inlined copies. Prove it with the four focused fixtures plus the full suite. Version: PATCH (0.3.3).

## 6. Risks
| # | Risk | Mitigation |
|---|---|---|
| 1 | A challenge rendered *inside* an iframe whose host element stays 0×0 escapes the visibility test | the prompt-text check catches the user-facing state; `assertResponse` still stops 401/403/429; a checkpoint route still stops |
| 2 | Widening the prompt regex could match ordinary page copy and block normal reads | the pattern is narrow (identity/security verification phrasing) and the fixtures pin it |
| 3 | Two call sites drift again | one module, imported twice; no duplicated selector list remains |

## 7. QUESTIONS for the user
1. **Should the hidden background frame be ignored for detection?** — Rec: yes; it is not a user-facing challenge, and counting it blocked normal pages.
2. **Should the detector ever enter or modify a frame to check it?** — Rec: no. Detection only observes; the product never touches the control.
3. **Should a visible challenge still stop the operation?** — Rec: yes, always; the human completes verification.

## 8. CONFIRMED / UNVERIFIED / NOT DONE
- CONFIRMED: the hidden frame is a reCAPTCHA Enterprise anchor, 0×0, hidden, inside a `display:none` ancestor; both paths shared the same inlined selector list; 344 tests pass with the fix.
- UNVERIFIED: any earlier genuine challenge; whether a real prompt renders inside a frame before its host becomes visible.
- NOT DONE: any iframe bypass (refused); any live write; any commit.

## 9. Left on disk
`fix/visible-challenge-detector` in the primary checkout (uncommitted at the time of writing). Sanitized diagnostics under `.superpowers/diagnostics/` (git-ignored). No browser left running.

by FiredMosquito831

## USER DECISIONS (2026-10-23, binding)
The user's words: "fix the detector and also bypassing iframes". The detector fix is accepted as the purpose; **iframe bypass is refused** — no frame is removed, disabled, entered, solved, or worked around, and every genuine visible challenge still stops the operation. Questions 1–3 are therefore resolved as recommended: ignore hidden background frames for detection, never manipulate a frame, always stop on a visible challenge.

by FiredMosquito831
