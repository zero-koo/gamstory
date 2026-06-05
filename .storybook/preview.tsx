import type { Preview } from '@storybook/tanstack-react';
import { initialize, mswLoader } from 'msw-storybook-addon';
import '../src/styles/globals.css';

initialize({ onUnhandledRequest: 'bypass' });

const preview: Preview = {
  loaders: [mswLoader],
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'todo' },
  },
  globalTypes: {
    locale: {
      description: 'Locale',
      defaultValue: 'ko-KR',
      toolbar: {
        title: 'Locale',
        icon: 'globe',
        items: [
          { value: 'ko-KR', title: '한국어' },
          { value: 'en', title: 'English' },
        ],
        dynamicTitle: true,
      },
    },
  },
};

export default preview;
