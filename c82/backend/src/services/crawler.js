const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');

const config = {
  headless: process.env.PUPPETEER_HEADLESS !== 'false',
  slowMo: parseInt(process.env.PUPPETEER_SLOW_MO || '0'),
  timeout: parseInt(process.env.WAIT_FOR_TIMEOUT || '30000'),
  networkIdleTimeout: parseInt(process.env.WAIT_FOR_NETWORK_IDLE || '2000'),
  scrollEnabled: process.env.SCROLL_ENABLED !== 'false',
  scrollStep: parseInt(process.env.SCROLL_STEP || '500'),
  scrollDelay: parseInt(process.env.SCROLL_DELAY || '200'),
  maxScrollAttempts: parseInt(process.env.MAX_SCROLL_ATTEMPTS || '10'),
  screenWidth: parseInt(process.env.SCREEN_WIDTH || '1920'),
  screenHeight: parseInt(process.env.SCREEN_HEIGHT || '1080'),
};

class Crawler {
  constructor() {
    this.browser = null;
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: config.headless ? 'new' : false,
        slowMo: config.slowMo,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1920,1080',
        ],
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async fetchPage(url, options = {}) {
    const {
      usePuppeteer = true,
      enableScroll = config.scrollEnabled,
      waitForSelector = '',
      customTimeout = config.timeout,
    } = options;

    if (!usePuppeteer) {
      return this.fetchPageSimple(url);
    }

    let page = null;
    try {
      const browser = await this.initBrowser();
      page = await browser.newPage();
      
      await page.setViewport({
        width: config.screenWidth,
        height: config.screenHeight,
      });

      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: customTimeout,
      });

      await this.waitForNetworkIdle(page);

      if (waitForSelector) {
        try {
          await page.waitForSelector(waitForSelector, {
            timeout: Math.min(customTimeout, 10000),
          });
        } catch (e) {
          console.warn(`Selector ${waitForSelector} not found, continuing...`);
        }
      }

      if (enableScroll) {
        await this.autoScroll(page);
      }

      await this.waitForLazyImages(page);
      await this.waitForDynamicContent(page);

      const content = await page.content();
      const stats = await this.extractPageStats(page, content);

      await page.close();

      return {
        success: true,
        content,
        status: response?.status() || 200,
        stats,
        renderEngine: 'puppeteer',
      };
    } catch (error) {
      if (page) {
        try {
          await page.close();
        } catch (e) {}
      }
      console.error(`Error fetching ${url}:`, error.message);
      return {
        success: false,
        error: error.message,
        status: 500,
      };
    }
  }

  async fetchPageSimple(url) {
    try {
      const axios = require('axios');
      const response = await axios.get(url, {
        timeout: config.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const content = response.data;
      const stats = this.extractSimpleStats(content);

      return {
        success: true,
        content,
        status: response.status,
        stats,
        renderEngine: 'simple',
      };
    } catch (error) {
      console.error(`Error fetching simple ${url}:`, error.message);
      return {
        success: false,
        error: error.message,
        status: error.response?.status || 500,
      };
    }
  }

  async extractPageStats(page, content) {
    try {
      const stats = await page.evaluate(() => {
        return {
          contentLength: document.documentElement.outerHTML.length,
          textLength: document.body?.textContent?.trim().length || 0,
          linkCount: document.querySelectorAll('a').length,
          imageCount: document.querySelectorAll('img').length,
        };
      });
      return stats;
    } catch (error) {
      return this.extractSimpleStats(content);
    }
  }

  extractSimpleStats(content) {
    const $ = cheerio.load(content);
    return {
      contentLength: content.length,
      textLength: $('body').text().trim().length,
      linkCount: $('a').length,
      imageCount: $('img').length,
    };
  }

  async waitForNetworkIdle(page) {
    let lastNetworkActivity = Date.now();
    let inflightRequests = 0;

    page.on('request', () => {
      inflightRequests++;
      lastNetworkActivity = Date.now();
    });

    page.on('requestfinished', () => {
      inflightRequests--;
      lastNetworkActivity = Date.now();
    });

    page.on('requestfailed', () => {
      inflightRequests--;
      lastNetworkActivity = Date.now();
    });

    return new Promise((resolve) => {
      const checkIdle = () => {
        const now = Date.now();
        if (now - lastNetworkActivity >= config.networkIdleTimeout && inflightRequests === 0) {
          resolve();
        } else {
          setTimeout(checkIdle, 100);
        }
      };
      setTimeout(checkIdle, 100);
    });
  }

  async autoScroll(page) {
    await page.evaluate(async (scrollStep, scrollDelay, maxAttempts) => {
      return new Promise((resolve) => {
        let totalHeight = 0;
        let attempts = 0;
        let lastHeight = document.body.scrollHeight;

        const timer = setInterval(() => {
          window.scrollBy(0, scrollStep);
          totalHeight += scrollStep;
          attempts++;

          const currentHeight = document.body.scrollHeight;
          if (currentHeight > lastHeight) {
            lastHeight = currentHeight;
            attempts = 0;
          }

          if (
            totalHeight >= currentHeight ||
            attempts >= maxAttempts ||
            document.body.scrollHeight === lastHeight
          ) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            setTimeout(resolve, scrollDelay);
          }
        }, scrollDelay);
      });
    }, config.scrollStep, config.scrollDelay, config.maxScrollAttempts);

    await new Promise(resolve => setTimeout(resolve, config.scrollDelay));
  }

  async waitForLazyImages(page) {
    try {
      await page.evaluate(() => {
        const lazyImages = document.querySelectorAll('img[loading="lazy"], img[data-src], img[data-lazy]');
        lazyImages.forEach(img => {
          if (img.dataset.src) {
            img.src = img.dataset.src;
          }
          if (img.dataset.lazy) {
            img.src = img.dataset.lazy;
          }
          img.removeAttribute('loading');
          img.removeAttribute('data-src');
          img.removeAttribute('data-lazy');
        });
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Error waiting for lazy images:', error.message);
    }
  }

  async waitForDynamicContent(page) {
    try {
      await page.evaluate(() => {
        const loaders = document.querySelectorAll('[class*="loading"], [class*="loader"], [class*="spinner"]');
        loaders.forEach(loader => {
          loader.style.display = 'none';
        });
      });

      await page.waitForFunction(
        () => {
          const dynamicElements = document.querySelectorAll('[data-dynamic], [data-loaded]');
          return dynamicElements.length === 0 || 
            Array.from(dynamicElements).every(el => el.dataset.loaded === 'true');
        },
        { timeout: 5000 }
      ).catch(() => {});

    } catch (error) {
      console.error('Error waiting for dynamic content:', error.message);
    }
  }

  normalizeDOM(html) {
    const $ = cheerio.load(html, { normalizeWhitespace: true, xmlMode: false });
    
    $('script').remove();
    $('style').remove();
    $('noscript').remove();
    $('iframe').remove();
    $('svg').remove();
    
    $('[style]').removeAttr('style');
    $('[class]').removeAttr('class');
    $('[id]').removeAttr('id');
    $('[data-*]').removeAttr('data-*');
    
    $('*').each((_, elem) => {
      Object.keys(elem.attribs || {}).forEach(attr => {
        if (attr.startsWith('data-') || attr.startsWith('aria-') || attr === 'tabindex') {
          delete elem.attribs[attr];
        }
      });
    });

    return $.html();
  }

  calculateDOMHash(html) {
    const normalized = this.normalizeDOM(html);
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  extractTextNodes(html) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const walker = doc.createTreeWalker(
      doc.body,
      dom.window.NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text && text.length > 1) {
        textNodes.push({
          text,
          path: this.getNodePath(node),
          parentTag: node.parentElement?.tagName,
        });
      }
    }
    return textNodes;
  }

  getNodePath(node) {
    const path = [];
    let current = node.parentElement;
    while (current) {
      const index = Array.from(current.parentNode?.children || []).indexOf(current) + 1;
      path.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  extractAttributes(html) {
    const $ = cheerio.load(html);
    const attributes = [];
    
    $('*').each((i, elem) => {
      const path = this.getCheerioPath($(elem));
      Object.entries(elem.attribs || {}).forEach(([name, value]) => {
        if (!name.startsWith('data-') && !name.startsWith('aria-')) {
          attributes.push({
            path,
            name,
            value,
            tag: elem.tagName,
          });
        }
      });
    });
    
    return attributes;
  }

  getCheerioPath($elem) {
    const path = [];
    let current = $elem;
    while (current.length && current[0].tagName) {
      const index = current.index() + 1;
      path.unshift(`${current[0].tagName}:nth-child(${index})`);
      current = current.parent();
    }
    return path.join(' > ');
  }
}

const crawler = new Crawler();

process.on('SIGINT', async () => {
  await crawler.closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await crawler.closeBrowser();
  process.exit(0);
});

module.exports = crawler;
