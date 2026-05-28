const puppeteer = require('puppeteer');

(async () => {
  console.log("Starting browser...");
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));

  console.log("Navigating to http://localhost:5173/ ...");
  await page.goto('http://localhost:5173/');
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Try to click "New chat"
  console.log("Clicking New chat in sidebar...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent && b.textContent.includes('New chat'));
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Try to click "Comparison of specific products"
  console.log("Clicking Comparison scenario...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent && b.textContent.includes('Comparison of specific'));
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 2000));
  console.log("Taking screenshot to see if it's blank...");
  await page.screenshot({ path: 'screenshot.png' });

  console.log("Checking HTML content of main container...");
  const html = await page.evaluate(() => {
    const main = document.querySelector('.main-content');
    return main ? main.innerHTML.substring(0, 500) : "NO MAIN CONTENT";
  });
  console.log("Main content:", html);

  console.log("Done.");
  await browser.close();
})();
