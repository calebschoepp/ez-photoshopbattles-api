const express = require("express");
const PORT = process.env.PORT || 5000;

const getCategory = (req, res) => {
  res.json({ name: req.params.name, posts: [123, 456, 789] });
};
const getPost = (req, res) => {
  res.json({
    id: req.params.id,
    original: "https://fakeurl.com",
    photoshops: [
      "https://fakeurl.com",
      "https://fakeurl.com",
      "https://fakeurl.com"
    ]
  });
};

express()
  .get("/v1/categories/:name", getCategory)
  .get("/v1/posts/:id", getPost)
  .listen(PORT, () => console.log(`Listening on ${PORT}`));
