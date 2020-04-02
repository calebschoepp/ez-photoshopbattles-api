const snoowrap = require("snoowrap");
const cloudinary = require("cloudinary");
const { Client } = require("pg");
const postLimit = parseInt(process.env.POSTS_PER_CATEGORY);
const photoshopLimit = parseInt(process.env.PHOTOSHOPS_PER_POST);

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
    console.log("New scraping session inserted");
  }

  async _scrape() {
    this._h1("Scraping");

    const subreddit = await this.r.getSubreddit("photoshopbattles");

    // Scrape every category
    let posts = await subreddit.getTop({ time: "week", limit: postLimit });
    await this._handleCategory(posts, "top:week");
  }

  async _postScrape() {
    this._h1("Post-Scraping");

    // Delete the old cloudinary content
    await this.cloudinary.deletePrefix(this.oldScrapingSessionID);

    // Delete the old cloudinary folder
    await this.cloudinary.deleteFolder(this.oldScrapingSessionID);

    console.log("Old cloudinary content deleted");
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
      const { text, url } = this._parseComment(comment.body);
      await this._handlePhoto(text, url, comment.score, postID, false);
    }
  }

  async _handlePhoto(text, url, score, postID, isOriginal) {
    // We want to ignore any blank photos - ie. photos that didn't meet our narrow
    // specifications of url format, extension, markdown style etc.
    // TODO: lower how many of these there are by implementing features
    if (text === "" || url === "") {
      console.log(
        `Post ${postID}: ${isOriginal ? "[original]" : ""} ---INVALID---`
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

  _parseComment(comment) {
    // TODO: Improve the parsing logic here, I currently just ignore any url
    // without an extension because I can't directly download the image then.
    // I could have this parsing except urls without extensions but then I would
    // probably need to sign up and use the imgur API and parse out the id of the image
    const pattern = RegExp(/\[(.*)\]\((.*\.(jpg|jpeg|png|gif|mp4))\)/);
    const matches = comment.match(pattern);
    if (matches) {
      return { text: matches[1], url: matches[2] };
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
