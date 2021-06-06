
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
  [process.env.DL_CHANNEL_ID]: 0,
  [process.env.SOURCE_CHANNEL_ID]: 0
}

module.exports = {
  mixins: [QueueService(process.env.TRANSPORTER)],
  name: 'telegram',
  metadata: {
    dlCache: new Map(),
    msgIdCache: {
      [process.env.DL_CHANNEL_ID]: new Map(),
      [process.env.SOURCE_CHANNEL_ID]: new Map(),
    }
  },
  queues: {
    'telegram-upload-queue': {
      concurrency: 1,
      async process(job) {
        try {
          let messageId = job.data.messageId
          if (!messageId) {
            messageId = this.metadata.dlCache.get(job.data.dlId).messageId
          }

          const files = ThroughDirectoryWrapper(path.join(process.env.TMP_DIR, 'unpack', job.data.dlId))

          let hasPhoto = job.data.hasPhoto
          if (typeof hasPhoto === 'undefined') {
            hasPhoto = this.metadata.dlCache.get(job.data.dlId).hasPhoto
          }

          messageId && await client.invoke({
            _: 'forwardMessages',
            chat_id: process.env.TRACKS_CHANNEL_ID,
            from_chat_id: process.env.DL_CHANNEL_ID,
            message_ids: [messageId]
          })



          if (!hasPhoto) {
            const pictureFiles = files.filter(file => pictureFormats.indexOf(file.split('.').pop()) >= 0)
            if (pictureFiles.length > 1) {
              const params = ['--to', process.env.TRACKS_CHANNEL_URL, '--album']
              pictureFiles.forEach(f => params.push(f))
              try {
                const bashRes = await bash.call(this, { program: process.env.TELEGRAM_UPLOAD, params })
                this.logger.debug(bashRes)
              } catch (ex) {
                this.logger.error('photos were not uploaded', ex)
              }
            }

            if (pictureFiles.length === 1) {
              try {
                const bashRes = await bash.call(this, { program: process.env.TELEGRAM_UPLOAD, params: ['--to', process.env.TRACKS_CHANNEL_URL, pictureFiles[0], '--caption', job.data.dlId] })
                this.logger.debug(bashRes)
              } catch (ex) {
                this.logger.error('photo was not uploaded', ex)
              }
            }
          }

          const mp3Files = ThroughDirectoryWrapper(path.join(process.env.TMP_DIR, 'mp3', job.data.dlId))
          if (mp3Files.length) {
            const params = ['--to', process.env.TRACKS_CHANNEL_URL, '--album']
            mp3Files.forEach(f => params.push(f))
            await bash.call(this, { program: process.env.TELEGRAM_UPLOAD, params })
          }

          try {
            fs.rmdirSync(path.join(process.env.TMP_DIR, 'unpack', job.data.dlId), { recursive: true })
            fs.rmdirSync(path.join(process.env.TMP_DIR, 'mp3', job.data.dlId), { recursive: true })
          } catch (ex) {
            this.logger.error('Error while deleting folders', ex)
          }
        } catch (ex) {
          this.logger.error(ex)
          throw ex
        }
      }
    }
  },
  async started() {
    client = new Client(new TDLib('/home/sergey/Code/td/build/libtdjson.so'), {
      apiId: process.env.API_ID, // Your api_id, get it at http://my.telegram.org/
      apiHash: process.env.API_HASH // Your api_hash
    })
    await client.connectAndLogin()
    client.on('error', this.logger.error)
    client.on('update', async payload => {
      if (payload.chat_id === +process.env.SOURCE_CHANNEL_ID) {
        // patch to skip first 3 messages on start (in each chat)
        if (++dlCount[payload.chat_id] <= 3) {
          return
        }
        if (payload._ === 'updateChatLastMessage' && payload.last_message && payload.last_message.content && payload.last_message.content.document) {
          if (!this.metadata.msgIdCache[payload.chat_id].has(payload.last_message.id)) {
            this.metadata.msgIdCache[payload.chat_id].set(payload.last_message.id, {
              messageId: payload.last_message.id,
              text: payload.last_message.content.text,
              hasPhoto: !!(payload.last_message.content.web_page && payload.last_message.content.web_page.photo)
            })
            await client.invoke({
              _: 'forwardMessages',
              chat_id: process.env.DL_CHANNEL_ID,
              from_chat_id: process.env.SOURCE_CHANNEL_ID,
              message_ids: [payload.last_message.id]
            })
          }
        }
      }
      if (payload.chat_id === +process.env.DL_CHANNEL_ID || payload.chat_id === +process.env.SOURCE_CHANNEL_ID) {
        // patch to skip first 3 messages on start (in each chat)
        if (++dlCount[payload.chat_id] <= 3) {
          return
        }
        // download attachment from cloud:
        if (payload._ === 'updateChatLastMessage' && payload.last_message && payload.last_message.content && payload.last_message.content.document) {
          if (!this.metadata.msgIdCache[payload.chat_id].has(payload.last_message.id)) {
            this.metadata.msgIdCache[payload.chat_id].set(payload.last_message.id, {
              messageId: payload.last_message.id,
              text: payload.last_message.content.text,
              hasPhoto: !!(payload.last_message.content.web_page && payload.last_message.content.web_page.photo)
            })
            this.metadata.dlCache.set(payload.last_message.content.document.file_name, {
              messageId: payload.last_message.id,
              text: payload.last_message.content.text,
              hasPhoto: !!(payload.last_message.content.web_page && payload.last_message.content.web_page.photo)
            })
          }
        }
        // parse for disk.yandex link and download from there:
        if (payload._ === 'updateChatLastMessage' && payload.last_message && payload.last_message.content && payload.last_message.content.text && payload.last_message.content.text.text) {
          if (!this.metadata.msgIdCache[payload.chat_id].has(payload.last_message.id)) {
            this.metadata.msgIdCache[payload.chat_id].set(payload.last_message.id, {
              messageId: payload.last_message.id,
              text: payload.last_message.content.text,
              hasPhoto: !!(payload.last_message.content.web_page && payload.last_message.content.web_page.photo)
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
                  hasPhoto: !!payload.last_message.content.web_page.photo
                }, jobOpts)
              })
            }
          }
        }
      }
      if (payload.chat_id === +process.env.TRACKS_CHANNEL_ID) {
        if (payload.last_message) {
          try {
            await client.invoke({
              _: 'editMessageCaption',
              chat_id: process.env.TRACKS_CHANNEL_ID,
              message_id: payload.last_message.id,
              caption: { text: '' }
            })
          } catch (ex) {
            this.logger.error('editMessageCaption', { message_id: payload.last_message.id }, ex)
          }
        }
      }
    })

    const watcher = chokidar.watch(process.env.TDD_DEST, { ignored: /^\./, persistent: true })
    watcher.on('add', path => {
      const dlId = path.replace(/^.*[\\\/]/, '')
      this.logger.debug(`will create job for unpacker-queue, dlId=${dlId}, path=${path}`)
      this.createJob('unpacker-queue', { path, dlId }, jobOpts)
    })

    setTimeout(() => {
      if (dlCount[process.env.DL_CHANNEL_ID] <= 3) {
        dlCount[process.env.DL_CHANNEL_ID] = 3
      }
      if (dlCount[process.env.SOURCE_CHANNEL_ID] <= 3) {
        dlCount[process.env.SOURCE_CHANNEL_ID] = 3
      }
      this.logger.info('ready to receive messages')
    }, 3000)
  }
}
