const cron = require('node-cron');
const urlModel = require('../models/urlModel');
const snapshotModel = require('../models/snapshotModel');
const diffModel = require('../models/diffModel');
const crawler = require('./crawler');
const diffCalculator = require('./diffCalculator');
const webhookService = require('./webhookService');

class Scheduler {
  constructor() {
    this.isRunning = false;
    this.crawlInterval = parseInt(process.env.CRAWL_INTERVAL || '6');
  }

  start() {
    const cronExpression = `0 */${this.crawlInterval} * * *`;
    console.log(`Starting scheduler with ${this.crawlInterval}-hour interval`);
    
    cron.schedule(cronExpression, () => {
      this.crawlAllUrls();
    });

    setTimeout(() => this.crawlAllUrls(), 5000);
  }

  async crawlAllUrls() {
    if (this.isRunning) {
      console.log('Crawl already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('Starting scheduled crawl...');

    try {
      const urls = await urlModel.getActiveUrls();
      console.log(`Found ${urls.length} active URLs to crawl`);

      for (const url of urls) {
        await this.crawlUrl(url);
      }

      console.log('Scheduled crawl completed');
    } catch (error) {
      console.error('Scheduled crawl failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  async crawlUrl(url) {
    console.log(`Crawling: ${url.url}`);
    
    try {
      const crawlOptions = {
        usePuppeteer: url.use_puppeteer !== 0,
        enableScroll: url.enable_scroll !== 0,
        waitForSelector: url.wait_for_selector || '',
        customTimeout: url.custom_timeout || 30000,
      };

      const result = await crawler.fetchPage(url.url, crawlOptions);
      
      if (!result.success) {
        console.log(`Failed to crawl ${url.url}: ${result.error}`);
        await snapshotModel.create(url.id, url.url, '', '', result.status, {}, result.renderEngine || 'simple');
        return;
      }

      const domHash = crawler.calculateDOMHash(result.content);
      const latestSnapshot = await snapshotModel.getLatestByUrlId(url.id);

      await snapshotModel.create(
        url.id,
        url.url,
        domHash,
        result.content,
        result.status,
        result.stats,
        result.renderEngine
      );

      console.log(`Crawled ${url.url}: hash=${domHash.substring(0, 8)}, contentLength=${result.stats?.contentLength || 0}`);

      if (latestSnapshot && latestSnapshot.dom_hash !== domHash) {
        console.log(`Changes detected for ${url.url}`);
        
        const newSnapshot = await snapshotModel.getLatestByUrlId(url.id);
        const diffResult = diffCalculator.compareSnapshots(latestSnapshot, newSnapshot);
        
        if (diffResult.hasChanges) {
          const diff = await diffModel.create(
            url.id,
            latestSnapshot.id,
            newSnapshot.id,
            diffResult.diffs,
            diffResult.stats
          );
          console.log(`Diff saved: ${diffResult.stats.changedNodes} nodes changed, +${diffResult.stats.addedText}/-${diffResult.stats.removedText} chars`);
          
          webhookService.notifySubscribers(diff.id).catch(error => {
            console.error('Failed to notify subscribers:', error);
          });
        }
      }

    } catch (error) {
      console.error(`Error crawling ${url.url}:`, error);
    }
  }

  async manualCrawl(urlId) {
    const url = await urlModel.getById(urlId);
    if (!url) {
      throw new Error('URL not found');
    }
    await this.crawlUrl(url);
  }
}

module.exports = new Scheduler();
