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
        const mp3Dir = path.join(process.env.TMP_DIR, 'mp3', job.data.dlId)
        /* if (fs.existsSync(mp3Dir)) { // TODO: catch "respawns"
          return `${mp3Dir} folder already exists`
        } */
        await bash.call(this, { program: 'mkdir', params: ['-p', mp3Dir] })
        const files = job.data.filePath ? [job.data.filePath] : ThroughDirectoryWrapper(path.join(process.env.TMP_DIR, 'unpack', job.data.dlId))
        const outfiles = []
        let progress = 0
        for (const file of files) {
          try {
            if (losslessAudioFormats.indexOf(file.split('.').pop()) >= 0) {
              const filePath = path.join(process.env.TMP_DIR, 'mp3', job.data.dlId, file.replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '.mp3'))
              await bash.call(this, {
                program: process.env.FFMPEG, params: ['-y', '-i', file, '-vn', '-ar', '44100', '-ac', '2', '-b:a', process.env.MP3_BITRATE || '320k', filePath]
              })
              outfiles.push(filePath)
            }
          } catch (ex) {
            await this.broker.call('telegram.sendMessage', { chat_id: process.env.LOG_CHANNEL, text: JSON.stringify({ code: ex.code, stderr: ex.stderr, opts: ex.opts, stdout: ex.stdout }) })
          }
          progress++
          job.progress(100 * progress / files.length)
        }
        this.broker.broadcast('file-complete', { dlId: job.data.dlId, files })
        return outfiles
      }
    }
  }
}
