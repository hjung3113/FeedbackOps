import { DetailPanelFullscreenContext as platformContext } from '@ap/ui';
import { DetailPanelFullscreenContext as feedbackOpsContext } from '../index.js';
import { DetailPanelFullscreenContext as localModuleContext } from '../panel/DetailPanelFullscreenContext.js';

it('shares the @ap/ui fullscreen context with FeedbackOps consumers', () => {
  expect(feedbackOpsContext).toBe(platformContext);
  expect(localModuleContext).toBe(platformContext);
});
