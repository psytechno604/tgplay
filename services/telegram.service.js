
const fs = require('fs')
const path = require('path')
const uuid = require('uuid')
const chokidar = require('chokidar')
const { Client } = require('tdl')
const { TDLib } = require('tdl-tdlib-addon')
const bash = require('../lib/bash')
const QueueService = require('moleculer-bull')
const { ThroughDirectoryWrapper } = require('../lib/utils')
const jobOpts = require('../lib/jobOpts')

const pictureFormats = process.env.PICTURE_FORMATS.split(',')


function detectURLs(message) {
  if (typeof message === 'string') {
    var urlRegex = /(((https?:\/\/)|(www\.))[^\s]+)/g;
    return message.match(urlRegex)
  }
}

let client

let dlCount = {
  [process.env.TELEGRAM_DAEMON_CHANNEL]: [],
  [process.env.SOURCE_CHANNEL]: []
}

let dlLimit = 4

module.exports = {
  mixins: [QueueService(process.env.TRANSPORTER)],
  name: 'telegram',
  metadata: {
    dlCache: new Map(),
    msgIdCache: {
      [process.env.TELEGRAM_DAEMON_CHANNEL]: new Map(),
      [process.env.SOURCE_CHANNEL]: new Map(),
    }
  },
  queues: {
    'telegram-upload-queue': {
      concurrency: 1,
      async process(job) {
        try {
          let messageId = job.data.messageId
          if (!messageId) {
            const cachedItem = this.metadata.dlCache.get(job.data.dlId)
            cachedItem && (messageId = this.metadata.dlCache.get(job.data.dlId).messageId)
          }

          const files = ThroughDirectoryWrapper(path.join(process.env.TMP_DIR, 'unpack', job.data.dlId))

          let hasPhoto = job.data.hasPhoto
          if (typeof hasPhoto === 'undefined') {
            const cacheEntry = this.metadata.dlCache.get(job.data.dlId)
            if (!cacheEntry) {
              this.logger.error('No cache entry for dlId', job.data.dlId)
            }
            cacheEntry && (hasPhoto = this.metadata.dlCache.get(job.data.dlId).hasPhoto)
          }

          if (!messageId) {
            this.logger.error('no messageId', job.data)
          }

          messageId && await client.invoke({
            _: 'forwardMessages',
            chat_id: process.env.TRACKS_CHANNEL,
            from_chat_id: process.env.TELEGRAM_DAEMON_CHANNEL,
            message_ids: [messageId]
          })

          if (!hasPhoto) {
            const pictureFiles = files.filter(file => pictureFormats.indexOf(file.split('.').pop()) >= 0)
            if (pictureFiles.length > 1) {
              const params = ['-u', 'whatever', '--', process.env.TELEGRAM_UPLOAD, '--to', process.env.TRACKS_CHANNEL_URL, '--album']
              pictureFiles.forEach(f => params.push(f))
              try {
                const bashRes = await bash.call(this, { program: 'runuser', params })
                this.logger.debug(bashRes)
              } catch (ex) {
                this.logger.error('photos were not uploaded', ex)
              }
            }

            if (pictureFiles.length === 1) {
              try {
                const bashRes = await bash.call(this, { program: 'runuser', params: ['-u', 'whatever', '--', process.env.TELEGRAM_UPLOAD, '--to', process.env.TRACKS_CHANNEL_URL, pictureFiles[0], '--caption', job.data.dlId] })
                this.logger.debug(bashRes)
              } catch (ex) {
                this.logger.error('photo was not uploaded', ex)
              }
            }
          }

          const mp3Files = ThroughDirectoryWrapper(path.join(process.env.TMP_DIR, 'mp3', job.data.dlId))
          if (mp3Files.length) {
            const params = ['-u', 'whatever', '--', process.env.TELEGRAM_UPLOAD, '--to', process.env.TRACKS_CHANNEL_URL, '--album']
            mp3Files.forEach(f => params.push(f))
            this.logger.debug('running TELEGRAM_UPLOAD', { params })
            await bash.call(this, { program: 'runuser', params })
          }

          try {
            fs.rmdirSync(path.join(process.env.TMP_DIR, 'unpack', job.data.dlId), { recursive: true })
            fs.rmdirSync(path.join(process.env.TMP_DIR, 'mp3', job.data.dlId), { recursive: true })
          } catch (ex) {
            this.logger.error('Error while deleting folders', ex)
          }
          return 'done'
        } catch (ex) {
          this.logger.error('telegram-upload-queue: error', ex)
          return 'wtf..: ' + ex.message
          //throw ex
        }
      }
    }
  },
  actions: {
    sendMessage(ctx) {
      return this.sendMessage(ctx.params.chat_id, ctx.params.text)
    }
  },
  methods: {
    sendMessage(chat_id, text) {
      return client.invoke({
        _: 'sendMessage',
        chat_id,
        input_message_content: {
          _: 'inputMessageText',
          text: {
            _: 'formattedText',
            text
          }
        }
      })
    }
  },
  async started() {
    this.logger.debug('LIBTDJSON_SO', process.env.LIBTDJSON_SO)
    client = new Client(new TDLib(process.env.LIBTDJSON_SO), {
      apiId: process.env.API_ID, // Your api_id, get it at http://my.telegram.org/
      apiHash: process.env.API_HASH // Your api_hash
    })
    await client.connectAndLogin()
    client.on('error', this.logger.error)
    client.on('update', async payload => {
      const hasPhoto = payload && payload.last_message && payload.last_message.content && payload.last_message.content.web_page && !!payload.last_message.content.web_page.photo
      if (payload.chat_id === +process.env.SOURCE_CHANNEL) {
        // patch to skip first 3 messages on start (in each chat)
        if (dlCount[payload.chat_id].length < dlLimit) {
          dlCount[payload.chat_id].push(payload)
          return
        }
        // forward all messages with text & document:
        if (payload._ === 'updateChatLastMessage' && payload.last_message && payload.last_message.content && (payload.last_message.content.document || payload.last_message.content.text && payload.last_message.content.text.text)) {
          if (!this.metadata.msgIdCache[payload.chat_id].has(payload.last_message.id)) {
            this.metadata.msgIdCache[payload.chat_id].set(payload.last_message.id, {
              messageId: payload.last_message.id,
              text: payload.last_message.content.text,
              hasPhoto
            })
          }
          const check = await this.broker.call('database.messageIdExists', { messageId: payload.last_message.id })
          if (!check) {
            await client.invoke({
              _: 'forwardMessages',
              chat_id: process.env.TELEGRAM_DAEMON_CHANNEL,
              from_chat_id: process.env.SOURCE_CHANNEL,
              message_ids: [payload.last_message.id]
            })
            await this.broker.call('database.insertMessageId', { messageId: payload.last_message.id })
          } else {
            await this.sendMessage(process.env.LOG_CHANNEL, `already forwarded. messageId=${payload.last_message.id}:`)
            await client.invoke({
              _: 'forwardMessages',
              chat_id: process.env.LOG_CHANNEL,
              from_chat_id: process.env.SOURCE_CHANNEL,
              message_ids: [payload.last_message.id]
            })
          }
        }
      }
      if (payload.chat_id === +process.env.TELEGRAM_DAEMON_CHANNEL) {
        // patch to skip first 3 messages on start (in each chat)
        if (dlCount[payload.chat_id].length < dlLimit) {
          dlCount[payload.chat_id].push(payload)
          return
        }
        // download attachment from telegram cloud:
        if (payload._ === 'updateMessageContent' && payload.new_content && payload.new_content.text && payload.new_content.text.text && payload.new_content.text.text.endsWith(' ready')) {
          const archiveFile = path.join(process.env.TELEGRAM_DAEMON_DEST, payload.new_content.text.text.substr(0, payload.new_content.text.text.length - 6))
          const dlId = archiveFile.replace(/^.*[\\\/]/, '')
          const check = await this.broker.call('database.dlIdExists', { dlId })
          if (check) {
            this.logger.debug(`already processed: ${dlId}`)
            return 'already processed'
          }
          await this.broker.call('database.insertDlId', {
            dlId,
            serviceName: 'telegram'
          })
          this.logger.debug(`will create job for unpacker-queue, dlId=${dlId}, archiveFile=${archiveFile}`)
          this.createJob('unpacker-queue', { archiveFile, dlId }, { ...jobOpts(dlId), delay: 1 * process.env.UNPACKER_DELAY })
        }
        if (payload._ === 'updateChatLastMessage' && payload.last_message && payload.last_message.content && payload.last_message.content.document) {
          if (!this.metadata.msgIdCache[payload.chat_id].has(payload.last_message.id)) {
            this.metadata.msgIdCache[payload.chat_id].set(payload.last_message.id, {
              messageId: payload.last_message.id,
              text: payload.last_message.content.text || payload.last_message.content.caption && payload.last_message.content.caption.text,
              hasPhoto
            })
            if (!this.metadata.dlCache.has(payload.last_message.content.document.file_name)) {
              this.metadata.dlCache.set(payload.last_message.content.document.file_name, {
                messageId: payload.last_message.id,
                text: payload.last_message.content.text || payload.last_message.content.caption && payload.last_message.content.caption.text,
                hasPhoto
              })
            }
          }
        }
        // parse for disk.yandex link and download from there:
        if (payload._ === 'updateChatLastMessage' && payload.last_message && payload.last_message.content && payload.last_message.content.text && payload.last_message.content.text.text) {
          if (!this.metadata.msgIdCache[payload.chat_id].has(payload.last_message.id)) {
            this.metadata.msgIdCache[payload.chat_id].set(payload.last_message.id, {
              messageId: payload.last_message.id,
              text: payload.last_message.content.text || payload.last_message.content.caption && payload.last_message.content.caption.text,
              hasPhoto
            })
            const urls = detectURLs(payload.last_message.content.text.text)
            if (Array.isArray(urls)) {
              const yaUrls = urls.filter(url => url.startsWith('https://disk.yandex.ru/') || url.startsWith('https://yadi.sk/'))
              yaUrls.forEach(releaseUrl => {
                this.logger.debug(`yandex url ${releaseUrl}`)
                this.createJob('yandex-url-queue', {
                  releaseUrl,
                  messageId: payload.last_message.id,
                  text: payload.last_message.content.text,
                  hasPhoto
                }, jobOpts(releaseUrl))
              })
            }
          }
        }
      }
      if (payload.chat_id === +process.env.TRACKS_CHANNEL) {
        if (payload.last_message) {
          try {
            await client.invoke({
              _: 'editMessageCaption',
              chat_id: process.env.TRACKS_CHANNEL,
              message_id: payload.last_message.id,
              caption: { text: '' }
            })
          } catch (ex) {
            this.logger.error('editMessageCaption', { message_id: payload.last_message.id }, ex)
          }
        }
      }
    })

    setTimeout(() => {
      dlLimit = 0
      this.logger.info('ready to receive messages')
    }, 3000)
  }
}
