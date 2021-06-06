require('dotenv-defaults').config()
const { ServiceBroker } = require('moleculer')
const googleService = require('./google.service')
const yandexService = require('./yandex.service')
const unpackerService = require('./unpacker.service')
const transcoderService = require('./transcoder.service')
const telegramService = require('./telegram.service')

let broker = new ServiceBroker({
  logger: console,
  logLevel: {
    '**': process.env.DEBUG ? 'debug' : process.env.LOG_LEVEL || 'info'
  },
  transporter: process.env.TRANSPORTER,
  tracking: {
    enabled: true,
    shutdownTimeout: process.env.SHUTDOWN_TIMEOUT || 180 * 1000
  }
})

broker.createService(googleService)
broker.createService(yandexService)
broker.createService(unpackerService)
broker.createService(transcoderService)
broker.createService(telegramService)

broker.start()