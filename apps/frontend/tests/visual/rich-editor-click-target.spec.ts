import { expect, test } from './support/visual-test';

// Behavioural, not pixel: `minHeight` sizes the RichEditor wrapper, but the
// element TipTap actually makes editable (`.ProseMirror`) is only as tall as
// its content. When those two came apart, every composer in the app took focus
// only on its first line and the rest of the box was dead space. jsdom cannot
// see this — ProseMirror needs real layout — so the oracle lives here.
//
// `/dev-rich-editor` renders a RichEditor at minHeight 140 outside the authed
// tree, so no session or mock API is needed.

test.describe('RichEditor click target', () => {
  test('takes focus when the bottom of the box is clicked, not just the first line', async ({
    page,
  }) => {
    await page.goto('/dev-rich-editor');

    const editable = page.locator('.ProseMirror').first();
    await expect(editable).toBeVisible();
    await expect(editable).not.toBeFocused();

    const wrapper = page.locator('.rich-editor').first();
    const box = await wrapper.boundingBox();
    if (!box) throw new Error('rich editor wrapper has no layout box');
    expect(box.height).toBeGreaterThan(100);

    // Click low in the box — well past the first line, where the old dead zone
    // was. A few pixels above the bottom edge to stay clear of the border.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8);

    await expect(editable).toBeFocused();

    // And it is genuinely editable from there, not merely focused.
    await page.keyboard.type('bottom click reaches the editor');
    await expect(editable).toContainText('bottom click reaches the editor');
  });

  test('the editable element fills the wrapper rather than one line of it', async ({ page }) => {
    await page.goto('/dev-rich-editor');

    const wrapper = page.locator('.rich-editor').first();
    const editable = page.locator('.ProseMirror').first();
    await expect(editable).toBeVisible();

    const wrapperBox = await wrapper.boundingBox();
    const editableBox = await editable.boundingBox();
    if (!wrapperBox || !editableBox) throw new Error('missing layout box');

    // The editable area reaches the bottom of the wrapper, leaving only the
    // border. Padding belongs to `.ProseMirror` itself, so it must not show up
    // here as an inset that clicks fall into.
    const slack = wrapperBox.y + wrapperBox.height - (editableBox.y + editableBox.height);
    expect(slack).toBeLessThanOrEqual(4);
  });
});
