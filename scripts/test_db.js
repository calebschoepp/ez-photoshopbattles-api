const cloudinary = require("cloudinary");

function getCloudinaryPrefixedAssets(prefix) {
  return new Promise((resolve, reject) => {
    cloudinary.v2.api.resources(
      { type: "upload", prefix: prefix },
      (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      }
    );
  });
}

function deleteOldCloudinaryPhotos(prefix) {
  return new Promise((resolve, reject) => {
    cloudinary.v2.api.delete_resources_by_prefix(
      prefix,
      { resource_type: "raw" },
      (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      }
    );
  });
}

async function run() {
  const res = await getCloudinaryPrefixedAssets("ps/");
  const oldPublicIDs = res.resources.map(res => res.public_id);
  console.log(oldPublicIDs);
  await deleteOldCloudinaryPhotos("ps/");
}

run();
