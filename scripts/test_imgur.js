const axios = require("axios");

const baseURL = "https://api.imgur.com/3/image";

async function run() {
  const imgID = "a/74LLAyk";
  const res = await axios.get(`${baseURL}/${imgID}`, {
    headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` }
  });
  console.log(res.data.data.link);
}

run();
