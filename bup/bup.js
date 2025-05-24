import * as path from "node:path";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as crypto from "node:crypto";
import Logger from "./logger.js";
import {
  loadJSON,
  saveJSON,
  get,
  getJSON,
  getRandomSample,
  getPathFn,
  getURLFn,
  getVersion
} from "./utils.js";

let logger = null;

// See <https://github.com/Nemo2011/bilibili-api/pull/680/files>.
// 一个验证有没有用户操作的玩意，似乎随便丢点字符给他就过了。
const dmSeed = "ABCDEFGHIJK".split('');

const addDM = (params) => {
  params.set("dm_img_list", "[]");
  params.set("dm_img_str", getRandomSample(dmSeed, 2).join(''));
  params.set("dm_cover_img_str", getRandomSample(dmSeed, 2).join(''));
  params.set("dm_img_inter", "{\"ds\":[],\"wh\":[0,0,0],\"of\":[0,0,0]}");
  return params;
};

// 一个奇怪的验证，需要从别的地方获取伪装成图片的 key 然后根据参数和时间进行编码。
const getWBIKeys = async () => {
  const res = await getJSON("https://api.bilibili.com/x/web-interface/nav", {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Referer": "https://www.bilibili.com/"
  });
  logger.debug(`getWBIKeys(): ${JSON.stringify(res, null, "  ")}`);
  const imgURL = res["data"]["wbi_img"]["img_url"];
  const subURL = res["data"]["wbi_img"]["sub_url"];
  return {
    "img": imgURL.slice(imgURL.lastIndexOf('/') + 1, imgURL.lastIndexOf('.')),
    "sub": subURL.slice(subURL.lastIndexOf('/') + 1, subURL.lastIndexOf('.'))
  };
};

const mixinKeyEncodeTable = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52
];

// 对 img 和 sub 进行字符顺序打乱编码。
const getMixinKey = (orig) => {
  return mixinKeyEncodeTable.map((n) => {
    return orig[n];
  }).join('').slice(0, 32);
};

// 为请求参数进行 wbi 签名。
const encodeWBI = (params, img, sub) => {
  const mixinKey = getMixinKey(`${img}${sub}`);
  const current = Math.round(Date.now() / 1000);

  // 添加 wts 字段。
  params.set("wts", current);
  // 过滤 value 中的 "!'()*" 字符。
  // 这段代码有点问题，显然我这里没有这些字符就不用了。
  // params.forEach((key, value) => {
  //   const newValue = value.replace(/[!'()*]/g, '');
  //   return params.set(key, newValue);
  // });
  // 按照 key 重排参数。
  params.sort();
  logger.debug(`${params.toString()}`);

  const wbi = crypto.createHash("md5")
	.update(`${params.toString()}${mixinKey}`)
	.digest("hex");

  return `${params.toString()}&w_rid=${wbi}`;
};

const getUser = async (uid) => {
  const {img, sub} = await getWBIKeys();
  const params = new URLSearchParams({"mid": uid});
  const url = `https://api.bilibili.com/x/space/wbi/acc/info?${encodeWBI(addDM(params), img, sub)}`;
  logger.debug(`getUser(): ${url}`);

  const res = await getJSON(url, {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Cookie": "buvid3=00BA3F83-2A0A-C1D6-A984-8EE1E6AC62CF33288infoc; b_nut=1748014733;",
    "Referer": `https://space.bilibili.com/${uid}`,
    "Origin": "https://space.bilibili.com"
  });
  logger.debug(`getUser(): ${JSON.stringify(res, null, "  ")}`);
  if (res["code"] !== 0) {
    throw new Error(res["message"]);
  }
  return res["data"];
};

const getVideos = async (uid) => {
  const {img, sub} = await getWBIKeys();
  const params = new URLSearchParams({
    "mid": uid,
    "ps": 3,
    "tid": 0,
    "pn": 1,
    "keyword": "",
    "order": "pubdate",
    "order_avoided": true
  });
  const url = `https://api.bilibili.com/x/space/wbi/arc/search?${encodeWBI(addDM(params), img, sub)}`;
  logger.debug(`getVideos(): ${url}`);

  const res = await getJSON(url, {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Cookie": "buvid3=00BA3F83-2A0A-C1D6-A984-8EE1E6AC62CF33288infoc; b_nut=1748014733; ",
    "Referer": `https://space.bilibili.com/${uid}/video`,
    "Origin": "https://space.bilibili.com"
  });
  logger.debug(`getVideos(): ${JSON.stringify(res, null, "  ")}`);
  if (res["code"] !== 0) {
    throw new Error(res["message"]);
  }
  return res["data"]["list"]["vlist"];
};

const clean = async (uids, docDir, userDir) => {
  const fullUserDir = path.join(docDir, userDir);
  if (!fs.existsSync(fullUserDir)) {
    return;
  }

  const subDirs = (await fsp.readdir(fullUserDir)).filter((d) => {
    return fs.lstatSync(path.join(fullUserDir, d)).isDirectory();
  });
  const removed = subDirs.filter((d) => {
    return !uids.includes(d);
  });
  if (removed.length === 0) {
    return;
  }
  logger.log(`Removing unused dir for ${removed.join(", ")}.`);
  await Promise.all(removed.map((d) => {
    return fsp.rm(path.join(fullUserDir, d), {"recursive": true});
  }));
};

const makeMetadata = (user, videos, userDir) => {
  const uid = `${user["mid"]}`;
  const userPath = path.join(userDir, uid);
  return {
    "uid": uid,
    "name": user["name"],
    "path": userPath,
    // 目前至少可以假设叔叔一定会给我们 JPG。
    "avatar": path.join(userPath, "avatar.jpg"),
    "avatarURL": user["face"],
    "videos": videos.slice(0, 3).map((video, i) => {
      return {
	"bvid": video["bvid"],
	"title": video["title"],
        // 叔叔返回的是 UNIX 时间戳，单位是秒，但 JS 的 Date 喜欢毫秒。
        "created": video["created"] * 1000,
	"thumb": path.join(userPath, `${i}-thumb.jpg`),
	"thumbURL": video["pic"]
      };
    })
  };
};

const check = async (uids, docDir, userDir) => {
  const fullUserDir = path.join(docDir, userDir);
  const results = await Promise.all(uids.map(async (uid) => {
    let newMD = null;
    try {
      const user = await getUser(uid);
      const videos = await getVideos(uid);
      newMD = makeMetadata(user, videos, userDir);
    } catch (error) {
      // 爬取更新失败的话就假装无事发生。
      logger.error(error);
      return null;
    }

    // UP 的最新视频变了，或者 UP 改名了，或者我们之前没给这个 UP 建档，都视为有更新。
    let updated = false;
    try {
      const md = await loadJSON(path.join(fullUserDir, uid, "index.json"));
      if (newMD["videos"][0]["bvid"] !== md["videos"][0]["bvid"] ||
	  newMD["name"] !== md["name"]) {
        updated = true;
      }
    } catch (error) {
      updated = true;
    }

    return updated ? newMD : null;
  }));
  // 当然是只处理有更新的。
  return results.filter((o) => {
    return o != null;
  });
};

const renderUserPage = (docPath, md, getPath, getURL) => {
  const html = [];
  html.push(
    "<!DOCTYPE html>\n",
    "<html lang=\"zh-Hans\">\n",
    "  <head>\n",
    "    <meta charset=\"utf-8\">\n",
    "    <meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\">\n",
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=10\">\n"
  );

  // Open Graph.
  html.push(
    "    <meta property=\"og:site_name\" content=\"BUp\">\n",
    `    <meta property="og:title" content="${md["name"]} - BUp">\n`,
    "    <meta property=\"og:type\" content=\"website\">\n",
    `    <meta property="og:url" content="${getURL(docPath)}">\n`
  );
  html.push(
    `    <meta property="og:image" content="${getPath(md["avatar"])}">\n`
  );
  html.push(
    `    <meta property="og:description" content="${md["name"]} - BUp">\n`
  );
  html.push(
    `    <link rel="stylesheet" type="text/css" href="${getPath("css/normalize.css")}">\n`,
    `    <link rel="stylesheet" type="text/css" href="${getPath("css/index.css")}">\n`,
    `    <script type="text/javascript" src="${getPath("js/index.js")}"></script>\n`,
    "    <script type=\"text/javascript\">\n",
    "      documentReady(() => {\n",
    `        document.getElementById("delta").innerText = countDateTime(${md["videos"][0]["created"]});\n`,
    "        window.setInterval(() => {\n",
    `          document.getElementById("delta").innerText = countDateTime(${md["videos"][0]["created"]});\n`,
    "        }, 1000);\n",
    "      });\n",
    "    </script>\n",
    `    <title>${md["name"]} - BUp</title>\n`,
    "  </head>\n",
    "  <body>\n",
    "    <div class=\"container\">\n",
    "      <header>\n"
  );
  html.push(
    "        <div class=\"title\" id=\"title\">\n",
    `          <div>亲爱的 <img class="avatar" src="${getPath(md["avatar"])}"> <a target="_blank" rel="external nofollow noreferrer noopener" href="https://space.bilibili.com/${md["uid"]}">${md["name"]}</a>：</div>\n`,
    "        </div>\n"
  );
  const formatter = new Intl.DateTimeFormat("zh-Hans", {
    "year": "numeric",
    "month": "2-digit",
    "day": "2-digit",
    "weekday": "short",
    "hour": "2-digit",
    "minute": "2-digit",
    "second": "2-digit",
    "timeZoneName": "short",
    "hour12": false
  });
  const created = new Date(md["videos"][0]["created"]);
  const parts = formatter.formatToParts(created);
  const obj = {};
  for (let {type, value} of parts) {
    obj[type] = value;
  }
  html.push(
    "      </header>\n",
    "      <main>\n",
    "        <div class=\"content\" id=\"content\">\n",
    "          <div>距离您上次更新视频已经过去 <span id=\"delta\"></span> 了。</div>\n",
    "          <div>您上次的投稿是：</div>\n",
    `          <a class="video" target="_blank" rel="external nofollow noreferrer noopener" href="https://www.bilibili.com/video/${md["videos"][0]["bvid"]}">\n`,
    "            <div class=\"video-thumb\">\n",
    `              <img src="${getPath(md["videos"][0]["thumb"])}">\n`,
    "            </div>\n",
    "            <div class=\"video-info\">\n",
    `              <div class="video-title">${md["videos"][0]["title"]}</div>\n`,
    `              <div class="video-created">${obj["year"]}-${obj["month"]}-${obj["day"]} ${obj["hour"]}:${obj["minute"]}:${obj["second"]}</div>\n`,
    "            </div>\n",
    "          </a>\n",
    "        </div>\n"
  );
  html.push(
    "      </main>\n",
    "      <footer>\n",
  );
  html.push(
    "        <div class=\"info\" id=\"info\">\n",
    `          <a href="${getPath(docPath)}">当前页面链接</a>\n`,
    "        </div>\n"
  );
  html.push(
    "     </footer>\n",
    "    </div>\n",
    "  </body>\n",
    "</html>\n",
    `<!-- Page built by BUp v${getVersion()} at ${new Date().toISOString()}. -->`
  );

  return html.join("");
};

const renderIndexPage = (docPath, mds, getPath, getURL) => {
  const html = [];
  html.push(
    "<!DOCTYPE html>\n",
    "<html lang=\"zh-Hans\">\n",
    "  <head>\n",
    "    <meta charset=\"utf-8\">\n",
    "    <meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\">\n",
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=10\">\n"
  );

  // Open Graph.
  html.push(
    "    <meta property=\"og:site_name\" content=\"BUp\">\n",
    "    <meta property=\"og:title\" content=\"BUp\">\n",
    "    <meta property=\"og:type\" content=\"website\">\n",
    `    <meta property="og:url" content="${getURL(docPath)}">\n`
  );
  html.push(
    "    <meta property=\"og:description\" content=\"BUp\">\n"
  );
  html.push(
    `    <link rel="stylesheet" type="text/css" href="${getPath("css/normalize.css")}">\n`,
    `    <link rel="stylesheet" type="text/css" href="${getPath("css/index.css")}">\n`,
    `    <script type="text/javascript" src="${getPath("js/index.js")}"></script>\n`,
    "    <title>BUp</title>\n",
    "  </head>\n",
    "  <body>\n",
    "    <div class=\"container\">\n",
    "      <header>\n"
  );
  html.push(
    "        <div class=\"title\" id=\"title\">\n",
    "          <h1>BUp</h1>\n",
    "        </div>\n"
  );
  html.push(
    "      </header>\n",
    "      <main>\n",
    "        <div class=\"content\" id=\"content\">\n",
    "          <ul>\n"
  );
  for (const md of mds) {
    html.push(
      `            <li><a href=${getPath(md["path"])}>${md["name"]}</a></li>\n`
    );
  }
  html.push(
    "          </ul>\n",
    "        </div>\n"
  );
  html.push(
    "      </main>\n",
    "      <footer>\n",
  );
  html.push(
    "        <div class=\"info\" id=\"info\">\n",
    `          <a href="${getPath(docPath)}">当前页面链接</a>\n`,
    "        </div>\n"
  );
  html.push(
    "     </footer>\n",
    "    </div>\n",
    "  </body>\n",
    "</html>\n",
    `<!-- Page built by BUp v${getVersion()} at ${new Date().toISOString()}. -->`
  );

  return html.join("");
};

const writeUserPage = async (md, docDir, getPath, getURL) => {
  const filePath = path.join(docDir, md["path"], "index.html");
  logger.debug(`Creating ${filePath}...`);
  await fsp.writeFile(
    filePath,
    renderUserPage(md["path"], md, getPath, getURL),
    "utf8"
  );
};

const writeIndexPage = async (mds, docDir, getPath, getURL) => {
  const filePath = path.join(docDir, "index.html");
  logger.debug(`Creating ${filePath}...`);
  await fsp.writeFile(
    filePath,
    renderIndexPage("/", mds, getPath, getURL),
    "utf8"
  );
};

const getFile = async (url, docDir, docPath) => {
  logger.debug(`getFile(): ${url}`);
  try {
    const buffer = await get(url);
    await fsp.writeFile(path.join(docDir, docPath), buffer);
  } catch (error) {
    // 下载失败了能咋办，不咋办呗，假装无事发生。
    logger.error(error);
  }
};

const build = async (mds, docDir, userDir, baseURL, rootDir) => {
  const fullUserDir = path.join(docDir, userDir);
  const getPath = getPathFn(rootDir);
  const getURL = getURLFn(baseURL, rootDir);
  if (mds.length === 0) {
    logger.log("Got no update.");
    process.exit(1);
  }

  logger.log(`Got updates from ${mds.map((md) => {
    return `${md["uid"]}(${md["name"]})`;
  }).join(", ")}.`);
  await Promise.all(mds.map(async (md) => {
    try {
      await fsp.mkdir(path.join(fullUserDir, md["uid"]), {"recursive": true});
      // 叔叔不让我们直接外链引用图片啊，只能下载下来了，不要耽误叔叔赚钱。
      await getFile(md["avatarURL"], docDir, md["avatar"]);
      await Promise.all(md["videos"].map(async (video, i) => {
	await getFile(video["thumbURL"], docDir, video["thumb"]);
      }));
      await saveJSON(path.join(fullUserDir, md["uid"], "index.json"), md);
      await writeUserPage(md, docDir, getPath, getURL);
    } catch (error) {
      logger.error(error);
    }
  }));
  try {
    await writeIndexPage(mds, docDir, getPath, getURL);
  } catch (error) {
    logger.error(error);
  }
};

const bup = async (dir, opts) => {
  logger = new Logger({"debug": opts["debug"], "color": opts["color"]});
  const configPath = opts["config"] || path.join(dir, "config.json");
  let config = null;
  try {
    config = await loadJSON(configPath);
  } catch (error) {
    logger.error(error);
    process.exit(-1);
  }
  const {uids, docDir, userDir, baseURL, rootDir} = config;
  const fullDocDir = path.join(dir, docDir);

  await clean(uids, fullDocDir, userDir);
  const mds = await check(uids, fullDocDir, userDir);
  await build(mds, fullDocDir, userDir, baseURL, rootDir);
  process.exit(0);
};

export default bup;
