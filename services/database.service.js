const path = require('path')
const sqlite3 = require('sqlite3')
const { open } = require('sqlite')

module.exports = {
  name: 'database',
  metadata: {
  },
  actions: {
    async insertDlId(ctx) {
      return this.metadata.db.run(`INSERT INTO T_DOWNLOADS (dlId, serviceName, releaseUrl) VALUES ($dlId, $serviceName, $releaseUrl)`, {
        $dlId: ctx.params.dlId,
        $serviceName: ctx.params.serviceName,
        $releaseUrl: ctx.params.releaseUrl
      })
    },
    async dlIdExists(ctx) {
      return this.metadata.db.get(`SELECT dlId FROM T_DOWNLOADS WHERE dlId=$dlId`, {
        $dlId: ctx.params.dlId
      })
    }
  },
  async started() {
    this.metadata.db = await open({
      filename: path.join(process.env.DB_PATH, 'db.sqlite'),
      driver: sqlite3.Database
    })
    await this.metadata.db.exec('CREATE TABLE IF NOT EXISTS T_DOWNLOADS (dlId TEXT PRIMARY KEY, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, serviceName TEXT, releaseUrl TEXT)')
    process.on('SIGINT', () => {
      this.metadata.db.close()
    })
  }
}