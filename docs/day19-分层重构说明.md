# Day 19｜数据访问层：把数据库代码从接口里拆出来

## 一、拆完之后，目录长这样

```
cloudfunctions/
  _shared/                        数据访问层（源码只有一份，打包时分发给每个函数）
    gatewayClient.js              最底层：怎么连网关、带凭证、发请求、解析返回
    planDaysRepository.js         plan_days 这张表的全部查询
    checkinsRepository.js         checkins 这张表的全部读写

  plan-days/                      计划接口（入口层 + 业务组装）
    index.js
    planDaysRepository.js         ← 打包时从 _shared 复制进来
    checkinsRepository.js         ← 同上（读单天要带出当天体检）
    gatewayClient.js              ← 同上

  checkins/                       体检接口（入口层 + 业务规则）
    index.js
    checkinsRepository.js         ← 打包时从 _shared 复制进来
    planDaysRepository.js         ← 同上（写体检前要确认这天有没有计划）
    gatewayClient.js              ← 同上

  health/                         健康检查，不查库，今天没动
```

## 二、三层各放什么

入口层（`index.js`）
接 HTTP 请求、判断方法和参数合不合规、把数据拼成契约规定的形状返回。
`checkins` 的"睡眠只能是 1 到 5"这类校验也在这里——它是业务规矩，不是数据库的规矩。

业务组装（`index.js` 里的 `readOneDay`）
把两张表的数据拼成契约第 7 条规定的形状：先问 `planDaysRepository` 要这天的计划，
再问 `checkinsRepository` 要这天的体检，拼在一起。它只做拼装，不碰查询细节。

数据访问层（`_shared/` 三个文件）
`gatewayClient.js`：请求发给哪个地址、带什么凭证、返回怎么解析、出错时把状态码挂在哪。
`planDaysRepository.js`：查哪些字段、筛选条件怎么翻译成网关的查询串、总数怎么拿。
`checkinsRepository.js`：按日期查一条、新增一条、更新某一天。

一句话记住：**入口层管 HTTP，业务层管拼装和规矩，数据访问层管怎么查表。**

## 三、为什么接口文件里不许写查询

当初把查询直接写在接口里，能跑，但有两个具体的坏处：

一是每加一个接口就要抄一遍连接和凭证的代码，抄漏一处就是一个 500。

二是同一张表的查询会散在多个文件里。这个项目里 `plan_days` 这张表就有两个地方要用——
`plan-days` 接口读它，`checkins` 写体检前也要确认这天有没有计划。如果按接口各写一份，
将来给这张表加一个字段就要改两处，**改漏一处不会报错**，只会表现为：一个接口读得到
这个字段，另一个读不到。这类问题最难查，因为它不报错，只是安静地不对。

所以 repository 按**表**划分，不按接口划分：一张表的知识，全项目只有一份。

## 四、分层到位检测（Day 19 检测第 1 项）

搜索关键字：`select=` `date=eq.` `fetch(` `ilike` `order=` `limit=` `gte.`

接口文件（`plan-days/index.js`、`checkins/index.js`）：**命中 0 次**

数据访问层（`_shared/` 三个文件）：**命中 13 处**

```
planDaysRepository.js:48   'select=' + SELECT, 'order=date.desc'
planDaysRepository.js:52   or=(morning_anchor.ilike.*...
planDaysRepository.js:62   'date=gte.' + daysAgo(n)
planDaysRepository.js:65   'limit=' + Number(limit)
planDaysRepository.js:72   'select=date&limit=1'
planDaysRepository.js:90   'select=' + SELECT + '&date=eq.' + ...
planDaysRepository.js:103  'select=date&date=eq.' + ...
checkinsRepository.js:30   'select=' + SELECT + '&date=eq.' + ...
checkinsRepository.js:44   'select=' + SELECT
checkinsRepository.js:58   'select=' + SELECT + '&date=eq.' + ...
gatewayClient.js:60        fetch(url, init)
```

一处要如实说明的地方：如果按字面搜 `update`、`insert`、`plan_days`，接口文件里会搜到几条，
但它们**不是查询**——`checkinsRepo.update(...)` 是调用函数名，
`'这天还没有计划（plan_days 表里没有这一天）'` 是给用户看的中文提示，
另外两处在注释里。查询串特征的搜索结果才是真正的判据：接口文件 0 命中。

这里有个不能动的细节：那两条中文提示里的表名不能删、不能改成"计划表"。
删了就改变了接口的返回内容，违反今天"行为不变"的要求。

## 五、为什么要有打包防呆

每个云函数是各自打成一个压缩包单独上传的，运行时只看得见自己包里的文件。
所以源码虽然只有一份，打包时必须分发进每一个包。分发靠脚本做，就怕哪次绕过脚本、
手传一个旧包，线上就变成两份副本内容不一致——这种不一致不会报错，只会表现为
某个接口读到的字段和另一个不一样。

所以 `tools/pack-cloudfunctions.py` 里加了三道检查，任何一道不过就直接报错退出、不产出 zip：

1. `index.js` 里 `require('./xxx')` 的每个本地文件，必须都在包里（防漏文件）
2. 两个包里的共享层文件必须逐字节一致（防只改了一边）
3. 包里的共享层文件必须和 `_shared` 源码一致（防用了旧副本）

## 六、重构前的离线自检

上传前用假网关接住请求，把数据访问层真正发出的地址记下来，和重构前那版代码会发出的
地址逐条对照——11 条全部一致，包括查询串里的转义（`q=温水` 转义成 `%E6%B8%A9%E6%B0%B4`）。

脚本：`tools/check-repository.js`，以后再动数据访问层可以直接重跑。

做这一步的原因：地址差一个字符，线上就读不到数据，但接口不会报错，只会安静地返回空。
部署后才发现要重新打包重传，不如上传前先对清楚。
