//#!/usr/bin/env node

var express = require('express'),
    sets = require('simplesets'),
    util = require('util'),
    jade = require('jade'),
    MemoryStore = express.session.MemoryStore,
    uuid = require('node-uuid'),
    io = require('socket.io'),
    underscore = require('underscore'),
    messages = require('./messages.js');


// WEB APP CODE
var app = express.createServer(
  express.logger(),
  express.bodyDecoder()
);

app.configure(function(){
  app.use(express.cookieDecoder());
  app.use(express.session({
    secret: uuid(),
    store: new MemoryStore({reapInterval: 60000 * 10 })
  }));
  app.use(express.methodOverride());
  app.use(express.bodyDecoder());
  app.use(app.router);
  app.use(express.staticProvider(__dirname + '/static'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

app.set('view engine', 'jade');

function getUser(req) {
  if (!req.session.userId) {
    req.session.userId = messages.addUser();
    console.log("created new user with id", req.session.userId);
  }
  var user = messages.getUserById(req.session.userId);
  console.log("got user", user);
  return user;
}

app.get('/', function(req, res) {
  var user = getUser(req);
  console.log("got user", user);
  var globalMessages = messages.getLastNMessagesExcludingUser(5, user.id);
  var commentedOnMessages = user.getCommentedOnMessages();
  var userMessages = user.getMessages();

  // remove commentedOnMessages that are the user's own messages
  commentedOnMessages = underscore.select(commentedOnMessages, function(message) {
    return message.userId !== user.id;
  });

  var ignoreIds = new sets.Set(underscore.pluck(commentedOnMessages, 'id'));
  globalMessages = underscore.select(globalMessages, function(message) {
    return !ignoreIds.has(message.id);
  });

  res.render('index', {
    locals: {
      userMessages: userMessages,
      globalMessages: globalMessages,
      commentedOnMessages: commentedOnMessages
    }
  });
});

app.post('/message', function(req, res) {
  var user = getUser(req);
  var messageId = user.add(req.param("content"));
  var message = messages.getMessageById(messageId);
  console.log("Created new message:", message);
  socket.broadcast({
    method: 'dom',
    params: [{
      content: res.partial("message", {locals: {message: message}}),
      target: "#globalMessages > ul",
      position: "prepend"
    }]
  });
  res.redirect("back");
});

app.post('/comment', function(req, res) {
  var user = getUser(req);
  var message = messages.getMessageById(req.param("messageId"));
  if (message) {
    var commentId = message.addComment(user.id, req.param("content"));
    console.log("Created new comment:", commentId);
  }
  socket.broadcast({
    method: 'dom',
    params: [{
      content: res.partial("message", {locals: {message: message}}),
      target: "#"+message.id,
      position: "replace"
    }]
  });

  res.redirect("back");
});

var port = 8085;
console.log("running on port", port);
app.listen(port);


// SOCKET CODE
var socket = io.listen(app);
socket.on('connection', function(client) {
  var s = socket;
  console.log('connection from', client.sessionId);
  client.on('message', function(msg) {
    console.log("on message", util.inspect(msg));
  });
  client.on('disconnect', function() {
    console.log(client.sessionId, 'disconnected');
  });
});