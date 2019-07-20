/* eslint-disable node/no-unsupported-features */
const got = require("got");
const puppeteer = require("puppeteer");

module.exports = function({ imdb, title, year, country }) {
  var year_range = "1900,2019";

  if (imdb == null) {
    imdb = title;
  }

  if (year != null) {
    year_range = `${year},${year}`;
  }
  //  imdb = "tt0096874";

  const searchUrl = `https://unogs.com/?q=${imdb}-!${year_range}-!0,5-!0,10-!0,10-!Any-!Any-!Any-!Any-!I%20Don&cl=${country},&pt=&st=adv&p=1&ao=and`;

  return new Promise((resolve, reject) => {
    var Browser = null;
    var Page = null;

    // console.log(title);
    // console.log(searchUrl);

    puppeteer
      .launch({ headless: true })
      .then(browser => {
        // console.log("Browser created");
        Browser = browser;
        return Browser.newPage();
      })
      .then(page => {
        // console.log("Page created");
        Page = page;
        return Page.goto(searchUrl, { waitUntil: "networkidle0" });
      })
      .then(resp => {
        // console.log("Page loaded");

        return new Promise((resolve, reject) => {
          var result = Page.evaluate(() => {
            //return document.getElementById("results");
            var divResults = document.querySelector("#listdiv");
            var links = divResults.querySelectorAll("a");
            if (links.length > 0) {
              //TODO: Use this to check titles instead of IMDB ID (if other agent is used)
              /*
              links.forEach(link => {
                console.log(link.getAttribute("b"));
              });
              */
              return links[0].getAttribute("href");
            } else {
              return null;
            }
          });
          resolve(result);
        }).catch(err => {
          reject(err);
        });
      })
      .then(result => {
        var item = { imdb, title, year, country };
        if (!result) {
          result = null;
        } else {
          result = result.split(/\/video\/\?v\=/g)[1];
        }
        var data = {
          mediaItem: item,
          result: result
        };
        Browser.close();
        resolve(data);
      })
      .catch(err => {
        Browser.close();
        reject(err);
      });
  });

  /*
  return got(searchUrl).then(data => {
    console.log(searchUrl);

    if (!data || !data.body) {
      return [];
    }

    //var document = new dom().parseFromString(data.body);

    var results = xpath.select(
      "/html/body/div[@id='results']/div[@id='listdiv']",
      data.body
    );

    console.log(results);

    if (!data.body || !data.body.RESULT || !data.body.RESULT.country) {
      return [];
    }
    return data.body.RESULT.country.map(country => {
      return country[1];
    });
  });
  */
};
