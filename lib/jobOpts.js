module.exports = {
  removeOnComplete: process.env.NUMBER_OF_JOBS_TO_KEEP || 1000, 
  timeout: process.env.TELEGRAM_DOWNLOAD_TIMEOUT || 20 * 60 * 1000,
  attempts: 1
}
