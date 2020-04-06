const express = require("express");
const PORT = process.env.PORT || 5000;
const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
});

const asyncMiddleware = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const getCategory = asyncMiddleware(async (req, res, next) => {
  try {
    const name = req.params.name;
    const {
      rows,
    } = await pool.query("SELECT id FROM posts WHERE category_name=$1", [name]);
    let posts = [];
    for (const row of rows) {
      posts.push(row.id);
    }
    const response = { name, posts };
    res.json(response);
  } catch (error) {
    console.log("Encountered error");
    console.log(error.message);
    res.status(500).send("Failure to load posts");
  }
});

const getPost = asyncMiddleware(async (req, res, next) => {
  try {
    const id = req.params.id;
    const { rows } = await pool.query(
      `SELECT h.cloudinary_secure_url as url, h.text as text, h.is_original as is_original, h.height as height
      FROM posts p INNER JOIN photos h ON p.id=h.post_id WHERE p.id=$1`,
      [id]
    );
    let original;
    let photoshops = [];
    let maxHeight = 0;
    for (const row of rows) {
      if (row.height > maxHeight) {
        maxHeight = row.height;
      }
      if (row.is_original) {
        original = { url: row.url, text: row.text };
      } else {
        photoshops.push({ url: row.url, text: row.text });
      }
    }
    const response = { id, maxHeight, original, photoshops };
    res.json(response);
  } catch (error) {
    console.log("Encountered error");
    console.log(error.message);
    res.status(500).send("Failure to load photos");
  }
});

app = express();

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});
app.get("/v1/categories/:name", getCategory);
app.get("/v1/posts/:id", getPost);
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
