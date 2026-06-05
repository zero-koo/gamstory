import type { StorybookConfig } from '@storybook/tanstack-react';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-themes',
    '@storybook/addon-a11y',
    'msw-storybook-addon',
  ],
  framework: { name: '@storybook/tanstack-react', options: {} },
  staticDirs: ['../public'],
};

export default config;
