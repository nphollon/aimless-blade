"use strict";

var async = require("async")
var fs = require("fs")
var markdown = require("markdown").markdown
var db = require("./databaseAccess")

var content = {
  fullPath: __dirname + "/posts",
  ext: "markdown"
}

var buildDatabase = function () {
  async.series([createTable, populateTable, indexTable], function (err) {
    if (err) {
      console.error(err)
    } else {
      console.log("All files migrated successfully")
    }
    db.end()
  })
}

var createTable = function (done) {
  db.executeSeries([
    "DROP TABLE IF EXISTS posts",
    "CREATE TABLE posts ( " +
      "id serial PRIMARY KEY, " + 
      "path varchar(20) NOT NULL UNIQUE, " + 
      "title varchar(100) NOT NULL UNIQUE, " +
      "body json NOT NULL )"
  ], done)
}

var populateTable = function (done) {
  fs.readdir(content.fullPath, function (err, files) {
    if (err) {
      taskDone(err)
    } else {
      console.log("Site content found: ")
      console.log(files)

      async.each(files, parseFile, done)
    }
  })
}

var indexTable = function (taskDone) {
  db.execute("CREATE INDEX posts_path_index ON posts (path)", taskDone)
}

var parseFile = function (file, taskDone) {
  var fullPathToFile = content.fullPath + "/" + file
  fs.readFile(fullPathToFile, { encoding: "utf8" }, function (err, data) {
    if (err) {
      console.error("Error reading " + file)
      taskDone(err)
    } else {
      var baseName = new RegExp("([\\w-]+)\\." + content.ext + "$").exec(file)[1]
      var parseTree = markdown.parse(data)

      async.detect(parseTree, isTitle, function (titleElement) {
        var title = titleElement[2]

        var queryConfig = {
          text: "INSERT INTO posts (path, title, body) " +
            "VALUES ($1, $2, $3)",
          values: [ baseName, title, JSON.stringify(parseTree) ]
        }

        console.log("Writing to the database: " + file)
        db.execute(queryConfig, taskDone)
      })
    }
  })
}

var isTitle = function (element, isTrueIf) {
  isTrueIf(
    Array.isArray(element) && 
    element.length >= 3 &&
    element[0] === "header" &&
    element[1].level === 1
  )
}

buildDatabase()
