import * as crypto from "node:crypto";
import * as timersp from "node:timers/promises";
import {get, getJSON, postJSON, getRandomSample} from "./utils.js";

// 实在不知道假装成什么的时候就假装成 macOS 上的 Chrome 就好了！我猜他们开发就是
// 这种环境！
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

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
  const current = Math.floor(Date.now() / 1000);

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

  const wbi = crypto.createHash("md5")
	.update(`${params.toString()}${mixinKey}`)
	.digest("hex");

  return `${params.toString()}&w_rid=${wbi}`;
};

const dmSeed = "ABCDEFGHIJK".split('');
// See <https://github.com/Nemo2011/bilibili-api/pull/680/files>.
// 一个验证有没有用户操作的玩意，似乎随便丢点字符给他就过了。
const addDM = (params) => {
  params.set("dm_img_list", "[]");
  params.set("dm_img_str", getRandomSample(dmSeed, 2).join(''));
  params.set("dm_cover_img_str", getRandomSample(dmSeed, 2).join(''));
  params.set("dm_img_inter", "{\"ds\":[],\"wh\":[0,0,0],\"of\":[0,0,0]}");
  return params;
};

const randomInt = (min, max) => {
  if (min > max) {
    [min, max] = [max, min];
  }
  return Math.floor(min + Math.random() * (max - min));
};

class BAPI {
  constructor(logger, opts = {}) {
    this.logger = logger;
    this.img = null;
    this.sub = null;
    this.biliTicket = null;
    this.cookie = opts["cookie"] || "";
    this.userAgent = opts["userAgent"] || userAgent;
    this.maxDelay = 0;
  }

  async init() {
    try {
      // FIXME: 好像每次获取新的 cookie 更容易被风控。评价为这俩都没啥用不如浏览
      // 器隐身模式复制一个。而且似乎 cookie 和 UA 匹配才不容易被风控。
      // await this.initCookie();
      // await this.initBiliTicket();
      if (this.biliTicket != null) {
	this.cookie = [...this.cookie.split("； "), `bili_ticket=${this.biliTicket}`].join("; ");
      }
    } catch (error) {
      // 这些都不是必须的所以失败了就当无事发生。
      this.logger.warn(error);
    }
    // 这个如果失败了后面肯定也会失败所以可以不管。
    await this.initWBIKeys();
  }

  // 希望能让叔叔觉得我们是个人畜无害的普通用户。
  async initCookie() {
    const {headers} = await get("https://www.bilibili.com/", {"User-Agent": this.userAgent});
    if (headers["set-cookie"] == null) {
      return;
    }
    this.logger.debug(`initCookie(): ${JSON.stringify(headers["set-cookie"], null, "  ")}`);
    this.cookie = headers["set-cookie"].join("; ").split("; ").filter((s) => {
      // 看起来 cookie 里面乱七八糟的东西多了反而会触发风控。
      return s.startsWith("buvid3=") || s.startsWith("b_nut=");
    }).join("; ");
    this.logger.debug(`initCookie(): ${this.cookie}`);
  }

  // See <https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/sign/wbi.html>.
  // 一个奇怪的验证，需要从别的地方获取伪装成图片的 key 然后根据参数和时间进行编码。
  async initWBIKeys() {
    const {body} = await getJSON("https://api.bilibili.com/x/web-interface/nav", {
      "User-Agent": this.userAgent,
      "Referer": "https://www.bilibili.com/"
    });
    this.logger.debug(`initWBIKeys(): ${JSON.stringify(body, null, "  ")}`);
    const imgURL = body["data"]["wbi_img"]["img_url"];
    const subURL = body["data"]["wbi_img"]["sub_url"];
    this.img = imgURL.slice(imgURL.lastIndexOf('/') + 1, imgURL.lastIndexOf('.'));
    this.sub = subURL.slice(subURL.lastIndexOf('/') + 1, subURL.lastIndexOf('.'));
  }

  // See <https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/sign/bili_ticket.html>.
  // 似乎能减少风控概率。
  async initBiliTicket(csrf) {
    const current = Math.floor(Date.now() / 1000);
    const key = "XgwSnGZ1p";
    const hexSign = crypto.createHmac("sha256", key)
	  .update(`ts${current}`)
	  .digest("hex");
    const params = new URLSearchParams({
        "key_id": "ec02",
        "hexsign": hexSign,
        "context[ts]": current,
        "csrf": csrf || ""
    });
    const url = `https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket?${params.toString()}`;
    const {body} = await postJSON(url, null, {
      "User-Agent": this.userAgent,
      "Referer": "https://www.bilibili.com/"
    });
    if (body["code"] !== 0) {
      // 假装无事发生也可以，反正不是什么必需品。
      return;
    }
    this.logger.debug(`initBiliTicket(): ${JSON.stringify(body, null, "  ")}`);
    this.biliTicket = body["data"]["ticket"];
  }

  setMaxDelay(maxDelay) {
    if (maxDelay >= 0) {
      this.maxDelay = maxDelay;
    }
  }

  getMaxDelay() {
    return this.maxDelay;
  }

  async getUser(uid) {
    if (this.maxDelay > 0) {
      const delay = randomInt(0, this.maxDelay);
      this.logger.debug(`getUser(): Waiting ${delay} ms to avoid banning...`);
      await timersp.setTimeout(delay);
    }

    const params = new URLSearchParams({"mid": uid});
    const url = `https://api.bilibili.com/x/space/wbi/acc/info?${encodeWBI(addDM(params), this.img, this.sub)}`;
    this.logger.debug(`getUser(): ${url}`);

    const {body} = await getJSON(url, {
      "User-Agent": this.userAgent,
      "Cookie": this.cookie,
      "Referer": `https://space.bilibili.com/${uid}`,
      "Origin": "https://space.bilibili.com"
    });
    this.logger.debug(`getUser(): ${JSON.stringify(body, null, "  ")}`);
    if (body["code"] !== 0) {
      throw new Error(body["message"]);
    }
    return body["data"];
  }

  async getVideos(uid) {
    if (this.maxDelay > 0) {
      const delay = randomInt(0, this.maxDelay);
      this.logger.debug(`getVideos(): Waiting ${delay} ms to avoid banning...`);
      await timersp.setTimeout(delay);
    }

    const params = new URLSearchParams({
      "mid": uid,
      "ps": 3,
      "tid": 0,
      "pn": 1,
      "keyword": "",
      "order": "pubdate",
      "order_avoided": true
    });
    const url = `https://api.bilibili.com/x/space/wbi/arc/search?${encodeWBI(addDM(params), this.img, this.sub)}`;
    this.logger.debug(`getVideos(): ${url}`);

    const {body} = await getJSON(url, {
      "User-Agent": this.userAgent,
      "Cookie": this.cookie,
      "Referer": `https://space.bilibili.com/${uid}/video`,
      "Origin": "https://space.bilibili.com"
    });
    this.logger.debug(`getVideos(): ${JSON.stringify(body, null, "  ")}`);
    if (body["code"] !== 0) {
      throw new Error(body["message"]);
    }
    return body["data"]["list"]["vlist"];
  }
}

export default BAPI;
