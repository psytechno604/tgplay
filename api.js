require('dotenv-defaults').config()
const { ServiceBroker } = require('moleculer')
const apiService = require('./services/api.service')

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

broker.createService(apiService)

broker.start()