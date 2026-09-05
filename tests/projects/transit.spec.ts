import { expect, test } from '@playwright/test';
import {
  addRoute, addStation, analyzeNetwork, appendStop, createHistory, LIMITS, MAP_BOUNDS,
  moveStation, parseProject, recordChange, redo, removeRoute, removeStation, removeStop,
  renameCity, reorderStop, serializeProject, setRouteStops, undo, updateRoute,
  updateStation, validateNetwork,
} from '../../src/projects/transit/engine';
import { createDefaultNetwork } from '../../src/projects/transit/data';
import { serializeSvg } from '../../src/projects/transit/svg';

test.describe('Transit engine', () => {
  test('the original city is connected, served, and independently cloned', () => {
    const network = validateNetwork(createDefaultNetwork());
    const health = analyzeNetwork(network, 'lantern-exchange');
    expect(network.stations).toHaveLength(20);
    expect(network.routes).toHaveLength(4);
    expect(health.components).toBe(1);
    expect(health.reachable).toBe(network.stations.length);
    expect(health.unserved).toBe(0);
    expect(health.interchanges).toBe(4);
    expect(network.routes.every((route) => route.stops.length > 1)).toBe(true);
    const other = createDefaultNetwork();
    other.routes[0].stops.pop();
    other.stations[0].name = 'Different station';
    expect(network.routes[0].stops).toHaveLength(7);
    expect(createDefaultNetwork().stations[0].name).toBe('Rookery End');
  });

  test('deleting a shared station repairs every route and can be undone', () => {
    const original = createDefaultNetwork();
    let history = createHistory(original);
    const deleted = removeStation(history.present, 'lantern-exchange');
    expect(deleted.stations).toHaveLength(19);
    expect(deleted.routes.every((route) => !route.stops.includes('lantern-exchange'))).toBe(true);
    expect(deleted.routes[0].stops).toEqual([
      'rookery-end', 'copperfold', 'mossgate', 'saffron-steps', 'spindle-yard', 'glint-quay',
    ]);
    expect(deleted.routes[1].stops).toEqual(['cloudglass', 'pollen-hall', 'fernworks', 'lastlight-pier']);
    expect(() => validateNetwork(deleted)).not.toThrow();
    expect(original.stations).toHaveLength(20);
    history = recordChange(history, deleted);
    expect(undo(history).present).toEqual(original);
    expect(redo(undo(history)).present).toEqual(deleted);
  });

  test('route editing has explicit order, validates colors, and preserves stations', () => {
    const original = createDefaultNetwork();
    let network = updateRoute(original, 'emberway', { name: 'Copper & Clay', color: '#ABCDEF' });
    expect(network.routes[0].name).toBe('Copper & Clay');
    expect(network.routes[0].color).toBe('#abcdef');
    expect(original.routes[0].name).toBe('Emberway');
    expect(() => updateRoute(network, 'emberway', { color: 'url(https://invalid.example)' })).toThrow(/six-digit/);
    network = reorderStop(network, 'emberway', 'copperfold', 1);
    expect(network.routes[0].stops.slice(0, 3)).toEqual(['rookery-end', 'mossgate', 'copperfold']);
    network = removeStop(network, 'emberway', 'copperfold');
    network = appendStop(network, 'emberway', 'copperfold');
    expect(network.routes[0].stops.at(-1)).toBe('copperfold');
    expect(() => appendStop(network, 'emberway', 'copperfold')).toThrow(/only once/);
    expect(() => setRouteStops(network, 'emberway', ['missing-station'])).toThrow(/missing/);
    const withoutRoute = removeRoute(network, 'emberway');
    expect(withoutRoute.stations).toEqual(network.stations);
    expect(withoutRoute.routes).toHaveLength(3);
    expect(analyzeNetwork(withoutRoute).unserved).toBeGreaterThan(0);
    expect(() => validateNetwork(withoutRoute)).not.toThrow();
  });

  test('adding, moving, empty routes, and isolated stations remain coherent', () => {
    const original = createDefaultNetwork();
    let network = addStation(original, { x: 660, y: 360 }, 'emberway', 'Paper Harbor');
    const station = network.stations.at(-1)!;
    expect(network.routes[0].stops.at(-1)).toBe(station.id);
    expect(analyzeNetwork(network).components).toBe(1);
    network = moveStation(network, station.id, 675, 389, true);
    expect(network.stations.at(-1)).toMatchObject({ x: 680, y: 380 });
    network = moveStation(network, station.id, -1000, 10000, false);
    expect(network.stations.at(-1)).toMatchObject({ x: MAP_BOUNDS.minX, y: MAP_BOUNDS.maxY });
    expect(() => moveStation(network, station.id, Number.NaN, 200)).toThrow(/finite/);
    network = addRoute(network, 'Blank route', '#567890');
    const route = network.routes.at(-1)!;
    expect(route.stops).toEqual([]);
    network = appendStop(network, route.id, station.id);
    network = removeStation(network, station.id);
    expect(network.routes.at(-1)!.stops).toEqual([]);
    network = addStation(network, { x: 660, y: 360 }, '', 'An island');
    expect(analyzeNetwork(network).components).toBe(2);
    expect(analyzeNetwork(network).unserved).toBe(1);
  });

  test('history is bounded, no-op edits are ignored, and new edits discard redo', () => {
    let history = createHistory(createDefaultNetwork());
    for (let index = 0; index < LIMITS.history + 15; index += 1) {
      history = recordChange(history, renameCity(history.present, `Imaginary city ${index}`));
    }
    expect(history.past).toHaveLength(LIMITS.history);
    expect(recordChange(history, { ...history.present })).toBe(history);
    const final = history.present;
    history = undo(history);
    expect(history.future).toHaveLength(1);
    expect(redo(history).present).toEqual(final);
    history = recordChange(history, renameCity(history.present, 'Another tomorrow'));
    expect(history.future).toHaveLength(0);
    expect(redo(history)).toBe(history);
  });

  test('project import is validated, bounded, and rejects broken references and XML controls', () => {
    const network = createDefaultNetwork();
    expect(parseProject(serializeProject(network))).toEqual(network);
    expect(() => parseProject('not JSON')).toThrow(/not valid JSON/);
    expect(() => parseProject(' '.repeat(200_001))).toThrow(/too large/);
    expect(() => validateNetwork({ ...network, version: 2 })).toThrow(/version 1/);
    expect(() => validateNetwork({
      ...network, stations: [...network.stations, network.stations[0]],
    })).toThrow(/Duplicate station/);
    expect(() => validateNetwork({
      ...network, routes: [{ ...network.routes[0], stops: ['nonexistent'] }],
    })).toThrow(/missing station/);
    expect(() => validateNetwork({
      ...network, routes: [{ ...network.routes[0], stops: ['mossgate', 'mossgate'] }],
    })).toThrow(/repeats station/);
    expect(() => validateNetwork({
      ...network, stations: [{ ...network.stations[0], x: Number.POSITIVE_INFINITY }],
    })).toThrow(/finite/);
    expect(() => renameCity(network, 'Bad\u0000name')).toThrow(/printable/);
    expect(() => renameCity(network, 'Bad\ud800name')).toThrow(/printable/);
    expect(() => renameCity(network, 'Moon 🌙 City')).not.toThrow();
  });

  test('SVG is valid self-contained XML with escaped user text and a complete legend', async ({ page }) => {
    let network = renameCity(createDefaultNetwork(), 'A <&> "City"');
    network = updateStation(network, 'mossgate', { name: 'A & B <Depot>' });
    network = updateRoute(network, 'emberway', { name: '<script>alert("map")</script>', color: '#234567' });
    const exported = serializeSvg(network);
    expect(exported).toContain('&lt;script&gt;');
    expect(exported).not.toContain('<script>');
    expect(exported).not.toContain('data-station=');
    const parsed = await page.evaluate((text) => {
      const document = new DOMParser().parseFromString(text, 'image/svg+xml');
      return {
        errors: document.querySelectorAll('parsererror').length,
        root: document.documentElement.localName,
        scripts: document.querySelectorAll('script').length,
        foreignObjects: document.querySelectorAll('foreignObject, image, use, a').length,
        text: document.documentElement.textContent,
        namespace: document.documentElement.namespaceURI,
        external: [...document.querySelectorAll('*')].some((element) => element.hasAttribute('href')),
      };
    }, exported);
    expect(parsed.errors).toBe(0);
    expect(parsed.root).toBe('svg');
    expect(parsed.namespace).toBe('http://www.w3.org/2000/svg');
    expect(parsed.scripts).toBe(0);
    expect(parsed.foreignObjects).toBe(0);
    expect(parsed.external).toBe(false);
    expect(parsed.text).toContain('A <&> "City"');
    expect(parsed.text).toContain('A & B <Depot>');
    expect(parsed.text).toContain('ROUTE LEGEND');
    for (const route of network.routes) expect(parsed.text).toContain(route.name);
  });

  test('wide station labels fit inside exported map paper at its edges', async ({ page }) => {
    let network = createDefaultNetwork();
    network = updateStation(network, 'rookery-end', { name: 'W'.repeat(36), x: 920, y: 560, label: 'right' });
    network = updateStation(network, 'mossgate', { name: 'M'.repeat(36), x: 80, y: 140, label: 'above-left' });
    await page.setContent(serializeSvg(network));
    const bounds = await page.locator('text').evaluateAll((texts) => texts
      .filter((text) => text.querySelector('tspan') && /^[MW]+$/.test(text.textContent ?? ''))
      .map((text) => {
        const box = (text as SVGTextElement).getBBox();
        return { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height };
      }));
    expect(bounds).toHaveLength(2);
    for (const box of bounds) {
      expect(box.left).toBeGreaterThanOrEqual(23);
      expect(box.right).toBeLessThanOrEqual(977);
      expect(box.top).toBeGreaterThan(90);
      expect(box.bottom).toBeLessThan(615);
    }
  });
});

test.describe('Transit website', () => {
  test('maker content density: the map leads the page and marks its preview', async ({ page }) => {
    for (const viewport of [{ width: 1322, height: 1160 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewport);
      await page.goto('./projects/transit/');
      const preview = page.locator('.project-transit [data-project-preview]');
      await expect(preview).toHaveCount(1);
      const map = preview.locator('[data-map]');
      await expect(map).toBeVisible();
      const top = await map.evaluate((element) => element.getBoundingClientRect().top + scrollY);
      expect(top, `Map starts at ${viewport.width}px width`).toBeLessThanOrEqual(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('./projects/transit/');
    await expect(page.locator('.project-transit h1')).toHaveText('Transit Weaver.');
  });

  test('station keyboard controls, membership edits, deletion, and undo work locally', async ({ page }) => {
    const root = page.locator('.project-transit');
    await expect(root.locator('[data-health]')).toContainText('Every station connected');
    const station = root.locator('[data-station="lantern-exchange"]');
    await station.focus();
    await station.press('ArrowRight');
    await expect(root.locator('[name="x"]')).toHaveValue('480');
    await expect(station).toBeFocused();
    await root.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(root.locator('[name="x"]')).toHaveValue('460');
    await root.getByLabel('Station name', { exact: true }).fill('Paper & <Lantern>');
    await root.getByRole('button', { name: 'Save station', exact: true }).click();
    await expect(root.locator('[data-station="lantern-exchange"]')).toHaveAttribute('aria-label', /Paper & <Lantern>/);
    await expect(root.locator('script')).toHaveCount(0);
    await root.locator('[data-membership="orchard"]').check();
    await expect(root.locator('.tw-selection-heading')).toContainText('4-route interchange');
    await root.getByRole('button', { name: 'Remove station', exact: true }).click();
    await expect(root.locator('[data-station="lantern-exchange"]')).toHaveCount(0);
    await expect(root.locator('[data-map] [data-station]')).toHaveCount(19);
    await root.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(root.locator('[data-map] [data-station]')).toHaveCount(20);
    await root.getByLabel('Choose a station').selectOption('lantern-exchange');
    await expect(root.locator('[data-membership="orchard"]')).toBeChecked();
  });

  test('drag coordinates follow the responsive viewBox, cancellation, and one-step undo', async ({ page }) => {
    const root = page.locator('.project-transit');
    await root.getByRole('button', { name: 'Move', exact: true }).click();
    const station = root.locator('[data-station="lantern-exchange"]');
    await root.locator('[data-map]').evaluate((element) => {
      (element as SVGSVGElement).style.width = '850px';
      (element as SVGSVGElement).style.minWidth = '850px';
    });
    await station.scrollIntoViewIfNeeded();
    const points = await root.locator('[data-map]').evaluate((element) => {
      const matrix = (element as SVGSVGElement).getScreenCTM()!;
      const start = new DOMPoint(460, 440).matrixTransform(matrix);
      const end = new DOMPoint(520, 460).matrixTransform(matrix);
      return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
    });
    await page.mouse.move(points.start.x, points.start.y);
    await page.mouse.down();
    await page.mouse.move(points.end.x, points.end.y, { steps: 5 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(root.locator('[name="x"]')).toHaveValue('460');
    await expect(root.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await page.mouse.move(points.start.x, points.start.y);
    await page.mouse.down();
    await page.mouse.move(points.end.x, points.end.y, { steps: 5 });
    await page.mouse.up();
    await expect(root.locator('[name="x"]')).toHaveValue('520');
    await expect(root.locator('[name="y"]')).toHaveValue('460');
    await root.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(root.locator('[name="x"]')).toHaveValue('460');
    await expect(root.locator('[name="y"]')).toHaveValue('440');
    await expect(root.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  });

  test('route colors validate, stop ordering is editable, and new routes undo cleanly', async ({ page }) => {
    const root = page.locator('.project-transit');
    await root.getByRole('button', { name: 'Edit route Emberway', exact: true }).click();
    await root.getByLabel('Route color · six-digit hex').fill('#bad');
    await root.getByRole('button', { name: 'Save route', exact: true }).click();
    await expect(root.locator('[data-status]')).toContainText('six-digit');
    await expect(root.locator('[data-local-status]')).toContainText('six-digit');
    await expect(root.locator('[data-map-route="emberway"]').first()).toHaveAttribute('stroke', '#df5935');
    await root.getByLabel('Route color · six-digit hex').fill('#234567');
    await root.getByLabel('Route name', { exact: true }).fill('Copper & Clay');
    await root.getByRole('button', { name: 'Save route', exact: true }).click();
    await expect(root.locator('[data-map-route="emberway"]').first()).toHaveAttribute('stroke', '#234567');
    await expect(root.getByRole('button', { name: 'Edit route Copper & Clay', exact: true })).toBeVisible();
    await root.getByRole('button', { name: 'Move Copperfold later', exact: true }).click();
    await expect(root.locator('.tw-stop-list li').nth(2)).toContainText('Copperfold');
    await root.getByRole('button', { name: 'Add route', exact: true }).click();
    await expect(root.locator('.tw-legend-route')).toHaveCount(5);
    await root.getByRole('button', { name: 'Append stop', exact: true }).click();
    await root.getByRole('button', { name: 'Append stop', exact: true }).click();
    await expect(root.locator('.tw-stop-list li')).toHaveCount(2);
    await root.getByRole('button', { name: 'Remove route', exact: true }).click();
    await expect(root.locator('.tw-legend-route')).toHaveCount(4);
    await expect(root.locator('[data-map] [data-station]')).toHaveCount(20);
    await root.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(root.locator('.tw-legend-route')).toHaveCount(5);
  });

  test('station placement, project import errors, and SVG downloads have real outcomes', async ({ page }) => {
    const root = page.locator('.project-transit');
    await root.getByRole('button', { name: 'Add without pointing', exact: true }).click();
    await expect(root.locator('[data-map] [data-station]')).toHaveCount(21);
    await expect(root.locator('[data-membership="emberway"]')).toBeChecked();
    await root.locator('[data-file-input]').setInputFiles({
      name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"city":"Incomplete"}'),
    });
    await expect(root.locator('[data-status]')).toContainText('stations array');
    await expect(root.locator('[data-map] [data-station]')).toHaveCount(21);
    const imported = renameCity(createDefaultNetwork(), 'Tomorrow & Tide');
    await root.locator('[data-file-input]').setInputFiles({
      name: 'city.json', mimeType: 'application/json', buffer: Buffer.from(serializeProject(imported)),
    });
    await expect(root.locator('[data-city-heading]')).toHaveText('Tomorrow & Tide');
    await expect(root.locator('[data-map] [data-station]')).toHaveCount(20);
    const downloadPromise = page.waitForEvent('download');
    await root.getByRole('button', { name: /Download SVG poster/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('tomorrow-tide-transit.svg');
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const svg = Buffer.concat(chunks).toString('utf8');
    expect(svg).toContain('Tomorrow &amp; Tide');
    expect(svg).toContain('ROUTE LEGEND');
    for (const route of imported.routes) expect(svg).toContain(route.name);
    await root.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(root.locator('[data-map] [data-station]')).toHaveCount(21);
    await expect(root.locator('[data-city-heading]')).toHaveText('Brindleport');
  });
});
