require('dotenv-defaults').config()
const { ServiceBroker } = require('moleculer')
const googleService = require('./services/google.service')
const yandexService = require('./services/yandex.service')
const unpackerService = require('./services/unpacker.service')
const transcoderService = require('./services/transcoder.service')
const telegramService = require('./services/telegram.service')
const databaseService = require('./services/database.service')

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
broker.createService(databaseService)

broker.start()