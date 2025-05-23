"use strict";

/* eslint-disable-next-line no-unused-vars */
const documentReady = (callback) => {
  if (callback == null) {
    return;
  }
  if (
    document.readyState === "complete" || document.readyState === "interactive"
  ) {
    window.setTimeout(callback, 0);
  } else {
    document.addEventListener("DOMContentLoaded", callback);
  }
};

/* eslint-disable-next-line no-unused-vars */
const countDateTime = (created) => {
  const delta = Math.floor((Date.now() - created) / 1000);
  const seconds = delta % 60;
  const minutes = Math.floor(delta / 60) % 60;
  const hours = Math.floor(delta / 60 / 60) % 24;
  const days = Math.floor(delta / 60 / 60 / 24);
  const res = [];
  if (days > 0) {
    res.push(`${days} 天`);
  }
  if (hours > 0) {
    res.push(`${hours} 时`);
  }
  if (minutes > 0) {
    res.push(`${minutes} 分`);
  }
  res.push(`${seconds} 秒`);
  return res.join(' ');
};
