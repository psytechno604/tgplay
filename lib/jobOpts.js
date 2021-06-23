module.exports = jobId => ({
  jobId,
  removeOnComplete: 1 * (process.env.NUMBER_OF_JOBS_TO_KEEP || 1000),
  timeout: 1 * (process.env.TELEGRAM_DOWNLOAD_TIMEOUT || 20 * 60 * 1000),
  attempts: 1
})
