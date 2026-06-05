import type { TestRunnerConfig } from '@storybook/test-runner';
import { getStoryContext } from '@storybook/test-runner';

const config: TestRunnerConfig = {
  async preVisit(page) {
    await page.evaluate(() => {
      window.localStorage.clear();
    });
  },
  async postVisit(page, context) {
    const storyContext = await getStoryContext(page, context);
    if (storyContext.tags?.includes('skip-test-runner')) return;
  },
};

export default config;
