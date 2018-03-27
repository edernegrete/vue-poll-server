
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const Koa = require('koa');
const logger = require('koa-logger');
const router = require('koa-router')();
const bodyParser = require('koa-bodyparser');
const fs = require('fs');
const cors = require('@koa/cors');
const moment = require('moment');
const JsonDB = require('node-json-db');

const db = new JsonDB('pollDB', true, false);

const jsonData = require('./polls/data.json');
let polls = jsonData.polls;
const lastKey = Object.keys(polls).length;
const lastPollParse = polls[lastKey].map((item, index) => {
    item.isLast = true
    return item;
  });
polls[lastKey] = lastPollParse;

const app = new Koa();

app.use(bodyParser());
app.use(cors());

// Custom 401 handling
app.use(async (ctx, next) => next().catch((err) => {
  if (err.status === 401) {
    ctx.status = 401;
    const errMessage = err.originalError ?
      err.originalError.message :
      err.message;
    ctx.body = {
      error: errMessage,
    };
    ctx.set('X-Status-Reason', errMessage);
  } else {
    throw err;
  }
}));

// Logger
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.set('X-Response-Time', `${ms}ms`);
});

if (process.env.NODE_ENV !== 'test') {
  app.use(logger());
}


router.post('/auth', async (ctx) => {
  ctx.body = {
    status: 'success'
  };
});

router.post('/answers', async (ctx) => {
  if(!ctx.request.body || !Object.keys(ctx.request.body).length) {
    ctx.status = 400;
    ctx.body = {
      status: 'Please provide a valid body'
    }
    return;
  }
  const timestamp = new Date().getTime();
  const payload = {
    timestamp: timestamp,
    data: ctx.request.body
  }
  await db.push('/answers[]', payload, true);
  ctx.status = 200;
  ctx.body = {
    status: 'success'
  }
});

const mapIds = (answers) => {
  let mapped = [];
  answers.forEach(item => {
    mapped.push(item.data.map(el => el.id))
  });
  return mapped;
}

const getCounts = (ids) => {
  let counts = {};
  ids.forEach(function(x) { counts[x] = (counts[x] || 0)+1; });
  return counts;
}

const findId = (id) => {
  let data
  for(let poll in polls) {
    if(!data) {
      data = polls[poll].find(o => o.id === Number(id));
    }
  }
  return data;
}

const generatePercentage = (counts, total) => {
  let percentages = []
  for(let item in counts) {
    let id = findId(item);
    let payload = {
      text: id.text,
      percentage: (counts[item] * 100) / total
    }
    percentages.push(payload);
  }
  return percentages;
};

const getPercentage = (answers, total) => {
  const idsMap = mapIds(answers);
  const ids = [].concat.apply([], idsMap);
  const counts = getCounts(ids, total);
  return generatePercentage(counts, total);
}

router.get('/todayAnswers', async (ctx) => {
  const today = moment().format('LL');
  const answers =  db.getData('/answers');
  const todaypolls = answers.filter(item => moment(item.timestamp).format('LL') === today);
  const todayTotal = todaypolls.length;
  const percentage = await getPercentage(answers, todayTotal);
  ctx.body = {
    total: todayTotal,
    answers: answers.length ? answers : 'No answers today',
    percentages: percentage
  }
  ctx.status = 200
});

router.get('/questions/:id', async (ctx) => {
  const pollRes = polls[ctx.params.id];
  if(pollRes) {
    ctx.body = polls[ctx.params.id];
    ctx.status = 200
    return;
  }

  ctx.status = 404;
  ctx.body = 'Not found';

});



app.use(router.routes());
app.use(router.allowedMethods());

module.exports = app;
