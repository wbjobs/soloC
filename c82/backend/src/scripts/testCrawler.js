require('dotenv').config();
const crawler = require('../services/crawler');

async function testLazyLoading() {
  console.log('=== 测试懒加载页面 ===');
  const result = await crawler.fetchPage('https://lazyload-demo.vercel.app/', {
    usePuppeteer: true,
    enableScroll: true,
  });
  
  if (result.success) {
    console.log('✓ 抓取成功');
    console.log(`  内容长度: ${result.stats?.contentLength}`);
    console.log(`  文本长度: ${result.stats?.textLength}`);
    console.log(`  图片数量: ${result.stats?.imageCount}`);
    console.log(`  链接数量: ${result.stats?.linkCount}`);
    console.log(`  渲染引擎: ${result.renderEngine}`);
    
    const hasLazyImages = result.content.includes('loading="lazy"') === false;
    console.log(`  懒加载图片处理: ${hasLazyImages ? '✓' : '✗'}`);
  } else {
    console.log(`✗ 抓取失败: ${result.error}`);
  }
  
  return result.success;
}

async function testInfiniteScroll() {
  console.log('\n=== 测试无限滚动页面 ===');
  const result = await crawler.fetchPage('https://the-internet.herokuapp.com/infinite_scroll', {
    usePuppeteer: true,
    enableScroll: true,
  });
  
  if (result.success) {
    console.log('✓ 抓取成功');
    console.log(`  内容长度: ${result.stats?.contentLength}`);
    console.log(`  文本长度: ${result.stats?.textLength}`);
    
    const scrollDivs = (result.content.match(/class="jscroll-added"/g) || []).length;
    console.log(`  滚动加载的DIV数量: ${scrollDivs}`);
    console.log(`  渲染引擎: ${result.renderEngine}`);
  } else {
    console.log(`✗ 抓取失败: ${result.error}`);
  }
  
  return result.success;
}

async function testDOMHash() {
  console.log('\n=== 测试DOM哈希计算 ===');
  const result1 = await crawler.fetchPage('https://example.com/', {
    usePuppeteer: true,
    enableScroll: false,
  });
  
  if (result1.success) {
    const hash1 = crawler.calculateDOMHash(result1.content);
    console.log(`  哈希1: ${hash1.substring(0, 16)}...`);
    
    const result2 = await crawler.fetchPage('https://example.com/', {
      usePuppeteer: true,
      enableScroll: false,
    });
    
    if (result2.success) {
      const hash2 = crawler.calculateDOMHash(result2.content);
      console.log(`  哈希2: ${hash2.substring(0, 16)}...`);
      console.log(`  一致性: ${hash1 === hash2 ? '✓ 相同' : '✗ 不同'}`);
    }
  }
  
  return true;
}

async function testSimpleMode() {
  console.log('\n=== 测试简单模式 (无Puppeteer) ===');
  const result = await crawler.fetchPage('https://example.com/', {
    usePuppeteer: false,
  });
  
  if (result.success) {
    console.log('✓ 抓取成功');
    console.log(`  内容长度: ${result.stats?.contentLength}`);
    console.log(`  渲染引擎: ${result.renderEngine}`);
  } else {
    console.log(`✗ 抓取失败: ${result.error}`);
  }
  
  return result.success;
}

async function runAllTests() {
  console.log('开始网页爬虫测试...\n');
  
  let passed = 0;
  let total = 0;
  
  const tests = [
    testLazyLoading,
    testInfiniteScroll,
    testDOMHash,
    testSimpleMode,
  ];
  
  for (const test of tests) {
    total++;
    try {
      if (await test()) {
        passed++;
      }
    } catch (error) {
      console.log(`✗ 测试异常: ${error.message}`);
    }
  }
  
  console.log('\n=== 测试结果 ===');
  console.log(`通过: ${passed}/${total}`);
  
  await crawler.closeBrowser();
  process.exit(passed === total ? 0 : 1);
}

if (require.main === module) {
  runAllTests();
}

module.exports = {
  testLazyLoading,
  testInfiniteScroll,
  testDOMHash,
  testSimpleMode,
};
