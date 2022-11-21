const ApiGateway = require('moleculer-web')
const Queue = require('bull')
const { createBullBoard } = require('bull-board')
const { BullAdapter } = require('bull-board/bullAdapter')

const queues = [
  new Queue(`telegram-upload-queue`, process.env.TRANSPORTER),
  new Queue(`yandex-url-queue`, process.env.TRANSPORTER),
  new Queue(`yandex-file-queue`, process.env.TRANSPORTER),
  new Queue(`unpacker-queue`, process.env.TRANSPORTER),
  new Queue(`transcoder-queue`, process.env.TRANSPORTER),
]

const bullAdapters = queues.map(queue => new BullAdapter(queue))

const { router } = createBullBoard(bullAdapters)

module.exports = {
  name: 'api',
  mixins: [ApiGateway],
  settings: {
    port: process.env.PORT || 4200,
    path: '/',
    routes: [
      {
        path: '/bull-board',
        use: [router],
      }
    ]
  }
}