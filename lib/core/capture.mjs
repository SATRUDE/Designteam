const NAVIGATION_TIMEOUT_MS = 20000;
const IMAGE_WAIT_TIMEOUT_MS = 10000;
const IMAGE_WAIT_INTERVAL_MS = 200;
const SCROLL_STEP_PX = 720; // match viewport height so each "screen" gets time in view
const SCROLL_STEP_DELAY_MS = 350; // give Intersection Observer time to fire for lazy images
/** After scroll-to-top: fonts, two animation frames, then this delay for layout/paint settle. */
const PRE_CAPTURE_SETTLE_MS = 450;
const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 400, height: 720 };
async function gotoWithRetry(page, url, timeoutMs) {
    let response;
    try {
        response = await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
    } catch {
        response = await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: timeoutMs,
        });
    }
    if (response && response.status() >= 400) {
        throw new Error(`HTTP ${response.status()} for ${url}`);
    }
}
export function isValidUrl(input) {
    try {
        const u = new URL(input);
        return u.protocol === "http:" || u.protocol === "https:";
    }
    catch {
        return false;
    }
}
async function settleBeforeCapture(page) {
    await page.evaluate(async () => {
        await Promise.race([
            document.fonts.ready.catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        await new Promise((resolve) => {
            const fallback = setTimeout(resolve, 250);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    clearTimeout(fallback);
                    resolve();
                });
            });
        });
    });
    await page.waitForTimeout(PRE_CAPTURE_SETTLE_MS);
}
/**
 * Drawer/sheet/modal UIs often stay mounted with `position: fixed` + `data-state="closed"`.
 * Stripping fixed → static pulls their chrome into the document flow. Hide closed overlays
 * so they do not appear in full-page captures.
 */
async function applyHideClosedOverlayUi(page) {
    await page.evaluate(() => {
        const vw = window.innerWidth;
        function hide(el) {
            el.style.setProperty("display", "none", "important");
        }
        document.querySelectorAll('[role="dialog"][aria-hidden="true"]').forEach((n) => {
            if (n instanceof HTMLElement)
                hide(n);
        });
        document.querySelectorAll('[role="dialog"][hidden]').forEach((n) => {
            if (n instanceof HTMLElement)
                hide(n);
        });
        document.querySelectorAll("[data-state]").forEach((node) => {
            if (!(node instanceof HTMLElement))
                return;
            if (node.getAttribute("data-state") !== "closed")
                return;
            if (node.closest("nav, [role='navigation']"))
                return;
            const slot = node.getAttribute("data-slot") || "";
            const cls = node.className?.toString?.() || "";
            const id = node.id || "";
            const role = node.getAttribute("role") || "";
            const looksOverlay = role === "dialog" ||
                /dialog|sheet|drawer|modal|overlay|popover|cart|mini-cart/i.test(slot + cls + id) ||
                /DialogContent|SheetContent|DrawerContent|ModalContent|CartDrawer|MiniCart/i.test(cls);
            if (!looksOverlay) {
                const cs = window.getComputedStyle(node);
                const r = node.getBoundingClientRect();
                const fullBleed = (cs.position === "fixed" || cs.position === "sticky") &&
                    r.width >= vw * 0.75 &&
                    r.height < window.innerHeight * 0.95;
                if (fullBleed && !node.closest("main")) {
                    hide(node);
                }
                return;
            }
            hide(node);
        });
        document.querySelectorAll("[data-vaul-drawer]").forEach((n) => {
            if (!(n instanceof HTMLElement))
                return;
            if (n.getAttribute("data-state") === "closed")
                hide(n);
        });
    });
}
/** Optional full-page stitch mitigation; run at scrollY=0 after scroll-to-top. */
async function applyFixedChromeNormalization(page) {
    await page.evaluate(({ edgePx, maxChromeHeightPx, minWidthFrac, }) => {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const minBarWidth = vw < 480 ? 60 : vw * minWidthFrac;
        const shell = document.getElementById("__next") ??
            document.getElementById("root") ??
            document.body;
        /** Top fixed bars we strip — move to app shell top so order matches former stacking. */
        const topBars = [];
        function shouldSkipOverlayChrome(el) {
            if (el.closest("[inert]"))
                return true;
            if (el.closest('[role="dialog"], [role="alertdialog"]'))
                return true;
            if (el.closest("[aria-modal='true']"))
                return true;
            if (el.closest("[data-radix-dialog-content], [data-radix-sheet-content], [data-radix-alert-dialog-content], [data-radix-popover-content]")) {
                return true;
            }
            if (el.closest("[data-vaul-drawer], [data-vaul-overlay], [data-vaul-handle]")) {
                return true;
            }
            const closed = el.closest("[data-state='closed']");
            if (closed instanceof HTMLElement) {
                if (closed.closest("nav, [role='navigation']"))
                    return false;
                return true;
            }
            return false;
        }
        for (const el of document.querySelectorAll("*")) {
            const pos = window.getComputedStyle(el).position;
            if (pos !== "fixed" && pos !== "sticky")
                continue;
            if (shouldSkipOverlayChrome(el))
                continue;
            const r = el.getBoundingClientRect();
            if (r.height > maxChromeHeightPx)
                continue;
            const atTop = r.top <= edgePx && r.top >= -2;
            const atBottom = r.bottom >= vh - edgePx && r.bottom <= vh + 2;
            if (!atTop && !atBottom)
                continue;
            if (r.width < minBarWidth)
                continue;
            if (atTop && !atBottom) {
                topBars.push({ el, top: r.top });
            }
            el.style.setProperty("position", "static", "important");
            el.style.removeProperty("top");
            el.style.removeProperty("bottom");
            el.style.removeProperty("left");
            el.style.removeProperty("right");
            el.style.removeProperty("z-index");
        }
        topBars.sort((a, b) => b.top - a.top);
        for (const { el } of topBars) {
            if (!el.isConnected)
                continue;
            shell.insertBefore(el, shell.firstChild);
        }
    }, { edgePx: 8, maxChromeHeightPx: 400, minWidthFrac: 0.22 });
}
/**
 * Many marketing sites put a full-viewport hero first in the DOM and the real
 * site nav after it; fixed/sticky positioning keeps the nav visually on top.
 * Full-page screenshots follow paint/DOM order — reorder so header/nav sit
 * before tall hero blocks.
 *
 * Direct-sibling swaps miss common patterns like [hero, wrapper[…, nav]]; we
 * bubble the nav (or its ancestors) up until it sits before the first tall
 * preceding sibling at each level.
 */
async function applyNavHeroReadingOrder(page) {
    await page.evaluate(() => {
        const vh = window.innerHeight;
        const minHeroPx = Math.min(Math.max(vh * 0.32, 260), 720);
        const maxHeroPx = Math.min(Math.max(document.documentElement.scrollHeight * 0.92, vh * 2), 6000);
        const shell = document.getElementById("__next") ??
            document.getElementById("root") ??
            document.body;
        function isTallBlock(el) {
            const h = el.getBoundingClientRect().height;
            return h >= minHeroPx && h <= maxHeroPx;
        }
        function isChrome(el) {
            if (!(el instanceof HTMLElement))
                return false;
            const t = el.tagName.toLowerCase();
            const role = el.getAttribute("role");
            if (t === "nav")
                return true;
            if (role === "navigation" || role === "banner")
                return true;
            if (t === "header") {
                if (role === "contentinfo")
                    return false;
                const h = el.getBoundingClientRect().height;
                if (h > 260)
                    return false;
                if (el.querySelector("nav, a[href], button"))
                    return true;
                return h <= 120;
            }
            return false;
        }
        function findPrimaryNav() {
            const candidates = [
                ...shell.querySelectorAll("nav, [role='navigation']"),
            ].filter((n) => n.offsetParent !== null &&
                n.getAttribute("aria-hidden") !== "true" &&
                !n.closest("footer, [role='contentinfo']"));
            if (candidates.length === 0)
                return null;
            candidates.sort((a, b) => {
                const la = a.querySelectorAll("a[href]").length;
                const lb = b.querySelectorAll("a[href]").length;
                if (lb !== la)
                    return lb - la;
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                return rb.width * rb.height - ra.width * ra.height;
            });
            if (candidates[0])
                return candidates[0];
            const shortHeaders = [...shell.querySelectorAll("header")].filter((h) => h instanceof HTMLElement &&
                h.getBoundingClientRect().height < 220 &&
                h.querySelectorAll("a[href]").length >= 4 &&
                !h.closest("article, [role='article'], footer"));
            if (shortHeaders.length > 0) {
                shortHeaders.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
                return shortHeaders[0];
            }
            return null;
        }
        const vw = window.innerWidth;
        /** Lift node (starting from nav) before any preceding tall sibling, bubbling up toward shell. */
        function bubbleLiftChrome(start) {
            let node = start;
            const maxPass = 40;
            for (let pass = 0; pass < maxPass && node && shell.contains(node); pass++) {
                if (node === shell)
                    break;
                const par = node.parentElement;
                if (!par)
                    break;
                let moved = false;
                for (let scan = node.previousElementSibling; scan; scan = scan.previousElementSibling) {
                    if (!(scan instanceof HTMLElement))
                        continue;
                    if (!isTallBlock(scan))
                        continue;
                    const r = scan.getBoundingClientRect();
                    if (r.width < vw * 0.28 && r.height > vh * 1.4)
                        continue;
                    par.insertBefore(node, scan);
                    moved = true;
                    break;
                }
                if (moved)
                    continue;
                if (par === shell)
                    break;
                node = par;
            }
        }
        function trySwap(container) {
            if (container.closest("article, [role='article']"))
                return;
            const kids = [...container.children];
            if (kids.length < 2)
                return;
            const navIdx = kids.findIndex(isChrome);
            if (navIdx <= 0)
                return;
            const tallIdx = kids.findIndex((k, i) => {
                if (i >= navIdx)
                    return false;
                if (!(k instanceof HTMLElement))
                    return false;
                return isTallBlock(k);
            });
            if (tallIdx < 0)
                return;
            container.insertBefore(kids[navIdx], kids[tallIdx]);
        }
        const nav = findPrimaryNav();
        if (nav)
            bubbleLiftChrome(nav);
        const maxDepth = 8;
        function walk(el, depth) {
            if (depth > maxDepth)
                return;
            trySwap(el);
            for (const c of el.children)
                walk(c, depth + 1);
        }
        walk(shell, 0);
    });
}
/** Full-page screenshots only expand the document, not nested scrollports. */
async function expandScrollRoot(page) {
    await page.evaluate(() => {
        const root = document.querySelector("[data-designteam-scroll-root='1']");
        if (!(root instanceof HTMLElement))
            return;
        const style = getComputedStyle(root);
        const contentHeight = root.scrollHeight +
            parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
        // Release clipping up to the document too: resizing main alone leaves it
        // hidden inside a viewport-sized app shell (often a flex column).
        for (let el = root; el; el = el.parentElement) {
            const currentStyle = getComputedStyle(el);
            const position = currentStyle.position;
            const clipHorizontally = currentStyle.overflowX !== "visible";
            // Keep carousels/tables clipped to the original viewport width.
            // hidden/auto would force overflow-y back to auto; clip does not.
            el.style.setProperty("overflow-x", clipHorizontally ? "clip" : "visible", "important");
            el.style.setProperty("overflow-y", "visible", "important");
            el.style.setProperty("max-height", "none", "important");
            el.style.setProperty("min-height", "0", "important");
            el.style.setProperty("height", "auto", "important");
            el.style.setProperty("contain", "none", "important");
            el.style.setProperty("flex-shrink", "0", "important");
            if (position === "fixed" || position === "absolute") {
                el.style.setProperty("position", "relative", "important");
                el.style.setProperty("inset", "auto", "important");
            }
        }
        root.style.setProperty("box-sizing", "border-box", "important");
        root.style.setProperty("height", `${contentHeight}px`, "important");
        root.style.setProperty("flex", "none", "important");
        root.scrollTop = 0;
        window.scrollTo(0, 0);
    });
}

/** Capture one URL and viewport. The caller owns the browser; this owns its page. */
export async function capturePage(browser, url, mode, options = {}) {
    if (!isValidUrl(url))
        throw new TypeError("Invalid HTTP URL");
    if (mode !== "desktop" && mode !== "mobile")
        throw new TypeError("Invalid capture mode");
    const { cookieSelector, normalizeFixedChrome = true } = options;
    const page = await browser.newPage();
    try {
        await page.setViewportSize(mode === "desktop" ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT);
        await gotoWithRetry(page, url, NAVIGATION_TIMEOUT_MS);
        if (cookieSelector) {
            try {
                await page.waitForTimeout(1000);
                if (typeof cookieSelector === "string") {
                    await page.click(cookieSelector, { timeout: 5000 });
                }
                else {
                    await page.frameLocator(cookieSelector.frameSelector).first().locator(cookieSelector.innerSelector).click({ timeout: 5000 });
                }
                await page.waitForTimeout(500);
            }
            catch (error) {
                throw new Error(`Cookie dismissal failed: ${error.message}. Check the supplied cookie selector or omit it if this page has no consent banner.`, { cause: error });
            }
        }
        // Detect main scroll container (window vs. inner scroll element)
        const scrollContext = await page.evaluate(() => {
            const markAttr = "data-designteam-scroll-root";
            // Prefer existing mark if we re-run
            const marked = document.querySelector(`[${markAttr}='1']`);
            if (marked) {
                const rect = marked.getBoundingClientRect();
                return {
                    type: "element",
                    isBody: marked === document.body,
                    rectHeight: rect.height,
                };
            }
            const candidates = [];
            const pushIf = (el) => {
                if (el && el instanceof HTMLElement && !candidates.includes(el)) {
                    candidates.push(el);
                }
            };
            pushIf(document.documentElement);
            pushIf(document.body);
            pushIf(document.querySelector("main"));
            pushIf(document.querySelector("[data-scroll-container]"));
            document
                .querySelectorAll("[class*='scroll'], [class*='Scroll']")
                .forEach((el) => pushIf(el));
            let best = null;
            let bestScore = 0;
            for (const el of candidates) {
                const style = window.getComputedStyle(el);
                const overflowY = style.overflowY;
                const isScrollable = overflowY === "auto" ||
                    overflowY === "scroll" ||
                    el === document.documentElement ||
                    el === document.body;
                if (!isScrollable)
                    continue;
                const scrollHeight = el.scrollHeight;
                const clientHeight = el.clientHeight || window.innerHeight;
                const extra = scrollHeight - clientHeight;
                if (extra > 50 && scrollHeight > bestScore) {
                    best = el;
                    bestScore = scrollHeight;
                }
            }
            if (!best || best === document.documentElement) {
                return { type: "window" };
            }
            if (best === document.body) {
                best.setAttribute(markAttr, "1");
                const rect = best.getBoundingClientRect();
                return {
                    type: "element",
                    isBody: true,
                    rectHeight: rect.height,
                };
            }
            best.setAttribute(markAttr, "1");
            const rect = best.getBoundingClientRect();
            return {
                type: "element",
                isBody: false,
                rectHeight: rect.height,
            };
        });
        // Scroll down in steps so middle-of-page lazy images get time in view (Intersection Observer)
        if (!scrollContext || scrollContext.type === "window") {
            await page.evaluate(({ stepPx, delayMs }) => new Promise((resolve) => {
                const maxScroll = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
                const maxSteps = Math.min(120, Math.max(1, Math.ceil(maxScroll / stepPx) + 2));
                let current = 0;
                let steps = 0;
                let lastTop = window.scrollY;
                const step = () => {
                    steps += 1;
                    current += stepPx;
                    window.scrollTo(0, Math.min(current, maxScroll));
                    const top = window.scrollY;
                    const stuck = steps > 2 && Math.abs(top - lastTop) < 1;
                    lastTop = top;
                    if (current >= maxScroll || steps >= maxSteps || stuck) {
                        resolve();
                        return;
                    }
                    setTimeout(step, delayMs);
                };
                step();
            }), {
                stepPx: SCROLL_STEP_PX,
                delayMs: SCROLL_STEP_DELAY_MS,
            });
        }
        else {
            const container = page
                .locator("[data-designteam-scroll-root='1']")
                .first();
            await container.evaluate((root, { stepPx, delayMs }) => new Promise((resolve) => {
                const el = root;
                const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
                const maxSteps = Math.min(120, Math.max(1, Math.ceil(maxScrollTop / stepPx) + 2));
                let current = 0;
                let steps = 0;
                let lastTop = el.scrollTop;
                const step = () => {
                    steps += 1;
                    current += stepPx;
                    el.scrollTo(0, Math.min(current, maxScrollTop));
                    const top = el.scrollTop;
                    const stuck = steps > 2 && Math.abs(top - lastTop) < 1;
                    lastTop = top;
                    if (current >= maxScrollTop || steps >= maxSteps || stuck) {
                        resolve();
                        return;
                    }
                    setTimeout(step, delayMs);
                };
                step();
            }), {
                stepPx: SCROLL_STEP_PX,
                delayMs: SCROLL_STEP_DELAY_MS,
            });
        }
        // Wait for images to load (poll with timeout)
        const imageWaitDeadline = Date.now() + IMAGE_WAIT_TIMEOUT_MS;
        while (Date.now() < imageWaitDeadline) {
            const allComplete = await page.evaluate(() => {
                const images = Array.from(document.images);
                return (images.length === 0 ||
                    images.every((img) => img.complete && img.naturalWidth > 0));
            });
            if (allComplete)
                break;
            await page.waitForTimeout(IMAGE_WAIT_INTERVAL_MS);
        }
        // Scroll back to top, then (optionally) normalize fixed chrome at scrollY=0,
        // then settle before full-page capture.
        if (!scrollContext || scrollContext.type === "window") {
            await page.evaluate(() => window.scrollTo(0, 0));
        }
        else {
            await page.evaluate(() => {
                const el = document.querySelector("[data-designteam-scroll-root='1']");
                if (el)
                    el.scrollTo(0, 0);
                window.scrollTo(0, 0);
            });
        }
        await applyHideClosedOverlayUi(page);
        if (normalizeFixedChrome) {
            await applyFixedChromeNormalization(page);
        }
        await applyNavHeroReadingOrder(page);
        if (scrollContext?.type === "element") {
            await expandScrollRoot(page);
        }
        await settleBeforeCapture(page);
        const buffer = await page.screenshot({
            type: "png",
            fullPage: true,
        });
        return buffer;
    }
    finally {
        await page.close();
    }
}
