const express = require("express");
const PORT = process.env.PORT || 5000;

const getCategory = (req, res) => {
  res.send(`Hello World from ${req.params.name}`);
};
const getPost = (req, res) => {
  res.send(`Hello World from ${req.params.id}`);
};

express()
  .get("/v1/categories/:name", getCategory)
  .get("/v1/posts/:id", getPost)
  .listen(PORT, () => console.log(`Listening on ${PORT}`));
