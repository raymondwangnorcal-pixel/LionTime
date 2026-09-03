const { chromium } = require('playwright');

(async () => {
  let count = 0;
  while (true) {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    const page = await context.newPage();
    await page.goto('https://lionhour.com', { waitUntil: 'networkidle' });
    await browser.close();
    count++;
    console.log(`Visit #${count} done`);
    await new Promise(r => setTimeout(r, 1000));
  }
})();
