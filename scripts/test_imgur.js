const axios = require("axios");

const imgurBaseURL = "https://api.imgur.com/3";

async function run() {
  const imgID = "LbKtyWY";
  const c = new ImgurClient();
  const res = await c.urlFromGallery(imgID);
  console.log(res);
}

class ImgurClient {
  async urlFromHash(imageHash) {
    const url = `${imgurBaseURL}/image/${imageHash}`;
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` }
      });
      return res.data.data.link;
    } catch (error) {
      return "IMGUR API FAILURE";
    }
  }

  async urlFromAlbum(albumHash) {
    const url = `${imgurBaseURL}/album/${albumHash}/images`;
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` }
      });
      const images = res.data.data;
      if (!images[0]) {
        throw new Error("No images in album");
      }
      return images[0].link;
    } catch (error) {
      console.log(error.message);
      return "IMGUR API FAILURE";
    }
  }

  async urlFromGallery(galleryImageHash) {
    const url = `${imgurBaseURL}/gallery/image/${galleryImageHash}`;
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` }
      });
      return res;
    } catch (error) {
      console.log(error.message);
      return "IMGUR API FAILURE";
    }
  }
}

run();
