const path = require('path')
const axios = require('axios')
const QueueService = require('moleculer-bull')
const bash = require('./bash')
const jobOpts = require('./lib/jobOpts')

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
        if (res && res.data && res.data._embedded && res.data._embedded.items) {
          this.metadata.yandexUrls.set(res.data.name, {
            length: res.data._embedded.items.length,
            messageId: job.data.messageId,
            hasPhoto: job.data.hasPhoto,
            text: job.data.text
          })
          const dlFolder = path.join(process.env.TMP_DIR, 'unpack', res.data.name)
          await bash.call(this, { program: 'mkdir', params: ['-p', dlFolder] })
          for (const item of res.data._embedded.items) {
            this.createJob('yandex-file-queue', {
              dlId: res.data.name,
              fileUrl: item.file,
              filePath: path.join(dlFolder, item.name)
            }, jobOpts)
          }
          return res.data.name
        }
      }
    },
    'yandex-file-queue': {
      concurrecncy: 1,
      async process(job) {
        // await bash.call(this, { program: 'curl', params: ['-L', job.data.fileUrl, '--output', job.data.filePath] })
        await bash.call(this, { program: 'wget', params: ['-O', job.data.filePath, job.data.fileUrl] })
        // await bash.call(this, { program: 'lftp', params: ['-c', `set net:idle 10; set net:max-retries 3; set net:reconnect-interval-base 3; set net:reconnect-interval-max 3; pget -n 10 -c "${job.data.filePath}"`]} )
        this.createJob('transcoder-queue', { dlId: job.data.dlId, filePath: job.data.filePath }, jobOpts)
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
        }, jobOpts)
        this.metadata.yandexUrls.delete(payload.dlId)
        return
      }
      if (x && x.length) {
        this.metadata.yandexUrls.set(payload.dlId, { ...x, length: x.length - 1 })
      }
    }
  }
}
