/**
 * This example demonstrates how to use PuppeteerCrawler in combination with RequestList
 * and RequestQueue to recursively scrape Hacker News website (https://news.ycombinator.com)
 * using headless Chrome / Puppeteer.
 * The crawler starts with a single URL, finds links to next pages,
 * enqueues them and continues until no more desired links are available.
 * The results are stored to the default dataset. In local configuration,
 * the results are stored as JSON files in `./apify_storage/datasets/default`
 */

const Apify = require('apify');

Apify.main(async () => {
    // Create and initialize an instance of the RequestList class that contains the start URL.
    const requestList = new Apify.RequestList({
        sources: [
            {
                url: 'https://www.preiswert-uebernachten.de/pirna/hotel-zur-post/34',
                userData: {
                    label: 'start-page',
                } },
        ],
    });
    await requestList.initialize();

    // Apify.openRequestQueue() is a factory to get a preconfigured RequestQueue instance.
    const requestQueue = await Apify.openRequestQueue();

    // Create an instance of the PuppeteerCrawler class - a crawler
    // that automatically loads the URLs in headless Chrome / Puppeteer.
    const crawler = new Apify.PuppeteerCrawler({
        // The crawler will first fetch start URLs from the RequestList
        // and then the newly discovered URLs from the RequestQueue
        requestList,
        requestQueue,

        // Here you can set options that are passed to the Apify.launchPuppeteer() function.
        // For example, you can set "slowMo" to slow down Puppeteer operations to simplify debugging
        launchPuppeteerOptions: { slowMo: 500 },
        // This function will be called for each URL to crawl.
        // Here you can write the Puppeteer scripts you are familiar with,
        // with the exception that browsers and pages are automatically managed by the Apify SDK.
        // The function accepts a single parameter, which is an object with the following fields:
        // - request: an instance of the Request class with information such as URL and HTTP method
        // - page: Puppeteer's Page object (see https://pptr.dev/#show=api-class-page)
        handlePageFunction: async ({ request, page }) => {
            console.log(`Processing ${request.url}...`);
            await Apify.utils.puppeteer.injectJQuery(page);
            switch (request.userData.label) {
            case 'start-page':
                const gpages = [];

                const links = await page.evaluate(() => {
                    const result = [];
                    $('ul.alphabet > li a').each((index, element) => {
                        result.push({
                            title: $(element).text().trim(),
                            url: $(element).attr('href'),
                        });
                    });
                    return result;
                });
                for (const { url, title } of links) { // could be imroved via promise all and batch processing
                    await Promise.all([
                        requestQueue.addRequest({
                            url,
                            userData: {
                                label: 'glossary-page',
                            },
                        }),
                        Apify.pushData({ title, url }),
                    ]);
                }

                await Apify.pushData({
                    type: request.label,
                    glossaries: gpages,
                });
                break;
            }
            await Apify.utils.sleep(4000000);
        },

        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed too many times`);
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
});
