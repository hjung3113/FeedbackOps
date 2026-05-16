import uiPreset from '@fops/ui/tailwind-preset';
import type { Config } from 'tailwindcss';

const config: Config = {
  presets: [uiPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
};

export default config;
