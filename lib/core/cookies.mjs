const KNOWN_BANNERS = '#onetrust-banner-sdk, #CybotCookiebotDialog, .cky-consent-container, #coi-banner-wrapper, #didomi-notice, .qc-cmp2-ui, #cmpbox, [data-testid="uc-default-wall"], [data-testid="uc-banner"]';
const POSSIBLE_BANNERS = '[role="dialog"], [aria-modal="true"], [id*="cookie" i], [class*="cookie-banner" i], [class*="cookie-consent" i], [class*="consent-banner" i]';
const COOKIE_WORDS = /cookies?|informasjonskapsler|informasjonskapslar|personverninnstillinger|samtykke|kakor/i;
const CHOICES = [
  /^(reject(?: all)?(?: cookies)?|decline(?: all)?|deny(?: all)?|necessary(?: cookies)? only|only necessary(?: cookies)?|use necessary cookies only|avvis(?: alle)?|kun nødvendige|bare nødvendige|avvisa alla|afvis alle|alle ablehnen|nur notwendige|tout refuser)$/i,
  /^(accept(?: all)?(?: cookies)?|allow(?: all)?(?: cookies)?|agree(?: to all)?|i agree|ok(?:ay)?|got it|godta(?: alle)?(?: informasjonskapsler)?|aksepter(?: alle)?|tillat alle|godkänn alla|accepter alle|alle akzeptieren|tout accepter)$/i,
];

async function firstVisible(locator) {
  const count = Math.min(await locator.count(), 40);
  for (let i = 0; i < count; i++) {
    const candidate = locator.nth(i);
    if (await candidate.isVisible()) return candidate;
  }
  return null;
}

async function findBanner(page) {
  for (const frame of page.frames()) {
    try {
      const known = await firstVisible(frame.locator(KNOWN_BANNERS));
      if (known) return { frame, banner: known };
      const candidates = frame.locator(POSSIBLE_BANNERS);
      const count = Math.min(await candidates.count(), 40);
      for (let i = 0; i < count; i++) {
        const banner = candidates.nth(i);
        if (!await banner.isVisible()) continue;
        const isBanner = await banner.evaluate(el => {
          const style = getComputedStyle(el);
          const marker = `${el.id} ${el.className}`;
          return el.getAttribute('role') === 'dialog' || el.getAttribute('aria-modal') === 'true' ||
            style.position === 'fixed' || /(?:cookie|consent)[-_ ]?(?:banner|notice|consent)/i.test(marker);
        });
        if (isBanner && COOKIE_WORDS.test(await banner.innerText({ timeout: 500 }))) return { frame, banner };
      }
      // Some CMPs put the entire consent interface inside a cross-origin iframe.
      // Scope body-level handling to recognisable consent frames, never the page.
      if (frame !== page.mainFrame() && /cookie|consent|sourcepoint|trustarc|quantcast|usercentrics/i.test(frame.url())) {
        const banner = frame.locator('body');
        if (await banner.isVisible() && COOKIE_WORDS.test(await banner.innerText({ timeout: 500 }))) return { frame, banner };
      }
    } catch (error) {
      if (!frame.isDetached()) throw error;
    }
  }
  return null;
}

/** Dismiss common CMPs without clicking unrelated page controls. */
export async function dismissCookieBanner(page, selector) {
  if (selector) {
    try {
      if (typeof selector === 'string') {
        await page.click(selector, { timeout: 5000 });
      } else {
        await page.frameLocator(selector.frameSelector).first().locator(selector.innerSelector).click({ timeout: 5000 });
      }
      await page.waitForTimeout(500);
      return;
    } catch (error) {
      throw new Error(`Cookie dismissal failed: ${error.message}. Check the supplied cookie selector.`, { cause: error });
    }
  }

  const deadline = Date.now() + 8000;
  const detectionDeadline = Date.now() + 2000;
  let handled = 0;
  while (Date.now() < deadline) {
    const found = await findBanner(page);
    if (!found) {
      if (handled || Date.now() >= detectionDeadline) return;
      await page.waitForTimeout(150);
      continue;
    }
    const { frame, banner } = found;
    let button = null;
    for (const name of CHOICES) {
      button = await firstVisible(banner.getByRole('button', { name }));
      if (button) break;
    }
    if (!button || handled >= 3) {
      throw new Error('Automatic cookie dismissal could not find a working consent button. Supply a cookie selector for this site.');
    }
    try {
      await button.click({ timeout: Math.max(1, Math.min(2500, deadline - Date.now())) });
      await banner.waitFor({ state: 'hidden', timeout: Math.max(1, Math.min(2500, deadline - Date.now())) });
    } catch (error) {
      if (!frame.isDetached()) {
        throw new Error('Automatic cookie dismissal failed: the detected banner could not be closed. Supply a cookie selector for this site.', { cause: error });
      }
    }
    handled++;
  }
  throw new Error('Automatic cookie dismissal timed out. Supply a cookie selector for this site.');
}
