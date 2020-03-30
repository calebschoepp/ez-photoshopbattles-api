// For get category

// SELECT p.id as post_id
// FROM categories c
// INNER JOIN posts p
// ON c.id = p.category_id
// WHERE c.name = $1;

// For get posts

// SELECT h.text as text, h.url as url, h.score as score
// FROM posts p
// INNER JOIN photoshops h
// ON p.id = h.post_id
// WHERE p.id = $1;

// And also run this for original photo

// SELECT text, url, score
// FROM posts
// WHERE id = $1;

async function run() {
  const { Client } = require("pg");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: true
  });
  await client.connect();
  const res = await client.query(
    "SELECT table_schema,table_name FROM information_schema.tables;"
  );
  for (let row of res.rows) {
    console.log(JSON.stringify(row));
  }
  await client.end();
}

run();
