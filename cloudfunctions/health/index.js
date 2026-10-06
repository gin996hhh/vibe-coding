'use strict';

/**
 * /api/health —— Day 15 唯一要实现的后端接口
 *
 * 只做一件事：告诉外面"我活着"。不连数据库、不写任何业务逻辑。
 *
 * 为什么写成起服务器的样子（而不是 exports.main）：
 * 用的是 CloudBase 的「HTTP 云函数」类型，容器起来后会执行 scf_bootstrap
 * 启动这个文件，要求它自己监听端口。所以这里必须起一个 http server，
 * 端口从环境变量 PORT 读（CloudBase 注入），取不到就兜底 9000。
 *
 * 两个额外处理：
 * 1. CORS 跨域头不在代码里设 —— 网关层（HTTP 访问服务的跨域设置）已经配了
 *    允许来源＝静态托管域名。代码层再设一个（哪怕是 *），两层会拼成
 *    "https://xxx,*" 这种畸形值，浏览器不认，直接拦掉整个请求（Day 20 踩过）。
 * 2. OPTIONS 直接返回 204 —— 浏览器的 CORS 预检请求，不处理的话真正的
 *    请求会被挡掉。
 */
const http = require('node:http');
const PORT = process.env.PORT || 9000;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // CORS 预检，直接放行
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  res.statusCode = 200;
  res.end(
    JSON.stringify({
      ok: true,
      service: 'anchor',
      time: new Date().toISOString()
    })
  );
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`health listening on 0.0.0.0:${PORT}`);
});
