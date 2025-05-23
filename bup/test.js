import * as crypto from "node:crypto";
import {get, getRandomSample} from "./utils.js";

const uid = "521444";

// See <https://github.com/Nemo2011/bilibili-api/pull/680/files>.
const dmSeed = "ABCDEFGHIJK".split('');

const params = new URLSearchParams({
  "mid": uid,
  "ps": 10,
  "tid": 0,
  "pn": 1,
  "keyword": "",
  "order": "pubdate",
  "dm_img_list": "[]",
  "dm_img_str": getRandomSample(dmSeed, 2).join(''),
  "dm_cover_img_str": getRandomSample(dmSeed, 2).join(''),
  "dm_img_inter": "{\"ds\":[],\"wh\":[0,0,0],\"of\":[0,0,0]}",
  "order_avoided": true
});

const getWBIKeys = async () => {
  const res = await get("https://api.bilibili.com/x/web-interface/nav", {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Referer": "https://www.bilibili.com/"
  });
  const wbi = JSON.parse(res.toString("utf8"))["data"]["wbi_img"];
  const imgURL = wbi["img_url"];
  const subURL = wbi["sub_url"];
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

  const wbi = crypto.createHash("md5").update(`${params.toString()}${mixinKey}`).digest("hex");

  return `${params.toString()}&w_rid=${wbi}`;
};

const main = async () => {
  const {img, sub} = await getWBIKeys();
  const url = `https://api.bilibili.com/x/space/wbi/arc/search?${encodeWBI(params, img, sub)}`;
  console.log(url);

  const res = await get(url, {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Referer": `https://space.bilibili.com/${uid}/video`,
    "Origin": "https://space.bilibili.com"
  });

  const data = JSON.parse(res.toString("utf8"))["data"];
  console.log(JSON.stringify(data, null, "  "));

  const videos = data["list"]["vlist"];
  console.log(JSON.stringify(videos, null, "  "));
};

main();
