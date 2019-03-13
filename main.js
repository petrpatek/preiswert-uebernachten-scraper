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
            const gpages = [];
            const cpages = [];
            console.log(request.userData.label === 'start-page');
            if (request.userData.label === 'start-page') {
                const links = await page.evaluate(() => {
                    const result = [];
                    $('#navigation > li a').each((index, element) => {
                        result.push({
                            title: $(element).text().trim(),
                            url: $(element).attr('href'),
                        });
                    });
                    return result;
                });
                for (const { url, title } of links) { // could be imroved via promise all and batch processing
                    await requestQueue.addRequest({
                        url,
                        userData: {
                            label: 'glossary-page',
                        },
                    });
                    await Apify.pushData({ title, url });
                }

                await Apify.pushData({
                    type: request.userData.label,
                    glossaries: gpages,
                });
            } else if (request.userData.label === 'glossary-page') {
                const { items, glossary_letter } = await page.evaluate(() => {
                    const items = [];
                    $('div.full-rel-left.list-of-places.mb15.mt20 li a').each((index, element) => {
                        items.push({
                            url: $(element).attr('href'),
                            title: $(element).text().trim(),

                        });
                    });
                    return {
                        items,
                        glossary_letter: $('body > div.container > div.row.full-rel-left.content > div > h1 > span').text().trim(),
                    };
                });
                for (const { url, title } of items) {
                    await requestQueue.addRequest({
                        url,
                        label: 'city-page',

                    });
                    cpages.push({ title, url });
                }
                await Apify.pushData({
                    type: request.userData.label,
                    glossary_letter,
                    cities: cpages,
                });
            } else if (request.userData.label === 'city-page') {
                const { items, city } = await page.evaluate(() => {
                    const items = [];
                    const city = $('body > div.container > div.row.full-rel-left.content > div.full-rel-left > h1').text().trim();
                    $('ul.hotels-list div.title-address').each((index, element) => {
                        result.push({
                            city: $('body > div.container > div.row.full-rel-left.content > div.full-rel-left > h1').text().trim(),
                            name: $(element).find('a').text().trim(),
                            addr_full: $(element).find('div[itemprop=address]').text().trim(),
                            addr_street: $(element).find('div[itemprop=address] span[itemprop=streetAddress]').text().trim(),
                            addr_postalcode: $(element).find('div[itemprop=address] span[itemprop=postalCode]').text().trim(),
                            addr_locality: $(element).find('div[itemprop=address] span[itemprop=addressLocality]').text().trim(),
                            price_range: $(element).closest('div.content').find('li[itemprop=priceRange]').text()
                                .trim(),
                            url: $(element).find('a').attr('href'),
                        });
                    });
                    return { items, city };
                });
                for (const { url } of items) {
                    await requestQueue.addRequest({
                        url,
                        userData: {
                            label: 'hotel-page',
                        },

                    });
                }

                await Apify.pushData({
                    type: request.userData.label,
                    city,
                    hotels: items,
                });
            } else if (request.userData.label === 'hotel-page') {
                const hotel = await page.evaluate(() => {
                    const hotel_data = {
                        name: $('body div.hotel-view h1').text().trim(),
                        address: $('div.hotel-view div.address > p:first').text().trim().replace(/\t| +/g, ' '),
                        phone: ($('div.hotel-view div.address').text().match(/(?:(?:^|\n) *)Telefon: (.+)(?:\n|$)/) || ['']).pop().trim(),
                        fax: ($('div.hotel-view div.address').text().match(/(?:(?:^|\n) *)Fax: (.+)(?:\n|$)/) || ['']).pop().trim(),
                        email: ($('div.hotel-view div.address').text().match(/(?:(?:^|\n) *)E-Mail: (.+)(?:\n|$)/) || ['']).pop().trim(),
                        website: ($('div.hotel-view div.address').text().match(/(?:(?:^|\n) *)Web: (.+)(?:\n|$)/) || ['']).pop().trim(),
                        number_of_beds: ($('div.hotel-view div.hotel-features').text().match(/Anzahl der Betten: (.+)(?:\n|$)/) || ['']).pop().trim(),
                        owner: ($('div.hotel-view div.address').text().match(/(?:(?:^|\n) *)Inhaber: (.+)(?:\n|$)/) || ['']).pop().trim(),
                        amenities: $('div.hotel-view div.hotel-features div.room-facilities').parent().find('ul li').map(function () { return $(this).text(); })
                            .get(),
                    };

                    if ($('#mapDiv a[jsaction="mouseup:placeCard.largerMap"]')) {
                        try {
                            hotel_data.lon = ($('#mapDiv a[jsaction="mouseup:placeCard.largerMap"]').href.match(/(?:\/maps\?ll=)(?:-?\d+\.\d*)(?:,)(-?\d+\.\d*)/) || ['']).pop().trim();
                            hotel_data.lat = ($('#mapDiv a[jsaction="mouseup:placeCard.largerMap"]').href.match(/(?:\/maps\?ll=)(-?\d+\.\d*)(?:,)(?:-?\d+\.\d*)/) || ['']).pop().trim();
                        } catch (error) {
                            hotel_data.lon = null;
                            hotel_data.lat = null;
                        }
                    }
                });

                await Apify.pushData({
                    url: request.url,
                    type: request.userData.label,
                    ...hotel,

                });
            }
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
