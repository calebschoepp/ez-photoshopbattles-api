const snoowrap = require("snoowrap");
const cloudinary = require("cloudinary");
const { Client } = require("pg");
const postLimit = parseInt(process.env.POSTS_PER_CATEGORY);
const photoshopLimit = parseInt(process.env.PHOTOSHOPS_PER_POST);

async function run() {
  let client;
  let r;
  try {
    // Init postgres connection
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
    await client.connect();

    // Init snoowrap
    r = new snoowrap({
      userAgent: process.env.REDDIT_USER_AGENT,
      clientId: process.env.REDDIT_CLIENT_ID,
      clientSecret: process.env.REDDIT_CLIENT_SECRET,
      refreshToken: process.env.REDDIT_REFRESH_TOKEN
    });
  } catch (err) {
    console.log("Setup failed");
    console.log(err.message);
    process.exit(1);
  }
  lib = { client: client, r: r };

  await preScrape(lib);
  await scrape(lib);
  await postScrape(lib);
  await report(lib);

  await lib.client.end();
}

async function preScrape(lib) {
  h1("Pre-Scraping Cleanup");
  try {
    const res = await getCloudinaryPrefixedAssets("ps/");
    const oldPublicIDs = res.resources.map(res => res.public_id);

    // Delete the photo records from the DB
    for (const id of oldPublicIDs) {
      const res = await lib.client.query(
        `DELETE FROM photos WHERE cloudinary_public_id=$1`,
        [id]
      );
    }
    console.log("All rows in photos for old photos were deleted");
    // TODO: Clean up dead posts that can no longer be reached either

    // Delete the photos from cloudinary
    await deleteOldCloudinaryPhotos("ps/");
    console.log("All of the previous content in ps/ was deleted");
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }
}

async function postScrape(oldPublicIDs, lib) {
  h1("Post-Scraping Cleanup");
  // TODO: do the deletion in here so that there is no time without photos
}

async function report(lib) {
  h1("Reporting");
}

async function scrape(lib) {
  h1("Scraping");
  const subreddit = await lib.r.getSubreddit("photoshopbattles");

  // Scrape every category
  let posts = await subreddit.getTop({ time: "week", limit: postLimit });
  await handleCategory(posts, "top:week", lib);
}

async function handleCategory(posts, categoryName, lib) {
  h2(`Scraping ${categoryName}`);
  for (const post of posts) {
    await handlePost(post, categoryName, lib);
  }
}

async function handlePost(post, categoryName, lib) {
  // Insert post into DB
  const res = await lib.client.query(
    "INSERT INTO posts (category_name, title, permalink, score) VALUES ($1, $2, $3, $4) RETURNING id;",
    [categoryName, post.title, post.permalink, post.score]
  );
  const postID = res.rows[0].id;

  // Add original photo to photos
  await handlePhoto(post.title, post.url, post.score, postID, true, lib);

  // Photoshops come from the parent comments of the post
  // This is a naive approach that misses all other photoshops in children
  // Also naive in the way is scrapes the text and url
  // TODO: Improve this
  const comments = await post
    .expandReplies({ depth: 0 })
    .comments.sort((a, b) => (a.score < b.score ? 1 : -1)) // Sort func flipped to have highest first
    .slice(0, photoshopLimit + 1);
  for (const comment of comments) {
    const { text, url } = parseComment(comment.body);
    await handlePhoto(text, url, comment.score, postID, false, lib);
  }
}

function parseComment(comment) {
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

async function handlePhoto(text, url, score, postID, isOriginal, lib) {
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
    const uploadResult = await uploadToCloudinary(url, {
      folder: "ps",
      resource_type: "auto"
    });
    const res = await lib.client.query(
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

function uploadToCloudinary(image, opts) {
  return new Promise((resolve, reject) => {
    cloudinary.v2.uploader.upload(image, opts, (err, res) => {
      if (err) return reject(err);
      return resolve(res);
    });
  });
}

function deleteOldCloudinaryPhotos(prefix) {
  return new Promise((resolve, reject) => {
    cloudinary.v2.api.delete_resources_by_prefix(
      prefix,
      { resource_type: "video" },
      (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      }
    );
  });
}

function getCloudinaryPrefixedAssets(prefix) {
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

function h1(s) {
  console.log();
  console.log("=".repeat(s.length));
  console.log(s);
  console.log("=".repeat(s.length));
  console.log();
}

function h2(s) {
  console.log(s);
  console.log("-".repeat(s.length));
}

run();
