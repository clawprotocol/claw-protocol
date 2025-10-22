import fs from "fs";
import fetch from "node-fetch";

async function uploadJSON(data) {
  const response = await fetch("https://api.nft.storage/upload", {
    method: "POST",
    headers: {
      "Authorization": "Bearer e865247b.3cb5ffc71664165996c1db0dc71762b",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  const json = await response.json();
  console.log("Upload response:", json);
}

const clause = {
  title: "Local Node Upload Test",
  jurisdiction: "Delaware, USA",
  author: "Anthem",
  text: "This upload came from Node backend."
};

uploadJSON(clause);
