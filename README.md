BUp
===

Bilibili Update Checker
-----------------------

大概就是每隔一定时间爬一下 UP 主的最新投稿然后生成一个已经多久多久没更新的催更网页。

能不能稳定用取决于叔叔家的反爬虫风控策略。

# 使用方法

编辑 `config.json`, 把想催更的 UP 主 UID 加入 `uids` 列表。其它选项看着改。

如果老被风控就打开一个浏览器隐身模式页面访问叔叔网站首页，然后找到 `www.bilibili.com` 的网络请求把 `Set-Cookie` 里面的 `buvid3` 和 `b_nuts` 复制到 `cookie` 项（这两个 key 和 value 还有等号都要复制，中间用英文分号加空格分隔），再把 `User-Agent` 复制到 `userAgent` 项。

然后随便你用什么办法（crontab 或者 timer）定时运行 `npx bup`，运行一次检查一次，为了防止被风控不要爬的太频繁，感觉半小时一次就差不多了。

然后把 `docs` 目录当作网站根目录即可。
