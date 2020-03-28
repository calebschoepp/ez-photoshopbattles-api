const express = require("express");
const PORT = process.env.PORT || 5000;

const getCategory = (req, res) => {
  res.json({ name: req.params.name, posts: [123, 456, 789] });
};
const getPost = (req, res) => {
  res.json({
    id: req.params.id,
    original: { url: "test/original.jpg", text: "foo" },
    photoshops: [
      { url: "1.jpg", text: "bar" },
      { url: "2.jpg", text: "qux" },
      { url: "3.jpg", text: "baz" },
      { url: "4.gif", text: "yap" },
      { url: "5.jpg", text: "hah" }
    ]
  });
};

app = express();

app.use(function(req, res, next) {
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
