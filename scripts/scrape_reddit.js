const snoowrap = require("snoowrap");
const cloudinary = require("cloudinary");
const { Client } = require("pg");
const postLimit = parseInt(process.env.POSTS_PER_CATEGORY);
const photoshopLimit = parseInt(process.env.PHOTOSHOPS_PER_POST);

async function setup(func) {
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

  await func(lib);

  await lib.client.end();
}

async function run(lib) {
  const subreddit = await lib.r.getSubreddit("photoshopbattles");

  // Scrape every category
  let posts = await subreddit.getTop({ time: "week", limit: postLimit });
  await handleCategory(posts, "top:week", lib);
}

async function handleCategory(posts, categoryName, lib) {
  for (const post of posts) {
    console.log("---------------");
    await handlePost(post, categoryName, lib);
  }
}

async function handlePost(post, categoryName, lib) {
  // Upload original photo and insert post into DB
  console.log(post);
  const uploadResult = await uploadToCloudinary(post.url, { folder: "ps" });
  const res = await lib.client.query(
    "INSERT INTO posts (category_name, title, post_url, cloudinary_secure_url, score) VALUES ($1, $2, $3, $4, $5);",
    [categoryName, post.title, post.url, uploadResult.secure_url, post.score]
  );
  console.log(res);
  console.log(res.rows);

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
    await handlePhoto(text, url, comment.score, lib);
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

async function handlePhoto(text, url, score, lib) {
  // We want to ignore any blank photos - ie. photos that didn't meet our narrow
  // specifications of url format, extension, markdown style etc.
  // TODO: lower how many of these there are by implementing features
  if (text === "" || url === "") {
    return;
  }

  const uploadResult = await uploadToCloudinary(url, { folder: "ps" });
  // const res = await client.query(
  //   "INSERT INTO photoshops (post_id INTEGER NOT NULL,
  //     text varchar(200),
  //     score INTEGER,
  //     cloudinary_secure_url varchar(200) NOT NULL,
  //     cloudinary_public_id varchar(200) NOT NULL,
  //     width INTEGER NOT NULL,
  //     height INTEGER NOT NULL,
  //     format varchar(5) NOT NULL,
  //     FOREIGN KEY (post_id) REFERENCES posts (id)) VALUES ($1, $2, $3, $4, $5);",
  //   [categoryName, post.title, post.url, uploadResult.secure_url, post.score]
  // );
  // console.log(uploadResult);
}

function uploadToCloudinary(image, opts) {
  // TODO: use opts
  return new Promise((resolve, reject) => {
    cloudinary.v2.uploader.upload(image, opts, (err, url) => {
      if (err) return reject(err);
      return resolve(url);
    });
  });
}

setup(run);

// for category in categories
//     posts = category.posts[0:POSTS_PER_CATEGORY]
//     for post in posts
//         storePost(post)

// storePost(post):
//     storePhoto(post.original_data)
//     photoshops = post.photos[0:PHOTOSHOPS_PER_POST]
//     for photoshop in photoshops
//         storePhoto(photoshop)

// storePhoto(photo):
//     cloudinaryResult = storeInCloudinary(photo)
//     writeToDB(photo, cloudinaryResult)

// Uploading to cloudinary as a stream
// const writeStream = cloudinary.uploader.upload_stream(function(result) {
//   console.log(result);
// });
// const response = await axios({
//   url,
//   method: "GET",
//   responseType: "stream"
// });
// response.data.pipe(writeStream);
