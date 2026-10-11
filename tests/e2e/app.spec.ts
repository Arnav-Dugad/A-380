import { expect, test } from '@playwright/test';
import { openApp, realErrors, waitFor } from './helpers';

test.describe('A380 digital twin', () => {
  test('loads the aircraft, all exterior assets and shows no errors', async ({ page }) => {
    const issues = await openApp(page, { skipIntro: false });
    // The intro continues automatically after a few seconds; click if the button is still there.
    await page.getByRole('button', { name: 'Begin exploring' }).click({ timeout: 4000 }).catch(() => undefined);
    await expect(page.getByRole('heading', { name: 'Airbus A380-800' })).toBeVisible({ timeout: 90_000 });
    const info = await page.evaluate(() => window.__a380!.rigInfo());
    expect(info!.meshes).toBeGreaterThan(250);
    expect(info!.articulated).toBeGreaterThan(80);
    for (const p of ['fuselage', 'wing', 'slat', 'flap', 'aileron', 'spoiler', 'engineFan', 'noseGear', 'wingGear', 'bodyGear', 'passengerDoor', 'cargoDoor', 'rudder', 'elevator']) expect(info!.parts).toContain(p);
    await page.screenshot({ path: 'test-results/01-home.png' });
    expect(realErrors(issues.errors)).toEqual([]);
    expect(issues.failed).toEqual([]);
  });

  test('orbit and zoom move the camera', async ({ page }) => {
    await openApp(page);
    const before = await page.evaluate(() => window.__a380!.extra);
    void before;
    const cam0 = await page.evaluate(() => {
      const c = document.querySelector('canvas')!;
      void c;
      return window.__a380!.project('fuselage_skin');
    });
    const canvas = page.locator('canvas').first();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.45, { steps: 12 });
    await page.mouse.up();
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(1500);
    const cam1 = await page.evaluate(() => window.__a380!.project('fuselage_skin'));
    expect(Math.hypot(cam1!.x - cam0!.x, cam1!.y - cam0!.y)).toBeGreaterThan(20);
  });

  test('clicking a component selects it and opens the inspector', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.__a380!.camera([40, 6, 40], [10, 3.5, 18]));
    await page.waitForTimeout(1500);
    const p = await page.evaluate(() => window.__a380!.project('eng3_fancowl'));
    await page.mouse.click(p!.x, p!.y);
    await expect(page.getByRole('dialog', { name: /details/ })).toBeVisible();
    const sel = await page.evaluate(() => window.__a380!.ui.getState().selected);
    expect(sel).toBeTruthy();
    await page.screenshot({ path: 'test-results/02-inspector.png' });
  });

  test('landing gear swing on jacks retracts and extends the gear', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Gear swing' }).click();
    await waitFor(page, () => window.__a380!.systems.state.gear.position > 0.3, 90_000);
    const leg = await page.evaluate(() => window.__a380!.node('gear_wing_R')!.quat);
    expect(Math.abs(leg[0]!)).toBeGreaterThan(0.05);
    await expect(page.getByText('Aircraft on maintenance jacks')).toBeVisible();
  });

  test('flaps and slats extend through the systems model', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      const s = window.__a380!.systems;
      s.setBattery(true);
      s.setExternalPower(true);
      s.setTimeScale(8);
      s.setFlapLever(4);
    });
    await waitFor(page, () => window.__a380!.systems.state.highLift.flap > 30, 90_000);
    const flap = await page.evaluate(() => window.__a380!.node('flap_R2')!);
    const slat = await page.evaluate(() => window.__a380!.node('slat_R3')!);
    expect(Math.abs(flap.quat[0]!) + Math.abs(flap.quat[1]!) + Math.abs(flap.quat[2]!)).toBeGreaterThan(0.1);
    expect(Math.abs(slat.quat[0]!) + Math.abs(slat.quat[1]!) + Math.abs(slat.quat[2]!)).toBeGreaterThan(0.08);
  });

  test('engines start, spool up and the fans rotate', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.__a380!.systems.applyScenario('taxi'));
    const q0 = await page.evaluate(() => window.__a380!.node('eng1_fan')!.quat);
    await page.waitForTimeout(1500);
    const q1 = await page.evaluate(() => window.__a380!.node('eng1_fan')!.quat);
    expect(q0).not.toEqual(q1);
    const n1 = await page.evaluate(() => window.__a380!.systems.state.engines.map((e) => e.n1));
    for (const v of n1) expect(v).toBeGreaterThan(15);
  });

  test('doors respect interlocks and open', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.__a380!.systems.applyScenario('taxi'));
    const denied = await page.evaluate(() => window.__a380!.systems.setDoor('M1L', true));
    expect(denied.ok).toBe(false);
    await page.evaluate(() => {
      const s = window.__a380!.systems;
      s.applyScenario('turnaround');
      s.setTimeScale(4);
      s.setDoor('M2L', true);
    });
    await waitFor(page, () => window.__a380!.systems.state.doors.M2L!.position > 0.9);
    const door = await page.evaluate(() => window.__a380!.node('door_M2L_panel')!.pos);
    expect(door).toBeTruthy();
  });

  test('X-ray streams the structure layer and exploded view separates assemblies', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('2');
    await expect(page.getByRole('heading', { name: 'Assemblies & structure' })).toBeVisible();
    await page.getByRole('switch', { name: /X-ray skin/ }).click();
    await waitFor(page, () => window.__a380!.rigInfo()!.parts.includes('frames'), 90_000);
    const w0 = await page.evaluate(() => window.__a380!.node('wing_R')!.pos);
    await page.evaluate(() => window.__a380!.ui.getState().set({ explode: 1 }));
    const z0 = w0[2]!;
    await page.waitForFunction((z) => window.__a380!.node('wing_R')!.pos[2]! - z > 4, z0, { timeout: 60_000 });
    await page.screenshot({ path: 'test-results/03-xray-explode.png' });
  });

  test('cockpit controls operate the systems', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('4');
    await expect(page.getByRole('heading', { name: 'Flight deck' })).toBeVisible();
    await page.getByRole('button', { name: 'Batteries' }).click();
    await waitFor(page, () => window.__a380!.systems.state.elec.battery === true);
    await page.getByRole('button', { name: 'APU master switch' }).click();
    await waitFor(page, () => window.__a380!.systems.state.apu.master === true);
    await waitFor(page, () => window.__a380!.rigInfo()!.parts.includes('displays'), 90_000);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'test-results/04-cockpit.png' });
  });

  test('cabin: walk the main deck and change deck', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('5');
    await expect(page.getByRole('heading', { name: 'Two passenger decks' })).toBeVisible();
    await waitFor(page, () => window.__a380!.rigInfo()!.parts.includes('seats'), 90_000);
    // wait until the walk-in transition has placed the eye on the main deck
    await page.waitForFunction(() => (window.__a380!.extra.firstPerson as { pose: () => { pos: number[] } }).pose().pos[1]! > 6, null, { timeout: 60_000 });
    await page.waitForTimeout(2000);
    const p0 = await page.evaluate(() => (window.__a380!.extra.firstPerson as { pose: () => { pos: number[] } }).pose().pos);
    await page.keyboard.down('w');
    await page.waitForFunction(
      (p) => {
        const q = (window.__a380!.extra.firstPerson as { pose: () => { pos: number[] } }).pose().pos;
        return Math.hypot(q[0]! - p[0]!, q[2]! - p[2]!) > 0.5;
      },
      p0,
      { timeout: 60_000 },
    );
    await page.keyboard.up('w');
    await page.getByRole('radio', { name: 'Upper deck' }).click();
    await page.waitForFunction(() => (window.__a380!.extra.firstPerson as { pose: () => { pos: number[] } }).pose().pos[1]! > 9, null, { timeout: 60_000 });
    await page.screenshot({ path: 'test-results/05-cabin.png' });
  });

  test('flight mode: take-off roll accelerates under TOGA', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.__a380!.ui.getState().set({ flightScenario: 'takeoff' }));
    await page.keyboard.press('6');
    await expect(page.getByRole('heading', { name: 'Simplified flight model' })).toBeVisible();
    await waitFor(page, () => window.__a380!.systems.state.air.ias > 25, 120_000);
    await page.screenshot({ path: 'test-results/06-flight.png' });
    const crashed = await page.evaluate(() => window.__a380!.flight.state.crashed);
    expect(crashed).toBeNull();
  });

  test('photo mode captures a screenshot', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('p');
    await expect(page.getByRole('button', { name: 'Capture' })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.getByRole('button', { name: 'Capture' }).click()]);
    expect(download.suggestedFilename()).toMatch(/a380-digital-twin-.*\.png/);
    await page.getByRole('button', { name: 'Exit' }).click();
    await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeVisible();
  });

  test('graphics quality presets switch level of detail and persist across reload', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Graphics & settings' }).click();
    await page.getByRole('radio', { name: 'Perf.' }).click();
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => window.__a380!.ui.getState().quality)).toBe('performance');
    await page.reload();
    await page.waitForFunction(() => window.__a380?.ready(), null, { timeout: 120_000 });
    expect(await page.evaluate(() => window.__a380!.ui.getState().quality)).toBe('performance');
    await page.evaluate(() => window.__a380!.ui.getState().set({ quality: 'high' }));
  });

  test('keyboard navigation switches sections and toggles help', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('7');
    await expect(page.getByRole('heading', { name: 'A380-842 technical data' })).toBeVisible();
    await page.keyboard.press('3');
    await expect(page.getByRole('heading', { name: 'Aircraft systems' })).toBeVisible();
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Help and keyboard shortcuts' })).toBeVisible();
  });
});
