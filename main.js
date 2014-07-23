"use strict";

var async = require("async")
var db = require("./databaseAccess")
var express = require("express")
var fs = require("fs")
var markdown = require("markdown").markdown
var mustacheExpress = require('mustache-express')

var port = process.env.PORT || 3000
var root = __dirname

var notFound = function (req, res) {
  res.status(404).render("404.mustache", { title: "Page not found" });
}

var serverError = function (req, res, err) {
  err && console.log(err)
  res.status(500).render("500.mustache", { title: "Server error" })
}

var noRecordsIn = function (result) {
  return result.rowCount < 1
}

var buildModelFrom = function (results) {
  var posts = results[0].rows
  var post = results[1].rows[0]

  return {
    title: post.title,
    body: markdown.toHTML(post.body),
    posts: posts
  }
}

var app = express()

app.engine('mustache', mustacheExpress())
app.set('view engine', "mustache")
app.set('views', "views/")

app.get("/", function (req, res) {
  db.execute("SELECT path, title FROM posts", function (err, result) {
    if (err) {
      serverError(req, res, err)
    } else {
      var posts = result.rows
      res.render("index.mustache", { title: "Home", posts: posts})
    }
  })
})

app.get("/posts/:name", function (req, res) {
  var queries = [
    "SELECT path, title FROM posts",
    {
      text: "SELECT title, body FROM posts WHERE path = $1",
      values: [ req.params.name ]
    }
  ]

  db.executeParallel(queries, function (err, results) {
    if (err) {
      serverError(req, res, err)
    } else if (noRecordsIn(results[1])) {
      notFound(req, res)
    } else {
      res.render("post.mustache", buildModelFrom(results))
    }
  })
})

app.get("/resources/:file", function (req, res) {
  res.sendfile(root + "/resources/" + req.params.file)
})

app.use(notFound)

var server = app.listen(port, function () {
  console.log("Listening on port " + server.address().port)
})
