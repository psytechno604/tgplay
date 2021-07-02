const path = require('path')
const axios = require('axios')
const QueueService = require('moleculer-bull')
const bash = require('../lib/bash')
const jobOpts = require('../lib/jobOpts')

module.exports = {
  mixins: [QueueService(process.env.TRANSPORTER)],
  name: 'yandex',
  metadata: {
    yandexUrls: new Map()
  },
  queues: {
    'yandex-url-queue': {
      concurrecncy: 1,
      async process(job) {
        const fullUrl = process.env.YANDEX_PUBLIC_DL_URL + encodeURIComponent(job.data.releaseUrl)
        const res = await axios.get(fullUrl)
        const check = await this.broker.call('database.dlIdExists', { dlId: res.data.name })
        if (check) {
          this.logger.debug(`already processed: ${res.data.name}`)
          return 'already processed'
        }
        await this.broker.call('database.insertDlId', {
          dlId: res.data.name,
          releaseUrl: job.data.releaseUrl,
          serviceName: 'yandex'
        })
        if (res && res.data && res.data._embedded && res.data._embedded.items
          && !this.metadata.yandexUrls.has(res.data.name)) {
          this.metadata.yandexUrls.set(res.data.name, {
            length: res.data._embedded.items.length,
            messageId: job.data.messageId,
            hasPhoto: job.data.hasPhoto,
            text: job.data.text
          })
          const dlFolder = path.join(process.env.TMP_DIR, 'unpack', res.data.name)
          await bash.call(this, { program: 'mkdir', params: ['-p', dlFolder] })
          for (const item of res.data._embedded.items) {
            const filePath = path.join(dlFolder, item.name)
            await this.createJob('yandex-file-queue', {
              dlId: res.data.name,
              fileUrl: item.file,
              filePath
            }, jobOpts(filePath))
          }
          return res.data.name
        }
      }
    },
    'yandex-file-queue': {
      concurrecncy: 1,
      async process(job) {
        await bash.call(this, { program: 'wget', params: ['-O', job.data.filePath, job.data.fileUrl] })
        this.createJob('transcoder-queue', { dlId: job.data.dlId, filePath: job.data.filePath }, jobOpts(job.data.filePath))
      }
    }
  },
  events: {
    'file-complete'(payload) {
      const x = this.metadata.yandexUrls.get(payload.dlId)
      if (x && x.length === 1) {
        this.createJob('telegram-upload-queue', {
          dlId: payload.dlId,
          messageId: x.messageId,
          hasPhoto: x.hasPhoto,
          text: x.text
        }, jobOpts(payload.dlId))
        this.metadata.yandexUrls.delete(payload.dlId)
        return
      }
      if (x && x.length) {
        this.metadata.yandexUrls.set(payload.dlId, { ...x, length: x.length - 1 })
      }
    }
  }
}
