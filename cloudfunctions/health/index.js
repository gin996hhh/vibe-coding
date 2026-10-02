/**
 * /api/health —— Day 15 唯一要实现的东西
 *
 * 只做一件事：告诉外面"我活着"。
 * 不连数据库、不写任何业务逻辑。
 *
 * 为什么这么写：CloudBase 的云函数被 HTTP 访问时，
 * 如果你返回的对象里有 statusCode / headers / body，
 * 它会把这个对象当成一整个 HTTP 响应发出去。
 * 所以这里包一层，浏览器打开才能直接看到 JSON，
 * 而不是看到一个被转义成字符串的怪东西。
 */
exports.main = async function (event, context) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      ok: true,
      service: 'anchor',
      time: new Date().toISOString()
    })
  };
};
