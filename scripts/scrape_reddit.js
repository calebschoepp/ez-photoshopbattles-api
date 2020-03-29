const snoowrap = require("snoowrap");
const fs = require("fs");
const axios = require("axios");
const cloudinary = require("cloudinary");

const postLimit = parseInt(process.env.POSTS_PER_CATEGORY);
const photoshopLimit = parseInt(process.env.PHOTOSHOPS_PER_POST);

async function run() {
  // Init snoowrap
  const r = new snoowrap({
    userAgent: process.env.REDDIT_USER_AGENT,
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    refreshToken: process.env.REDDIT_REFRESH_TOKEN
  });

  const subreddit = await r.getSubreddit("photoshopbattles");

  // Scrape every category
  let posts = await subreddit.getTop({ time: "week", limit: postLimit });
  await handleCategory(posts);

  //   topPosts.forEach(post => {
  //     data.push({
  //       link: post.url,
  //       text: post.title,
  //       score: post.score
  //     });
  //   });
}

async function handleCategory(posts) {
  for (const post of posts) {
    console.log("---------------");
    await handlePost(post);
  }
}

async function handlePost(post) {
  // Original photo data comes from post
  handlePhoto(post.title, post.url, post.score);

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
    await handlePhoto(text, url, comment.score);
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

async function handlePhoto(text, url, score) {
  // We want to ignore any blank photos - ie. photos that didn't meet our narrow
  // specifications of url format, extension, markdown style etc.
  // TODO: lower how many of these there are by implementing features
  if (text === "" || url === "") {
    return;
  }
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream"
  });

  const writeStream = cloudinary.uploader.upload_stream(function(result) {
    console.log(result);
  });

  response.data.pipe(writeStream);

  console.log(text);
  console.log(url);
  console.log(score);
}

run();

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
