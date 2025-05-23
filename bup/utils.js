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

const saveJSON = async (path, obj) => {
  return await fsp.writeFile(path, JSON.stringify(obj), "utf8");
};

const saveJSONSync = (path, obj) => {
  return fs.writeFileSync(path, JSON.stringify(obj), "utf8");
};

const pkgJSON = loadJSONSync(path.join(pkgDir, "package.json"));

const getVersion = () => {
  return pkgJSON["version"];
};

const isFunction = (o) => {
  return o instanceof Function;
};

const getPathFn = (rootDir = path.posix.sep) => {
  // Anyway, we need to escape backslash literally using RegExp.
  const winSepRegExp = new RegExp(`\\${path.win32.sep}`, "g");
  rootDir = rootDir.replace(winSepRegExp, path.posix.sep);
  if (!rootDir.endsWith(path.posix.sep)) {
    rootDir = path.posix.join(rootDir, path.posix.sep);
  }
  if (!path.posix.isAbsolute(rootDir)) {
    rootDir = path.posix.join(path.posix.sep, rootDir);
  }
  return (docPath = "", skipEncode = false) => {
    // Handle link with query string or hash.
    // Use assertion to prevent `?` and `#` to be removed.
    const array = docPath.split(/(?=[?#])/);
    array[0] = array[0].replace(winSepRegExp, path.posix.sep);
    const baseName = path.posix.basename(array[0]);
    const dirName = path.posix.dirname(array[0]);
    if (baseName === "index.html" || baseName === "index.htm") {
      array[0] = path.posix.join(dirName, path.posix.sep);
    }
    /**
     * marked.js and CommonMark tends to do URL encode by themselevs.
     * Maybe I should not do `encodeURL()` here.
     * See <https://github.com/markedjs/marked/issues/1285>.
     */
    return skipEncode
      ? path.posix.join(rootDir, ...array)
      : encodeURI(path.posix.join(rootDir, ...array));
  };
};

const getURLFn = (baseURL, rootDir = path.posix.sep) => {
  const getPath = getPathFn(rootDir);
  return (docPath = "") => {
    return new URL(getPath(docPath), baseURL);
  };
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

const getJSON = (url, headers = {}) => {
  return get(url, headers).then((res) => {
    return JSON.parse(res.toString("utf8"));
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
  saveJSON,
  saveJSONSync,
  isFunction,
  getPathFn,
  getURLFn,
  get,
  post,
  getJSON,
  getRandomSample,
  getVersion
};
