const fs = require('fs')
const path = require('path')

let Files = []
function ThroughDirectoryWrapper(Directory) {
  Files = []
  ThroughDirectory(Directory)
  return Files
}

function ThroughDirectory(Directory) {
  fs.readdirSync(Directory).forEach(File => {
    const Absolute = path.join(Directory, File)
    if (fs.statSync(Absolute).isDirectory()) return ThroughDirectory(Absolute)
    else return Files.push(Absolute)
  })
}

module.exports = {
  ThroughDirectoryWrapper
}