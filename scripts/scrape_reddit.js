const snoowrap = require("snoowrap");

async function run() {
  const r = new snoowrap({
    userAgent: process.env.REDDIT_USER_AGENT,
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    refreshToken: process.env.REDDIT_REFRESH_TOKEN
  });

  const subreddit = await r.getSubreddit("realEstate");
  const topPosts = await subreddit.getTop({ time: "week", limit: 3 });

  let data = [];

  topPosts.forEach(post => {
    data.push({
      link: post.url,
      text: post.title,
      score: post.score
    });
  });

  console.log(data);
}

console.log(process.env);

run();
