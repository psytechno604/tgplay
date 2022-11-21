const spawn = require('child_process').spawn
const codeProcessor = ({ code, res, opts, resolve, reject }) => {
  res.code = code
  res.opts = { command: opts.command, program: opts.program, params: opts.params }
  res.stdout = res.stdout.map(x => x instanceof Buffer ? x.toString('utf8') : x)
  res.stderr = res.stderr.map(x => x instanceof Buffer ? x.toString('utf8') : x)
  if (code === 0) {
    resolve(res)
  } else {
    reject(res)
  }
  if (typeof res.timeout !== 'undefined') {
    clearTimeout(res.timeout)
  }
}
module.exports = async function (opts) {
  let program, params
  if (opts.command) {
    params = Array.isArray(opts.command) ? opts.command : (opts.command && opts.command.split(' '))
    program = params[0]
    params.shift()
  } else {
    program = opts.program
    params = opts.params
  }
  return new Promise((resolve, reject) => {
    const res = {
      stdout: [],
      stderr: []
    }
    const spawned = spawn(program, params, { detached: true, cwd: opts.cwd })
    spawned.stdout.on('data', (data) => {
      res.stdout.push(data)
      opts.logger && this.logger.info(`stdout:\n${data}`)
    })

    spawned.stderr.on('data', (data) => {
      res.stderr.push(data)
      opts.logger && this.logger.info(`stderr: ${data}`)
    })

    spawned.on('error', (error) => {
      res.error = error
      opts.logger && this.logger.error(`error: ${error.message}`)
    })

    spawned.on('exit', code => {
      codeProcessor({ code, res, opts, resolve, reject })
      this.logger.info(`exit: child process exited with code ${code}`, res)
    })

    if (opts.timeout * 1 > 0) {
      res.timeout = setTimeout(() => {
        this.logger.debug(`bash.js: Killing by timeout, [[${program} ${params}]]`)
        res.timedOut = true
        process.kill(-spawned.pid, 'SIGKILL')
      }, opts.timeout * 1)
    }
  })
}