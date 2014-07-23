var async = require("async")
var pg = require("pg")

var url = process.env.DATABASE_URL

var connect = function (callback) {
  pg.connect(url, function (err, client, done) {
    if (err) {
      console.error("Error connecting to database")
      done(err)
    } else {
      callback(client, done)
    }
  })
}

var query = function (client) {
  return function (statement, done) {
    client.query(statement, function (err, result) {
      if (err) {
        console.error("Error executing SQL: ")
        console.error(statement)
      }
      done(err, result)
    })
  }
}

exports.execute = function (statement, taskDone) {
  exports.executeSeries([statement], function (err, result) {
    taskDone(err, result ? result[0] : undefined)
  })
}

exports.executeParallel = function (statements, taskDone) {
  async.map(statements, exports.execute, taskDone)
}

exports.executeSeries = function (statements, taskDone) {
  connect(function (client, connectionDone) {
    async.map(statements, query(client), function (err, results) {
      connectionDone()
      taskDone(err, results)
    })
  })
}

exports.end = pg.end.bind(pg)