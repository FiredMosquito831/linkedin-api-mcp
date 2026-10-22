import { HumanInterventionError } from './policy.js';

const CHALLENGE_SELECTORS = 'iframe[src*="captcha"], iframe[src*="challenge"], input[name="captcha"], #captcha-internal';
const VERIFICATION_PROMPT = /verify your identity|confirm (?:your identity|it.?s you)|(?:complete|perform|pass) (?:the |a )?(?:security |verification )?(?:check|challenge)|security verification|prove you(?:'re| are) (?:a )?human/i;

// Background CAPTCHA providers may mount hidden infrastructure on normal pages.
// Inspect visibility only. Never remove frames, alter their DOM, enter their
// contents, or attempt to complete a challenge.
export async function assertNoVisibleChallenge(page) {
  const candidates = page.locator(CHALLENGE_SELECTORS);
  for (let i = 0, count = await candidates.count(); i < count; i += 1) {
    if (await candidates.nth(i).isVisible()) throw new HumanInterventionError();
  }

  // A user-facing verification prompt can appear before its frame becomes
  // visible. Keep that state blocked too, without matching ordinary page text.
  const prompts = page.locator('[role="dialog"], [role="alert"], h1, h2');
  for (let i = 0, count = await prompts.count(); i < count; i += 1) {
    const prompt = prompts.nth(i);
    if (await prompt.isVisible() && VERIFICATION_PROMPT.test(await prompt.innerText())) {
      throw new HumanInterventionError();
    }
  }
}
