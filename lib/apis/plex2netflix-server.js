"use strict";

const got = require("got");
const unogsApi = require("./unogs");

/*
module.exports = function(media) {
  return new Promise((resolve, reject) => {
    got("https://plex2netflix.now.sh/search", {
      json: true,
      query: {
        imdb: media.imdb,
        title: media.imdb ? null : media.title,
        year: media.imdb ? null : media.year
      }
    })
      .then(response => {
        const countries = response.body.countries;
        resolve([media, countries]);
      })
      .catch(err => {
        console.log(err.response);
        reject(err);
      });
  });
};
*/

module.exports = function(media) {
  return new Promise((resolve, reject) => {
    const imdb = media.imdb;
    const title = media.title;
    const year = media.year;
    const skip = media.skip;
    const country = media.country;

    const getUnixTimestamp = () => Math.floor(Date.now() / 1000);

    if (!imdb && (!title || !year)) {
      reject("Add a 'imdb' or 'title' + 'year' query parameter.");
    }
    if (!imdb && skip) {
      reject(
        "This movie does not have a IMDB id. Possibly a different agent was used."
      );
    }

    unogsApi({ imdb, title, year, country })
      .then(result => {
        resolve(result);
      })
      .catch(err => {
        console.log(err);
        reject(err);
      });
  });
};

/*
    unogsApi({ imdb, title, year })
      .then(countryList => {
        const data = {
          countries: countryList,
          checkedAt: getUnixTimestamp()
        };

        console.log(countryList);
      })
      .catch(err => {
        if (err.response) {
          const code = err.response.statusCode;
          console.log("API error", "statusCode:", code);
        }
      });
  }); */
