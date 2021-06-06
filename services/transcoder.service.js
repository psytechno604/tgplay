const path = require('path')
const QueueService = require('moleculer-bull')
const bash = require('../lib/bash')
const { ThroughDirectoryWrapper } = require('../lib/utils')

const losslessAudioFormats = process.env.LOSSLESS_AUDIO_FORMATS.split(',')

module.exports = {
  mixins: [QueueService(process.env.TRANSPORTER)],
  name: 'transcoder',
  queues: {
    "transcoder-queue": {
      async process(job) {
        await bash.call(this, { program: 'mkdir', params: ['-p', path.join(process.env.TMP_DIR, 'mp3', job.data.dlId)] })
        const files = job.data.filePath ? [job.data.filePath] : ThroughDirectoryWrapper(path.join(process.env.TMP_DIR, 'unpack', job.data.dlId))
        const outfiles = []
        for (const file of files) {
          if (losslessAudioFormats.indexOf(file.split('.').pop()) >= 0) {
            const filePath = path.join(process.env.TMP_DIR, 'mp3', job.data.dlId, file.replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '.mp3'))
            await bash.call(this, {
              program: process.env.FFMPEG, params: ['-y', '-i', file, '-vn', '-ar', '44100', '-ac', '2', '-b:a', '320k', filePath]
            })
            outfiles.push(filePath)
          }
        }
        this.broker.broadcast('file-complete', { dlId: job.data.dlId, files })
        return outfiles
      }
    }
  }
}
