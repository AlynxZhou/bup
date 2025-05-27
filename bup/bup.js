import * as path from "node:path";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import Logger from "./logger.js";
import BAPI from "./bapi.js";
import {loadJSON, saveJSON, get, getPathFn, getURLFn, getVersion} from "./utils.js";

let logger = null;

const downloadFile = async (url, docDir, docPath) => {
  logger.debug(`downloadFile(): ${url}`);
  try {
    const {body} = await get(url);
    await fsp.writeFile(path.join(docDir, docPath), body);
  } catch (error) {
    // 下载失败了能咋办，不咋办呗，假装无事发生。
    logger.warn(error);
  }
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
  const userPath = path.join(userDir, uid, path.sep);
  return {
    "uid": uid,
    "name": user["name"],
    // 最近一次检查的时候是否有更新。
    "updated": false,
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

const check = async (bAPI, uids, docDir, userDir) => {
  const fullUserDir = path.join(docDir, userDir);
  const mds = [];

  // 这里当然可以并行请求，但是恐怕会被反爬风控，所以还是一个个来。
  for (const uid of uids) {
    let md = null;
    try {
      const user = await bAPI.getUser(uid);
      const videos = await bAPI.getVideos(uid);
      md = makeMetadata(user, videos, userDir);
    } catch (error) {
      // 爬取更新失败的话就假装无事发生。
      logger.warn(error);
      continue;
    }

    // UP 的最新视频变了，或者 UP 改名了，或者我们之前没给这个 UP 建档，都视为有更新。
    try {
      const old = await loadJSON(path.join(fullUserDir, uid, "index.json"));
      if (md["videos"][0]["bvid"] !== old["videos"][0]["bvid"] ||
	  md["name"] !== old["name"]) {
        md["updated"] = true;
      }
    } catch (error) {
      md["updated"] = true;
    }

    mds.push(md);
  }

  return mds;
};

const renderUserPage = (docPath, md, getPath, getURL) => {
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
    `    <meta property="og:url" content="${getURL(docPath)}">\n`,
    `    <meta property="og:image" content="${getPath(md["avatar"])}">\n`,
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
    "      <header>\n",
    "        <div class=\"title\" id=\"title\">\n",
    `          <div>亲爱的 <img class="avatar" src="${getPath(md["avatar"])}"> <a target="_blank" rel="external nofollow noreferrer noopener" href="https://space.bilibili.com/${md["uid"]}">${md["name"]}</a>：</div>\n`,
    "        </div>\n",
    "      </header>\n",
    "      <main>\n",
    "        <div class=\"content\" id=\"content\">\n",
    "          <div>距离您上次更新视频已经过去 <span id=\"delta\"></span> 了。</div>\n",
    "          <div>您上次的投稿是：</div>\n",
    `          <a class="video" target="_blank" rel="external nofollow noreferrer noopener" href="https://www.bilibili.com/video/${md["videos"][0]["bvid"]}">\n`,
    `            <img class=\"video-thumb\" src="${getPath(md["videos"][0]["thumb"])}">\n`,
    "            <div class=\"video-info\">\n",
    `              <div class="video-title">${md["videos"][0]["title"]}</div>\n`,
    `              <div class="video-created">${obj["year"]}-${obj["month"]}-${obj["day"]} ${obj["hour"]}:${obj["minute"]}:${obj["second"]}</div>\n`,
    "            </div>\n",
    "          </a>\n",
    "        </div>\n",
    "      </main>\n",
    "      <footer>\n",
    "        <div class=\"info\" id=\"info\">\n",
    `          <a href="${getPath(docPath)}">当前页面链接</a>\n`,
    "        </div>\n",
    "     </footer>\n",
    "    </div>\n",
    "  </body>\n",
    "</html>\n",
    `<!-- Page built by BUp v${getVersion()} at ${new Date().toISOString()}. -->`
  );

  return html.join('');
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
    `    <meta property="og:url" content="${getURL(docPath)}">\n`,
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
    "      <header>\n",
    "        <div class=\"title\" id=\"title\">\n",
    "          <h1>BUp</h1>\n",
    "        </div>\n",
    "      </header>\n",
    "      <main>\n",
    "        <div class=\"content\" id=\"content\">\n",
    "          <ul class=\"users\">\n"
  );
  html.push(...mds.sort((a, b) => {
    return -(a["videos"][0]["created"] - b["videos"][0]["created"]);
  }).map((md) => {
    return `            <li><a href=${getPath(md["path"])}>${md["name"]}</a></li>\n`;
  }));
  html.push(
    "          </ul>\n",
    "        </div>\n",
    "      </main>\n",
    "      <footer>\n",
    "        <div class=\"info\" id=\"info\">\n",
    `          <a href="${getPath(docPath)}">当前页面链接</a>\n`,
    "        </div>\n",
    "     </footer>\n",
    "    </div>\n",
    "  </body>\n",
    "</html>\n",
    `<!-- Page built by BUp v${getVersion()} at ${new Date().toISOString()}. -->`
  );

  return html.join('');
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

const build = async (bAPI, mds, docDir, userDir, baseURL, rootDir) => {
  const fullUserDir = path.join(docDir, userDir);
  const getPath = getPathFn(rootDir);
  const getURL = getURLFn(baseURL, rootDir);
  const updatedMDs = mds.filter((md) => {
    return md["updated"];
  });
  if (updatedMDs.length === 0) {
    logger.log("Got no update.");
    process.exit(1);
  }

  logger.log(`Got updates from ${updatedMDs.map((md) => {
    return `${md["uid"]}(${md["name"]})`;
  }).join(", ")}.`);
  await Promise.all(updatedMDs.map(async (md) => {
    try {
      await fsp.mkdir(path.join(fullUserDir, md["uid"]), {"recursive": true});
      // 叔叔不让我们直接外链引用图片啊，只能下载下来了，不要耽误叔叔赚钱。
      await downloadFile(md["avatarURL"], docDir, md["avatar"]);
      await Promise.all(md["videos"].map(async (video) => {
	await downloadFile(video["thumbURL"], docDir, video["thumb"]);
      }));
      await saveJSON(path.join(fullUserDir, md["uid"], "index.json"), md);
      await writeUserPage(md, docDir, getPath, getURL);
    } catch (error) {
      logger.warn(error);
    }
  }));
  try {
    await writeIndexPage(mds, docDir, getPath, getURL);
  } catch (error) {
    logger.warn(error);
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
  const {uids, docDir, userDir, baseURL, rootDir, cookie} = config;
  const suids = uids.map((uid) => {
    return `${uid}`;
  });
  const fullDocDir = path.join(dir, docDir);

  const bAPI = new BAPI(logger, cookie);
  await bAPI.init();

  await clean(suids, fullDocDir, userDir);
  const mds = await check(bAPI, suids, fullDocDir, userDir);
  await build(bAPI, mds, fullDocDir, userDir, baseURL, rootDir);
  process.exit(0);
};

export default bup;
