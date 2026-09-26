import type { Locator } from '@playwright/test';
import { MILESTONE_IDS, MILESTONE_MANAGED_SYSTEM_IDS } from './fixtures/milestones';
import { installMockApi } from './support/mock-api';
import { expectVisual } from './support/screenshot';
import { expect, test } from './support/visual-test';

// Tokens are "R G B" channel triplets (ADR-0021 token format); badge/summary
// assertions derive their expected computed CSS from the resolved value.
function parseTriplet(value: string): [number, number, number] {
  expect(value).toMatch(/^\d+ \d+ \d+$/);
  return value.split(' ').map(Number) as [number, number, number];
}

// boundingBox() returns null for detached/hidden elements; the geometric
// regressions need the box, so fold the guard into a helper (no non-null
// assertions).
function requireBox(box: { x: number; y: number; width: number; height: number } | null) {
  if (box === null) throw new Error('Expected a bounding box, got null');
  return box;
}

// #514 B2c — /tasks?view=milestones list: empty copy, status tabs (no
// Blocked), populated rows, and the summary strip asserted through installMockApi.
// B2-pixel adds empty and populated list-with-detail screenshot assertions;
// the conductor owns generating the corresponding baseline PNGs.
test.describe('/tasks?view=milestones visual harness', () => {
  test('mounts exactly one list shell', async ({ page }) => {
    await installMockApi(page, { milestones: true });
    await page.goto('/tasks?view=milestones');
    await expect(page.locator('[data-shell="list"]')).toHaveCount(1);
  });

  test('renders the empty copy and the four status tabs without Blocked', async ({ page }) => {
    await installMockApi(page, { milestones: 'empty' });
    await page.goto('/tasks?view=milestones');

    await expect(page.getByText('표시할 milestone 이 없습니다.')).toBeVisible();
    for (const label of ['All', 'In progress', 'Planning', 'Released']) {
      await expect(page.getByRole('tab', { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: /Blocked/ })).toHaveCount(0);
    await expectVisual(page, page.locator('[data-shell="list"]'), 'milestone-empty.png');
  });

  test('renders populated rows, tab counts, and the summary strip', async ({ page }) => {
    await installMockApi(page, { milestones: true });
    await page.goto('/tasks?view=milestones');

    const ssoRow = page.locator('[role="button"]', { hasText: 'MLS-1021' });
    await expect(ssoRow).toContainText('SSO Stabilization');
    await expect(ssoRow).toContainText('In progress');
    await expect(ssoRow).toContainText('Power BI');
    await expect(ssoRow).toContainText('Product Usage');
    await expect(ssoRow).toContainText('0/1 released');
    await expect(ssoRow).toContainText('2026-06-15');

    const uxRow = page.locator('[role="button"]', { hasText: 'MLS-1018' });
    await expect(uxRow).toContainText('Q1 UX Polish');
    await expect(uxRow).toContainText('Released');

    // Tab counts derive from the unfiltered list fixture (5 milestones:
    // 2 in progress, 2 planning, 1 released).
    await expect(page.getByRole('tab', { name: /^All/ })).toContainText('5');
    await expect(page.getByRole('tab', { name: /^In progress/ })).toContainText('2');
    await expect(page.getByRole('tab', { name: /^Planning/ })).toContainText('2');
    await expect(page.getByRole('tab', { name: /^Released/ })).toContainText('1');

    const summary = page.getByTestId('milestones-summary');
    await expect(summary).toContainText('Milestones');
    await expect(summary).toContainText('Tasks in flight');
    await expect(summary).toContainText('Evidence linked');
    await expect(summary).toContainText('Released');
    await expect(summary).toContainText('Schedule risk · mini-timeline 우측 표시');
    await expect(page.getByTestId('milestone-summary-evidence-linked')).toHaveText('0');
  });

  // #514 B2d — open-panel text assertions (no PNG; B2-pixel owns screenshots).
  test('opens the detail panel from param and closes while preserving scope', async ({ page }) => {
    await installMockApi(page, { milestones: true });
    await page.goto(`/tasks?view=milestones&param=${MILESTONE_IDS.sso}`);

    await expect(page.getByRole('heading', { name: 'SSO Stabilization' })).toBeVisible();
    await expect(page.getByText('Why this milestone exists')).toBeVisible();
    await expect(page.getByText('0 of 1 tasks released')).toBeVisible();
    await expect(page.getByText('FIN-181')).toBeVisible();
    for (const label of ['Overview', 'Evidence', 'Activity']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
    // Slice C (Timeline) stays absent; B2d-tasks adds the Tasks entry.
    await expect(page.getByRole('button', { name: 'Timeline' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Tasks/ })).toBeVisible();

    await page.getByRole('button', { name: '패널 닫기' }).click();
    await expect(page.getByRole('heading', { name: 'SSO Stabilization' })).toHaveCount(0);
    expect(page.url()).not.toContain('param=');

    // Closing never drops the Managed System scope (list-context rule).
    await page.goto(
      `/tasks?view=milestones&managedSystem=${MILESTONE_MANAGED_SYSTEM_IDS.powerbi}&param=${MILESTONE_IDS.sso}`,
    );
    await expect(page.getByRole('heading', { name: 'SSO Stabilization' })).toBeVisible();
    await page.getByRole('button', { name: '패널 닫기' }).click();
    await expect(page.getByRole('heading', { name: 'SSO Stabilization' })).toHaveCount(0);
    expect(page.url()).toContain(`managedSystem=${MILESTONE_MANAGED_SYSTEM_IDS.powerbi}`);
    expect(page.url()).not.toContain('param=');
  });

  // #514 B2d-tasks — the detail panel's Tasks section: header count, the
  // child row (priority, display id, title, internal status, due date in the
  // G-columns estimate slot per ADR-0050 choice a, updated stamp, assignee),
  // and no Add task control. Text assertions only; B2-pixel owns PNGs.
  test('renders the Tasks section with the milestone child row', async ({ page }) => {
    await installMockApi(page, { milestones: true });
    await page.goto(`/tasks?view=milestones&param=${MILESTONE_IDS.sso}`);

    await expect(page.getByRole('heading', { name: 'SSO Stabilization' })).toBeVisible();
    await expect(page.getByText('Why this milestone exists')).toBeVisible();
    await expect(page.getByText('FIN-181')).toBeVisible();

    const ssoRow = page.locator('[role="button"]', { hasText: 'MLS-1021' });
    await expect(ssoRow).toContainText('SSO Stabilization');
    await expect(ssoRow).toContainText('Power BI');
    await expect(ssoRow).toContainText('Product Usage');

    const summary = page.getByTestId('milestones-summary');
    await expect(summary.getByTestId('milestone-summary-total')).toHaveText('5');
    await expect(summary.getByTestId('milestone-summary-in-flight')).toHaveText('2');

    await expect(page.getByRole('button', { name: /^Tasks/ })).toContainText('1');

    const tasksSection = page.locator('[data-anchor="tasks"]');
    await expect(tasksSection.getByText('Tasks · 1')).toBeVisible();
    await expect(tasksSection).toContainText('TASK-902');
    await expect(tasksSection).toContainText('Power BI 임베디드 SSO 재인증 핸들러 구현');
    await expect(tasksSection).toContainText('Doing');
    // G-columns (ADR-0050, choice a): due_date occupies the prototype's
    // estimate slot; the word estimate never renders and no Add task exists.
    await expect(tasksSection).toContainText('2026-06-15');
    await expect(tasksSection).not.toContainText('estimate');
    await expect(tasksSection).toContainText('updated 2026-07-21');
    // Prototype TASK-902 assignee u-4 resolves to 최민서 (data.js:24, :382);
    // the avatar renders the initial.
    await expect(tasksSection).toContainText('최');
    await expect(tasksSection).not.toContainText('Unassigned');
    await expect(page.getByRole('button', { name: 'Add task' })).toHaveCount(0);
    await expectVisual(page, page.locator('[data-shell="list"]'), 'milestone-detail.png');
  });

  // #514 B2e — the create control lives on the toolbar; the create block
  // itself is covered by MilestonesRoute.edit.test.tsx. No PNG in this spec.
  test('shows the New milestone toolbar action', async ({ page }) => {
    await installMockApi(page, { milestones: true });
    await page.goto('/tasks?view=milestones');

    await expect(page.getByRole('button', { name: 'New milestone' })).toBeVisible();
  });

  // B2d fixup — a selected detail the actor cannot read (403) still mounts the
  // panel chrome and close action; closing it clears param and keeps the
  // Managed System scope (routes-and-layout list-context rule).
  test('closes an inaccessible selected detail while clearing param and retaining scope', async ({
    page,
  }) => {
    await installMockApi(page, { milestones: 'denied-detail' });
    await page.goto(
      `/tasks?view=milestones&managedSystem=${MILESTONE_MANAGED_SYSTEM_IDS.powerbi}&param=${MILESTONE_IDS.sso}`,
    );

    // The scoped list stays as primary context; the blocked detail is dismissible.
    await expect(page.getByText('MLS-1021')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Milestone detail' })).toBeVisible();
    await expect(page.getByRole('button', { name: '패널 닫기' })).toBeVisible();
    // Panel-only record content must not render (the list row legitimately
    // still shows the title; the blocked panel must not).
    await expect(page.getByRole('heading', { name: 'SSO Stabilization' })).toHaveCount(0);
    await expect(page.getByText('Why this milestone exists')).toHaveCount(0);
    await expect(page.getByText('From finding')).toHaveCount(0);

    await page.getByRole('button', { name: '패널 닫기' }).click();
    await expect(page.getByRole('button', { name: '패널 닫기' })).toHaveCount(0);
    expect(page.url()).toContain(`managedSystem=${MILESTONE_MANAGED_SYSTEM_IDS.powerbi}`);
    expect(page.url()).not.toContain('param=');
  });

  // ============================================================
  // #514 CP-pixel regressions (.review/pixel-514-findings.md)
  // ============================================================

  // Finding 1 — at 1440 with the detail open the list column is 708px and the
  // defect was the search/action area overlapping the tab strip (tablist right
  // 729 vs search x 525), clipping Planning/Released. Boundary evidence from
  // the coordinator: assert against the elements that own the defect geometry —
  // every tab's right edge stays left of the search box, the New milestone
  // action stays inside the list column (list shell right = 1000), and the
  // last tab + action pass a center hit-test (operable, not scrolled away).
  // toBeVisible alone passes on clipped tabs; these checks do not.
  test('cp-pixel: keeps every status tab inside the toolbar with the detail open at 1440', async ({
    page,
  }) => {
    await installMockApi(page, { milestones: true });
    await page.goto(`/tasks?view=milestones&param=${MILESTONE_IDS.sso}`);

    const tabsContainer = page.locator('[data-list-toolbar-tabs]');
    await expect(tabsContainer).toBeVisible();
    const newMilestone = page.getByRole('button', { name: 'New milestone' });
    await expect(newMilestone).toBeVisible();

    // Measure only the settled layout: web-font swap and the async tab-count
    // badges both change toolbar geometry after first paint.
    await page.evaluate(() => document.fonts.ready);
    // Fixture: 5 milestones → the All tab's count badge is the last toolbar
    // content to arrive; its presence implies the counts query settled.
    await expect(page.getByRole('tab', { name: /^All 5$/ })).toBeVisible();

    const search = page.getByPlaceholder('Milestone 검색…');
    await expect(search).toBeVisible();
    const searchBox = requireBox(await search.boundingBox());
    // The list column the toolbar lives in (rail 52 + sidebar 240 = x 292 …
    // detail 440 → right edge 1000 at 1440).
    const toolbar = page.locator('[data-toolbar-height="50"]').first();
    const toolbarBox = requireBox(await toolbar.boundingBox());

    for (const label of ['All', 'In progress', 'Planning', 'Released']) {
      const tab = page.getByRole('tab', { name: new RegExp(`^${label}`) });
      await expect(tab).toBeVisible();
      const tabBox = requireBox(await tab.boundingBox());
      // The defect: tabs running under the search area and clipping.
      expect(
        tabBox.x + tabBox.width,
        `${label} tab right edge ${tabBox.x + tabBox.width} overlaps the search box left edge ${searchBox.x}`,
      ).toBeLessThanOrEqual(searchBox.x + 0.5);
      // Operability: the tab's center actually resolves to the tab, not to an
      // overlapping/clipping ancestor.
      const hit = await page.evaluate(
        ([x, y, expected]: [number, number, string]) => {
          const el = document.elementFromPoint(x, y);
          const tab = el?.closest('[role="tab"]');
          return tab !== null && tab !== undefined && (tab.textContent ?? '').startsWith(expected);
        },
        [tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2, label] as [
          number,
          number,
          string,
        ],
      );
      expect(hit, `${label} tab center does not hit the tab element — clipped or overlapped`).toBe(
        true,
      );
    }

    const actionBox = requireBox(await newMilestone.boundingBox());
    // The primary action stays inside the list column, never spilling under
    // the open detail panel.
    expect(
      actionBox.x + actionBox.width,
      `New milestone right edge ${actionBox.x + actionBox.width} exceeds the list column right edge ${toolbarBox.x + toolbarBox.width}`,
    ).toBeLessThanOrEqual(toolbarBox.x + toolbarBox.width + 0.5);
    const actionHit = await page.evaluate(
      ([x, y]: [number, number]) => {
        const el = document.elementFromPoint(x, y);
        return el !== null && (el.closest('button')?.textContent ?? '').includes('New milestone');
      },
      [actionBox.x + actionBox.width / 2, actionBox.y + actionBox.height / 2] as [number, number],
    );
    expect(actionHit, 'New milestone center does not hit the button').toBe(true);
  });

  // Finding 2 — the badge consumed RGB-channel tokens with
  // color:var(--status…) / color-mix(var(…)), both invalid CSS colors, so
  // list and title badges rendered as plain black text on a transparent
  // background. The expected values are derived from the token the page
  // actually resolves, so only real CSS can pass.
  test('cp-pixel: renders tinted status badges from real CSS tokens in list and detail', async ({
    page,
  }) => {
    await installMockApi(page, { milestones: true });
    await page.goto(`/tasks?view=milestones&param=${MILESTONE_IDS.sso}`);

    const ssoRow = page.locator('[role="button"]', { hasText: 'MLS-1021' });
    await expectBadgeCss(
      ssoRow.locator('[data-token="--status-internal-doing"]'),
      '--status-internal-doing',
    );
    // Title badge (detail panel header block) — same component, same contract.
    const titleBadge = page
      .locator('aside')
      .locator('[data-token="--status-internal-doing"]')
      .first();
    await expectBadgeCss(titleBadge, '--status-internal-doing');
    // Released badge — emerald token, list row only (no released detail open).
    const releasedRow = page.locator('[role="button"]', { hasText: 'MLS-1018' });
    await expectBadgeCss(
      releasedRow.locator('[data-token="--status-internal-done"]'),
      '--status-internal-done',
    );
  });

  test('cp-pixel: renders the milestone detail header badge to prototype style', async ({
    page,
  }) => {
    await installMockApi(page, { milestones: true });
    await page.goto(`/tasks?view=milestones&param=${MILESTONE_IDS.sso}`);

    const header = page.locator('[data-kind="milestone"]');
    await expect(header).toBeVisible();
    const badge = header.getByText('Milestone', { exact: true });
    await expect(badge).toBeVisible();

    const css = await badge.evaluate((el) => {
      const badgeStyle = getComputedStyle(el);
      const tokenRgb = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-amber')
        .trim();
      const dot = el.querySelector<HTMLElement>('span[aria-hidden="true"]');
      const dotStyle = dot === null ? null : getComputedStyle(dot);
      const header = el.closest('[data-kind="milestone"]');

      return {
        text: el.textContent?.trim(),
        color: badgeStyle.color,
        background: badgeStyle.backgroundColor,
        fontSize: badgeStyle.fontSize,
        borderRadius: badgeStyle.borderRadius,
        textTransform: badgeStyle.textTransform,
        tokenRgb,
        dot:
          dotStyle === null
            ? null
            : {
                width: dotStyle.width,
                height: dotStyle.height,
                background: dotStyle.backgroundColor,
                radius: dotStyle.borderRadius,
              },
        hasLeadingStripe: header?.querySelector(':scope > div[aria-hidden="true"]') !== null,
      };
    });
    const [r, g, b] = parseTriplet(css.tokenRgb);

    expect(css.text).toBe('Milestone');
    expect(css.color).toBe(`rgb(${r}, ${g}, ${b})`);
    expect(css.background).toBe(`rgba(${r}, ${g}, ${b}, 0.12)`);
    expect(css.fontSize).toBe('11px');
    expect(css.borderRadius).toBe('4px');
    expect(css.textTransform).toBe('none');
    expect(css.dot).toEqual({
      width: '6px',
      height: '6px',
      background: `rgb(${r}, ${g}, ${b})`,
      radius: '9999px',
    });
    expect(css.hasLeadingStripe).toBe(false);
  });

  // Finding 2 — the Released summary value used the non-existent `text-success`
  // utility and rendered black; it must consume the --text-success token.
  test('cp-pixel: renders the Released summary value in the semantic success color', async ({
    page,
  }) => {
    await installMockApi(page, { milestones: true });
    await page.goto('/tasks?view=milestones');

    const releasedValue = page.getByTestId('milestone-summary-released');
    await expect(releasedValue).toBeVisible();
    const { color, successRgb } = await releasedValue.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, successRgb: cs.getPropertyValue('--text-success').trim() };
    });
    const [r, g, b] = parseTriplet(successRgb);
    expect(color).toBe(`rgb(${r}, ${g}, ${b})`);
  });

  test('cp-pixel: keeps the zero-progress track visible against its card', async ({ page }) => {
    await installMockApi(page, { milestones: true });
    await page.goto(`/tasks?view=milestones&param=${MILESTONE_IDS.sso}`);

    const detail = page.getByTestId('app-detail-slot');
    await expect(detail.getByText('0%', { exact: true })).toBeVisible();

    const progressCard = detail
      .getByText('0 of 1 tasks released', { exact: true })
      .locator('xpath=../..');
    const track = progressCard.locator('div[aria-hidden="true"]');
    await expect(track).toHaveCount(1);
    const trackCss = await track.evaluate((el) => {
      const card = el.parentElement;
      if (card === null) throw new Error('Expected the progress track inside its card');
      return {
        height: getComputedStyle(el).height,
        background: getComputedStyle(el).backgroundColor,
        cardBackground: getComputedStyle(card).backgroundColor,
      };
    });

    expect.soft(trackCss.height).toBe('4px');
    expect.soft(trackCss.background).not.toBe(trackCss.cardBackground);
  });

  test('cp-pixel: aligns milestone property values to one prototype column', async ({ page }) => {
    await installMockApi(page, { milestones: true });
    await page.goto(`/tasks?view=milestones&param=${MILESTONE_IDS.sso}`);

    const detail = page.getByTestId('app-detail-slot');
    await expect(detail.getByRole('heading', { name: 'SSO Stabilization' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const propertyLabels = [
      'Managed System',
      'Analytics Area',
      'Owner',
      'Start',
      'Target',
      'Created',
    ];
    const properties = await Promise.all(
      propertyLabels.map(async (label) => {
        const fieldLabel = detail.getByText(label, { exact: true });
        await expect(fieldLabel).toBeVisible();
        const row = fieldLabel.locator('xpath=..');
        const value = row.locator('xpath=./div');
        const [rowBox, valueBox, rowCss, valueAlignment] = await Promise.all([
          row.boundingBox(),
          value.boundingBox(),
          row.evaluate((el) => {
            const cs = getComputedStyle(el);
            return {
              display: cs.display,
              columns: cs.gridTemplateColumns,
              columnGap: cs.columnGap,
              fontSize: cs.fontSize,
            };
          }),
          value.evaluate((el) => getComputedStyle(el).textAlign),
        ]);
        return {
          label,
          rowX: requireBox(rowBox).x,
          valueX: requireBox(valueBox).x,
          rowCss,
          valueAlignment,
        };
      }),
    );

    const sharedOrigin = properties[0]?.valueX;
    if (sharedOrigin === undefined) throw new Error('Expected representative milestone properties');
    for (const property of properties) {
      expect.soft(property.rowCss.display, property.label).toBe('grid');
      expect.soft(property.rowCss.columns, property.label).toMatch(/^120px\s/);
      expect.soft(property.rowCss.columnGap, property.label).toBe('12px');
      expect.soft(property.rowCss.fontSize, property.label).toBe('13px');
      expect.soft(property.valueAlignment, property.label).toBe('left');
      expect
        .soft(Math.abs(property.valueX - (property.rowX + 132)), property.label)
        .toBeLessThan(0.5);
      expect
        .soft(
          Math.abs(property.valueX - sharedOrigin),
          `${property.label}: row x ${property.rowX}, value x ${property.valueX}, shared origin ${sharedOrigin}`,
        )
        .toBeLessThan(0.5);
    }
  });

  // Finding 3 — detail typography/density on the prototype scale: why block
  // 13px/1.55 (NestedTextBlock), source summary 12px, panel-section 32px
  // rhythm, title block 24px margin, panel-scroll 28/24/32 padding; and
  // finding 4 — the Owner property renders the shared user chip with the
  // resolved owner.
  test('cp-pixel: renders detail typography, section rhythm, and the owner chip on the prototype scale', async ({
    page,
  }) => {
    await installMockApi(page, { milestones: true });
    await page.goto(`/tasks?view=milestones&param=${MILESTONE_IDS.sso}`);

    await expect(page.getByRole('heading', { name: 'SSO Stabilization' })).toBeVisible();

    // Why block — prototype NestedTextBlock: 13px with 1.6 line height.
    // Scoped to the detail panel: the selected row's truncated excerpt shares
    // the same sentence.
    const why = page
      .getByTestId('app-detail-slot')
      .getByText('SSO 세션 만료 후 재인증 흐름이 없습니다.');
    await expect(why).toBeVisible();
    const whyCss = await why.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { size: cs.fontSize, lineHeight: cs.lineHeight };
    });
    expect(whyCss.size).toBe('13px');
    expect(Math.abs(Number.parseFloat(whyCss.lineHeight) / 13 - 1.6)).toBeLessThan(0.03);

    // Source summary — prototype text-xs (12px).
    const summary = page.getByText(
      '여러 팀에서 401 응답 후 빈 화면 또는 무한 로딩을 겪고 있습니다.',
      {
        exact: false,
      },
    );
    await expect(summary).toBeVisible();
    const summaryCss = await summary.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { size: cs.fontSize, lineHeight: cs.lineHeight };
    });
    expect(summaryCss.size).toBe('12px');
    expect(Math.abs(Number.parseFloat(summaryCss.lineHeight) / 12 - 1.55)).toBeLessThan(0.03);

    // Section rhythm — .panel-section 32px bottom margin, title block 24px,
    // panel-scroll 28/24/32 padding.
    const titleBlock = page.getByRole('heading', { name: 'SSO Stabilization' }).locator('xpath=..');
    expect(await titleBlock.evaluate((el) => getComputedStyle(el).marginBottom)).toBe('24px');
    const tasksSection = page.locator('[data-anchor="tasks"]');
    await expect(tasksSection).toBeVisible();
    expect(await tasksSection.evaluate((el) => getComputedStyle(el).marginBottom)).toBe('32px');
    const scroll = page.getByTestId('milestone-detail-scroll');
    const scrollCss = await scroll.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { top: cs.paddingTop, x: cs.paddingLeft, bottom: cs.paddingBottom };
    });
    expect(scrollCss).toEqual({ top: '28px', x: '24px', bottom: '32px' });

    // Owner property — shared UserChip with the resolved owner (finding 4).
    await expect(page.getByText('박서연')).toBeVisible();
  });

  async function expectBadgeCss(badge: Locator, token: string): Promise<void> {
    await expect(badge).toBeVisible();
    const css = await badge.evaluate((el, tokenName) => {
      const cs = getComputedStyle(el);
      const dotEl = el.querySelector<HTMLElement>('span[aria-hidden="true"]');
      const dotCss = dotEl === null ? null : getComputedStyle(dotEl);
      return {
        tokenRgb: cs.getPropertyValue(tokenName).trim(),
        color: cs.color,
        background: cs.backgroundColor,
        dot:
          dotCss === null
            ? null
            : {
                width: dotCss.width,
                height: dotCss.height,
                background: dotCss.backgroundColor,
                radius: dotCss.borderRadius,
              },
      };
    }, token);
    const [r, g, b] = parseTriplet(css.tokenRgb);
    // Text in the token color (alpha 1) — never inherited black.
    expect(css.color).toBe(`rgb(${r}, ${g}, ${b})`);
    // Compact prototype badge tint: token at 12% — never fully transparent.
    expect(css.background).toBe(`rgba(${r}, ${g}, ${b}, 0.12)`);
    // Prototype .badge-dot: 6×6 pill in the token color.
    expect(css.dot).toEqual({
      width: '6px',
      height: '6px',
      background: `rgb(${r}, ${g}, ${b})`,
      radius: '9999px',
    });
  }
});
