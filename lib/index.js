"use strict";

const PlexAPI = require("plex-api");
const _ = require("lodash");
const plex2NetflixServer = require("./apis/plex2netflix-server");
const rConsole = require("./report/console");
const promiseLimit = require("promise-limit");

const countries = {
  ar: "21",
  au: "23",
  be: "26",
  br: "29",
  ca: "33",
  cz: "307",
  fr: "45",
  de: "39",
  gr: "327",
  hk: "331",
  hu: "334",
  is: "265",
  in: "337",
  il: "336",
  it: "269",
  jp: "267",
  lt: "357",
  mx: "65",
  nl: "67",
  pl: "392",
  pt: "268",
  ro: "400",
  ru: "402",
  sg: "408",
  sk: "412",
  za: "447",
  kr: "348",
  es: "270",
  se: "73",
  ch: "34",
  th: "425",
  gb: "46",
  us: "78"
};

// Amount of concurrent calls to Plex to fetch metadata
const limit = promiseLimit(10);
let country = countries["se"];

const defaults = {
  hostname: "127.0.0.1",
  port: 32400,
  report: rConsole,
  showImdb: false
};

function exit(err) {
  console.error(String(err));
  process.exit(1); // eslint-disable-line no-process-exit
}

function executeSequentially(promiseFactories) {
  let result = Promise.resolve();
  promiseFactories.forEach(promiseFactory => {
    result = result.then(promiseFactory);
  });
  return result;
}

function Plex2Netflix(options) {
  this.options = Object.assign({}, defaults, options);
  this.summary = { size: 0, available: 0 };
  process.setMaxListeners(20);

  if (options.country != null && !countries[options.country]) {
    exit(
      "The country code: " +
        options.country +
        ", does not work with this application!"
    );
  } else {
    country = options.country;
  }

  this.plexClient = new PlexAPI(
    _.pick(this.options, "hostname", "port", "token", "username", "password")
  );

  this.plexClient
    .query("/library/sections")
    .then(result => {
      this.reportOption("connectSuccess");

      if (this.options.librarySections) {
        return this.findSpecificLibraries(result.MediaContainer.Directory);
      }

      return this.findAllLibraries(result.MediaContainer.Directory);
    })
    .then(sections => {
      return executeSequentially(
        sections.map(section => {
          return () => {
            this.reportOption("beforeSearchSection", section);
            return this.getMediaForSection(`/library/sections/${section.key}`);
          };
        })
      );
    })
    .then(() => {
      this.reportOption("afterSearch", this.summary);
    })
    .catch(exit);
}

Plex2Netflix.prototype.reportOption = function(option, first, second) {
  return this.options.report[option].call(this, first, second);
};

Plex2Netflix.prototype.findSpecificLibraries = function(sections) {
  const sectionResults = [];
  // Try to find all sections.
  this.options.librarySections.forEach(sectionTitle => {
    const theSection = _.find(sections, { title: sectionTitle });
    // If section can't be found, list all sections and exit.
    if (!theSection) {
      const sectionTitles = _.map(sections, "title");
      exit(
        new Error(
          `Library section "${sectionTitle}" not found. Searched in sections: ${sectionTitles.join(
            ", "
          )}`
        )
      );
    }

    sectionResults.push(theSection);
  });

  return sectionResults;
};

Plex2Netflix.prototype.findAllLibraries = function(sections) {
  // Only include show and movie libraries, and libraries with an agent.
  return sections.filter(section => {
    return (
      ["show", "movie"].indexOf(section.type) >= 0 &&
      section.agent !== "com.plexapp.agents.none"
    );
  });
};

Plex2Netflix.prototype.getMediaMetadata = function(mediaUri) {
  return this.plexClient.query(mediaUri).then(result => {
    if (
      result.MediaContainer.Metadata &&
      result.MediaContainer.Metadata.length
    ) {
      const firstChild = result.MediaContainer.Metadata[0];
      // Try to find the IMDB id in this mess.
      // TODO: Maybe iterate over the children until an IMDb id is found?
      const guid = firstChild.guid;
      let skip = false;
      let imdb;
      if (guid) {
        imdb = guid.match(/tt\d{7}/);
        if (imdb == null) {
          //Possibly a different agent such as the movie database.
          skip = true;
        }
      }

      // For TV shows `result.parentTitle` and `result.parentYear` should be used.
      // For movies, `firstChild.originalTitle` contains the title without translation.
      // If this is empty, `firstChild.title` should be used.
      const title =
        result.MediaContainer.parentTitle ||
        firstChild.originalTitle ||
        firstChild.title;
      return {
        imdb: imdb ? imdb[0] : null,
        title: this.filterTitle(title),
        year: result.MediaContainer.parentYear || firstChild.year,
        skip: skip,
        country: country
      };
    }
    return null;
  });
};

Plex2Netflix.prototype.filterTitle = function(title) {
  // Sometimes a title contains the year at the end, e.g. `The Americans (2013)`.
  // This needs to be filtered out.
  return String(title)
    .replace(/\(\d{4}\)$/g, "")
    .replace("'", "")
    .trim();
};

Plex2Netflix.prototype.getMediaForSection = function(sectionUri) {
  const maybeAddYear = this.options.year ? `?year=${this.options.year}` : "";

  return this.plexClient
    .query(`${sectionUri}/all${maybeAddYear}`)
    .then(result => {
      const media = result.MediaContainer.Metadata;
      if (!_.isArray(media) || !media.length) {
        exit(new Error("No media found in library section."));
      }

      // This counter keeps track of how many media is available on Netflix.
      let availableCounter = 0;

      const promiseFunctions = media.map(item => {
        return limit(() =>
          this.getMediaMetadata(item.key)
            .then(plex2NetflixServer)
            .then(args => {
              const mediaItem = args["mediaItem"];
              const result = args["result"];
              // If get a netflix ID, then assume it is available.
              if (result != null) {
                return this.reportOption("movieAvailable", mediaItem);
              }
              this.reportOption("movieUnavailable", mediaItem);
              /*
              if (countryList.indexOf(this.options.country) >= 0) {
                availableCounter += 1;
                return this.reportOption("movieAvailable", mediaItem);
              }
              this.reportOption("movieUnavailable", mediaItem);
              */
              return null;
            })
            .catch(err => {
              this.reportOption("movieError", item, err);
            })
        );
      });

      return Promise.all(promiseFunctions).then(() => {
        this.summary.size += media.length;
        this.summary.available += availableCounter;
      });
    })
    .catch(exit);
};

module.exports = Plex2Netflix;
