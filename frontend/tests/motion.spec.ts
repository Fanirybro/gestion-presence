import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();
  await expect(page.locator(".route-content")).toHaveCSS("opacity", "1");
}

test("expressive metrics remain readable and honor reduced motion", async ({
  page,
}) => {
  await signIn(page);
  const metric = page.locator(".metric-motion").first();
  await expect(page.locator(".rolling-number")).toHaveCount(4);
  await expect(page.locator(".animated-meter").first()).toHaveAttribute(
    "role",
    "progressbar",
  );
  await page.waitForTimeout(1300);
  const size = await metric.boundingBox();
  if (!size) throw new Error("Missing metric");
  await page.mouse.move(size.x + size.width - 12, size.y + 12);
  await expect
    .poll(() => metric.evaluate((el) => getComputedStyle(el).transform))
    .not.toBe("none");
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: "test-results/expressive-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).toHaveCSS("visibility", "hidden");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/expressive-mobile.png",
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".digit-reel")).toHaveCount(0);
  await expect(metric).toHaveCSS("transform", "none");
});

test("real pending data displays skeletons, then the populated view", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("presence-session", "u1"),
  );
  await page.route("**/src/services/loadDatabase.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export async function loadDatabase() {
      await new Promise(resolve => { window.releaseData = resolve; });
      const { readDb } = await import('/src/services/store.ts');
      return readDb();
    }`,
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("status", { name: "Chargement des données" }),
  ).toBeVisible();
  await expect(page.locator(".skeleton-table tbody tr")).toHaveCount(5);
  await page.screenshot({
    path: "test-results/loading-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/loading-mobile.png",
    fullPage: true,
  });
  await page.evaluate(() =>
    (window as unknown as { releaseData: () => void }).releaseData(),
  );
  await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();
  await expect(page.locator(".skeleton")).toHaveCount(0);
});

test("slow page loading preserves the shell and navigation", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/src/pages/Admin.tsx*", async (route) => {
    await gate;
    await route.continue();
  });
  await signIn(page);
  await page
    .locator(".sidebar")
    .evaluate((el) => el.setAttribute("data-continuity", "retained"));
  await page.getByRole("link", { name: "Utilisateurs", exact: true }).click();
  try {
    await expect(
      page.getByRole("status", { name: "Chargement des données" }),
    ).toBeVisible();
    await expect(page.locator(".sidebar")).toHaveAttribute(
      "data-continuity",
      "retained",
    );
    await expect(
      page.getByRole("button", { name: "Se déconnecter" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/route-loading.png",
      fullPage: true,
    });
  } finally {
    release();
  }
  await expect(
    page.getByRole("heading", { name: "Utilisateurs", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".skeleton")).toHaveCount(0);
  await page.getByRole("link", { name: "Paramètres", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Paramètres", exact: true }),
  ).toBeVisible();
});

test("modal animation, keyboard dismissal and focus restoration", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/agents/a1/qr");
  await expect(page.locator(".qr-badge img")).toBeVisible();
  await page.getByRole("button", { name: "Régénérer le QR" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "test-results/modal-open.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Régénérer le QR" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Régénérer le QR" }).click();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("mobile drawer and live reduced-motion preference", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".main-shell")).toHaveAttribute("inert", "");
  await page.screenshot({
    path: "test-results/drawer-open.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Ouvrir le menu" }),
  ).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.getByRole("link", { name: "Personnel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Personnel", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".route-content")).toHaveCSS("transform", "none");
  await page.screenshot({
    path: "test-results/reduced-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("skeleton shimmer is composited and becomes static with reduced motion", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("presence-session", "u1"),
  );
  await page.route("**/src/services/loadDatabase.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "export async function loadDatabase() { return new Promise(() => {}); }",
    }),
  );
  await page.goto("/");
  await expect(page.locator(".skeleton").first()).toBeVisible();
  const keyframes = await page.evaluate(() =>
    document
      .getAnimations()
      .flatMap((a) => (a.effect as KeyframeEffect).getKeyframes())
      .map((frame) =>
        Object.keys(frame).filter(
          (k) =>
            !["offset", "computedOffset", "easing", "composite"].includes(k),
        ),
      )
      .flat(),
  );
  expect(keyframes.length).toBeGreaterThan(0);
  expect(
    keyframes.every((key) => ["transform", "opacity"].includes(key)),
  ).toBeTruthy();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const cdp = await page.context().newCDPSession(page);
  const complete = new Promise<{ stream: string }>((resolve) =>
    cdp.once("Tracing.tracingComplete", resolve),
  );
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline",
    transferMode: "ReturnAsStream",
  });
  await page.waitForTimeout(600);
  await cdp.send("Tracing.end");
  const { stream } = await complete;
  let trace = "";
  for (;;) {
    const chunk = await cdp.send("IO.read", { handle: stream });
    trace += chunk.data;
    if (chunk.eof) break;
  }
  await cdp.send("IO.close", { handle: stream });
  await cdp.detach();
  const events = (JSON.parse(trace) as { traceEvents: { name: string }[] })
    .traceEvents;
  expect(events.filter((event) => event.name === "Layout")).toHaveLength(0);
  expect(events.filter((event) => event.name === "Paint")).toHaveLength(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".skeleton").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(
    await page
      .locator(".skeleton")
      .first()
      .evaluate((el) => getComputedStyle(el, "::after").animationName),
  ).toBe("none");
  await page.screenshot({
    path: "test-results/loading-reduced.png",
    fullPage: true,
  });
});
