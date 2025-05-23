import * as path from "node:path";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as https from "node:https";

const pkgDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../"
);

const loadJSON = async (path) => {
  return JSON.parse(await fsp.readFile(path, "utf8"));
};

const loadJSONSync = (path) => {
  return JSON.parse(fs.readFileSync(path, "utf8"));
};

const pkgJSON = loadJSONSync(path.join(pkgDir, "package.json"));

const getVersion = () => {
  return pkgJSON["version"];
};

/**
 * @param {String} url Target URL.
 * @param {Object} [headers]
 * @return {Promise<Buffer>}
 */
const get = (url, headers = {}) => {
  const opts = {
    "method": "GET",
    "timeout": 1500,
    "headers": {}
  };
  for (const [k, v] of Object.entries(headers)) {
    opts["headers"][k.toLowerCase()] = v;
  }
  return new Promise((resolve, reject) => {
    const req = https.request(url, opts, (res) => {
      const chunks = [];
      res.on("error", reject);
      res.on("data", (chunk) => {
	chunks.push(chunk);
      });
      res.on("end", () => {
	resolve(Buffer.concat(chunks));
      });
    });
    req.on("error", reject);
    req.end();
  });
};

/**
 * @param {String} url Target URL.
 * @param {(String|Buffer|Object)} body Object will be JSON-serialized.
 * @param {Object} [headers]
 * @return {Promise<Buffer>}
 */
const post = (url, body, headers = {}) => {
  const opts = {
    "method": "POST",
    "timeout": 1500,
    "headers": {}
  };
  for (const [k, v] of Object.entries(headers)) {
    opts["headers"][k.toLowerCase()] = v;
  }
  if (!(isBuffer(body) || isString(body))) {
    body = JSON.stringify(body);
    opts["headers"]["content-type"] = "application/json";
    opts["headers"]["content-length"] = `${Buffer.byteLength(body)}`;
  }
  return new Promise((resolve, reject) => {
    const req = https.request(url, opts, (res) => {
      const chunks = [];
      res.on("error", reject);
      res.on("data", (chunk) => {
	chunks.push(chunk);
      });
      res.on("end", () => {
	resolve(Buffer.concat(chunks));
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

const getRandomSample = (array, length) => {
  const shuffled = [...array];
  const min = array.length - length;
  let i = array.length;
  while (i-- > min) {
    const chosen = Math.floor((i + 1) * Math.random());
    const temp = shuffled[chosen];
    shuffled[chosen] = shuffled[i];
    shuffled[i] = temp;
  }
  return shuffled.slice(min);
};

export {
  pkgDir,
  loadJSON,
  loadJSONSync,
  get,
  post,
  getRandomSample,
  getVersion
};
