const path = require('path')
const QueueService = require('moleculer-bull')
const bash = require('../lib/bash')
const jobOpts = require('../lib/jobOpts')

module.exports = {
  mixins: [QueueService(process.env.TRANSPORTER)],
  name: 'unpacker',
  metadata: {
    dlCache: new Map()
  },
  events: {
    'file-complete'(payload) {
      if (payload.dlId && this.metadata.dlCache.has(payload.dlId)) {
        this.createJob('telegram-upload-queue', { dlId: payload.dlId }, jobOpts(payload.dlId))
        this.metadata.dlCache.delete(payload.dlId)
      }
    }
  },
  queues: {
    "unpacker-queue": {
      concurrency: 2,
      async process(job) {
        this.logger.debug('unpacker.queue.process', job)
        if (this.metadata.dlCache.has(job.data.dlId)) {
          const msg = `already processing: ${job.data.dlId}`
          this.logger.debug(msg)
          return msg
        }
        this.metadata.dlCache.set(job.data.dlId, 1)
        await bash.call(this, { program: 'mkdir', params: ['-p', path.join(process.env.TMP_DIR, 'unpack', job.data.dlId)] })
        const ext = job.data.path.split('.').pop()
        const index = ['zip', 'rar'].indexOf(ext)
        
        if (index === 0) {
          await bash.call(this, {
            program: 'unzip', params: ['-o', job.data.path, '-d', path.join(process.env.TMP_DIR, 'unpack', job.data.dlId)]
          })
        }
        if (index === 1) {
          await bash.call(this, {
            program: 'unrar', params: ['e', job.data.path, path.join(process.env.TMP_DIR, 'unpack', job.data.dlId)]
          })
        }
        await bash.call(this, { program: 'rm', params: [job.data.path] })
        if (index < 0) {
          throw new Error(`extension ${ext} not supported, dlId ${job.data.dlId}, job.id ${job.id}`)
        }
        this.createJob('transcoder-queue', { dlId: job.data.dlId }, jobOpts(job.data.dlId))
      }
    }
  }
}
