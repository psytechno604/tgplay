const ApiGateway = require('moleculer-web')

const { createBullBoard } = require('@bull-board/api')
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter')
const { ExpressAdapter } = require('@bull-board/express')
const { Queue: QueueMQ } = require('bullmq')

let redisOptions = {
  port: 6379,
  host: '',
  password: '',
  tls: false
}
if (process.env.TRANSPORTER) {
  redisOptions = /^redis:\/\/((.*?)\:(.*?)@)?(.*?)\:([0-9]*)$/g
    .exec(process.env.TRANSPORTER)
    .reduce((result, value, index) => {
      switch (index) {
        case 2:
          // username
          break
        case 3: result['password'] = value; break
        case 4: result['host'] = value; break
        case 5: result['port'] = parseInt(value); break
      }
      return result
    }, redisOptions)
}

const queues = [
  new QueueMQ(`telegram-upload-queue`, { connection: redisOptions }),
  new QueueMQ(`yandex-url-queue`, { connection: redisOptions }),
  new QueueMQ(`yandex-file-queue`, { connection: redisOptions }),
  new QueueMQ(`unpacker-queue`, { connection: redisOptions }),
  new QueueMQ(`transcoder-queue`, { connection: redisOptions }),
]

const bullAdapters = queues.map(queue => new BullMQAdapter(queue))

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath(`/bull-board`)

createBullBoard({
  queues: bullAdapters,
  serverAdapter
})

module.exports = {
  name: 'api',
  mixins: [ApiGateway],
  settings: {
    port: process.env.PORT || 4200,
    path: '/',
    routes: [
      {
        path: '/bull-board',
        use: [serverAdapter.getRouter()],
      }
    ]
  }
}