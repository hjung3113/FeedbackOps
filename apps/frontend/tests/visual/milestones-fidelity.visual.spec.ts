import { MILESTONE_IDS } from './fixtures/milestones';
import { installMockApi } from './support/mock-api';
import { expect, test } from './support/visual-test';

// Final #514 fidelity pass — named Sol-review deviations, asserted through
// actual computed CSS (never class names) on the two milestone surfaces:
//
//   detail panel (param=sso):
//     - section titles 11px with 10px wrapper bottom rhythm (prototype
//       styles.css .panel-section-title 11px; panel.jsx title wrapper 10px)
//     - progress headline and source finding title 13px (prototype --text-sm)
//     - source card gap 6px, card top 10px, id margin-right 6px
//     - Managed System pill / Analytics Area / Evidence badges compact:
//       11px, weight 500, 4px radius, 20px height, transparent + shadow-subtle,
//       pill dot 6×6 in the semantic --managed-system-* token color
//     - Owner avatar 18px circle, white 9px initial, semantic fallback fill
//   list row (MLS-1019):
//     - row title 13px / weight 600 with visible 8px badge gaps, truncation kept
//     - compact Tableau pill / Revenue badge, trailing 18px owner avatar
//     - meta icons 10px, meta gap 10px
test.describe('milestone fidelity (final pixel pass)', () => {
  test('renders detail typography, compact badges, and the owner avatar to prototype values', async ({
    page,
  }) => {
    await installMockApi(page, { milestones: true });
    await page.goto(`/tasks?view=milestones&param=${MILESTONE_IDS.sso}`);

    const detail = page.getByTestId('app-detail-slot');
    await expect(detail.getByRole('heading', { name: 'SSO Stabilization' })).toBeVisible();
    await expect(detail.getByText('Owner', { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const captured = await detail.evaluate((root) => {
      // Own-text match: pills/badges keep their text in a node that also
      // carries the dot element, so leaf matching alone cannot find them.
      const ownText = (element: Element): string =>
        Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join('')
          .trim();
      const findByOwnText = (text: string): HTMLElement => {
        const match = Array.from(root.querySelectorAll<HTMLElement>('*')).find(
          (element) => ownText(element) === text,
        );
        if (match === undefined) throw new Error(`Expected an element with text ${text}`);
        return match;
      };

      const cs = getComputedStyle(root);
      const triplet = (token: string): [number, number, number] => {
        const raw = cs.getPropertyValue(token).trim();
        if (!/^\d+ \d+ \d+$/.test(raw)) throw new Error(`Expected ${token} to be an R G B triplet`);
        return raw.split(' ').map(Number) as [number, number, number];
      };
      const rgb = (token: string): string => `rgb(${triplet(token).join(', ')})`;

      const box = (element: Element): { w: number; h: number } => {
        const rect = element.getBoundingClientRect();
        return { w: rect.width, h: rect.height };
      };

      // Section titles — every detail h3 (nav entries are buttons, not h3).
      const sections = Array.from(root.querySelectorAll('h3')).map((title) => {
        const style = getComputedStyle(title);
        return {
          label: (title.textContent ?? '').trim(),
          fontSize: style.fontSize,
          marginBottom: style.marginBottom,
        };
      });
      const sourceTitle = sections.find((section) => section.label === 'Source');
      if (sourceTitle === undefined) throw new Error('Expected the Source section title');
      const sourceTitleEl = Array.from(root.querySelectorAll('h3')).find(
        (title) => (title.textContent ?? '').trim() === 'Source',
      );
      if (sourceTitleEl === undefined) throw new Error('Expected the Source title element');
      const sourceCard = sourceTitleEl.parentElement?.nextElementSibling;
      if (!(sourceCard instanceof HTMLElement)) {
        throw new Error('Expected the source card after the Source title row');
      }
      const findingTitle = sourceCard.children[1];
      const findingId = findingTitle?.firstElementChild;
      const evidenceBadge = sourceCard.children[3]?.firstElementChild;
      if (!(findingTitle instanceof HTMLElement) || !(findingId instanceof HTMLElement)) {
        throw new Error('Expected the source finding title and id');
      }

      const headline = findByOwnText('0 of 1 tasks released');

      // Title block (Overview) — pill and area badge next to the h2.
      const heading = Array.from(root.querySelectorAll('h2')).find(
        (el) => (el.textContent ?? '').trim() === 'SSO Stabilization',
      );
      if (heading === undefined) throw new Error('Expected the milestone h2');
      const titlePill = findByOwnText('Power BI');

      // Source header action — prototype .btn-sm: 24px high, 12px label,
      // 11px arrow (styles.css .btn-sm; screen-milestones.jsx source header).
      const openButton = findByOwnText('Open finding');
      const openArrow = openButton.querySelector('svg');
      const openCss = {
        height: `${openButton.getBoundingClientRect().height}px`,
        fontSize: getComputedStyle(openButton).fontSize,
        arrow:
          openArrow === null
            ? null
            : (() => {
                const rect = openArrow.getBoundingClientRect();
                return { width: `${rect.width}px`, height: `${rect.height}px` };
              })(),
      };

      // Properties — pill, area badge, owner chip avatar.
      const msLabel = findByOwnText('Managed System');
      const msValue = msLabel.parentElement?.querySelector(':scope > div');
      const areaLabel = findByOwnText('Analytics Area');
      const areaValue = areaLabel.parentElement?.querySelector(':scope > div');
      const ownerLabel = findByOwnText('Owner');
      const ownerValue = ownerLabel.parentElement?.querySelector(':scope > div');
      const ownerChip = ownerValue?.firstElementChild;
      const ownerAvatar = ownerChip?.firstElementChild;
      const propertiesPill = msValue?.firstElementChild;
      const propertiesBadge = areaValue?.firstElementChild;
      if (
        !(ownerChip instanceof HTMLElement) ||
        !(ownerAvatar instanceof HTMLElement) ||
        !(propertiesPill instanceof HTMLElement) ||
        !(propertiesBadge instanceof HTMLElement)
      ) {
        throw new Error('Expected the Properties pill, badge, and owner chip');
      }

      const pillCss = (pill: HTMLElement, dotToken: string) => {
        const style = getComputedStyle(pill);
        const dot = pill.querySelector<HTMLElement>('span[aria-hidden="true"]');
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          borderRadius: style.borderRadius,
          height: `${box(pill).h}px`,
          color: style.color,
          background: style.backgroundColor,
          columnGap: style.columnGap,
          dot:
            dot === null
              ? null
              : {
                  width: getComputedStyle(dot).width,
                  height: getComputedStyle(dot).height,
                  radius: getComputedStyle(dot).borderRadius,
                  background: getComputedStyle(dot).backgroundColor,
                  expected: rgb(dotToken),
                },
        };
      };

      const badgeCss = (badge: HTMLElement) => {
        const style = getComputedStyle(badge);
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          borderRadius: style.borderRadius,
          color: style.color,
          background: style.backgroundColor,
        };
      };

      return {
        secondary: rgb('--color-light-steel'),
        muted: rgb('--color-storm-cloud'),
        accent: rgb('--color-aether-blue'),
        sections,
        headlineSize: getComputedStyle(headline).fontSize,
        openButton: openCss,
        source: {
          titleSize: getComputedStyle(findingTitle).fontSize,
          idMarginRight: getComputedStyle(findingId).marginRight,
          cardMarginTop: getComputedStyle(sourceCard).marginTop,
          cardRowGap: getComputedStyle(sourceCard).rowGap,
        },
        titlePill: pillCss(titlePill, '--managed-system-power-bi'),
        propertiesPill: pillCss(propertiesPill, '--managed-system-power-bi'),
        propertiesBadge: badgeCss(propertiesBadge),
        evidenceBadge: evidenceBadge instanceof HTMLElement ? badgeCss(evidenceBadge) : null,
        ownerAvatar: {
          width: getComputedStyle(ownerAvatar).width,
          height: getComputedStyle(ownerAvatar).height,
          fontSize: getComputedStyle(ownerAvatar).fontSize,
          color: getComputedStyle(ownerAvatar).color,
          background: getComputedStyle(ownerAvatar).backgroundColor,
          radius: getComputedStyle(ownerAvatar).borderRadius,
          initial: (ownerAvatar.textContent ?? '').trim(),
        },
      };
    });

    // Section titles: 11px, 10px wrapper rhythm (Source title row is mb-0;
    // its 10px gap is asserted on the card below).
    for (const section of captured.sections) {
      const expectedMargin = section.label === 'Source' ? '0px' : '10px';
      expect.soft(section.fontSize, `section ${section.label} font`).toBe('11px');
      expect
        .soft(section.marginBottom, `section ${section.label} bottom rhythm`)
        .toBe(expectedMargin);
    }

    // Progress headline and source finding title: 13px.
    expect.soft(captured.headlineSize, 'progress headline font').toBe('13px');
    // Source header action: .btn-sm 24px high, 12px label, 11px arrow.
    expect.soft(captured.openButton.height, 'open finding height').toBe('24px');
    expect.soft(captured.openButton.fontSize, 'open finding font').toBe('12px');
    expect.soft(captured.openButton.arrow, 'open finding arrow').toEqual({
      width: '11px',
      height: '11px',
    });
    expect.soft(captured.source.titleSize, 'source finding title font').toBe('13px');
    expect.soft(captured.source.idMarginRight, 'source id right margin').toBe('6px');
    expect.soft(captured.source.cardMarginTop, 'source card top gap').toBe('10px');
    expect.soft(captured.source.cardRowGap, 'source card gap').toBe('6px');

    // Compact prototype pill: 11px/500, 4px radius, 20px height, secondary
    // text, transparent surface, 6×6 dot in the semantic token color.
    const expectedPill = {
      fontSize: '11px',
      fontWeight: '500',
      borderRadius: '4px',
      height: '20px',
      color: captured.secondary,
      background: 'rgba(0, 0, 0, 0)',
    };
    for (const [surface, pill] of [
      ['title block', captured.titlePill],
      ['properties', captured.propertiesPill],
    ] as const) {
      expect.soft(pill.fontSize, `${surface} pill font`).toBe(expectedPill.fontSize);
      expect.soft(pill.fontWeight, `${surface} pill weight`).toBe(expectedPill.fontWeight);
      expect.soft(pill.borderRadius, `${surface} pill radius`).toBe(expectedPill.borderRadius);
      expect.soft(pill.height, `${surface} pill height`).toBe(expectedPill.height);
      expect.soft(pill.color, `${surface} pill text`).toBe(expectedPill.color);
      expect.soft(pill.background, `${surface} pill surface`).toBe(expectedPill.background);
      expect.soft(pill.dot, `${surface} pill dot`).toEqual({
        width: '6px',
        height: '6px',
        radius: '9999px',
        background: `rgb(242, 196, 109)`,
        expected: 'rgb(242, 196, 109)',
      });
    }

    // Compact prototype outline badge: 11px/500, 4px radius, muted on
    // transparent (never the heavy rounded-full primary treatment).
    const expectedBadge = {
      fontSize: '11px',
      fontWeight: '500',
      borderRadius: '4px',
      color: captured.muted,
      background: 'rgba(0, 0, 0, 0)',
    };
    expect.soft(captured.propertiesBadge, 'area badge').toEqual(expectedBadge);
    expect.soft(captured.evidenceBadge, 'evidence badge').toEqual(expectedBadge);

    // Owner avatar: 18px circle, white 9px initial, semantic fallback fill.
    // AvatarUser carries no color, so the fill is the single documented
    // semantic fallback (--color-aether-blue); per-person prototype colors
    // are a data-shape limitation, not a design deviation.
    expect.soft(captured.ownerAvatar.width, 'owner avatar width').toBe('18px');
    expect.soft(captured.ownerAvatar.height, 'owner avatar height').toBe('18px');
    expect.soft(captured.ownerAvatar.fontSize, 'owner avatar initial size').toBe('9px');
    expect
      .soft(captured.ownerAvatar.color, 'owner avatar initial color')
      .toBe('rgb(255, 255, 255)');
    expect.soft(captured.ownerAvatar.background, 'owner avatar fill').toBe(captured.accent);
    expect.soft(captured.ownerAvatar.radius, 'owner avatar radius').toBe('9999px');
    expect.soft(captured.ownerAvatar.initial, 'owner avatar initial').toBe('박');
  });

  test('renders list row title, compact badges, owner avatar, and meta icons to prototype values', async ({
    page,
  }) => {
    await installMockApi(page, { milestones: true });
    await page.goto('/tasks?view=milestones');

    const row = page.locator('[role="button"]', { hasText: 'MLS-1019' });
    await expect(row).toContainText('Reporting Performance');
    await page.evaluate(() => document.fonts.ready);

    const captured = await row.evaluate((root) => {
      const ownText = (element: Element): string =>
        Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join('')
          .trim();
      const findByOwnText = (text: string): HTMLElement => {
        const match = Array.from(root.querySelectorAll<HTMLElement>('*')).find(
          (element) => ownText(element) === text,
        );
        if (match === undefined) throw new Error(`Expected an element with text ${text}`);
        return match;
      };
      const cs = getComputedStyle(root);
      const triplet = (token: string): [number, number, number] => {
        const raw = cs.getPropertyValue(token).trim();
        if (!/^\d+ \d+ \d+$/.test(raw)) throw new Error(`Expected ${token} to be an R G B triplet`);
        return raw.split(' ').map(Number) as [number, number, number];
      };
      const rgb = (token: string): string => `rgb(${triplet(token).join(', ')})`;

      // Title line — the inner 13px/600 title span inside the badge wrapper.
      const titleSpan = findByOwnText('Reporting Performance');
      const badgeWrapper = titleSpan.parentElement;
      if (badgeWrapper === null) throw new Error('Expected the title badge wrapper');
      const statusBadge = badgeWrapper.querySelector('span');
      if (statusBadge === null) throw new Error('Expected the status badge after the title');

      // Pill (Tableau) and area badge (Revenue) in the same line.
      const pill = findByOwnText('Tableau');
      const areaBadge = findByOwnText('Revenue');

      // Trailing owner avatar — last grid cell.
      const trailing = root.lastElementChild?.firstElementChild;
      if (!(trailing instanceof HTMLElement)) throw new Error('Expected the trailing avatar');

      // Meta line — second content row under the title line.
      const body = titleSpan.closest('div.min-w-0')?.parentElement;
      const metaRow = body?.children[2];
      if (!(metaRow instanceof HTMLElement)) throw new Error('Expected the meta row');
      const metaIcons = Array.from(metaRow.querySelectorAll('svg')).map((svg) => {
        const rect = svg.getBoundingClientRect();
        return { width: `${rect.width}px`, height: `${rect.height}px` };
      });

      const pillStyle = getComputedStyle(pill);
      const pillDot = pill.querySelector<HTMLElement>('span[aria-hidden="true"]');
      return {
        secondary: rgb('--color-light-steel'),
        muted: rgb('--color-storm-cloud'),
        accent: rgb('--color-aether-blue'),
        tableau: rgb('--managed-system-tableau'),
        title: {
          fontSize: getComputedStyle(titleSpan).fontSize,
          fontWeight: getComputedStyle(titleSpan).fontWeight,
          overflowX: getComputedStyle(titleSpan).overflowX,
          textOverflow: getComputedStyle(titleSpan).textOverflow,
          wrapperGap: getComputedStyle(badgeWrapper).columnGap,
          lineGap: getComputedStyle(titleSpan.closest('div') ?? badgeWrapper).columnGap,
        },
        pill: {
          fontSize: pillStyle.fontSize,
          fontWeight: pillStyle.fontWeight,
          borderRadius: pillStyle.borderRadius,
          height: `${pill.getBoundingClientRect().height}px`,
          color: pillStyle.color,
          background: pillStyle.backgroundColor,
          dot:
            pillDot === null
              ? null
              : {
                  width: getComputedStyle(pillDot).width,
                  height: getComputedStyle(pillDot).height,
                  radius: getComputedStyle(pillDot).borderRadius,
                  background: getComputedStyle(pillDot).backgroundColor,
                  expected: rgb('--managed-system-tableau'),
                },
        },
        areaBadge: {
          fontSize: getComputedStyle(areaBadge).fontSize,
          fontWeight: getComputedStyle(areaBadge).fontWeight,
          borderRadius: getComputedStyle(areaBadge).borderRadius,
          color: getComputedStyle(areaBadge).color,
          background: getComputedStyle(areaBadge).backgroundColor,
        },
        avatar: {
          width: getComputedStyle(trailing).width,
          height: getComputedStyle(trailing).height,
          fontSize: getComputedStyle(trailing).fontSize,
          color: getComputedStyle(trailing).color,
          background: getComputedStyle(trailing).backgroundColor,
          radius: getComputedStyle(trailing).borderRadius,
          initial: (trailing.textContent ?? '').trim(),
        },
        metaIcons,
        metaGap: getComputedStyle(metaRow).columnGap,
      };
    });

    // Row title: 13px / 600 with visible 8px gaps, truncation preserved.
    expect.soft(captured.title.fontSize, 'row title font').toBe('13px');
    expect.soft(captured.title.fontWeight, 'row title weight').toBe('600');
    expect.soft(captured.title.overflowX, 'row title truncation clip').toBe('hidden');
    expect.soft(captured.title.textOverflow, 'row title ellipsis').toBe('ellipsis');
    expect.soft(captured.title.wrapperGap, 'row title badge gap').toBe('8px');
    expect.soft(captured.title.lineGap, 'row title line gap').toBe('8px');

    // Compact pill with the Tableau semantic dot.
    expect.soft(captured.pill.fontSize, 'row pill font').toBe('11px');
    expect.soft(captured.pill.fontWeight, 'row pill weight').toBe('500');
    expect.soft(captured.pill.borderRadius, 'row pill radius').toBe('4px');
    expect.soft(captured.pill.height, 'row pill height').toBe('20px');
    expect.soft(captured.pill.color, 'row pill text').toBe(captured.secondary);
    expect.soft(captured.pill.background, 'row pill surface').toBe('rgba(0, 0, 0, 0)');
    expect.soft(captured.pill.dot, 'row pill dot').toEqual({
      width: '6px',
      height: '6px',
      radius: '9999px',
      background: captured.tableau,
      expected: captured.tableau,
    });

    // Compact area badge.
    expect.soft(captured.areaBadge, 'row area badge').toEqual({
      fontSize: '11px',
      fontWeight: '500',
      borderRadius: '4px',
      color: captured.muted,
      background: 'rgba(0, 0, 0, 0)',
    });

    // Trailing owner avatar — same semantic fallback as the detail Owner.
    expect.soft(captured.avatar.width, 'row avatar width').toBe('18px');
    expect.soft(captured.avatar.height, 'row avatar height').toBe('18px');
    expect.soft(captured.avatar.fontSize, 'row avatar initial size').toBe('9px');
    expect.soft(captured.avatar.color, 'row avatar initial color').toBe('rgb(255, 255, 255)');
    expect.soft(captured.avatar.background, 'row avatar fill').toBe(captured.accent);
    expect.soft(captured.avatar.radius, 'row avatar radius').toBe('9999px');
    expect.soft(captured.avatar.initial, 'row avatar initial').toBe('김');

    // Meta line: 10px icons, 10px gap.
    expect.soft(captured.metaIcons, 'meta icon sizes').toEqual([
      { width: '10px', height: '10px' },
      { width: '10px', height: '10px' },
    ]);
    expect.soft(captured.metaGap, 'meta gap').toBe('10px');
  });
});
