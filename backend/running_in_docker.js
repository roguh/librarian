const fs = require('fs')

module.exports = () => {
  let exists = true
  try {
    fs.statSync('/.dockerenv')
  } catch (err) {
    exists = false
  }
  return exists
}
