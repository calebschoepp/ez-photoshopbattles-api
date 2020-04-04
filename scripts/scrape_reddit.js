const snoowrap = require("snoowrap");
const cloudinary = require("cloudinary");
const axios = require("axios");
const { Client } = require("pg");
const postLimit = parseInt(process.env.POSTS_PER_CATEGORY);
const photoshopLimit = parseInt(process.env.PHOTOSHOPS_PER_POST);

const imgurBaseURL = "https://api.imgur.com/3";

class ImgurClient {
  async urlFromHash(imageHash) {
    const url = `${imgurBaseURL}/image/${imageHash}`;
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` }
      });
      return res.data.data.link;
    } catch (error) {
      return "IMGUR API FAILURE";
    }
  }

  async urlFromAlbum(albumHash) {
    const url = `${imgurBaseURL}/album/${albumHash}/images`;
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` }
      });
      const images = res.data.data;
      if (!images[0]) {
        throw new Error("No images in album");
      }
      return images[0].link;
    } catch (error) {
      return "IMGUR API FAILURE";
    }
  }
}

class CloudinaryClient {
  upload(image, opts) {
    return new Promise((resolve, reject) => {
      cloudinary.v2.uploader.upload(image, opts, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }

  deletePrefix(prefix) {
    return new Promise((resolve, reject) => {
      cloudinary.v2.api.delete_resources_by_prefix(prefix, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }

  deleteFolder(folder) {
    return new Promise((resolve, reject) => {
      cloudinary.v2.api.delete_folder(folder, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }

  getPrefix(prefix) {
    return new Promise((resolve, reject) => {
      cloudinary.v2.api.resources(
        { type: "upload", prefix: prefix },
        (err, res) => {
          if (err) return reject(err);
          return resolve(res);
        }
      );
    });
  }
}

class Scraper {
  constructor() {
    // Init snoowrap just to do something here
    this.r = new snoowrap({
      userAgent: process.env.REDDIT_USER_AGENT,
      clientId: process.env.REDDIT_CLIENT_ID,
      clientSecret: process.env.REDDIT_CLIENT_SECRET,
      refreshToken: process.env.REDDIT_REFRESH_TOKEN
    });

    this.cloudinary = new CloudinaryClient();
    this.imgur = new ImgurClient();
  }

  async run() {
    try {
      // Init postgres connection
      this.client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false
        }
      });
      await this.client.connect();
    } catch (err) {
      this._kill(err.message);
    }

    await this._preScrape();
    await this._scrape();
    await this._postScrape();
    await this._report();

    await this.client.end();
  }

  async _preScrape() {
    this._h1("Pre-Scraping");

    // Get the old cloudinary content prefix
    this.oldScrapingSessionID = null;
    const selectRes = await this.client.query(
      `SELECT * FROM scraping_sessions ORDER BY created_at ASC LIMIT 1;`
    );
    if (selectRes.rows[0]) {
      const id = selectRes.rows[0].id;
      this.oldScrapingSessionID = id;

      // Delete the old scraping_session if exists
      // Deleting this first so new clients won't be able to
      // access deleted photos as easily
      const deleteRes = await this.client.query(
        `DELETE FROM scraping_sessions WHERE id = $1;`,
        [id]
      );
    }
    console.log("Old scraping session deleted");

    // Insert a new scraping session and get the ID
    const insertRes = await this.client.query(
      `INSERT INTO scraping_sessions DEFAULT VALUES RETURNING id;`
    );
    this.newScrapingSessionID = insertRes.rows[0].id;
    console.log(
      `New scraping session inserted with id ${this.newScrapingSessionID}`
    );
  }

  async _scrape() {
    this._h1("Scraping");

    try {
      const subreddit = await this.r.getSubreddit("photoshopbattles");

      // Scrape every category
      let topDayPosts = await subreddit.getTop({
        time: "day",
        limit: postLimit
      });
      await this._handleCategory(topDayPosts, "top:day");

      let topWeekPosts = await subreddit.getTop({
        time: "week",
        limit: postLimit
      });
      await this._handleCategory(topWeekPosts, "top:week");

      let topMonthPosts = await subreddit.getTop({
        time: "month",
        limit: postLimit
      });
      await this._handleCategory(topMonthPosts, "top:month");

      let topYearPosts = await subreddit.getTop({
        time: "year",
        limit: postLimit
      });
      await this._handleCategory(topYearPosts, "top:year");

      let topAllPosts = await subreddit.getTop({
        time: "all",
        limit: postLimit
      });
      await this._handleCategory(topAllPosts, "top:all");

      let hotPosts = await subreddit.getHot({
        limit: postLimit
      });
      await this._handleCategory(hotPosts, "hot");

      let risingPosts = await subreddit.getRising({
        limit: postLimit
      });
      await this._handleCategory(risingPosts, "rising");
    } catch (error) {
      this._kill(error.message);
    }
  }

  async _postScrape() {
    this._h1("Post-Scraping");
    try {
      if (this.oldScrapingSessionID) {
        // Delete the old cloudinary content
        await this.cloudinary.deletePrefix(this.oldScrapingSessionID);

        // Delete the old cloudinary folder
        await this.cloudinary.deleteFolder(this.oldScrapingSessionID);
      }

      console.log("Old cloudinary content deleted");
    } catch (error) {
      console.log(
        "Something may have gone wrong while deleting old cloudinary resources"
      );
      console.log("It is possible it just has nothing to delete.");
      console.log(error.message);
    }
  }

  async _report() {
    this._h1("Reporting");
  }

  async _handleCategory(posts, categoryName) {
    this._h2(`Scraping ${categoryName}`);
    for (const post of posts) {
      await this._handlePost(post, categoryName);
    }
  }

  async _handlePost(post, categoryName) {
    // Insert post into DB
    const res = await this.client.query(
      "INSERT INTO posts (category_name, scraping_session_id, title, permalink, score) VALUES ($1, $2, $3, $4, $5) RETURNING id;",
      [
        categoryName,
        this.newScrapingSessionID,
        post.title,
        post.permalink,
        post.score
      ]
    );
    const postID = res.rows[0].id;

    // Add original photo to photos
    await this._handlePhoto(post.title, post.url, post.score, postID, true);

    // Photoshops come from the parent comments of the post
    // This is a naive approach that misses all other photoshops in children
    // Also naive in the way is scrapes the text and url
    // TODO: Improve this
    const comments = await post
      .expandReplies({ depth: 0 })
      .comments.sort((a, b) => (a.score < b.score ? 1 : -1)) // Sort func flipped to have highest first
      .slice(0, photoshopLimit + 1);
    for (const comment of comments) {
      const { text, url } = await this._parseComment(comment.body);
      await this._handlePhoto(text, url, comment.score, postID, false);
    }
  }

  async _handlePhoto(text, url, score, postID, isOriginal) {
    // We want to ignore any blank photos - ie. photos that didn't meet our narrow
    // specifications of url format, extension, markdown style etc.
    // TODO: lower how many of these there are by implementing features
    if (url === "" || text === "") {
      console.log(
        `Post ${postID}: ${isOriginal ? "[original]" : ""} ---INVALID---`
      );
      return;
    }

    if (url === "IMGUR API FAILURE") {
      console.log(
        `Post ${postID}: ${
          isOriginal ? "[original]" : ""
        } ---IMGUR API FAILURE---`
      );
      return;
    }

    try {
      const uploadResult = await this.cloudinary.upload(url, {
        folder: this.newScrapingSessionID,
        resource_type: "auto"
      });
      const res = await this.client.query(
        `INSERT INTO photos
          (post_id, text, score, cloudinary_secure_url, cloudinary_public_id,
          width, height, format, is_original)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          postID,
          text,
          score,
          uploadResult.secure_url,
          uploadResult.public_id,
          uploadResult.width,
          uploadResult.height,
          uploadResult.format,
          isOriginal
        ]
      );
      console.log(
        `Post ${postID}: ${isOriginal ? "[original]" : ""} ${
          uploadResult.public_id
        } ${uploadResult.width}x${uploadResult.height}`
      );
    } catch (error) {
      console.log(
        `Post ${postID}: ${isOriginal ? "[original]" : ""} ---FAILURE--- ${
          error.message
        }`
      );
    }
  }

  async _parseComment(comment) {
    // TODO: Improve the parsing logic here. I currently ignore non imgur links without file type
    // I also fail to parse any imgur gallery links i.e imgur.com/gallery/dil3AA

    // Take first pass on comment looking for urls ending in file type that cloudinary
    // is capable of directly dealing with
    const pattern1 = RegExp(/\[(.*)\]\((.*\.(jpg|jpeg|png|gif|mp4))\)/);
    const matches1 = comment.match(pattern1);
    if (matches1) {
      return { text: matches1[1], url: matches1[2] };
    }

    // Take second pass on comment looking for imgur urls that are part of an albmum
    const pattern2 = RegExp(/\[(.*)\]\(.*imgur\.com\/a\/(\w*)(?:\/.*)*\)/);
    const matches2 = comment.match(pattern2);
    if (matches2) {
      const url = await this.imgur.urlFromAlbum(matches2[2]);
      return { text: matches2[1], url: url };
    }

    // Take third pass on comment looking for imgur urls without a file ending,
    // with these we can get the url to pass to cloudinary by pinging imgur api
    const pattern3 = RegExp(/\[(.*)\]\(.*imgur\.com\/(?:.*\/)*(.*)\)/);
    const matches3 = comment.match(pattern3);
    if (matches3) {
      const url = await this.imgur.urlFromHash(matches3[2]);
      return { text: matches3[1], url: url };
    }

    return { text: "", url: "" };
  }

  _kill(msg) {
    console.log(msg);
    process.exit(1);
  }

  _h1(msg) {
    console.log();
    console.log("=".repeat(msg.length));
    console.log(msg);
    console.log("=".repeat(msg.length));
    console.log();
  }

  _h2(msg) {
    console.log(msg);
    console.log("-".repeat(msg.length));
  }
}

const scraper = new Scraper();
scraper.run();
